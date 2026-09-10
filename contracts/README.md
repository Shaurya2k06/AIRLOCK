# AIRLOCK contracts

This package contains the local AIRLOCK vertical slice:

`source evidence → proof adapter → deterministic capability → typed router → vault → revocation`

## Verify locally

```sh
npm install
npm run ci
```

The Solidity test suite uses `MockBlockProver` and `MockReceiptDecoder` only as
local fixtures. `OfficialReceiptDecoder` wraps the pinned `@gluwa/asc-contracts`
EVM V1 decoder, while the adapter calls Creditcoin's native BlockProver ABI.

The test covers separate source roles, proof and replay checks, deterministic
issuance, EIP-712 intents, scope proofs, validators, vault containment,
budgets, idempotency, and proven revocation.

## Live testnet path

```sh
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

`deploy-live` writes `../deployments.json` (ignored by git) and emits the four
source events. `import-proof` uses the saved transaction hashes unless
`SOURCE_TX_HASH` is set, waits for the source height to be attested, asks the
official Proof Builder for the proof, and submits it with the gas-only worker.
`live-step` issues and executes the capability, emits revocation after the
allowed action, and simulates the post-revocation action to prove it is
blocked.
