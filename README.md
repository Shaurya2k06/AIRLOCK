# AIRLOCK

AIRLOCK is a release firewall for autonomous on-chain agents. It proves the
artifact, evaluation, deployment approval, and active status of one release;
then issues a short-lived capability that a typed router and vault enforce.

```text
Sepolia evidence → Attestcoin proof → deterministic capability
→ EIP-712 tool intent → validator → vault execution → revocation
```

## Local verification

```sh
cd contracts && npm run ci
cd ../server && npm test
cd ../client && npm run build && npm run lint
```

Build and verify the canonical release commitment locally:

```sh
cd contracts
npm run manifest -- build --input ../fixtures/releases/demo --output /tmp/airlock-manifest.json
npm run manifest -- verify --file /tmp/airlock-manifest.json --input ../fixtures/releases/demo
```

The local contract suite is intentionally deterministic. It uses fixture proof
and receipt adapters to exercise the complete authorization and containment
path without requiring a wallet, RPC endpoint, or proof-builder account.

The live path is available from `contracts`: `npm run deploy-live` deploys and
seeds the two-chain demo, then `IMPORT_KIND=<kind> npm run import-proof` submits
each real proof through Creditcoin's BlockProver. `npm run worker` automates
source-event discovery and retries; it has no evidence-writing or
capability-issuance authority.

After the four imports, `LIVE_STEP=execute npm run live-step` runs the allowed
action; `LIVE_STEP=revoke`, a revocation proof import, and
`LIVE_STEP=blocked` complete the negative path.

The dashboard uses only `CREDITCOIN_RPC_URL` and the generated
`deployments.json` for live reads; the Vite client optionally uses
`VITE_API_URL` (default `http://127.0.0.1:8787`). The `/demo` runbook can
surface the terminal workflow and, only with `AIRLOCK_ENABLE_WRITES=true` on a
loopback-bound server, run its allowlisted commands. Public live addresses,
receipts, proof metrics, and enforcement results are recorded in [`docs/evidence.md`](docs/evidence.md) and
[`docs/deployment-manifest.json`](docs/deployment-manifest.json). A second
clean-clone live rehearsal is recorded in [`docs/rehearsal.md`](docs/rehearsal.md).
The generated evidence walkthrough is [`docs/demo-video.mp4`](docs/demo-video.mp4);
the recording script is [`docs/demo-video-script.md`](docs/demo-video-script.md).

## Live run inputs

Copy `contracts/.env.example` to `contracts/.env` only when running the real
Sepolia → Creditcoin flow. Private keys stay local and are never committed.
Run `npm run live:check` before deployment; it performs read-only validation
and sends no transactions.
Live deployments are written to `deployments.json`; generated addresses are
not configuration inputs.

## Current implementation

- `contracts/contracts/Airlock.sol` — source registries, evidence adapter,
  official decoder boundary, policy, capabilities, EIP-712 router, vault,
  mock stablecoin/deposit validators, and local proof fixtures.
- `contracts/contracts/Airlock.t.sol` — end-to-end contract scenarios,
  including proven revocation and negative actions.
- `contracts/scripts/manifest.mjs` — canonical CBOR manifest, artifact Merkle
  root, release digest, verification, and file proofs.
- `contracts/scripts/deploy-live.ts` and `contracts/scripts/import-proof.ts` —
  reproducible Sepolia → Creditcoin deployment and proof submission.
- `contracts/scripts/worker.ts` — cursor-backed source watcher and proof retry
  loop.
- `server/index.js` — fixture/live read-only control-plane API.
- `client/src/App.tsx` — evidence, capability, and enforcement console.
- `docs/` — architecture, Attestcoin integration, threat model, live evidence,
  deployment manifest, rehearsal evidence, and demo runbook.

The base-mode claim is deliberately narrow: the capability binds a release
digest to a runtime key; it does not prove that a running process loaded those
weights. That requires the optional TEE binding described in `context.md`.
