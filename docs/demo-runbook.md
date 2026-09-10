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
4. Run `LIVE_STEP=execute npm run live-step`; retain the capability and allowed
   payment transaction hashes.
5. Run `LIVE_STEP=revoke npm run live-step`.
6. Import the revocation proof.
7. Run `LIVE_STEP=blocked npm run live-step`; the router simulation must revert.

The same sequence can be driven by `WORKER_ONCE=true npm run worker` for a
single source scan, or `npm run worker` for polling/retry behavior.
The deployed vault holds the demo `MockStablecoin` for the vendor payment and
native test value only for the bounded deposit action.
The signer accepts only the typed `stablecoin.transfer` proposal shape; it
never accepts a caller-supplied target, selector, or raw calldata.

## Negative cases to show

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
