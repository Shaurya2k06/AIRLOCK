import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, getAddress, Interface, JsonRpcProvider, parseEther, Wallet, ZeroAddress, id, keccak256 } from "ethers";
// @ts-expect-error The manifest CLI is intentionally plain ESM for direct Node execution.
import { verifyManifest } from "./manifest.mjs";

const issuerAbi = [
    "function issue(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,bytes32 policyHash) returns (bytes32 capabilityId)",
    "function get(bytes32) view returns (tuple(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,bytes32 policyHash,bytes32 scopeRoot,address runtimeKey,uint128 spendCap,uint128 spent,uint128 perCallValueCap,uint32 callCap,uint32 callsUsed,uint64 notBefore,uint64 expiresAt,uint64 epoch,bool revoked))",
];
const routerAbi = [
    "function execute((bytes32 capabilityId,bytes32 agentId,address target,bytes4 functionSelector,bytes32 calldataHash,uint256 value,uint64 deadline,uint64 actionNonce,bytes32 idempotencyKey,bytes32 traceRoot,bytes32 scopeLeaf,bytes32[] scopeProof,bytes data) intent,bytes signature) returns (bytes)",
    "function nextNonce(bytes32) view returns (uint64)",
];
const evidenceAbi = [
    "function releaseKey(bytes32,bytes32) view returns (bytes32)",
    "function getStatus(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseDigest,uint8 status,uint64 statusNonce,uint64 issuedAt,uint64 validUntil,bool revoked,bytes32 reasonHash,bytes32 evidenceId))",
];
const delegationAbi = [
    "function isActive(bytes32) view returns (bool)",
    "function get(bytes32) view returns (tuple(bool exists,bool revoked,bytes32 childCapabilityId,bytes32 parentCapabilityId,bytes32 childAgentId,bytes32 scopeRoot,address runtimeKey,uint128 budget,uint128 spent,uint32 maxCalls,uint32 callsUsed,uint64 validAfter,uint64 validUntil,uint8 depth,bytes32 taskId))",
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
        { name: "traceRoot", type: "bytes32" },
        { name: "scopeLeaf", type: "bytes32" },
    ],
};

function deploymentPath(): string {
    return resolve(process.cwd(), process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json");
}

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

async function deployment(): Promise<any> {
    return JSON.parse(await readFile(deploymentPath(), "utf8"));
}

async function save(value: any) {
    await writeFile(deploymentPath(), `${JSON.stringify(value, null, 2)}\n`);
}

function actionDeadline(expiresAt?: number): bigint {
    const now = Math.floor(Date.now() / 1000);
    const upperBound = Number(expiresAt || 0);
    const deadline = upperBound > now ? Math.min(now + 300, upperBound - 1) : now + 300;
    if (deadline <= now) throw new Error("capability expires before a valid action deadline");
    return BigInt(deadline);
}

function paymentIntent(data: string, deploymentState: any, capabilityId: string, actionNonce: number) {
    return {
        capabilityId,
        agentId: deploymentState.live?.agentId || deploymentState.release.agentId,
        target: deploymentState.creditcoin.paymentRecipient || deploymentState.release.paymentRecipient,
        functionSelector: "0x00000000",
        calldataHash: keccak256(data),
        value: BigInt(deploymentState.live?.proposedAmount || deploymentState.release.paymentAmount),
        deadline: actionDeadline(deploymentState.live?.activeExpiresAt),
        actionNonce,
        idempotencyKey: id(`AIRLOCK_LIVE_ACTION:${capabilityId}:${actionNonce}`),
        traceRoot: process.env.AIRLOCK_TRACE_ROOT || id(`AIRLOCK_TRACE:${capabilityId}:${actionNonce}`),
        scopeLeaf: deploymentState.release.paymentLeaf,
        scopeProof: [deploymentState.release.depositLeaf],
        data,
    };
}

function depositIntent(deploymentState: any, capabilityId: string, actionNonce: number) {
    const data = new Interface(["function deposit(bytes32 position)"]).encodeFunctionData("deposit", [
        deploymentState.release.depositTarget,
    ]);
    return {
        capabilityId,
        agentId: deploymentState.live?.agentId || deploymentState.release.agentId,
        target: deploymentState.creditcoin.protocol,
        functionSelector: id("deposit(bytes32)").slice(0, 10),
        calldataHash: keccak256(data),
        value: BigInt(deploymentState.release.depositAmount || parseEther("0.1")),
        deadline: actionDeadline(deploymentState.live?.activeExpiresAt),
        actionNonce,
        idempotencyKey: id(`AIRLOCK_LIVE_DEPOSIT:${capabilityId}:${actionNonce}`),
        traceRoot: process.env.AIRLOCK_TRACE_ROOT || id(`AIRLOCK_TRACE:${capabilityId}:${actionNonce}`),
        scopeLeaf: deploymentState.release.depositLeaf,
        scopeProof: [deploymentState.release.paymentLeaf],
        data,
    };
}

async function proposedPayment(state: any): Promise<{ recipient: string; amount: string }> {
    const inlineRecipient = process.env.LIVE_RECIPIENT?.trim();
    const inlineAmount = process.env.LIVE_AMOUNT?.trim();
    if (inlineRecipient || inlineAmount) {
        if (!inlineRecipient || !inlineAmount) throw new Error("LIVE_RECIPIENT and LIVE_AMOUNT must be supplied together");
        const recipient = getAddress(inlineRecipient);
        const amount = parseEther(inlineAmount);
        if (recipient !== getAddress(state.release.paymentRecipient)) throw new Error("proposal recipient is outside the approved capability");
        if (amount <= 0n || amount > BigInt(state.release.paymentAmount)) throw new Error("proposal amount exceeds the approved capability");
        return { recipient, amount: amount.toString() };
    }
    const proposalFile = process.env.INTENT_FILE?.trim();
    if (!proposalFile) return { recipient: state.release.paymentRecipient, amount: state.release.paymentAmount };
    const proposal = JSON.parse(await readFile(resolve(process.cwd(), proposalFile), "utf8"));
    if (proposal?.tool !== "vendor.pay" || typeof proposal.recipient !== "string" || typeof proposal.amount !== "string") {
        throw new Error("INTENT_FILE must contain { tool: \"vendor.pay\", recipient, amount }");
    }
    const recipient = getAddress(proposal.recipient);
    const amount = parseEther(proposal.amount);
    if (recipient !== getAddress(state.release.paymentRecipient)) throw new Error("proposal recipient is outside the approved capability");
    if (amount <= 0n || amount > BigInt(state.release.paymentAmount)) throw new Error("proposal amount exceeds the approved capability");
    return { recipient, amount: amount.toString() };
}

async function assertCapabilityBinding(issuer: Contract, capabilityId: string, state: any, runtime: Wallet, expectedAgentId = state.release.agentId): Promise<void> {
    const capability = await issuer.get(capabilityId);
    const runtimeAddress = await runtime.getAddress();
    if (capability.runtimeKey !== ZeroAddress) {
        if (
            capability.orgId.toLowerCase() !== state.release.orgId.toLowerCase()
                || capability.agentId.toLowerCase() !== expectedAgentId.toLowerCase()
                || capability.releaseDigest.toLowerCase() !== state.release.releaseDigest.toLowerCase()
                || capability.policyHash.toLowerCase() !== state.release.policyHash.toLowerCase()
                || getAddress(capability.runtimeKey) !== getAddress(runtimeAddress)
                || capability.revoked
        ) {
            throw new Error("issued capability does not match the verified release or runtime signer");
        }
        return;
    }
    if (!state.creditcoin.delegationRegistry) throw new Error("delegation registry is not configured");
    const delegation = new Contract(state.creditcoin.delegationRegistry, delegationAbi, issuer.runner);
    const [active, child] = await Promise.all([delegation.isActive(capabilityId), delegation.get(capabilityId)]);
    const parent = await issuer.get(child.parentCapabilityId);
    if (
        !active
            || !child.exists
            || child.revoked
            || child.childCapabilityId.toLowerCase() !== capabilityId.toLowerCase()
            || child.childAgentId.toLowerCase() !== expectedAgentId.toLowerCase()
            || getAddress(child.runtimeKey) !== getAddress(runtimeAddress)
            || child.scopeRoot.toLowerCase() !== state.release.scopeRoot.toLowerCase()
            || parent.orgId.toLowerCase() !== state.release.orgId.toLowerCase()
            || parent.releaseDigest.toLowerCase() !== state.release.releaseDigest.toLowerCase()
            || parent.policyHash.toLowerCase() !== state.release.policyHash.toLowerCase()
    ) {
        throw new Error("delegated capability does not match the verified release or runtime signer");
    }
}

async function capabilityExpiry(issuer: Contract, capabilityId: string, state: any): Promise<number> {
    const capability = await issuer.get(capabilityId);
    if (capability.runtimeKey !== ZeroAddress) return Number(capability.expiresAt);
    if (!state.creditcoin.delegationRegistry) throw new Error("delegation registry is not configured");
    const delegation = new Contract(state.creditcoin.delegationRegistry, delegationAbi, issuer.runner);
    return Number((await delegation.get(capabilityId)).validUntil);
}

async function main() {
    const step = process.env.LIVE_STEP?.trim();
    if (!step || !["execute", "deposit", "revoke", "blocked"].includes(step)) {
        throw new Error("Set LIVE_STEP=execute, deposit, revoke, or blocked");
    }
    const state = await deployment();
    const proposal = step === "execute"
        ? await proposedPayment(state)
        : { recipient: state.release.paymentRecipient, amount: state.release.paymentAmount };

    if (step !== "blocked") {
        const manifest = await verifyManifest(
            resolve(process.cwd(), process.env.MANIFEST_FILE?.trim() || "../airlock-manifest.json"),
            resolve(process.cwd(), process.env.RELEASE_DIR?.trim() || "../fixtures/releases/demo"),
        );
        if (manifest.releaseDigest !== state.release.releaseDigest) {
            throw new Error("release files no longer match the deployed release digest");
        }
    }

    const creditcoinRpc = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
    const network = await creditcoinRpc.getNetwork();
    if (state.creditcoin.chainId && Number(network.chainId) !== Number(state.creditcoin.chainId)) {
        throw new Error(`Creditcoin RPC chain ${network.chainId} does not match deployment ${state.creditcoin.chainId}`);
    }
    const runtime = new Wallet(required("RUNTIME_PRIVATE_KEY"), creditcoinRpc);
    const worker = new Wallet(required("CREDITCOIN_WORKER_PRIVATE_KEY"), creditcoinRpc);
    const issuer = new Contract(state.creditcoin.issuer, issuerAbi, worker);
    const router = new Contract(state.creditcoin.router, routerAbi, worker);
    const data = "0x";

    if (step === "revoke") {
        if (!state.live?.capabilityId) throw new Error("Run LIVE_STEP=execute first");
        const evidence = new Contract(state.creditcoin.evidence, evidenceAbi, creditcoinRpc);
        const releaseKey = await evidence.releaseKey(state.release.orgId, state.release.releaseDigest);
        const currentStatus = await evidence.getStatus(releaseKey);
        if (!currentStatus.exists || currentStatus.revoked || Number(currentStatus.status) !== 1) {
            throw new Error("an active imported status is required before preparing revocation");
        }
        await assertCapabilityBinding(issuer, state.live.capabilityId, state, runtime, state.live.agentId || state.release.agentId);
        const actionNonce = Number(await router.nextNonce(state.live.capabilityId));
        const intent = paymentIntent(data, { ...state, live: { ...state.live, proposedAmount: proposal.amount } }, state.live.capabilityId, actionNonce);
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

        const sourceRpc = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
        const sourceNetwork = await sourceRpc.getNetwork();
        if (state.source.chainId && Number(sourceNetwork.chainId) !== Number(state.source.chainId)) {
            throw new Error(`source RPC chain ${sourceNetwork.chainId} does not match deployment ${state.source.chainId}`);
        }
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
        state.live.blockedAction = {
            actionNonce,
            deadline: intent.deadline.toString(),
            idempotencyKey: intent.idempotencyKey,
            amount: intent.value.toString(),
            data: intent.data,
            signature,
            traceRoot: intent.traceRoot,
        };
        await save(state);
        console.log(JSON.stringify({ revocationTx: transaction.hash, blockedActionNonce: actionNonce }, null, 2));
        return;
    }

    if (step === "execute") {
        if (getAddress(state.release.runtimeKey) !== getAddress(await runtime.getAddress())) {
            throw new Error("runtime signer does not match the approved runtime key");
        }
        const requestedCapabilityId = process.env.LIVE_CAPABILITY_ID?.trim();
        let capabilityId: string;
        let issueTransaction: { hash: string } | null = null;
        if (requestedCapabilityId) {
            capabilityId = requestedCapabilityId;
            await assertCapabilityBinding(issuer, capabilityId, state, runtime, process.env.LIVE_AGENT_ID?.trim() || state.release.agentId);
        } else {
            capabilityId = await issuer.issue.staticCall(
                state.release.orgId,
                state.release.agentId,
                state.release.releaseDigest,
                state.release.policyHash,
            );
            const transaction = await issuer.issue(
                state.release.orgId,
                state.release.agentId,
                state.release.releaseDigest,
                state.release.policyHash,
            );
            await transaction.wait();
            issueTransaction = transaction;
            await assertCapabilityBinding(issuer, capabilityId, state, runtime);
        }
        const agentId = process.env.LIVE_AGENT_ID?.trim() || state.release.agentId;
        const actionNonce = Number(await router.nextNonce(capabilityId));
        const activeExpiresAt = await capabilityExpiry(issuer, capabilityId, state);
        const intent = paymentIntent(data, { ...state, live: { ...state.live, agentId, proposedAmount: proposal.amount, activeExpiresAt } }, capabilityId, actionNonce);
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
        const previousLive = state.live || {};
        const rootCapabilityId = requestedCapabilityId
            ? (previousLive.rootCapabilityId || previousLive.capabilityId)
            : capabilityId;
        state.live = {
            ...previousLive,
            capabilityId: rootCapabilityId,
            rootCapabilityId,
            ...(issueTransaction ? { issueTx: issueTransaction.hash } : {}),
            agentId: requestedCapabilityId ? (previousLive.agentId || state.release.agentId) : agentId,
            lastCapabilityId: capabilityId,
            lastAgentId: agentId,
            lastDelegated: Boolean(requestedCapabilityId),
            delegated: Boolean(requestedCapabilityId),
            allowedActionTx: actionTransaction.hash,
            proposedAmount: proposal.amount,
            traceRoot: process.env.AIRLOCK_TRACE_ROOT || id(`AIRLOCK_TRACE:${capabilityId}:${actionNonce}`),
        };
        await save(state);
        console.log(JSON.stringify(state.live, null, 2));
        return;
    }

    const activeCapabilityId = process.env.LIVE_CAPABILITY_ID?.trim() || state.live?.capabilityId;
    const activeAgentId = process.env.LIVE_AGENT_ID?.trim() || state.live?.agentId || state.release.agentId;
    if (!activeCapabilityId) throw new Error("Run LIVE_STEP=execute first");
    await assertCapabilityBinding(issuer, activeCapabilityId, state, runtime, activeAgentId);
    if (step === "deposit") {
        const actionNonce = Number(await router.nextNonce(activeCapabilityId));
        const activeExpiresAt = await capabilityExpiry(issuer, activeCapabilityId, state);
        const intent = depositIntent({ ...state, live: { ...state.live, capabilityId: activeCapabilityId, agentId: activeAgentId, activeExpiresAt } }, activeCapabilityId, actionNonce);
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
        const explicitCapabilityId = process.env.LIVE_CAPABILITY_ID?.trim();
        const delegated = Boolean(explicitCapabilityId && explicitCapabilityId.toLowerCase() !== state.live?.capabilityId?.toLowerCase());
        if (!delegated) {
            state.live.capabilityId = activeCapabilityId;
            state.live.agentId = activeAgentId;
        }
        state.live.lastCapabilityId = activeCapabilityId;
        state.live.lastAgentId = activeAgentId;
        state.live.lastDelegated = delegated;
        state.live.depositActionTx = actionTransaction.hash;
        state.live.depositTraceRoot = process.env.AIRLOCK_TRACE_ROOT || id(`AIRLOCK_TRACE:${activeCapabilityId}:${actionNonce}`);
        await save(state);
        console.log(JSON.stringify({ depositActionTx: actionTransaction.hash }, null, 2));
        return;
    }

    const evidence = new Contract(state.creditcoin.evidence, evidenceAbi, creditcoinRpc);
    const releaseKey = await evidence.releaseKey(state.release.orgId, state.release.releaseDigest);
    const status = await evidence.getStatus(releaseKey);
    if (!status.revoked || Number(status.status) !== 2) {
        throw new Error("import the proven revocation before LIVE_STEP=blocked");
    }
    const blockedAction = state.live.blockedAction;
    if (!blockedAction) throw new Error("Run LIVE_STEP=revoke first");
    const intent = paymentIntent(blockedAction.data, { ...state, live: { ...state.live, proposedAmount: blockedAction.amount || state.release.paymentAmount } }, state.live.capabilityId, Number(blockedAction.actionNonce));
    intent.deadline = BigInt(blockedAction.deadline);
    intent.idempotencyKey = blockedAction.idempotencyKey;
    intent.traceRoot = blockedAction.traceRoot || id(`AIRLOCK_TRACE:${state.live.capabilityId}:${blockedAction.actionNonce}`);
    const signature = blockedAction.signature;
    try {
        await router.execute.staticCall(intent, signature);
        throw new Error("revoked capability still passed the router check");
    } catch (error) {
        if (error instanceof Error && error.message.includes("revoked capability still")) throw error;
        console.log(JSON.stringify({ blocked: true, reason: "proven revocation" }, null, 2));
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
