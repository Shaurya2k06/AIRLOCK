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

The adapter also supports atomic batches of up to 10 proofs with one shared
continuity proof: set `SOURCE_TX_HASHES` and `IMPORT_KINDS`, then run
`npm run import-proof:batch`. Optional TEE-required policies use
`RuntimeBindingRegistry`; set `TEE_REQUIRED=true`, then after an independently
validated quote register its measurement and hash with
`npm run register-tee-binding`. This registry is verifier-attested and does
not verify hardware quotes on-chain.

After the four imports, `LIVE_STEP=execute npm run live-step` runs the allowed
action; `LIVE_STEP=revoke`, a revocation proof import, and
`LIVE_STEP=blocked` complete the negative path.

The dashboard uses only `CREDITCOIN_RPC_URL` and the generated
`deployments.json` for live reads; the Vite client optionally uses
`VITE_API_URL` (default `http://127.0.0.1:8787`). The `/demo` runbook surfaces
the terminal workflow and can run its allowlisted testnet commands when the
server has `AIRLOCK_ENABLE_WRITES=true` and, for hosted deployments,
`AIRLOCK_WRITE_TOKEN`. Public live addresses,
receipts, proof metrics, and enforcement results are recorded in [`docs/evidence.md`](docs/evidence.md) and
[`docs/deployment-manifest.json`](docs/deployment-manifest.json). A second
clean-clone live rehearsal is recorded in [`docs/rehearsal.md`](docs/rehearsal.md).
The generated evidence walkthrough is [`docs/demo-video.mp4`](docs/demo-video.mp4);
the recording script is [`docs/demo-video-script.md`](docs/demo-video-script.md).

For local wiring, copy `server/.env.example` to `server/.env` and
`client/.env.example` to `client/.env` when using a non-default API URL.

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
  native-payment/deposit validators, and isolated local proof fixtures.
- `contracts/contracts/Airlock.t.sol` — end-to-end contract scenarios,
  including proven revocation and negative actions.
- `contracts/scripts/manifest.mjs` — canonical CBOR manifest, artifact Merkle
  root, release digest, verification, and file proofs.
- `contracts/scripts/deploy-live.ts`, `contracts/scripts/import-proof.ts`, and
  `contracts/scripts/import-batch-proof.ts` — reproducible Sepolia → Creditcoin
  deployment and single/batched proof submission.
- `contracts/scripts/register-tee-binding.ts` — verifier-attested runtime
  binding registration for TEE-required policies.
- `contracts/scripts/worker.ts` — cursor-backed source watcher and proof retry
  loop.
- `server/index.js` — chain-backed control-plane API.
- `server/credential.js`, `server/mcp-gateway.js`, and `server/a2a.js` —
  release-bound credentials and capability-aware agent protocol gateways.
- `server/erc8004.js`, `server/evaluator-quorum.js`, `server/trace.js`, and
  `server/x402.js` — identity, independent evaluation, trace, and payment
  adapters with explicit configuration gates.
- `client/src/App.tsx` — evidence, capability, and enforcement console.
- `docs/` — architecture, Attestcoin integration, threat model, live evidence,
  deployment manifest, rehearsal evidence, and demo runbook.

The base-mode claim is deliberately narrow: the capability binds a release
digest to a runtime key; it does not prove that a running process loaded those
weights. That requires the optional TEE binding described in `context.md`.

The protocol extension details and honest integration boundaries are documented
in [`docs/protocol.md`](docs/protocol.md).
