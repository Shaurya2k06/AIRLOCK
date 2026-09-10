import "dotenv/config";

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { chainInfo } from "@gluwa/usc-sdk";
import { formatEther, getAddress, JsonRpcProvider, parseEther, Wallet, ZeroAddress } from "ethers";

const requiredNames = [
    "SOURCE_CHAIN_RPC_URL",
    "SOURCE_CHAIN_ID",
    "CREDITCOIN_RPC_URL",
    "CREDITCOIN_CHAIN_ID",
    "CREDITCOIN_PROOF_BUILDER_URL",
    "SOURCE_DEPLOYER_PRIVATE_KEY",
    "SOURCE_PUBLISHER_PRIVATE_KEY",
    "SOURCE_EVALUATOR_PRIVATE_KEY",
    "SOURCE_APPROVER_PRIVATE_KEY",
    "SOURCE_STATUS_PRIVATE_KEY",
    "CREDITCOIN_DEPLOYER_PRIVATE_KEY",
    "CREDITCOIN_WORKER_PRIVATE_KEY",
    "CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY",
    "CREDITCOIN_GUARDIAN_PRIVATE_KEY",
    "RUNTIME_PRIVATE_KEY",
    "ORG_ID",
    "RELEASE_ID",
    "AGENT_ID",
    "PAYMENT_RECIPIENT",
    "PAYMENT_AMOUNT",
];

const sourceKeyNames = [
    "SOURCE_DEPLOYER_PRIVATE_KEY",
    "SOURCE_PUBLISHER_PRIVATE_KEY",
    "SOURCE_EVALUATOR_PRIVATE_KEY",
    "SOURCE_APPROVER_PRIVATE_KEY",
    "SOURCE_STATUS_PRIVATE_KEY",
];

const destinationKeyNames = [
    "CREDITCOIN_DEPLOYER_PRIVATE_KEY",
    "CREDITCOIN_WORKER_PRIVATE_KEY",
    "CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY",
    "CREDITCOIN_GUARDIAN_PRIVATE_KEY",
    "RUNTIME_PRIVATE_KEY",
];

function value(name: string): string | undefined {
    const result = process.env[name]?.trim();
    return result || undefined;
}

function numberValue(name: string): number {
    const raw = value(name);
    const result = Number(raw);
    if (!raw || !Number.isSafeInteger(result) || result < 0) throw new Error(`${name} must be a non-negative integer`);
    return result;
}

function checkPrivateKeys(names: string[]): Record<string, string> {
    const addresses: Record<string, string> = {};
    const seen = new Map<string, string>();
    for (const name of names) {
        try {
            const address = new Wallet(value(name) as string).address;
            const previous = seen.get(address.toLowerCase());
            if (previous) throw new Error(`${name} reuses the address from ${previous}`);
            seen.set(address.toLowerCase(), name);
            addresses[name] = address;
        } catch (error) {
            throw new Error(`${name} is invalid: ${error instanceof Error ? error.message : error}`);
        }
    }
    return addresses;
}

async function sourceChainKey(provider: JsonRpcProvider, sourceChainId: number): Promise<number> {
    const info = new chainInfo.PrecompileChainInfoProvider(
        provider as unknown as ConstructorParameters<typeof chainInfo.PrecompileChainInfoProvider>[0],
    );
    const supported = await info.getSupportedChains();
    const matches = supported.filter((chain) => chain.chainId === sourceChainId);
    const configured = value("SOURCE_CHAIN_KEY");
    if (configured) {
        const key = Number(configured);
        if (!Number.isSafeInteger(key) || !matches.some((chain) => chain.chainKey === key)) {
            throw new Error(`SOURCE_CHAIN_KEY=${configured} is not configured for source chain ${sourceChainId}`);
        }
        return key;
    }
    if (matches.length !== 1) throw new Error(`Expected one live source key for chain ${sourceChainId}; found ${matches.length}`);
    return matches[0].chainKey;
}

async function main(): Promise<void> {
    const missing = requiredNames.filter((name) => !value(name));
    if (missing.length) throw new Error(`Missing environment variables:\n${missing.map((name) => `- ${name}`).join("\n")}`);

    const sourceChainId = numberValue("SOURCE_CHAIN_ID");
    const creditcoinChainId = numberValue("CREDITCOIN_CHAIN_ID");
    const proofBuilderUrl = new URL(value("CREDITCOIN_PROOF_BUILDER_URL") as string);
    if (!/^https?:$/.test(proofBuilderUrl.protocol)) throw new Error("CREDITCOIN_PROOF_BUILDER_URL must use http or https");

    const recipient = getAddress(value("PAYMENT_RECIPIENT") as string);
    if (recipient === ZeroAddress) throw new Error("PAYMENT_RECIPIENT must not be the zero address");
    const paymentAmount = parseEther(value("PAYMENT_AMOUNT") as string);
    if (paymentAmount <= 0n) throw new Error("PAYMENT_AMOUNT must be greater than zero");
    for (const name of ["ORG_ID", "RELEASE_ID", "AGENT_ID"]) {
        if (!value(name)) throw new Error(`${name} must not be empty`);
    }
    const releaseDirectory = resolve(process.cwd(), value("RELEASE_DIR") || "../fixtures/releases/demo");
    if (!(await stat(releaseDirectory)).isDirectory()) throw new Error(`RELEASE_DIR is not a directory: ${releaseDirectory}`);
    const releaseVersion = Number(value("RELEASE_VERSION") || "1");
    if (!Number.isSafeInteger(releaseVersion) || releaseVersion < 1) throw new Error("RELEASE_VERSION must be a positive integer");

    const addresses = checkPrivateKeys([...sourceKeyNames, ...destinationKeyNames]);
    const sourceRpc = new JsonRpcProvider(value("SOURCE_CHAIN_RPC_URL"));
    const creditcoinRpc = new JsonRpcProvider(value("CREDITCOIN_RPC_URL"));
    const [sourceNetwork, creditcoinNetwork] = await Promise.all([sourceRpc.getNetwork(), creditcoinRpc.getNetwork()]);
    if (Number(sourceNetwork.chainId) !== sourceChainId) throw new Error(`SOURCE_CHAIN_ID=${sourceChainId} does not match RPC chain ${sourceNetwork.chainId}`);
    if (Number(creditcoinNetwork.chainId) !== creditcoinChainId) throw new Error(`CREDITCOIN_CHAIN_ID=${creditcoinChainId} does not match RPC chain ${creditcoinNetwork.chainId}`);
    const chainKey = await sourceChainKey(creditcoinRpc, sourceChainId);
    const fundingNames = [...sourceKeyNames, "CREDITCOIN_DEPLOYER_PRIVATE_KEY", "CREDITCOIN_WORKER_PRIVATE_KEY"];
    const fundingBalances = await Promise.all(fundingNames.map(async (name) => {
        const provider = name.startsWith("SOURCE_") ? sourceRpc : creditcoinRpc;
        const balance = await provider.getBalance(addresses[name]);
        return { name, address: addresses[name], balanceWei: balance.toString(), balance: formatEther(balance) };
    }));
    const unfunded = fundingBalances.filter((entry) => entry.balanceWei === "0");
    if (unfunded.length) throw new Error(`Fund these transaction senders before deployment:\n${unfunded.map((entry) => `- ${entry.name} (${entry.address})`).join("\n")}`);

    console.log(JSON.stringify({
        ok: true,
        source: { chainId: sourceChainId, chainKey, rpcConfigured: true },
        creditcoin: { chainId: creditcoinChainId, rpcConfigured: true, proofBuilderConfigured: true },
        release: { directory: releaseDirectory, version: releaseVersion, recipient, paymentAmount: paymentAmount.toString() },
        roles: addresses,
        fundingBalances,
        sendsTransactions: false,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
