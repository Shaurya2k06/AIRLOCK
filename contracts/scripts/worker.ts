import "dotenv/config";

import { execFile as execFileCallback } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { id, JsonRpcProvider } from "ethers";

const execFile = promisify(execFileCallback);
const REPLAY_SELECTOR = id("Replay()").slice(0, 10).toLowerCase();

const eventTopics = {
    artifact: id("ArtifactPublished(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64)"),
    evaluation: id("EvaluationCertified(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint32,uint256,uint64,uint64,uint64)"),
    approval: id("DeploymentApproved(bytes32,bytes32,bytes32,address,bytes32,bytes32,uint128,uint128,uint32,uint64,uint64,uint64)"),
    status: id("ReleaseStatusCheckpoint(bytes32,bytes32,uint8,uint64,uint64,uint64)"),
    revocation: id("ReleaseRevoked(bytes32,bytes32,bytes32,uint64,uint64)"),
} as const;

type Kind = keyof typeof eventTopics;
type EventStatus = "observed" | "retryable" | "submitted" | "consumed";

type PendingEvent = {
    kind: Kind;
    txHash: string;
    logIndex: number;
    blockNumber: number;
    attempts: number;
    status: EventStatus;
    lastError?: string;
};

type WorkerState = {
    cursor: number;
    sourceFingerprint: string;
    events: Record<string, PendingEvent>;
};

function numberEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function deploymentPath(): string {
    return process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json";
}

function statePath(): string {
    return process.env.WORKER_STATE_FILE?.trim() || "../worker-state.json";
}

async function loadDeployment(): Promise<any> {
    return JSON.parse(await readFile(deploymentPath(), "utf8"));
}

async function loadState(path: string, initialCursor: number, sourceFingerprint: string): Promise<WorkerState> {
    try {
        const state = JSON.parse(await readFile(path, "utf8")) as WorkerState;
        if (state.sourceFingerprint === sourceFingerprint) return state;
    } catch {
        // Start a fresh journal when the state file is absent or corrupt.
    }
    return { cursor: initialCursor, sourceFingerprint, events: {} };
}

async function saveState(path: string, state: WorkerState): Promise<void> {
    const temporaryPath = `${path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
    await rename(temporaryPath, path);
}

function eventKey(event: Pick<PendingEvent, "kind" | "txHash" | "logIndex">): string {
    return `${event.kind}:${event.txHash}:${event.logIndex}`;
}

function isReplay(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("Replay") || message.toLowerCase().includes(REPLAY_SELECTOR);
}

function errorMessage(error: unknown): string {
    const value = error as { message?: string; stderr?: string };
    return `${value.message || error}${value.stderr ? `\n${value.stderr}` : ""}`.slice(0, 2_000);
}

async function sourceStartBlock(provider: JsonRpcProvider, deployment: any): Promise<number> {
    const configured = process.env.WORKER_START_BLOCK?.trim();
    if (configured) return numberEnv("WORKER_START_BLOCK", 0);
    const hashes = Object.values(deployment.source?.transactions || {}) as string[];
    const receipts = await Promise.all(hashes.filter(Boolean).map((hash) => provider.getTransactionReceipt(hash)));
    const blocks = receipts.filter((receipt): receipt is NonNullable<typeof receipt> => receipt !== null).map((receipt) => receipt.blockNumber);
    return blocks.length ? Math.min(...blocks) : await provider.getBlockNumber();
}

function streams(deployment: any): Array<{ kind: Kind; address: string; topic: string }> {
    return [
        { kind: "artifact", address: deployment.source.artifactRegistry, topic: eventTopics.artifact },
        { kind: "evaluation", address: deployment.source.evaluationRegistry, topic: eventTopics.evaluation },
        { kind: "approval", address: deployment.source.approvalRegistry, topic: eventTopics.approval },
        { kind: "status", address: deployment.source.statusRegistry, topic: eventTopics.status },
        { kind: "revocation", address: deployment.source.statusRegistry, topic: eventTopics.revocation },
    ];
}

async function discover(
    provider: JsonRpcProvider,
    deployment: any,
    fromBlock: number,
    toBlock: number,
): Promise<PendingEvent[]> {
    if (fromBlock > toBlock) return [];
    const logs = await Promise.all(streams(deployment).map(async (stream) => {
        const entries = await provider.getLogs({ address: stream.address, topics: [stream.topic], fromBlock, toBlock });
        return entries.map((entry) => ({
            kind: stream.kind,
            txHash: entry.transactionHash,
            logIndex: entry.index,
            blockNumber: entry.blockNumber,
            attempts: 0,
            status: "observed" as const,
        }));
    }));
    return logs.flat().sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
}

async function submit(event: PendingEvent): Promise<string> {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = await execFile(npm, ["run", "import-proof"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            IMPORT_KIND: event.kind,
            SOURCE_TX_HASH: event.txHash,
            SOURCE_LOG_INDEX: String(event.logIndex),
        },
        maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout.trim().slice(-2_000);
}

async function processPending(state: WorkerState, path: string): Promise<void> {
    const pending = Object.values(state.events)
        .filter((event) => event.status === "observed" || event.status === "retryable")
        .sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
    for (const event of pending) {
        event.attempts += 1;
        try {
            const output = await submit(event);
            event.status = "submitted";
            delete event.lastError;
            console.log(JSON.stringify({ event: "submitted", kind: event.kind, txHash: event.txHash, logIndex: event.logIndex, output }));
        } catch (error) {
            event.lastError = errorMessage(error);
            event.status = isReplay(error) ? "consumed" : "retryable";
            console.error(JSON.stringify({ event: event.status, kind: event.kind, txHash: event.txHash, logIndex: event.logIndex, attempts: event.attempts, error: event.lastError }));
        }
        await saveState(path, state);
        if (event.status === "retryable") break;
    }
}

async function main(): Promise<void> {
    const deployment = await loadDeployment();
    const sourceRpcUrl = process.env.SOURCE_CHAIN_RPC_URL?.trim();
    if (!sourceRpcUrl) throw new Error("Missing SOURCE_CHAIN_RPC_URL");
    const provider = new JsonRpcProvider(sourceRpcUrl);
    const network = await provider.getNetwork();
    if (deployment.source?.chainId && Number(network.chainId) !== Number(deployment.source.chainId)) {
        throw new Error(`source RPC chain ${network.chainId} does not match deployment ${deployment.source.chainId}`);
    }
    const path = statePath();
    const startBlock = await sourceStartBlock(provider, deployment);
    const sourceFingerprint = JSON.stringify(streams(deployment));
    const state = await loadState(path, startBlock - 1, sourceFingerprint);
    const batchSize = numberEnv("WORKER_BATCH_BLOCKS", 2_000);
    const pollMs = numberEnv("WORKER_POLL_INTERVAL_MS", 10_000);
    const once = ["1", "true", "yes"].includes((process.env.WORKER_ONCE || "").toLowerCase());

    for (;;) {
        const latestBlock = await provider.getBlockNumber();
        const toBlock = Math.min(latestBlock, state.cursor + batchSize);
        if (toBlock > state.cursor) {
            const discovered = await discover(provider, deployment, state.cursor + 1, toBlock);
            for (const event of discovered) state.events[eventKey(event)] ||= event;
            state.cursor = toBlock;
            await saveState(path, state);
            for (const event of discovered) {
                console.log(JSON.stringify({ event: "observed", kind: event.kind, txHash: event.txHash, logIndex: event.logIndex, blockNumber: event.blockNumber }));
            }
        }
        await processPending(state, path);
        if (once) return;
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
