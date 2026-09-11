# AIRLOCK contracts

This package contains the local AIRLOCK vertical slice:

`source evidence → proof adapter → deterministic capability → typed router → vault → revocation`

## Verify locally

```sh
npm install
npm run ci
```

Build and verify a release commitment:

```sh
npm run manifest -- build --input ../fixtures/releases/demo --output /tmp/airlock-manifest.json
npm run manifest -- verify --file /tmp/airlock-manifest.json --input ../fixtures/releases/demo
npm run manifest -- prove --file /tmp/airlock-manifest.json --path tools.json
```

The manifest uses canonical CBOR, rejects symlink/path escapes, hashes sorted
artifact leaves, and derives `releaseDigest` from the release components.

The Solidity test suite uses `MockBlockProver` and `MockReceiptDecoder` only as
local fixtures. `OfficialReceiptDecoder` wraps the pinned `@gluwa/asc-contracts`
EVM V1 decoder, while the adapter calls Creditcoin's native BlockProver ABI.

The test covers separate source roles, proof and replay checks, deterministic
issuance, EIP-712 intents, scope proofs, native-payment and deposit validators,
vault containment, budgets, idempotency, and proven revocation. The isolated
unit suite also keeps an in-memory token fixture for accounting fuzz cases.
The suite also runs a bounded stablecoin accounting fuzz test and a capability
spend/call invariant.

## Live testnet path

```sh
cp .env.example .env
npm run live:check
npm run deploy-live
IMPORT_KIND=artifact npm run import-proof
IMPORT_KIND=evaluation npm run import-proof
IMPORT_KIND=approval npm run import-proof
IMPORT_KIND=status npm run import-proof
LIVE_STEP=execute npm run live-step
LIVE_STEP=deposit npm run live-step
LIVE_STEP=revoke npm run live-step
IMPORT_KIND=revocation npm run import-proof
LIVE_STEP=blocked npm run live-step
```

`deploy-live` writes `../deployments.json` (ignored by git) and emits the four
source events. `import-proof` uses the saved transaction hashes unless
`SOURCE_TX_HASH` is set, waits for the source height to be attested, asks the
official Proof Builder for the proof, and submits it with the gas-only worker.
`live-step` issues and executes the capability, sends a bounded native payment
and deposit through the router, emits revocation after the allowed actions,
and statically checks that the post-revocation action is blocked.
Set `INTENT_FILE` to a JSON proposal with `tool: "vendor.pay"`, a
recipient, and an amount to exercise the isolated signer; it rejects recipients
or amounts outside the deployed capability before signing.

For continuous source-event discovery, run `npm run worker`. It persists a
cursor and event journal in `worker-state.json`, retries transient proof
failures, and treats adapter replay as already consumed. `WORKER_ONCE=true`
performs one scan for a smoke test.
