import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, Interface, JsonRpcProvider, Wallet, id, keccak256 } from "ethers";
// @ts-expect-error The manifest CLI is intentionally plain ESM for direct Node execution.
import { verifyManifest } from "./manifest.mjs";

const issuerAbi = [
    "function issue(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,bytes32 policyHash) returns (bytes32 capabilityId)",
];
const routerAbi = [
    "function execute((bytes32 capabilityId,bytes32 agentId,address target,bytes4 functionSelector,bytes32 calldataHash,uint256 value,uint64 deadline,uint64 actionNonce,bytes32 idempotencyKey,bytes32 scopeLeaf,bytes32[] scopeProof,bytes data) intent,bytes signature) returns (bytes)",
];
const statusAbi = [
    "function revoke(bytes32 orgId,bytes32 releaseDigest,bytes32 reasonHash,uint64 statusNonce,uint64 revokedAt)",
];
const intentTypes = {
    ToolIntent: [
        { name: "capabilityId", type: "bytes32" },
        { name: "agentId", type: "bytes32" },
        { name: "target", type: "address" },
        { name: "functionSelector", type: "bytes4" },
        { name: "calldataHash", type: "bytes32" },
        { name: "value", type: "uint256" },
        { name: "deadline", type: "uint64" },
        { name: "actionNonce", type: "uint64" },
        { name: "idempotencyKey", type: "bytes32" },
        { name: "scopeLeaf", type: "bytes32" },
    ],
};

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

async function deployment(): Promise<any> {
    return JSON.parse(await readFile(resolve(process.cwd(), "../deployments.json"), "utf8"));
}

async function save(value: any) {
    await writeFile(resolve(process.cwd(), "../deployments.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function paymentIntent(data: string, deploymentState: any, capabilityId: string, actionNonce: number) {
    return {
        capabilityId,
        agentId: deploymentState.release.agentId,
        target: deploymentState.creditcoin.paymentToken,
        functionSelector: id("transfer(address,uint256)").slice(0, 10),
        calldataHash: keccak256(data),
        value: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
        actionNonce,
        idempotencyKey: id(`AIRLOCK_LIVE_ACTION:${actionNonce}`),
        scopeLeaf: deploymentState.release.paymentLeaf,
        scopeProof: [deploymentState.release.depositLeaf],
        data,
    };
}

async function main() {
    const step = process.env.LIVE_STEP?.trim();
    if (!step || !["execute", "revoke", "blocked"].includes(step)) {
        throw new Error("Set LIVE_STEP=execute, revoke, or blocked");
    }
    const state = await deployment();

    if (step === "execute") {
        const manifest = await verifyManifest(
            resolve(process.cwd(), process.env.MANIFEST_FILE?.trim() || "../airlock-manifest.json"),
            resolve(process.cwd(), process.env.RELEASE_DIR?.trim() || "../fixtures/releases/demo"),
        );
        if (manifest.releaseDigest !== state.release.releaseDigest) {
            throw new Error("release files no longer match the deployed release digest");
        }
    }

    if (step === "revoke") {
        const sourceRpc = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
        const statusAuthority = new Wallet(required("SOURCE_STATUS_PRIVATE_KEY"), sourceRpc);
        const status = new Contract(state.source.statusRegistry, statusAbi, statusAuthority);
        const transaction = await status.revoke(
            state.release.orgId,
            state.release.releaseDigest,
            id("AIRLOCK_LIVE_REVOCATION"),
            2,
            Math.floor(Date.now() / 1000),
        );
        await transaction.wait();
        state.source.transactions.revocationTx = transaction.hash;
        await save(state);
        console.log(JSON.stringify({ revocationTx: transaction.hash }, null, 2));
        return;
    }

    const creditcoinRpc = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
    const network = await creditcoinRpc.getNetwork();
    const runtime = new Wallet(required("RUNTIME_PRIVATE_KEY"), creditcoinRpc);
    const worker = new Wallet(required("CREDITCOIN_WORKER_PRIVATE_KEY"), creditcoinRpc);
    const issuer = new Contract(state.creditcoin.issuer, issuerAbi, worker);
    const router = new Contract(state.creditcoin.router, routerAbi, worker);
    const data = new Interface(["function transfer(address recipient,uint256 amount)"]).encodeFunctionData("transfer", [
        state.release.paymentRecipient,
        state.release.paymentAmount,
    ]);

    if (step === "execute") {
        const capabilityId = await issuer.issue.staticCall(
            state.release.orgId,
            state.release.agentId,
            state.release.releaseDigest,
            state.release.policyHash,
        );
        const issueTransaction = await issuer.issue(
            state.release.orgId,
            state.release.agentId,
            state.release.releaseDigest,
            state.release.policyHash,
        );
        await issueTransaction.wait();
        const intent = paymentIntent(data, state, capabilityId, 0);
        const signature = await runtime.signTypedData(
            {
                name: "AIRLOCK Tool Router",
                version: "1",
                chainId: network.chainId,
                verifyingContract: state.creditcoin.router,
            },
            intentTypes,
            intent,
        );
        const actionTransaction = await router.execute(intent, signature);
        await actionTransaction.wait();
        state.live = {
            capabilityId,
            issueTx: issueTransaction.hash,
            allowedActionTx: actionTransaction.hash,
        };
        await save(state);
        console.log(JSON.stringify(state.live, null, 2));
        return;
    }

    if (!state.live?.capabilityId) throw new Error("Run LIVE_STEP=execute first");
    const intent = paymentIntent(data, state, state.live.capabilityId, 1);
    const signature = await runtime.signTypedData(
        {
            name: "AIRLOCK Tool Router",
            version: "1",
            chainId: network.chainId,
            verifyingContract: state.creditcoin.router,
        },
        intentTypes,
        intent,
    );
    try {
        await router.execute.staticCall(intent, signature);
        throw new Error("revoked capability still passed the router simulation");
    } catch (error) {
        if (error instanceof Error && error.message.includes("revoked capability still")) throw error;
        console.log(JSON.stringify({ blocked: true, reason: "proven revocation" }, null, 2));
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
