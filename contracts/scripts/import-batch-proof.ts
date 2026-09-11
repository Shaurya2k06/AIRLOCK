import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, id, JsonRpcProvider, Wallet } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

const kinds = {
    artifact: 1,
    evaluation: 2,
    approval: 3,
    status: 4,
    revocation: 5,
} as const;

type Kind = keyof typeof kinds;

const topics = {
    artifact: "ArtifactPublished(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64)",
    evaluation: "EvaluationCertified(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint32,uint256,uint64,uint64,uint64)",
    approval: "DeploymentApproved(bytes32,bytes32,bytes32,address,bytes32,bytes32,uint128,uint128,uint32,uint64,uint64,uint64)",
    status: "ReleaseStatusCheckpoint(bytes32,bytes32,uint8,uint64,uint64,uint64)",
    revocation: "ReleaseRevoked(bytes32,bytes32,bytes32,uint64,uint64)",
} as const;

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function numberEnv(name: string, fallback?: number): number | undefined {
    const value = process.env[name]?.trim();
    return value ? Number(value) : fallback;
}

function listEnv(name: string): string[] {
    const value = required(name);
    const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (entries.length === 0 || entries.length > 10) throw new Error(`${name} must contain 1-10 comma-separated values`);
    return entries;
}

function parseKinds(values: string[]): Kind[] {
    return values.map((value) => {
        if (!(value in kinds)) throw new Error(`Unsupported batch kind: ${value}`);
        return value as Kind;
    });
}

async function loadDeployment(path: string): Promise<any> {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch {
        return undefined;
    }
}

async function main() {
    const txHashes = listEnv("SOURCE_TX_HASHES");
    const batchKinds = parseKinds(listEnv("IMPORT_KINDS"));
    if (batchKinds.length !== txHashes.length) throw new Error("IMPORT_KINDS must match SOURCE_TX_HASHES length");
    const configuredLogIndices = process.env.SOURCE_LOG_INDICES
        ?.split(",")
        .map((entry) => Number(entry.trim()));
    if (configuredLogIndices && configuredLogIndices.length !== txHashes.length) {
        throw new Error("SOURCE_LOG_INDICES must match SOURCE_TX_HASHES length");
    }

    const deploymentFile = resolve(process.cwd(), process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json");
    const deployment = await loadDeployment(deploymentFile);
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

    const sourceChainInfo = new chainInfo.PrecompileChainInfoProvider(
        creditcoinRpc as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0],
    );
    const supported = await sourceChainInfo.getSupportedChains();
    const configuredChainKey = numberEnv("SOURCE_CHAIN_KEY");
    const matches = supported.filter((chain) => chain.chainId === sourceChainId);
    if (configuredChainKey !== undefined && !matches.some((chain) => chain.chainKey === configuredChainKey)) {
        throw new Error(`SOURCE_CHAIN_KEY=${configuredChainKey} is not the live key for source chain ${sourceChainId}`);
    }
    if (matches.length !== 1 && configuredChainKey === undefined) {
        throw new Error(`Expected one live chain key for chain ID ${sourceChainId}; found ${matches.length}`);
    }
    const sourceChainKey = configuredChainKey ?? matches[0].chainKey;
    const sourceReceipts = await Promise.all(txHashes.map((txHash) => sourceRpc.getTransactionReceipt(txHash)));
    if (sourceReceipts.some((receipt) => !receipt)) throw new Error("One or more source transactions were not found");
    if (sourceReceipts.some((receipt) => receipt?.status !== 1)) throw new Error("Every source transaction must succeed");

    const waitTimeoutMs = numberEnv("ATTESTATION_WAIT_TIMEOUT_MS", 900_000) ?? 900_000;
    await Promise.all(sourceReceipts.map((receipt) => sourceChainInfo.waitUntilHeightAttested(
        sourceChainKey,
        receipt!.blockNumber,
        numberEnv("ATTESTATION_POLL_INTERVAL_MS", 5_000),
        waitTimeoutMs,
        numberEnv("ATTESTATION_EXTRA_DELAY_MS", 15_000),
    )));

    const proofBuilder = new proofProvider.service.ProofBuilder(
        sourceChainKey,
        required("CREDITCOIN_PROOF_BUILDER_URL"),
        numberEnv("PROOF_BUILDER_TIMEOUT_MS", 60_000),
    );
    const retryCount = numberEnv("WORKER_RETRIES", 4) ?? 4;
    const backoffMs = numberEnv("WORKER_BACKOFF_MS", 2_000) ?? 2_000;
    let proof;
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
        const result = await proofBuilder.getBatchProof(txHashes);
        if (result.success && result.data) {
            proof = result.data;
            break;
        }
        lastError = result.error ?? "Proof builder returned no batch proof";
        if (attempt < retryCount) await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
    if (!proof) throw new Error(lastError ?? "Proof builder returned no batch proof");
    if (proof.chainKey !== sourceChainKey) throw new Error("Batch proof chain key does not match source chain");

    const entries = new Map<string, any>();
    for (const [headerNumber, proofsByHeader] of proof.merkleProofs.entries()) {
        for (const [txIndex, entry] of proofsByHeader.entries()) {
            entries.set(entry.txHash.toLowerCase(), { ...entry, headerNumber, txIndex });
        }
    }
    const proofEntries = txHashes.map((txHash) => {
        const entry = entries.get(txHash.toLowerCase());
        if (!entry) throw new Error(`Batch proof omitted ${txHash}`);
        if (entry.txHash.toLowerCase() !== txHash.toLowerCase()) throw new Error(`Batch proof hash mismatch for ${txHash}`);
        return entry;
    });
    const logIndices = batchKinds.map((kind, index) => {
        const configured = configuredLogIndices?.[index];
        if (configured !== undefined) return configured;
        const expectedTopic = id(topics[kind]).toLowerCase();
        const inferred = sourceReceipts[index]!.logs.findIndex((log) => log.topics[0]?.toLowerCase() === expectedTopic);
        if (inferred < 0) throw new Error(`Could not infer ${kind} log index for ${txHashes[index]}`);
        return inferred;
    });

    const adapter = new Contract(
        adapterAddress,
        [
            "function importBatch((uint64 chainKey,uint64[] blockHeights,bytes[] encodedTransactions,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings)[] merkleProofs,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,uint32[] logIndices,uint8[] kinds) request) returns (bytes32[])",
        ],
        worker,
    );
    const request = {
        chainKey: proof.chainKey,
        blockHeights: proofEntries.map((entry) => entry.headerNumber),
        encodedTransactions: proofEntries.map((entry) => entry.txBytes),
        merkleProofs: proofEntries.map((entry) => entry.merkleProof),
        continuityProof: proof.continuityProof,
        logIndices,
        kinds: batchKinds.map((kind) => kinds[kind]),
    };
    const transaction = await adapter.importBatch(request);
    const receipt = await transaction.wait();
    if (receipt?.status !== 1) throw new Error(`Creditcoin batch import failed: ${transaction.hash}`);

    const proofRecord = {
        kinds: batchKinds,
        txHashes,
        sourceChainKey,
        sourceBlocks: proofEntries.map((entry) => entry.headerNumber),
        sourceTxIndices: proofEntries.map((entry) => entry.txIndex),
        logIndices,
        receiptStatuses: sourceReceipts.map((entry) => entry!.status),
        proofBytes: proofEntries.map((entry) => (entry.txBytes.length - 2) / 2),
        merkleSiblingCounts: proofEntries.map((entry) => entry.merkleProof.siblings.length),
        creditcoinTxHash: receipt.hash,
        creditcoinGasUsed: receipt.gasUsed?.toString(),
        cachedProof: proof.cached,
    };
    if (deployment) {
        deployment.proofs ||= {};
        deployment.proofs.batch = proofRecord;
        batchKinds.forEach((kind, index) => {
            deployment.proofs[kind] = {
                kind,
                txHash: txHashes[index],
                sourceChainKey,
                sourceBlock: proofEntries[index].headerNumber,
                sourceTxIndex: proofEntries[index].txIndex,
                logIndex: logIndices[index],
                receiptStatus: sourceReceipts[index]!.status,
                proofBytes: proofRecord.proofBytes[index],
                merkleSiblingCount: proofRecord.merkleSiblingCounts[index],
                creditcoinTxHash: receipt.hash,
                creditcoinGasUsed: receipt.gasUsed?.toString(),
                batchCreditcoinTxHash: receipt.hash,
                cachedProof: proof.cached,
            };
        });
        await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
    }
    console.log(JSON.stringify(proofRecord, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
