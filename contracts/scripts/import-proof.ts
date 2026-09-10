import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, id, JsonRpcProvider, Wallet } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

const methods = {
    artifact: "importArtifact",
    evaluation: "importEvaluation",
    approval: "importApproval",
    status: "importStatus",
    revocation: "importRevocation",
} as const;

const topics = {
    artifact: "ArtifactPublished(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64)",
    evaluation: "EvaluationCertified(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint32,uint256,uint64,uint64,uint64)",
    approval: "DeploymentApproved(bytes32,bytes32,bytes32,address,bytes32,bytes32,uint128,uint128,uint32,uint64,uint64,uint64)",
    status: "ReleaseStatusCheckpoint(bytes32,bytes32,uint8,uint64,uint64,uint64)",
    revocation: "ReleaseRevoked(bytes32,bytes32,bytes32,uint64,uint64)",
} as const;

type Kind = keyof typeof methods;

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function numberEnv(name: string, fallback?: number): number | undefined {
    const value = process.env[name]?.trim();
    return value ? Number(value) : fallback;
}

function usage(): never {
    throw new Error("Set IMPORT_KIND in contracts/.env; deploy-live supplies SOURCE_TX_HASH (or set it explicitly).");
}

async function main() {
    const kind = process.env.IMPORT_KIND as Kind | undefined;
    if (!kind || !(kind in methods)) usage();

    const deploymentFile = resolve(process.cwd(), process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json");
    let deployment: any;
    try {
        deployment = JSON.parse(await readFile(deploymentFile, "utf8"));
    } catch {
        deployment = undefined;
    }
    const txHash = process.env.SOURCE_TX_HASH?.trim() || deployment?.source?.transactions?.[`${kind}Tx`];
    if (!txHash) usage();

    const sourceRpc = new JsonRpcProvider(required("SOURCE_CHAIN_RPC_URL"));
    const creditcoinRpc = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
    const worker = new Wallet(required("CREDITCOIN_WORKER_PRIVATE_KEY"), creditcoinRpc);
    const adapterAddress = process.env.AIRLOCK_ADAPTER_ADDRESS?.trim() || deployment?.creditcoin?.adapter;
    if (!adapterAddress) throw new Error("Missing AIRLOCK_ADAPTER_ADDRESS and deployments.json has no adapter");
    const sourceChainId = numberEnv("SOURCE_CHAIN_ID", deployment?.source?.chainId);
    if (sourceChainId === undefined) throw new Error("Missing SOURCE_CHAIN_ID");
    const sourceNetwork = await sourceRpc.getNetwork();
    if (Number(sourceNetwork.chainId) !== sourceChainId) {
        throw new Error(`SOURCE_CHAIN_ID=${sourceChainId} does not match RPC chain ${sourceNetwork.chainId}`);
    }

    const configuredCreditcoinChainId = numberEnv("CREDITCOIN_CHAIN_ID");
    const creditcoinNetwork = await creditcoinRpc.getNetwork();
    if (configuredCreditcoinChainId !== undefined && Number(creditcoinNetwork.chainId) !== configuredCreditcoinChainId) {
        throw new Error(`CREDITCOIN_CHAIN_ID=${configuredCreditcoinChainId} does not match RPC chain ${creditcoinNetwork.chainId}`);
    }

    const sourceReceipt = await sourceRpc.getTransactionReceipt(txHash);
    if (!sourceReceipt) throw new Error(`Source transaction not found: ${txHash}`);
    if (sourceReceipt.status !== 1) throw new Error(`Source transaction failed: ${txHash}`);

    const creditcoinChainInfo = new chainInfo.PrecompileChainInfoProvider(
        creditcoinRpc as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0],
    );
    const supported = await creditcoinChainInfo.getSupportedChains();
    const configuredChainKey = numberEnv("SOURCE_CHAIN_KEY");
    const matches = supported.filter((chain) => chain.chainId === sourceChainId);
    if (configuredChainKey !== undefined && !matches.some((chain) => chain.chainKey === configuredChainKey)) {
        throw new Error(`SOURCE_CHAIN_KEY=${configuredChainKey} is not the live key for source chain ${sourceChainId}`);
    }
    if (matches.length !== 1 && configuredChainKey === undefined) {
        throw new Error(`Expected one live chain key for chain ID ${sourceChainId}; found ${matches.length}`);
    }
    const sourceChainKey = configuredChainKey ?? matches[0].chainKey;

    const expectedTopic = id(topics[kind]);
    const logIndexFromEnv = numberEnv("SOURCE_LOG_INDEX");
    const inferredLogIndex = sourceReceipt.logs.findIndex((log) => {
        const topic0 = typeof log === "object" && "topics" in log ? log.topics[0] : undefined;
        return topic0?.toLowerCase() === expectedTopic.toLowerCase();
    });
    const logIndex = logIndexFromEnv ?? (inferredLogIndex >= 0 ? inferredLogIndex : 0);

    const proofBuilder = new proofProvider.service.ProofBuilder(
        sourceChainKey,
        required("CREDITCOIN_PROOF_BUILDER_URL"),
        numberEnv("PROOF_BUILDER_TIMEOUT_MS", 60_000),
    );
    const waitTimeoutMs = numberEnv("ATTESTATION_WAIT_TIMEOUT_MS", 900_000);
    await creditcoinChainInfo.waitUntilHeightAttested(
        sourceChainKey,
        sourceReceipt.blockNumber,
        numberEnv("ATTESTATION_POLL_INTERVAL_MS", 5_000),
        waitTimeoutMs,
        numberEnv("ATTESTATION_EXTRA_DELAY_MS", 15_000),
    );

    const retryCount = numberEnv("WORKER_RETRIES", 4) ?? 4;
    const backoffMs = numberEnv("WORKER_BACKOFF_MS", 2_000) ?? 2_000;
    let proof;
    let lastError;
    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
        const result = await proofBuilder.getProof(txHash);
        if (result.success && result.data) {
            proof = result;
            break;
        }
        lastError = result.error ?? "Proof builder returned no proof";
        if (attempt < retryCount) await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
    if (!proof?.success || !proof.data) throw new Error(lastError ?? "Proof builder returned no proof");
    const data = proof.data;
    if (data.chainKey !== sourceChainKey || data.headerNumber !== sourceReceipt.blockNumber) {
        throw new Error("Proof response does not match the source transaction");
    }

    const requestType = "(uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,uint32 logIndex)";
    const adapter = new Contract(
        adapterAddress,
        [
            `function ${methods[kind]}(${requestType} request) returns (bytes32)`,
        ],
        worker,
    );

    const request = {
        chainKey: data.chainKey,
        blockHeight: data.headerNumber,
        encodedTransaction: data.txBytes,
        merkleProof: data.merkleProof,
        continuityProof: data.continuityProof,
        logIndex,
    };
    const transaction = await adapter[methods[kind]](request);
    const receipt = await transaction.wait();
    const sourceLog = sourceReceipt.logs[logIndex];

    const proofRecord = {
        kind,
        txHash,
        sourceChainKey,
        sourceBlock: sourceReceipt.blockNumber,
        sourceTxIndex: data.txIndex,
        logIndex,
        sourceEmitter: sourceLog?.address,
        sourceTopic0: sourceLog?.topics[0],
        receiptStatus: sourceReceipt.status,
        proofBytes: (data.txBytes.length - 2) / 2,
        merkleSiblingCount: data.merkleProof.siblings.length,
        creditcoinTxHash: receipt.hash,
        creditcoinGasUsed: receipt.gasUsed?.toString(),
        cachedProof: data.cached,
    };
    if (deployment) {
        deployment.proofs ||= {};
        deployment.proofs[kind] = proofRecord;
        await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
    }
    console.log(JSON.stringify(proofRecord, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
