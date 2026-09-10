# AIRLOCK — Project Context

## 1. Product

AIRLOCK is a cross-chain release firewall for autonomous AI agents. Before an agent receives privileged authority on Creditcoin, AIRLOCK requires proof of four independently governed Ethereum events tied to the same release:

1. The exact model and software artifact was published.
2. An approved evaluator certified that artifact.
3. A human or governance process approved a runtime key, scope, and budget.
4. The release has a fresh active-status checkpoint and has not been revoked.

Attestcoin verifies each source transaction on Creditcoin. Deterministic contracts issue a short-lived, non-transferable capability specifying allowed contracts, functions, argument constraints, spend, call count, and expiry. The LLM proposes actions but cannot approve itself, hold the treasury key, widen its scope, or bypass execution policy.

**Hackathon:** BUIDL CTC 2026 Fall  
**Track:** AI  
**Pitch:** AIRLOCK lets autonomous agents act on-chain only after Attestcoin proves that the exact model, safety evaluation, deployment scope, and release status were approved—then enforces a capability the AI cannot modify or exceed.

## 2. Problem

Agent deployments commonly depend on a hot wallet and an off-chain database saying which model, prompt, tools, and limits were approved. The approved release can drift from the runtime that ultimately signs transactions. A compromised operator, CI pipeline, model server, or release database can silently change the artifact or its authority.

AIRLOCK separates:

- **Probabilistic reasoning:** the model proposes an action.
- **Release evidence:** external registries state what was published, evaluated, and approved.
- **Cross-chain verification:** Attestcoin proves the source transactions.
- **Deterministic authorization:** Creditcoin contracts calculate whether authority may exist.
- **Contained execution:** a router and vault enforce the capability.

## 3. Claims and non-claims

### AIRLOCK proves

- A transaction belongs to an Attestcoin-attested source-chain history.
- The transaction succeeded, after AIRLOCK explicitly checks its receipt.
- An allowlisted source contract emitted an exact event with exact fields.
- Artifact, evaluation, approval, status, runtime key, policy, and capability reference one releaseDigest.
- A Creditcoin action satisfies deterministic scope and budget constraints.
- Proofs, evidence nonces, capability actions, and idempotency keys are not replayed.

### AIRLOCK does not prove

- Model intelligence, correctness, safety, or absence of bias.
- Evaluator competence merely because a certificate exists.
- Raw off-chain truth that was never committed on a supported source chain.
- That base-mode runtime execution used the approved weights.
- That every inference came from the approved model.

Base mode authorizes a hash-bound release for a runtime signing key. Strong proof that the runtime loaded the approved artifact requires optional TEE binding between the runtime key, container measurement, and artifact root.

## 4. Why Attestcoin is load-bearing

The source registries emit ordinary Ethereum events and do not call a destination-specific bridge. Any party may submit the historical transaction proof to Creditcoin.

- A generic oracle would become an authority able to fabricate an approval or omit a revocation.
- A standard message bridge would require bridge-specific source messages and inherit its validator, governance, replay, and availability assumptions.
- An asset bridge is irrelevant because no model artifact, treasury asset, or capability crosses chains.
- Removing receipt-proof verification makes the worker authoritative and destroys the product.

A generalized light-client receipt-proof system could recreate this primitive class, but that is not a drop-in oracle or standard bridge; it is rebuilding what Attestcoin supplies.

## 5. Current Attestcoin constraints

Use the live protocol surface, not broad multichain marketing claims.

| Area | Constraint |
| --- | --- |
| Mainnet source reads | Ethereum mainnet is currently documented |
| Testnet source reads | Ethereum Sepolia and Ethereum mainnet are currently documented |
| Chain identity | Use Attestcoin chainKey, not EVM chainId; query ChainInfo |
| BlockProver | 0x0000000000000000000000000000000000000FD2 |
| ChainInfo | 0x0000000000000000000000000000000000000FD3 |
| Proof | Transaction inclusion plus continuity to an attested source checkpoint |
| Receipt success | Not guaranteed by proof alone; decode and require status 1 |
| Timing | Same-transaction verification only after source finality and attestation; E2E may take minutes |
| Batching | Up to 10 queries sharing a continuity proof, within protocol span limits |
| Historical proofs | Older continuity paths cost more gas; use recent transactions |
| Proof generation | Hosted Proof Builder for MVP; RawProofBuilder/self-hosting for resilience |
| Writability | Separate path and unnecessary for this MVP |

The canonical demo path is **Ethereum Sepolia → Attestcoin → Creditcoin CC3 testnet**. Never claim live Base, Solana, Polygon, or Ronin support unless deployed ChainInfo confirms it.

## 6. Actors

| Actor | May do | Must never do |
| --- | --- | --- |
| Publisher | Publish an artifact manifest | Evaluate or approve its own release |
| Evaluator | Certify an exact release digest | Change the artifact or deployment scope |
| Governance approver | Approve agent, key, policy, scope, budget, validity | Rewrite evaluation evidence |
| Status authority | Publish active checkpoints and revocations | Issue Creditcoin capabilities |
| Proof worker | Observe, build, and submit public proofs | Interpret evidence authoritatively |
| LLM | Produce schema-valid proposed intents | Hold keys or broadcast arbitrary transactions |
| Runtime signer | Sign typed intents within its active capability | Sign raw arbitrary transactions |
| Policy admin | Configure trusted sources and ceilings | Widen an existing capability |
| Guardian | Pause or reduce authority | Issue or widen authority |
| TEE verifier, optional | Bind runtime measurement, key, and artifact | Change the base-mode claim |

Production deployments separate publisher, evaluator, approver, and status keys. Demo deployments use visibly distinct accounts.

## 7. End-to-end lifecycle

1. The manifest CLI hashes model weights, prompts, tools, container, dependencies, and provenance.
2. The publisher emits ArtifactPublished on Sepolia.
3. An evaluator emits EvaluationCertified for the same digest.
4. Governance emits DeploymentApproved, binding agent, runtime key, policy, scope, budgets, and time window.
5. The status authority emits a short-lived ACTIVE checkpoint.
6. A worker waits for Attestcoin attestation, generates proofs, and submits them to Creditcoin.
7. AirlockAttestcoinAdapter verifies and decodes each receipt.
8. ReleaseEvidenceRegistry stores normalized evidence and replay identifiers.
9. CapabilityIssuer evaluates the deterministic conjunction.
10. A short-lived capability is issued to the runtime key.
11. The LLM proposes a typed ToolIntent; the isolated signer signs it.
12. ToolRouter checks scope, validator, calldata, budgets, nonce, expiry, and revocation before AgentVault executes.
13. A proven Ethereum revocation or local Creditcoin pause blocks later actions.

## 8. Canonical release manifest

Use versioned canonical CBOR, not ordinary JSON.

~~~text
artifactLeaf = SHA256(normalizedPath || fileSize || SHA256(fileBytes))
artifactRoot = MerkleRoot(sorted artifactLeaf values)
manifestHash = SHA256(canonicalCBOR(manifest))

releaseDigest = KECCAK256(
  domainSeparator,
  orgId,
  releaseId,
  manifestHash,
  artifactRoot,
  weightsHash,
  tokenizerHash,
  systemPromptHash,
  toolManifestRoot,
  containerImageDigest,
  sbomHash,
  provenanceHash,
  releaseVersion
)
~~~

The manifest covers model weights/adapters, tokenizer, inference configuration, system/developer prompts, tool schemas, container digest, SBOM, dependency lock, build provenance, source revision, and evaluation suite.

Path normalization rejects absolute paths, parent traversal, duplicate normalized paths, symbolic-link escapes, inconsistent separators, and Unicode ambiguity.

## 9. Source-chain events

Use separate immutable or tightly governed Sepolia registries.

~~~solidity
event ArtifactPublished(
    bytes32 indexed orgId,
    bytes32 indexed releaseId,
    bytes32 indexed releaseDigest,
    bytes32 manifestHash,
    bytes32 artifactRoot,
    bytes32 weightsHash,
    bytes32 tokenizerHash,
    bytes32 systemPromptHash,
    bytes32 toolManifestRoot,
    bytes32 containerImageDigest,
    bytes32 sbomHash,
    bytes32 provenanceHash,
    uint64 releaseVersion,
    uint64 publisherNonce
);

event EvaluationCertified(
    bytes32 indexed orgId,
    bytes32 indexed releaseId,
    bytes32 indexed releaseDigest,
    bytes32 suiteHash,
    bytes32 reportHash,
    bytes32 evaluatorSetHash,
    uint32 safetyScoreBps,
    uint256 deniedCapabilityBitmap,
    uint64 evaluatedAt,
    uint64 validUntil,
    uint64 evaluationNonce
);

event DeploymentApproved(
    bytes32 indexed orgId,
    bytes32 indexed agentId,
    bytes32 indexed releaseDigest,
    address runtimeKey,
    bytes32 policyHash,
    bytes32 requestedScopeRoot,
    uint128 totalSpendCap,
    uint128 perCallValueCap,
    uint32 callCap,
    uint64 validAfter,
    uint64 validUntil,
    uint64 approvalNonce
);

event ReleaseStatusCheckpoint(
    bytes32 indexed orgId,
    bytes32 indexed releaseDigest,
    uint8 indexed status,
    uint64 statusNonce,
    uint64 issuedAt,
    uint64 validUntil
);

event ReleaseRevoked(
    bytes32 indexed orgId,
    bytes32 indexed releaseDigest,
    bytes32 indexed reasonHash,
    uint64 statusNonce,
    uint64 revokedAt
);
~~~

Status 1 is active and 2 is revoked. Revocation is monotonic. Recovery requires a new digest and capability epoch.

Optional production event:

~~~solidity
event RuntimeBound(
    bytes32 indexed orgId,
    bytes32 indexed releaseDigest,
    address indexed runtimeKey,
    bytes32 teeMeasurement,
    bytes32 quoteHash,
    bytes32 containerImageDigest,
    bytes32 artifactRoot,
    uint64 validUntil,
    uint64 runtimeNonce
);
~~~

## 10. Attestcoin proof ingestion

~~~solidity
struct QueryProof {
    uint64 chainKey;
    uint64 blockHeight;
    bytes encodedTransaction;
    bytes32 merkleRoot;
    MerkleProofEntry[] siblings;
    bytes32 lowerEndpointDigest;
    bytes32[] continuityRoots;
}

struct MerkleProofEntry {
    bytes32 hash;
    bool isLeft;
}
~~~

For every import:

1. Reject unsupported or paused source keys.
2. Call the official BlockProver interface.
3. Decode encodedTransaction with the official EVM decoder.
4. Require receipt status 1.
5. Require expected chain, emitter, topic0, topic count, data length, and log index.
6. Decode all fields from the proven receipt.
7. Recompute organization, release, schema, and nonce relationships.
8. Calculate transaction/log and semantic evidence identifiers.
9. Mark replay state before downstream external interaction.
10. Store normalized evidence and emit a Creditcoin event.

~~~text
queryKey = keccak256(
  chainKey,
  blockHeight,
  transactionIndex,
  logIndex,
  sourceEmitter
)

evidenceId = keccak256(
  evidenceKind,
  queryKey,
  releaseDigest
)
~~~

SDK query replay protection is not enough. AIRLOCK also enforces publisher, evaluator, approval, status, capability, and action nonces.

## 11. Creditcoin contracts

| Contract | Responsibility |
| --- | --- |
| AirlockAttestcoinAdapter | Immutable BlockProver calls, decoding, semantic checks, proof replay |
| ReleaseEvidenceRegistry | Normalized artifact, evaluation, approval, status, revocation, optional runtime evidence |
| OrganizationPolicyRegistry | Trusted emitters/evaluators/suites, thresholds, targets, validators, budgets, TTL |
| CapabilityIssuer | Deterministic evidence conjunction and capability creation |
| CapabilityToken | Optional non-transferable ERC-1155 view; mapping remains authoritative |
| ToolRouter | Typed intent, scope proof, validator, accounting, execution |
| AgentVault | Protected funds callable only through ToolRouter |
| EmergencyBrake | Organization/release/agent/runtime/target/capability pauses |
| RuntimeBindingRegistry | Optional TEE evidence |
| AuditTrail | Normalized evidence, denial, issuance, action, and revocation events |

Keep the Attestcoin adapter isolated and immutable.

## 12. Deterministic issuance

Capability issuance requires:

~~~text
artifact exists for releaseDigest
AND artifact came from the pinned publisher

AND evaluation exists for releaseDigest
AND evaluator and suite are approved
AND score meets threshold
AND evaluation remains valid through capability expiry
AND forbidden capability bits are absent

AND approval matches orgId, agentId, releaseDigest, runtimeKey
AND approval.policyHash equals active policy
AND scope, spend, calls, per-call value, and TTL stay within every ceiling
AND current time is inside approval validity

AND a fresh ACTIVE checkpoint exists
AND no equal-or-newer revocation exists

AND organization, release, agent, runtime, target, and capability are not paused
AND TEE evidence is valid when TEE_REQUIRED is enabled
~~~

Effective scope is always an intersection:

~~~text
artifactToolScope
∩ evaluatorAllowedScope
∩ deploymentApprovedScope
∩ organizationPolicyScope
~~~

## 13. Capability and tool intent

~~~solidity
struct Capability {
    bytes32 orgId;
    bytes32 agentId;
    bytes32 releaseDigest;
    bytes32 policyHash;
    bytes32 scopeRoot;
    address runtimeKey;
    uint128 spendCap;
    uint128 spent;
    uint128 perCallValueCap;
    uint32 callCap;
    uint32 callsUsed;
    uint64 notBefore;
    uint64 expiresAt;
    uint64 epoch;
    bool revoked;
}
~~~

Capabilities cannot transfer, widen, or outlive their evidence. Renewal produces a new ID and epoch. The optional token is explanatory; mappings are authoritative.

Scope leaf:

~~~text
keccak256(targetContract, functionSelector, validatorContract, constraintsHash)
~~~

The runtime signs an EIP-712 intent:

~~~text
capabilityId
agentId
target
functionSelector
calldataHash
value
deadline
actionNonce
idempotencyKey
~~~

ToolRouter recovers the key, loads capability and policy, checks status/expiry/scope/budgets, runs the calldata validator, consumes nonce, increments counters, and executes through the vault. No arbitrary target calls, raw transaction forwarding, or delegatecall are allowed.

## 14. Security invariants

1. No capability without every required evidence class for one digest.
2. No evidence from a wrong chain, emitter, event, failed receipt, malformed log, or stale nonce.
3. No proof, evidence, action nonce, or idempotency key executes twice.
4. Scope never exceeds the intersection of all authority sources.
5. Capability expiry never exceeds evaluation, approval, status, policy, or TEE validity.
6. A runtime key cannot use another key's capability.
7. Any model, prompt, tool, container, or policy change requires a new capability.
8. Guardian controls may only reduce authority.
9. Revocation is monotonic.
10. Spend and call counters update before external execution and remain bounded.
11. The LLM and runtime key cannot call the vault directly.
12. Active validator code cannot change without a new policy and capability.

## 15. Revocation

Cross-chain revocation is not instantaneous. Bound the gap with short active checkpoints, shorter capability TTLs, permissionless watchers, local Creditcoin pause, release-status checks on every action, and monotonic status nonces.

The UI shows latest proven status time, source block, capability expiry, and maximum remaining revocation window. Never claim instant cross-chain revocation.

Suggested demo values: 30-minute active checkpoint, 10-minute capability, 60-second tool intent.

## 16. Threat model

| Threat | Mitigation |
| --- | --- |
| Forged source event | Attestcoin plus chain/emitter/status/topic/schema/field checks |
| Valid proof of wrong event | Evidence-class-specific binding |
| Reverted transaction | Explicit receipt-status check |
| Worker changes fields | Decode inside Creditcoin |
| Replay | Query keys and domain-specific nonces |
| Cross-release mixing | One digest, organization, policy, agent, and version |
| Publisher self-approval | Role and registry separation |
| Evaluation of other build | Exact digest equality |
| Agent widens authority | Scope intersection and immutable capability |
| Changed calldata | Signed hash and semantic validator |
| Runtime key compromise | TTL, budgets, validators, pause, new-key approval |
| Active proof races revocation | Status nonce, short freshness, watchdog, local pause |
| Worker censorship | Permissionless submission and self-hostable prover path |
| Malicious target/reentrancy | Allowlists, code pinning, validators, CEI, guard |
| Artifact substitution | Canonical manifest and local streaming hash check |
| Runtime loads other weights | Honest base-mode limit; optional TEE |
| Policy widens authority | New policy hash requires new capability |

## 17. MVP

### Required

- Four Sepolia registries and distinct role keys.
- Canonical manifest CLI and sample artifact.
- Real Sepolia transactions and Attestcoin proofs.
- Creditcoin adapter with receipt and semantic validation.
- Evidence registry and deterministic conjunction.
- Short-lived, non-transferable capability.
- AgentVault holding a mock stablecoin.
- ToolRouter with an allowlisted-recipient payment validator and a bounded protocol-deposit/service-purchase validator.
- Isolated runtime signer and EIP-712 intents.
- Proven revocation and local pause.
- React evidence/capability/action dashboard.
- Adversarial Foundry tests and public deployment evidence.

### Post-MVP

- Batch imports.
- TEE runtime binding.
- Safe/account-abstraction integration.
- Multiple organizations.
- Redundant proof workers.
- Policy/validator marketplace.
- Compliance exports.

### Out of scope

- Inference correctness proofs.
- Unsupported chains.
- Arbitrary MCP execution.
- Unbounded autonomy.
- Bridge-based outbound execution.
- Governance token.
- Mainnet treasury custody during the hackathon.

## 18. Demo

1. Agent attempts payment and receives NoActiveCapability.
2. Show one digest covering model, prompt, tools, container, SBOM, and provenance.
3. Import real proofs for publication, evaluation, approval, and active status.
4. Four evidence nodes converge on capability issuance.
5. Execute an approved small vendor payment.
6. Reject an unapproved recipient, excessive amount, changed calldata, and replayed nonce.
7. Change one prompt byte; local release activation fails.
8. Import a proven Sepolia revocation.
9. Repeat the formerly valid call; it fails as revoked.
10. Replay the revocation proof; it fails.

Pre-stage finalized proofs. Run one fresh event in parallel, but never depend on fresh attestation latency for the entire pitch.

## 19. Competitive position

The field was rechecked on 10 September 2026: 80 BUIDLs comprising 33 DeFi, 22 RWA, 15 AI, 7 DePIN, and 3 Gaming.

AIRLOCK governs **which release receives authority**, unlike the dominant verified-fact-to-AI-to-transaction pattern.

- Strongest maturity competitor: Farebox.
- Closest architectural competitor: BountyOps.
- Strongest governance competitor: AEOS.
- AIRLOCK wins only if it ships real proofs, containment, revocation, and visible negative cases.

## 20. Business and CEIP

Initial customers: DAO treasuries, agent-wallet/MCP infrastructure, custodians, stablecoin issuers, on-chain funds, and DePIN operators.

Revenue:

- Subscription per protected organization, agent, or runtime.
- Usage per proof, release, renewal, or policy evaluation.
- Enterprise policy packs and evidence exports.
- Managed proof workers and revocation monitoring.
- Self-hosted deployment and integration fees.

Defensibility comes from policy validators, release lineage, framework/custody integrations, evaluation workflows, audit history, and an optional TEE tier—not a token.

## 21. Repository shape

~~~text
airlock/
├── apps/
│   ├── web/
│   └── worker/
├── contracts/
│   ├── source/
│   ├── creditcoin/
│   ├── validators/
│   ├── interfaces/
│   ├── libraries/
│   ├── script/
│   └── test/
├── packages/
│   ├── manifest/
│   ├── sdk/
│   ├── schemas/
│   └── config/
├── fixtures/
│   ├── releases/
│   ├── evaluations/
│   └── proofs/
├── docs/
│   ├── architecture.md
│   ├── attestcoin-integration.md
│   ├── threat-model.md
│   ├── evidence.md
│   └── demo-runbook.md
├── context.md
├── plan.md
└── README.md
~~~

Use Solidity/Foundry, TypeScript, Ethers v6, generated ABI types, environment-specific config, structured logs, and separate low-value demo keys.

## 22. Kill criteria

Stop or redesign if:

- A deployed Creditcoin contract cannot directly consume a real Sepolia proof.
- The verifier is replaced by a worker signature or oracle.
- Receipt status, emitter, event schema, and fields cannot be validated on Creditcoin.
- The runtime can bypass ToolRouter or reach vault funds.
- Mixed release digests can issue a capability.
- An expired or revoked release can execute.
- The final demo uses only mocked proofs.

## 23. Sources

1. [Attestcoin Protocol documentation](https://docs.attestcoin.org/)
2. [Attestcoin architecture](https://docs.attestcoin.org/attestcoin-protocol/architecture)
3. [Chains and environments](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments)
4. [Attestcoin SDK](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk)
5. [Official Attestcoin examples](https://github.com/gluwa/attestcoin-protocol-examples)
6. [Creditcoin USC SDK](https://github.com/gluwa/cc-next-query-builder)
7. [BUIDL CTC 2026 Fall details](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
8. [Live Fall submissions](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/buidl)
9. [Prior BUIDL CTC winners](https://dorahacks.io/hackathon/buidl-ctc/winner)
