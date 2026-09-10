# Attestcoin integration

The canonical deployment is Ethereum Sepolia → Creditcoin CC3 testnet.
Chain identity is the Attestcoin `chainKey`, not the EVM chain ID. The live
script queries Creditcoin ChainInfo and refuses an ambiguous or mismatched key.

The pinned runtime dependencies are:

- `@gluwa/usc-sdk` `0.18.0` for ChainInfo and hosted Proof Builder calls.
- `@gluwa/asc-contracts` `0.2.1` for the official `EvmV1Decoder` source.
- BlockProver precompile: `0x0000000000000000000000000000000000000FD2`.
- ChainInfo precompile: `0x0000000000000000000000000000000000000FD3`.

For each source transaction, `import-proof.ts`:

1. Confirms the source RPC chain and receipt status.
2. Resolves and validates the live Attestcoin chain key.
3. Waits for the source height to be attested.
4. Requests `txBytes`, the Merkle proof, and continuity proof from Proof
   Builder.
5. Submits the proof-shaped request to the evidence-specific adapter method.

The Creditcoin adapter performs the security checks again inside the
transaction. Off-chain decoding or worker interpretation is never accepted as
evidence.

`worker.ts` watches only the five configured source event streams, records an
observed cursor before submission, retries transient imports, and delegates the
actual proof build/import to `import-proof.ts`. It has only the configured
Creditcoin worker key, so it cannot write evidence directly or issue
capabilities.

## Local verification

Local tests use `MockBlockProver` and `MockReceiptDecoder` solely to exercise
state transitions quickly. `OfficialReceiptDecoderTest` separately checks the
official encoded receipt shape. The live deployment script never wires either
mock.

## Live commands

```sh
cd contracts
cp .env.example .env
npm run deploy-live

IMPORT_KIND=artifact npm run import-proof
IMPORT_KIND=evaluation npm run import-proof
IMPORT_KIND=approval npm run import-proof
IMPORT_KIND=status npm run import-proof

LIVE_STEP=execute npm run live-step
LIVE_STEP=revoke npm run live-step
IMPORT_KIND=revocation npm run import-proof
LIVE_STEP=blocked npm run live-step
```

Proof latency begins only after source finality and Attestcoin attestation.
The generated `deployments.json` contains non-secret addresses and hashes and
is ignored by git. Never put private keys or RPC credentials in evidence files.
