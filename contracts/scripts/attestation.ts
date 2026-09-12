type ChainInfoProvider = {
    getContinuityBounds: (chainKey: number, height: number) => Promise<{ isAttested: boolean }>;
};

export async function waitUntilHeightAttested(
    provider: ChainInfoProvider,
    chainKey: number,
    targetHeight: number,
    pollIntervalMs = 5_000,
    waitTimeoutMs = 900_000,
    extraDelayMs = 15_000,
): Promise<void> {
    const startedAt = Date.now();
    while (true) {
        const bounds = await provider.getContinuityBounds(chainKey, targetHeight);
        if (bounds.isAttested) {
            if (extraDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, extraDelayMs));
            return;
        }
        if (Date.now() - startedAt > waitTimeoutMs) {
            throw new Error(`Timeout waiting for height ${targetHeight} to be attested on chain key ${chainKey}`);
        }
        console.debug(`Height ${targetHeight} is not yet attested on chain key ${chainKey}. Retrying in ${pollIntervalMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
}
