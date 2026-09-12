import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, getAddress, JsonRpcProvider, Wallet } from "ethers";

const DEFAULT_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

async function main() {
    const deploymentFile = resolve(process.env.AIRLOCK_DEPLOYMENTS?.trim() || "../deployments.json");
    const deployment = JSON.parse(await readFile(deploymentFile, "utf8"));
    const rpcUrl = process.env.AIRLOCK_IDENTITY_RPC_URL?.trim() || process.env.SOURCE_CHAIN_RPC_URL?.trim() || DEFAULT_RPC;
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(required("SOURCE_DEPLOYER_PRIVATE_KEY"), provider);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) throw new Error(`ERC-8004 registration requires Sepolia, got ${network.chainId}`);

    const registryAddress = getAddress(process.env.ERC8004_IDENTITY_REGISTRY?.trim() || DEFAULT_REGISTRY);
    const agentRegistry = `eip155:${network.chainId}:${registryAddress}`;
    const baseUri = process.env.AIRLOCK_AGENT_REGISTRATION_URI?.trim()
        || `${process.env.AIRLOCK_PUBLIC_URL?.trim() || "https://airlock-control-plane.onrender.com"}/.well-known/agent-registration.json`;
    const identity = new Contract(registryAddress, [
        "function register(string agentURI) returns (uint256 agentId)",
        "function setAgentURI(uint256 agentId,string newURI)",
    ], signer);

    let agentId = deployment.identity?.agentId?.toString();
    let registerTxHash: string | undefined;
    let uriTxHash: string | undefined;
    if (!agentId) {
        agentId = (await identity.register.staticCall(baseUri)).toString();
        const transaction = await identity.register(baseUri);
        await transaction.wait();
        registerTxHash = transaction.hash;
    }
    const registrationUri = `${baseUri}${baseUri.includes("?") ? "&" : "?"}agentId=${encodeURIComponent(agentId)}`;
    const update = await identity.setAgentURI(agentId, registrationUri);
    await update.wait();
    uriTxHash = update.hash;

    deployment.identity = {
        agentRegistry,
        agentId,
        identityRegistry: registryAddress,
        rpcUrl,
        registrationUri,
        owner: await signer.getAddress(),
        registerTxHash: registerTxHash || deployment.identity?.registerTxHash,
        uriTxHash,
    };
    await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(JSON.stringify(deployment.identity, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
