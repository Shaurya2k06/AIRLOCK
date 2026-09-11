import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, getAddress, id, JsonRpcProvider, Wallet } from "ethers";

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function bytes32(value: string | undefined, name: string): string {
    if (!value) throw new Error(`Missing ${name}`);
    return /^0x[0-9a-fA-F]{64}$/.test(value) ? value : id(value);
}

function numberEnv(name: string, fallback: number): number {
    const value = process.env[name]?.trim();
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
    return parsed;
}

async function main() {
    const deploymentFile = resolve(process.cwd(), process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json");
    const deployment = JSON.parse(await readFile(deploymentFile, "utf8"));
    const runtimeBindings = deployment.creditcoin?.runtimeBindings;
    if (!runtimeBindings) throw new Error("deployments.json has no runtimeBindings address; deploy the current contracts first");

    const provider = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
    const verifier = new Wallet(
        process.env.CREDITCOIN_TEE_VERIFIER_PRIVATE_KEY?.trim()
            || required("CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY"),
        provider,
    );
    const network = await provider.getNetwork();
    if (deployment.creditcoin?.chainId && Number(network.chainId) !== Number(deployment.creditcoin.chainId)) {
        throw new Error(`Creditcoin RPC chain ${network.chainId} does not match deployment ${deployment.creditcoin.chainId}`);
    }

    const release = deployment.release || {};
    const orgId = bytes32(process.env.ORG_ID?.trim() || release.orgId, "ORG_ID");
    const agentId = bytes32(process.env.AGENT_ID?.trim() || release.agentId, "AGENT_ID");
    const releaseDigest = bytes32(process.env.RELEASE_DIGEST?.trim() || release.releaseDigest, "RELEASE_DIGEST");
    const runtimeKey = getAddress(process.env.TEE_RUNTIME_KEY?.trim() || release.runtimeKey || required("RUNTIME_ADDRESS"));
    const artifactRoot = bytes32(process.env.TEE_ARTIFACT_ROOT?.trim() || release.artifactRoot, "TEE_ARTIFACT_ROOT");
    const containerImageDigest = bytes32(
        process.env.TEE_CONTAINER_IMAGE_DIGEST?.trim() || release.containerImageDigest,
        "TEE_CONTAINER_IMAGE_DIGEST",
    );
    const now = Math.floor(Date.now() / 1000);
    const validAfter = numberEnv("TEE_VALID_AFTER", Math.max(0, now - 30));
    const validUntil = numberEnv("TEE_VALID_UNTIL", now + 3_600);
    if (validUntil <= validAfter) throw new Error("TEE_VALID_UNTIL must be after TEE_VALID_AFTER");

    const binding = new Contract(
        runtimeBindings,
        [
            "function bindingKey(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,address runtimeKey) view returns (bytes32)",
            "function register((bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,address runtimeKey,bytes32 teeMeasurement,bytes32 quoteHash,bytes32 artifactRoot,bytes32 containerImageDigest,uint64 validAfter,uint64 validUntil,uint64 runtimeNonce) value) returns (bytes32 bindingId)",
        ],
        verifier,
    );
    const transaction = await binding.register({
        orgId,
        agentId,
        releaseDigest,
        runtimeKey,
        teeMeasurement: bytes32(process.env.TEE_MEASUREMENT, "TEE_MEASUREMENT"),
        quoteHash: bytes32(process.env.TEE_QUOTE_HASH, "TEE_QUOTE_HASH"),
        artifactRoot,
        containerImageDigest,
        validAfter,
        validUntil,
        runtimeNonce: numberEnv("TEE_RUNTIME_NONCE", 1),
    });
    const receipt = await transaction.wait();
    if (receipt?.status !== 1) throw new Error(`TEE binding transaction failed: ${transaction.hash}`);

    deployment.teeBinding = {
        bindingId: await binding.bindingKey(orgId, agentId, releaseDigest, runtimeKey),
        verifier: await verifier.getAddress(),
        runtimeKey,
        teeMeasurement: process.env.TEE_MEASUREMENT,
        quoteHash: process.env.TEE_QUOTE_HASH,
        validAfter,
        validUntil,
        runtimeNonce: numberEnv("TEE_RUNTIME_NONCE", 1),
        creditcoinTxHash: receipt.hash,
    };
    await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(JSON.stringify(deployment.teeBinding, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
