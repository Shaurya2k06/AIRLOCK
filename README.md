# AIRLOCK

AIRLOCK is a release firewall for autonomous on-chain agents. It proves the
artifact, evaluation, deployment approval, and active status of one release;
then issues a short-lived capability that a typed router and vault enforce.

```text
Sepolia evidence → Attestcoin proof → deterministic capability
→ EIP-712 tool intent → validator → vault execution → revocation
```

## AIRLOCK whitepaper

### Abstract

AIRLOCK makes autonomous-agent authority release-specific. A wallet address,
API key, or worker signature is not enough: the agent must be running under a
release that has a canonical artifact identity, passed the required evaluation,
received deployment approval, and remains active. Only then can AIRLOCK issue a
short-lived, bounded capability for the runtime key.

The design goal is simple:

```text
authority = artifact ∧ evaluation ∧ approval ∧ active status
          ∧ policy ∧ capability ∧ valid intent
```

### The problem

Agent systems change in many places at once: model weights, adapters,
tokenizers, prompts, tools, containers, dependencies, policies, and source
revisions. Traditional authorization normally identifies the caller, not the
exact release that earned authority. A compromised or outdated process can
therefore retain access even after the intended release has changed or been
revoked.

AIRLOCK treats release identity as a security boundary. It does not attempt to
judge whether a model is intelligent or whether an evaluator is correct. It
enforces the narrower claim that a specific, approved release is the only
release eligible for a specified capability.

### Release identity and evidence

A manifest commits to the release inputs, including model artifacts, adapters,
tokenizer, system and developer prompts, tool definitions, container image,
dependency lockfile, SBOM, build provenance, source revision, and evaluation
suite. The manifest produces one deterministic `releaseDigest`; changing one
byte produces a different release.

Four independent evidence classes must converge on the same organization,
agent, release, policy, nonce, and validity window:

1. Artifact publication identifies the exact release.
2. Evaluation certification records the required result and evaluator.
3. Deployment approval authorizes the release and its parameters.
4. Active status records activation, pause, or revocation.

The resulting evidence root is consumed by the capability registry. Missing,
stale, mismatched, or revoked evidence fails closed.

### Cross-chain verification

The supported testnet path is Ethereum Sepolia → Attestcoin → Creditcoin CC3.
Source-chain events are proven through Attestcoin. On Creditcoin, AIRLOCK
checks receipt status, the approved emitter, topic, log index, event schema,
decoded fields, and continuity before importing the semantic evidence.

```text
Ethereum source event
        ↓
Attestcoin inclusion and continuity proof
        ↓
Creditcoin receipt and semantic verification
        ↓
AIRLOCK evidence registry
        ↓
deterministic capability decision
```

The proof worker supplies liveness by discovering events and retrying proof
submission. It cannot create evidence, approve a release, or issue authority.
The contracts verify the facts that matter; no centralized bridge signature is
used as the authorization decision.

### Capability and execution boundary

Once the evidence conjunction succeeds, AIRLOCK issues an audience-bound
`AIRLOCK_CREDENTIAL_V1` capability. The credential binds a runtime key to the
release digest, policy hash, scope root, evidence root, spend limit, call limit,
and expiry. Delegated credentials can narrow authority but cannot widen the
parent capability. Capabilities are non-transferable, short-lived, and
revalidated for every action.

The runtime path is deliberately typed:

```text
LLM proposes intent
        ↓
typed EIP-712 intent
        ↓
scope, policy, nonce, and budget checks
        ↓
exact calldata validation
        ↓
AgentVault execution through the router
```

The model does not hold the vault key. Raw transaction forwarding, arbitrary
targets, replayed nonces, expired capabilities, and over-budget actions are
rejected. The vault is callable only through the validated router.

### Protocol surfaces

AIRLOCK exposes the same release-bound authority to agent protocols:

- The MCP gateway filters `tools/list`, revalidates `tools/call`, and returns
  `ALLOW`, `AUTH_REQUIRED`, or `DENY` based on current capability state.
- The A2A surface publishes an agent card and represents missing authority as
  an authentication-required task state rather than silently executing.
- ERC-8004 and x402 are adapters with explicit configuration gates; they do
  not change AIRLOCK's evidence or enforcement model.
- Runtime assurance is layered. Base mode binds a digest to a runtime key; an
  optional TEE-required mode adds verifier-attested measurement and artifact
  binding. Base mode does not prove which weights a running process loaded.

### Revocation and security properties

Revocation is monotonic. A proven source-chain revocation is imported into
Creditcoin and makes the capability unusable; a local guardian pause can stop
execution while cross-chain evidence is pending. Short TTLs, freshness windows,
watchers, and emergency controls reduce the delay inherent in cross-chain
updates.

The security boundary includes receipt-status validation, exact digest matching,
approved emitters and roles, replay protection, scope intersection, runtime-key
binding, budget accounting, calldata validation, direct-vault protection, and
least-privilege proof workers. AIRLOCK does not guarantee model correctness,
evaluator competence, bias-free behavior, or truth of arbitrary off-chain
claims. It also makes no zero-knowledge claim about model execution.

The implementation and threat boundaries are documented in [`docs/architecture.md`](docs/architecture.md), [`docs/protocol.md`](docs/protocol.md), and [`docs/threat-model.md`](docs/threat-model.md). Live testnet evidence is recorded in [`docs/evidence.md`](docs/evidence.md).

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
`VITE_API_URL` (default `https://airlock-control-plane.onrender.com`). The `/demo` runbook surfaces
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
weights. That requires the optional TEE binding described in
[`docs/architecture.md`](docs/architecture.md).

The protocol extension details and honest integration boundaries are documented
in [`docs/protocol.md`](docs/protocol.md).
