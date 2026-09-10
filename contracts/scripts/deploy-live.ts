import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    AbiCoder,
    BaseContract,
    concat,
    ContractFactory,
    id,
    JsonRpcProvider,
    keccak256,
    parseEther,
    Wallet,
    getAddress,
} from "ethers";
import { chainInfo } from "@gluwa/usc-sdk";
// @ts-expect-error The manifest CLI is intentionally plain ESM for direct Node execution.
import { buildManifest } from "./manifest.mjs";

const BLOCK_PROVER = "0x0000000000000000000000000000000000000fd2";
const abi = AbiCoder.defaultAbiCoder();

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function bytes32(value: string, name: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
    if (!value) throw new Error(`Missing ${name}`);
    return id(value);
}

function selector(signature: string): string {
    return id(signature).slice(0, 10);
}

function pair(left: string, right: string): string {
    return left.toLowerCase() < right.toLowerCase()
        ? keccak256(concat([left, right]))
        : keccak256(concat([right, left]));
}

function scopeLeaf(target: string, functionSelector: string, validator: string, constraintsHash: string): string {
    return keccak256(abi.encode(["address", "bytes4", "address", "bytes32"], [
        target,
        functionSelector,
        validator,
        constraintsHash,
    ]));
}

async function deploy(name: string, signer: Wallet, ...args: unknown[]): Promise<BaseContract> {
    const artifactPath = resolve(`artifacts/contracts/Airlock.sol/${name}.json`);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
}

async function send(contract: BaseContract, method: string, ...args: unknown[]): Promise<string> {
    const transaction = await (contract as any)[method](...args);
    await transaction.wait();
    return transaction.hash;
}

async function sourceChainKey(provider: JsonRpcProvider, sourceChainId: number): Promise<number> {
    const info = new chainInfo.PrecompileChainInfoProvider(
        provider as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0],
    );
    const configured = process.env.SOURCE_CHAIN_KEY?.trim();
    const supported = await info.getSupportedChains();
    const matches = supported.filter((chain) => chain.chainId === sourceChainId);
    if (configured) {
        const key = Number(configured);
        if (!matches.some((chain) => chain.chainKey === key)) {
            throw new Error(`SOURCE_CHAIN_KEY=${key} is not configured for source chain ${sourceChainId}`);
        }
        return key;
    }
    if (matches.length !== 1) throw new Error(`Expected one live source key for chain ${sourceChainId}; found ${matches.length}`);
    return matches[0].chainKey;
}

async function main() {
    const sourceRpc = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
    const creditcoinRpc = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
    const sourceDeployer = new Wallet(required("SOURCE_DEPLOYER_PRIVATE_KEY"), sourceRpc);
    const publisher = new Wallet(required("SOURCE_PUBLISHER_PRIVATE_KEY"), sourceRpc);
    const evaluator = new Wallet(required("SOURCE_EVALUATOR_PRIVATE_KEY"), sourceRpc);
    const approver = new Wallet(required("SOURCE_APPROVER_PRIVATE_KEY"), sourceRpc);
    const statusAuthority = new Wallet(required("SOURCE_STATUS_PRIVATE_KEY"), sourceRpc);
    const creditcoinDeployer = new Wallet(required("CREDITCOIN_DEPLOYER_PRIVATE_KEY"), creditcoinRpc);
    const policyAdmin = new Wallet(required("CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY"), creditcoinRpc);
    const guardian = new Wallet(required("CREDITCOIN_GUARDIAN_PRIVATE_KEY"), creditcoinRpc);
    const runtime = new Wallet(required("RUNTIME_PRIVATE_KEY"), creditcoinRpc);

    const sourceChainId = Number(required("SOURCE_CHAIN_ID"));
    const sourceNetwork = await sourceRpc.getNetwork();
    if (Number(sourceNetwork.chainId) !== sourceChainId) {
        throw new Error(`SOURCE_CHAIN_ID=${sourceChainId} does not match RPC chain ${sourceNetwork.chainId}`);
    }
    const creditcoinNetwork = await creditcoinRpc.getNetwork();
    const configuredCreditcoinChainId = Number(required("CREDITCOIN_CHAIN_ID"));
    if (Number(creditcoinNetwork.chainId) !== configuredCreditcoinChainId) {
        throw new Error(`CREDITCOIN_CHAIN_ID=${configuredCreditcoinChainId} does not match RPC chain ${creditcoinNetwork.chainId}`);
    }
    const sourceKey = await sourceChainKey(creditcoinRpc, sourceChainId);
    const orgInput = required("ORG_ID");
    const releaseInput = required("RELEASE_ID");
    const agentId = bytes32(required("AGENT_ID"), "AGENT_ID");
    const recipient = getAddress(required("PAYMENT_RECIPIENT"));
    const paymentAmount = parseEther(required("PAYMENT_AMOUNT"));
    const depositTarget = bytes32(process.env.DEPOSIT_TARGET?.trim() || "airlock-demo-position", "DEPOSIT_TARGET");
    const releaseDirectory = resolve(process.cwd(), process.env.RELEASE_DIR?.trim() || "../fixtures/releases/demo");
    const paymentSelector = selector("pay(address)");
    const depositSelector = selector("deposit(bytes32)");
    const paymentConstraints = id("AIRLOCK_PAYMENT_V1");
    const depositConstraints = id("AIRLOCK_DEPOSIT_V1");

    const artifactRegistry = await deploy("ArtifactRegistry", sourceDeployer, await publisher.getAddress());
    const evaluationRegistry = await deploy("EvaluationRegistry", sourceDeployer, await evaluator.getAddress());
    const approvalRegistry = await deploy("DeploymentApprovalRegistry", sourceDeployer, await approver.getAddress());
    const statusRegistry = await deploy("ReleaseStatusRegistry", sourceDeployer, await statusAuthority.getAddress());

    const vendor = await deploy("VendorPayments", creditcoinDeployer);
    const protocol = await deploy("BoundedDepositProtocol", creditcoinDeployer);
    const paymentValidator = await deploy(
        "AllowlistedRecipientPaymentValidator",
        creditcoinDeployer,
        await vendor.getAddress(),
        recipient,
        paymentAmount,
        paymentSelector,
    );
    const depositValidator = await deploy(
        "BoundedDepositValidator",
        creditcoinDeployer,
        await protocol.getAddress(),
        parseEther("0.1"),
        depositSelector,
    );
    const paymentLeaf = scopeLeaf(await vendor.getAddress(), paymentSelector, await paymentValidator.getAddress(), paymentConstraints);
    const depositLeaf = scopeLeaf(await protocol.getAddress(), depositSelector, await depositValidator.getAddress(), depositConstraints);
    const scopeRoot = pair(paymentLeaf, depositLeaf);
    const manifest = await buildManifest({
        input: releaseDirectory,
        output: resolve(process.cwd(), process.env.MANIFEST_FILE?.trim() || "../airlock-manifest.json"),
        orgId: orgInput,
        releaseId: releaseInput,
        releaseVersion: process.env.RELEASE_VERSION || "1",
        componentOverrides: { toolManifestRoot: scopeRoot },
    });
    const orgId = manifest.payload.orgId;
    const releaseId = manifest.payload.releaseId;
    const digest = manifest.releaseDigest;
    const manifestHash = manifest.manifestHash;
    const artifactRoot = manifest.artifactRoot;
    const {
        weightsHash,
        tokenizerHash,
        systemPromptHash,
        toolManifestRoot,
        containerImageDigest,
        sbomHash,
        provenanceHash,
    } = manifest.payload.components;
    const suiteHash = manifest.payload.suiteId;
    const evaluatorSetHash = id("AIRLOCK_EVALUATORS_V1");
    const spendCeiling = paymentAmount + parseEther("0.1");
    const perCallCeiling = paymentAmount;
    const policyInput = {
        approvedSuiteHash: suiteHash,
        approvedEvaluatorSetHash: evaluatorSetHash,
        allowedToolScopeRoot: scopeRoot,
        minSafetyScoreBps: 8_000,
        deniedCapabilityBitmap: 0,
        spendCeiling,
        perCallCeiling,
        callCeiling: 2,
        capabilityTtl: 3_600,
        statusFreshness: 3_600,
        teeRequired: false,
    };
    const policyHash = keccak256(abi.encode(
        ["bytes32", "bytes32", "bytes32", "uint32", "uint256", "uint128", "uint128", "uint32", "uint64", "uint64", "bool"],
        [
            policyInput.approvedSuiteHash,
            policyInput.approvedEvaluatorSetHash,
            policyInput.allowedToolScopeRoot,
            policyInput.minSafetyScoreBps,
            policyInput.deniedCapabilityBitmap,
            policyInput.spendCeiling,
            policyInput.perCallCeiling,
            policyInput.callCeiling,
            policyInput.capabilityTtl,
            policyInput.statusFreshness,
            policyInput.teeRequired,
        ],
    ));

    const evidence = await deploy("EvidenceRegistry", creditcoinDeployer, await policyAdmin.getAddress());
    const decoder = await deploy("OfficialReceiptDecoder", creditcoinDeployer);
    const policies = await deploy("PolicyRegistry", creditcoinDeployer, await policyAdmin.getAddress(), await guardian.getAddress());
    const issuer = await deploy(
        "CapabilityIssuer",
        creditcoinDeployer,
        await policyAdmin.getAddress(),
        await guardian.getAddress(),
        await evidence.getAddress(),
        await policies.getAddress(),
    );
    const vault = await deploy("AgentVault", creditcoinDeployer, await policyAdmin.getAddress());
    const router = await deploy("ToolRouter", creditcoinDeployer, await policyAdmin.getAddress(), await issuer.getAddress(), await vault.getAddress());
    const adapter = await deploy(
        "AirlockAttestcoinAdapter",
        creditcoinDeployer,
        await policyAdmin.getAddress(),
        await guardian.getAddress(),
        sourceKey,
        BLOCK_PROVER,
        await decoder.getAddress(),
        await evidence.getAddress(),
        await artifactRegistry.getAddress(),
        await evaluationRegistry.getAddress(),
        await approvalRegistry.getAddress(),
        await statusRegistry.getAddress(),
    );

    await send(evidence, "setAdapter", await adapter.getAddress());
    await send(vault, "setRouter", await router.getAddress());
    await send(issuer, "setRouter", await router.getAddress());
    await send(router, "registerAction", await vendor.getAddress(), paymentSelector, await paymentValidator.getAddress(), paymentConstraints);
    await send(router, "registerAction", await protocol.getAddress(), depositSelector, await depositValidator.getAddress(), depositConstraints);
    await send(policies, "register", policyInput);
    const fundingTransaction = await creditcoinDeployer.sendTransaction({
        to: await vault.getAddress(),
        value: spendCeiling,
    });
    await fundingTransaction.wait();

    const now = Math.floor(Date.now() / 1000) - 30;
    const validUntil = now + 86_400;
    const artifactTx = await send(
        artifactRegistry,
        "publish",
        orgId,
        releaseId,
        digest,
        manifestHash,
        artifactRoot,
        weightsHash,
        tokenizerHash,
        systemPromptHash,
        toolManifestRoot,
        containerImageDigest,
        sbomHash,
        provenanceHash,
        manifest.payload.releaseVersion,
        1,
    );
    const evaluationTx = await send(
        evaluationRegistry,
        "certify",
        orgId,
        releaseId,
        digest,
        suiteHash,
        id(`AIRLOCK_REPORT:${digest}`),
        evaluatorSetHash,
        9_000,
        0,
        now,
        validUntil,
        1,
    );
    const approvalTx = await send(
        approvalRegistry,
        "approve",
        orgId,
        agentId,
        digest,
        await runtime.getAddress(),
        policyHash,
        scopeRoot,
        spendCeiling,
        perCallCeiling,
        2,
        now,
        validUntil,
        1,
    );
    const statusTx = await send(statusRegistry, "checkpoint", orgId, digest, 1, 1, now, validUntil);

    const deployment = {
        generatedAt: new Date().toISOString(),
        source: {
            chainId: sourceChainId,
            chainKey: sourceKey,
            artifactRegistry: await artifactRegistry.getAddress(),
            evaluationRegistry: await evaluationRegistry.getAddress(),
            approvalRegistry: await approvalRegistry.getAddress(),
            statusRegistry: await statusRegistry.getAddress(),
            transactions: { artifactTx, evaluationTx, approvalTx, statusTx },
        },
        creditcoin: {
            chainId: Number(creditcoinNetwork.chainId),
            blockProver: BLOCK_PROVER,
            decoder: await decoder.getAddress(),
            evidence: await evidence.getAddress(),
            adapter: await adapter.getAddress(),
            policies: await policies.getAddress(),
            issuer: await issuer.getAddress(),
            vault: await vault.getAddress(),
            router: await router.getAddress(),
            vendor: await vendor.getAddress(),
            protocol: await protocol.getAddress(),
            paymentValidator: await paymentValidator.getAddress(),
            depositValidator: await depositValidator.getAddress(),
            vaultFundingTx: fundingTransaction.hash,
        },
        release: {
            orgId,
            releaseId,
            agentId,
            releaseDigest: digest,
            releaseVersion: manifest.payload.releaseVersion,
            manifestHash,
            artifactRoot,
            policyHash,
            scopeRoot,
            paymentLeaf,
            depositLeaf,
            runtimeKey: await runtime.getAddress(),
            paymentRecipient: recipient,
            paymentAmount: paymentAmount.toString(),
            depositTarget,
        },
    };
    await writeFile(resolve(process.cwd(), "../deployments.json"), `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
