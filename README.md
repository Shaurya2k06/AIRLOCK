# AIRLOCK

AIRLOCK is a release-authority layer for autonomous agents. It binds authority
to one exact release, proves the release evidence cross-chain, issues bounded
capabilities, and enforces every action through a typed router and vault.

```text
Release manifest → Sepolia evidence → Attestcoin proof → Creditcoin evidence
→ capability → MCP/A2A credential → typed intent → validator → vault
```

## What AIRLOCK proves

An agent does not receive authority merely because it owns a wallet. A
capability requires the conjunction of:

```text
artifact ∧ evaluation ∧ approval ∧ active status
∧ policy ∧ runtime binding ∧ valid typed intent
```

The release digest commits to the model artifacts, tokenizer, prompts, tools,
container image, SBOM, build provenance, agent cards, policy bundle, Sigstore
bundle, Rekor proof, and release version. Changing a committed input produces a
new digest.

The four evidence classes must match the same organization, agent, release,
policy, nonce, and validity window:

1. Artifact publication.
2. Evaluation certification.
3. Deployment approval.
4. Active status or revocation.

Once proven, a capability is bound to a runtime key, release digest, scope
root, spend budget, call budget, policy hash, evidence root, audience, and
expiry. Capabilities are short-lived, non-transferable, attenuable, and
revalidated on every action.

## Architecture

```text
Ethereum Sepolia registries
  ├─ ArtifactPublished
  ├─ EvaluationCertified
  ├─ DeploymentApproved
  └─ ReleaseStatusCheckpoint / ReleaseRevoked
          │
          ▼
Attestcoin inclusion + continuity proof
          │
          ▼
Creditcoin AirlockAttestcoinAdapter
  ├─ official receipt decoding
  ├─ emitter/topic/schema/log checks
  ├─ semantic field validation
  └─ replay protection
          │
          ▼
EvidenceRegistry + PolicyRegistry
          │
          ▼
CapabilityIssuer → ToolRouter → AgentVault → bounded destination
          ▲
          │
RuntimeBindingRegistry (optional verifier-attested L2 binding)
```

The proof worker provides liveness by finding events and retrying submissions.
It cannot create evidence, approve releases, or issue capabilities. The
authorization decision is made by the Creditcoin contracts, not by a worker
signature or centralized bridge.

### Contract responsibilities

| Contract | Chain | Responsibility |
| --- | --- | --- |
| `ArtifactRegistry` | Sepolia | Publishes release artifact commitments |
| `EvaluationRegistry` | Sepolia | Records evaluator result and validity |
| `DeploymentApprovalRegistry` | Sepolia | Approves runtime, policy, scope, and budgets |
| `ReleaseStatusRegistry` | Sepolia | Checkpoints active state and monotonic revocation |
| `AirlockAttestcoinAdapter` | Creditcoin | Verifies proofs and imports semantic evidence |
| `OfficialReceiptDecoder` | Creditcoin | Pinned EVM V1 receipt decoding boundary |
| `EvidenceRegistry` | Creditcoin | Stores adapter-only normalized evidence |
| `PolicyRegistry` | Creditcoin | Stores policy hashes, pauses, and constraints |
| `CapabilityIssuer` | Creditcoin | Issues and accounts for release-bound capabilities |
| `CapabilityDelegationRegistry` | Creditcoin | Registers attenuated parent/child capabilities |
| `RuntimeBindingRegistry` | Creditcoin | Stores verifier-attested runtime bindings |
| `ToolRouter` | Creditcoin | EIP-712, scope, validator, nonce, budget, and execution checks |
| `AgentVault` | Creditcoin | Router-only custody and bounded execution |

## Attestcoin integration

The supported live path is:

```text
Ethereum Sepolia (chain ID 11155111)
        ↓ source receipt
Attestcoin chain key 1
        ↓ inclusion + continuity proof
Creditcoin CC3 testnet (chain ID 102031)
        ↓
AIRLOCK evidence registry
```

The chain key is resolved from Creditcoin ChainInfo; it is not inferred from
the EVM chain ID. The live importer:

1. Confirms the source chain and receipt status `1`.
2. Resolves the configured Attestcoin chain key.
3. Waits for the source height to be attested.
4. Requests transaction bytes, Merkle proof, and continuity proof from the
   official Proof Builder.
5. Submits the evidence-specific proof method to Creditcoin.

The adapter verifies the proof again on-chain and checks the source emitter,
topic, topic count, data length, log index, event schema, decoded fields,
receipt status, continuity, and replay state.

Pinned integration dependencies:

- `@gluwa/usc-sdk` `0.18.0` for ChainInfo and Proof Builder calls.
- `@gluwa/asc-contracts` `0.2.1` for the official EVM V1 decoder.
- BlockProver precompile: `0x0000000000000000000000000000000000000fd2`.
- ChainInfo precompile: `0x0000000000000000000000000000000000000fd3`.

Atomic proof batches support up to 10 proofs with one shared continuity proof.
The worker watches the five source event streams, persists a cursor, retries
transient failures, and has no evidence-writing authority.

## Current live deployment

This is the canonical public deployment currently used by production and the
demo. Addresses and transaction hashes are public; private keys and RPC
credentials are intentionally not stored here.

### Release passport

| Field | Value |
| --- | --- |
| Release version | `6` |
| `orgId` | `0x19f14d9c15d90b47249d88d3fb11ada9dda7ba4d690fc48c533d1217ee726fa0` |
| `releaseId` | `0x8e0a115b6ca14dc079f590175807a4ef26d840174a4e5bdeaed593f888f6324b` |
| `agentId` | `0xc9bb4c9317790d917fe2da888cda19c1c96a65a7b8393ec0959bc352361d8c31` |
| `releaseDigest` | `0x3988ad5066f195a663fb00d74c20b7b6f5dc5e9806476c8f9e646a61cec10ebf` |
| `manifestHash` | `0x95f8eaf1dc68ea637b729ac3d7d9088a96415883ddbeb2c22b8f7bf2bdd651c9` |
| `artifactRoot` | `0xd87cf4659e3c13b431d649eed8e39cd4dcd0b97cc26a5e6670b9a4b1a993a6eb` |
| `passportHash` | `0x681e2936138fdd415cbd8a9e627225d5afd5a0f11e1bcdde4cfe800bbde85abf` |
| `policyHash` | `0xc92471674bc5018f1e95c94ac771cb64b1901fe3f7db347ffd5d8f84834495e8` |
| Runtime assurance | `L2` hardware-bound |
| OCI image | `ghcr.io/shaurya2k06/airlock-agent` |
| OCI digest | `sha256:048829241a46c73193ffd75619cb2830d25e123a818435b44c7daff871a48cbc` |

The production passport verifies the container, CycloneDX 1.7 SBOM, SLSA v1
provenance, Sigstore bundle, Rekor inclusion, and OCI manifest digest.

### Source-chain contracts

| Contract | Address |
| --- | --- |
| `ArtifactRegistry` | [`0xa945B065B89Ca0779c2997bD4A7691d5d90b4Bb8`](https://sepolia.etherscan.io/address/0xa945B065B89Ca0779c2997bD4A7691d5d90b4Bb8) |
| `EvaluationRegistry` | [`0x2116b934A63062E603426f6269156e5cED9bf68D`](https://sepolia.etherscan.io/address/0x2116b934A63062E603426f6269156e5cED9bf68D) |
| `DeploymentApprovalRegistry` | [`0xbC09B6bA4A50BBa22190bD004E84a7e83304e708`](https://sepolia.etherscan.io/address/0xbC09B6bA4A50BBa22190bD004E84a7e83304e708) |
| `ReleaseStatusRegistry` | [`0xf8A11D62745E2F31B5B9Fc2A300de8Ec19a43471`](https://sepolia.etherscan.io/address/0xf8A11D62745E2F31B5B9Fc2A300de8Ec19a43471) |

### Creditcoin contracts

| Contract | Address |
| --- | --- |
| `OfficialReceiptDecoder` | [`0xF64aD84D20960E216D1b2D9F608b4D48805e6ca8`](https://creditcoin-testnet.blockscout.com/address/0xF64aD84D20960E216D1b2D9F608b4D48805e6ca8) |
| `EvidenceRegistry` | [`0x1F3FdFD49BDa4889570d7f1e42630123a0FCcc15`](https://creditcoin-testnet.blockscout.com/address/0x1F3FdFD49BDa4889570d7f1e42630123a0FCcc15) |
| `AirlockAttestcoinAdapter` | [`0x94eA3732Ac915F62dfe9C7DF2422516085c9C256`](https://creditcoin-testnet.blockscout.com/address/0x94eA3732Ac915F62dfe9C7DF2422516085c9C256) |
| `PolicyRegistry` | [`0x9bb4BD4dcc2d35dabF596978EF77655877524Eaf`](https://creditcoin-testnet.blockscout.com/address/0x9bb4BD4dcc2d35dabF596978EF77655877524Eaf) |
| `RuntimeBindingRegistry` | [`0xbd19baa228B99F464fc3C78342c77932a43CcEaC`](https://creditcoin-testnet.blockscout.com/address/0xbd19baa228B99F464fc3C78342c77932a43CcEaC) |
| `CapabilityIssuer` | [`0x8FFe9Fb9a96F3CDc0917644EF9C50c143E65dF57`](https://creditcoin-testnet.blockscout.com/address/0x8FFe9Fb9a96F3CDc0917644EF9C50c143E65dF57) |
| `CapabilityDelegationRegistry` | [`0xAB2e17FDE38a79c8d9f958cED3C757812912732c`](https://creditcoin-testnet.blockscout.com/address/0xAB2e17FDE38a79c8d9f958cED3C757812912732c) |
| `AgentVault` | [`0x2844649001436f6d6983cEB492B63a7B7422F958`](https://creditcoin-testnet.blockscout.com/address/0x2844649001436f6d6983cEB492B63a7B7422F958) |
| `ToolRouter` | [`0xdC33aCcb30E67A107D11663AEA1B124e02F4dD88`](https://creditcoin-testnet.blockscout.com/address/0xdC33aCcb30E67A107D11663AEA1B124e02F4dD88) |
| `BoundedDepositProtocol` | [`0x26ccb5b8DF8fE853C062EEFcce2Ce625c28fF885`](https://creditcoin-testnet.blockscout.com/address/0x26ccb5b8DF8fE853C062EEFcce2Ce625c28fF885) |
| `NativePaymentValidator` | [`0xfa98c7b3b7012d9Dc966592747FaeDa55fd13Ac3`](https://creditcoin-testnet.blockscout.com/address/0xfa98c7b3b7012d9Dc966592747FaeDa55fd13Ac3) |
| `BoundedDepositValidator` | [`0x54d9cd8adE472D721B4FBFa0453626Ca68D5C647`](https://creditcoin-testnet.blockscout.com/address/0x54d9cd8adE472D721B4FBFa0453626Ca68D5C647) |

### Proven release events

| Evidence | Sepolia transaction | Creditcoin import |
| --- | --- | --- |
| Artifact | [`0xb68f5d…405c0`](https://sepolia.etherscan.io/tx/0xb68f5d72b3c24c36c6d05bb7273a01bfde7495d22ee5547004ff7ca27cf405c0) | [`0x26aba4…914e3`](https://creditcoin-testnet.blockscout.com/tx/0x26aba4145461d65ac73d060f181b8069120443dee63459eec14d9bdebf1914e3) |
| Evaluation | [`0xb12322…7e864`](https://sepolia.etherscan.io/tx/0xb12322d8b012cc16cf6e31b82300798b5a83fe9493705af7c36a9e30fe57e864) | [`0x21d471…90a1c`](https://creditcoin-testnet.blockscout.com/tx/0x21d471d276b7a2549067bca0d2c88c53a63d08357f3db7acff35bf888a390a1c) |
| Approval | [`0x15c26b…b4772`](https://sepolia.etherscan.io/tx/0x15c26b30d9d0223dc06b5a011462e9e18e4dc72aa66de6338ae866719bbb4772) | [`0xf29cf1…6d8906`](https://creditcoin-testnet.blockscout.com/tx/0xf29cf1e03fbae1cd67971a8597812265f246c66bb33bb3f92a4c99c35f6d8906) |
| Active status | [`0x95c8df…05084`](https://sepolia.etherscan.io/tx/0x95c8df4043e84fc1d5f2c9906ec8f892211efda8d9c1f1ac2a2b772362905084) | [`0x4047d2…d02b3`](https://creditcoin-testnet.blockscout.com/tx/0x4047d2e175ad8d1435614a629d96e79c25eaa45f81936f5ae3478560cf2d02b3) |

### Runtime binding

| Field | Value |
| --- | --- |
| Binding ID | `0x604c6fafd66ae155e011b32b84c57a9ded41639b5db705c9f4a93c57222045fe` |
| Measurement | `0x8f04d264ede334706b54f0737f4e412657bf75d1d4c9fcd6f8bbfd3f494e56e9` |
| Quote hash | `0xed41476ae8c185f8f64dd14b8f09a4a60bff30943f3399dbaffb41d9c378c123` |
| Runtime nonce | `2` |
| Validity | 24 hours from registration on 2026-09-12 |
| Registration transaction | [`0x73ca87…30be60`](https://creditcoin-testnet.blockscout.com/tx/0x73ca87d3e17d45c27920df5509cbed357b006af08fb1a992cc3dd4de7030be60) |

L2 is verifier-attested. The registry stores the measurement, quote hash,
artifact/container binding, key, nonce, and validity window; it does not claim
to verify hardware quotes on-chain.

## Agent protocol surfaces

### MCP

`POST /mcp` supports `initialize`, `tools/list`, `tools/call`, and `ping`.
The gateway only lists tools authorized by the credential, revalidates the
release, scope, recipient, amount, budget, call count, and status immediately
before execution, and returns structured `ALLOW`, `AUTH_REQUIRED`, or `DENY`
results. It emits `notifications/tools/list_changed` when authority changes.

### A2A and credentials

`GET /.well-known/agent-card.json` publishes the AIRLOCK authorization skill.
`POST /a2a` returns `COMPLETED`, `AUTH_REQUIRED`, or `FAILED` with the AIRLOCK
decision in task metadata.

`POST /api/credentials/issue` returns an EIP-712 `AIRLOCK_CREDENTIAL_V1`
credential bound to the Creditcoin router, target chain, audience, release,
policy, scope, budget, validity, evidence root, and trace root.

`POST /api/credentials/delegate` registers an attenuated child capability
on-chain. A child may reduce scope, spend, calls, risk, depth, or lifetime, but
never expand its parent. Parent revocation cascades to child consumption.

### ERC-8004, x402, and traces

The deployed ERC-8004 identity is registry
`eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e`, agent ID `10239`.
The adapter validates the registration URI, registry, agent ID, and advertised
release digest; identity is not treated as safety proof.

`GET /x402/protected` emits an x402 v2 payment requirement and validates
network, recipient, and amount. Settlement is accepted only when the configured
facilitator returns success.

`GET /api/trace` returns a privacy-preserving graph connecting agent, release
passport, proven evidence, capability, tool call, and transaction. Raw prompts
and chain-of-thought are never committed.

## Live demo and API

Production:

- Landing page: <https://airlock-console.vercel.app/>
- Live demo: <https://airlock-console.vercel.app/demo>
- Control plane: <https://airlock-control-plane.onrender.com>
- Health: <https://airlock-control-plane.onrender.com/health>
- Protocol: <https://airlock-control-plane.onrender.com/api/protocol>
- Passport: <https://airlock-control-plane.onrender.com/api/release-passport>
- Agent card: <https://airlock-control-plane.onrender.com/.well-known/agent-card.json>

The demo's **Run end to end** action executes:

```text
preflight
→ deploy and seed release
→ import four evidence proofs
→ issue capability and run allowed payment
→ run bounded deposit
→ issue AIRLOCK credential
→ run authorized MCP payment
→ publish revocation
→ import revocation proof
→ verify the blocked post-revocation call
```

Every live step returns source-chain and/or Creditcoin explorer links. The
browser never receives private keys or RPC credentials. Hosted writes require
`AIRLOCK_ENABLE_WRITES=true` and an allowed browser origin.

## Run locally

```sh
cd contracts && npm install && npm run ci
cd ../server && npm install && npm test
cd ../client && npm install && npm run build && npm run lint
```

Build and verify a release manifest:

```sh
cd contracts
npm run manifest -- build --input ../fixtures/releases/demo --output /tmp/airlock-manifest.json
npm run manifest -- verify --file /tmp/airlock-manifest.json --input /tmp/airlock-manifest.json
```

For a live testnet run, copy `contracts/.env.example` to `contracts/.env` and
set the Sepolia/Creditcoin RPC URLs plus distinct funded role keys. Never commit
that file. Then run:

```sh
cd contracts
npm run live:check
npm run deploy-live
IMPORT_KIND=artifact npm run import-proof
IMPORT_KIND=evaluation npm run import-proof
IMPORT_KIND=approval npm run import-proof
IMPORT_KIND=status npm run import-proof
npm run register-tee-binding
LIVE_STEP=execute npm run live-step
LIVE_STEP=deposit npm run live-step
LIVE_STEP=revoke npm run live-step
IMPORT_KIND=revocation npm run import-proof
LIVE_STEP=blocked npm run live-step
```

The deployment script writes generated non-secret state to `deployments.json`,
which is ignored locally. The hosted server uses the tracked
`server/deployments.json` snapshot for public reads. The worker can be run with
`npm run worker`; `WORKER_ONCE=true npm run worker` performs one scan.

## Environment variables

The contract flow needs:

```text
SOURCE_CHAIN_RPC_URL
CREDITCOIN_RPC_URL
CREDITCOIN_PROOF_BUILDER_URL
SOURCE_DEPLOYER_PRIVATE_KEY
SOURCE_PUBLISHER_PRIVATE_KEY
SOURCE_EVALUATOR_PRIVATE_KEY
SOURCE_APPROVER_PRIVATE_KEY
SOURCE_STATUS_PRIVATE_KEY
CREDITCOIN_DEPLOYER_PRIVATE_KEY
CREDITCOIN_WORKER_PRIVATE_KEY
CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY
CREDITCOIN_GUARDIAN_PRIVATE_KEY
RUNTIME_PRIVATE_KEY
ORG_ID
RELEASE_ID
AGENT_ID
PAYMENT_RECIPIENT
PAYMENT_AMOUNT
```

TEE-required deployments additionally need `TEE_REQUIRED=true`,
`TEE_MEASUREMENT`, and `TEE_QUOTE_HASH`, validated independently by the
verifier before `register-tee-binding`. The server needs
`CREDITCOIN_RPC_URL`, `AIRLOCK_ENABLE_WRITES`, `AIRLOCK_CLIENT_ORIGIN`, and
optionally `AIRLOCK_OCI_IMAGE_REF` plus registry
credentials for private OCI images. The client only needs `VITE_API_URL` when
the API is not the production default.

## Security model and limits

AIRLOCK protects the ability to make bounded calls from `AgentVault`.

- Source roles can emit only their assigned evidence class.
- Proof workers cannot forge or write evidence directly.
- Every evidence record must match one release digest.
- Receipt status, emitter, topic, schema, log index, and decoded fields are checked.
- Proofs, nonces, idempotency keys, and capabilities cannot be replayed.
- Scope, spend, calls, expiry, and runtime identity only narrow downstream.
- The router validates exact calldata and the vault rejects direct callers.
- Guardians can pause; proven revocation blocks later actions.

AIRLOCK does not guarantee model intelligence, model correctness, evaluator
competence, bias-free behavior, truth of arbitrary off-chain claims, or that a
base-mode process loaded the approved weights. L2 remains a verifier-attested
runtime binding, not an on-chain hardware-quote proof. No AIRLOCK token, zkML
claim, or arbitrary-chain support is implied.

## Repository map

- `contracts/contracts/Airlock.sol` — registries, adapter, policy,
  capabilities, router, vault, validators, and runtime binding registry.
- `contracts/scripts/manifest.mjs` — canonical manifest, artifact root, and
  release digest.
- `contracts/scripts/deploy-live.ts` — source and Creditcoin deployment.
- `contracts/scripts/import-proof.ts` — single Attestcoin proof import.
- `contracts/scripts/import-batch-proof.ts` — atomic proof batches.
- `contracts/scripts/register-tee-binding.ts` — runtime binding registration.
- `contracts/scripts/worker.ts` — cursor-backed event discovery and retries.
- `server/index.js` — chain-backed API, runbook, credentials, MCP, A2A, x402,
  identity, passport, and trace endpoints.
- `client/src/App.tsx` — landing page, live control-plane demo, evidence graph,
  capability registry, protocol surfaces, and ReactFlow architecture view.
- `fixtures/releases/demo` — the deterministic local release fixture.

This README is the repository's canonical documentation. Generated deployments,
private environment files, runtime cursors, and videos are not required to
understand or reproduce the protocol.
