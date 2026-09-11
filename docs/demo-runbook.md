# AIRLOCK demo runbook

## Local rehearsal

```sh
cd contracts && npm run ci
cd ../server && npm test
cd ../client && npm run build && npm run lint
```

The local contract suite proves two allowed calls, wrong-recipient and
over-value rejection, replay protection, vault containment, and proven
revocation using deterministic proof fixtures. It is not a substitute for the
live Attestcoin gate.

## Live rehearsal

1. Copy `contracts/.env.example` to `contracts/.env` and use separate,
   low-value funded keys for publisher, evaluator, approver, status authority,
   deployer, gas-only worker, guardian, policy admin, and runtime signer.
2. Run `npm run live:check`, then `npm run deploy-live` from `contracts`.
3. Import the four publication/evaluation/approval/status proofs with
   `IMPORT_KIND=... npm run import-proof`.
   For independent source transactions, `SOURCE_TX_HASHES=0x...,0x...`
   and `IMPORT_KINDS=artifact,evaluation npm run import-proof:batch` submits
   one atomic batch of up to 10 proofs.
4. Run `LIVE_STEP=execute npm run live-step`; retain the capability and allowed
   payment transaction hashes.
5. Run `LIVE_STEP=deposit npm run live-step`; retain the bounded deposit
   transaction hash.
6. Run `LIVE_STEP=revoke npm run live-step`; this prepares the bounded blocked
   intent before publishing the source revocation.
7. Import the revocation proof.
8. Run `LIVE_STEP=blocked npm run live-step`; the router static call must revert.

TEE extension rehearsal: set `TEE_REQUIRED=true`, `TEE_MEASUREMENT`, and
`TEE_QUOTE_HASH` only after the verifier has independently validated the quote,
deploy the current contracts, import the source proofs, then run
`npm run register-tee-binding`. A `teeRequired=true` policy can issue only
while that exact runtime/artifact/container binding is active; revoking the
binding blocks later capability consumption.
This flow is verifier-attested, not an on-chain hardware-quote proof.

The same sequence can be driven by `WORKER_ONCE=true npm run worker` for a
single source scan, or `npm run worker` for polling/retry behavior.
The deployed vault holds only the native value required by the approved
payment and deposit actions. The signer accepts only the typed `vendor.pay`
proposal shape; it
never accepts a caller-supplied target, selector, or raw calldata.

## Negative cases to show

- mutated release fixture fails verification against the approved manifest
  (`../fixtures/releases/mutated`);
- unapproved recipient;
- value above the validator or capability ceiling;
- changed calldata hash;
- wrong runtime signature;
- reused action nonce or idempotency key;
- direct vault call;
- replayed source proof;
- post-revocation action.

Never describe fixture proof transactions as live evidence. Record timing,
proof size, gas, and rejection reason in the final evidence page.

The primary live evidence is in `evidence.md`; the second clean-clone replay is
in `rehearsal.md`.
