# AIRLOCK — Implementation Plan

## Current delivery status — 2026-09-11

Completed: the live Sepolia → Attestcoin → Creditcoin vertical slice, source
and destination contract verification, a non-secret deployment evidence
package, the chain-backed dashboard with an opt-in local terminal runbook, and
a second full rehearsal from a clean clone of the submission commit. Local CI
and the pushed GitHub CI run are green. The live server recheck confirms all
four evidence classes and the post-revocation block on the current deployment.

Batch imports and TEE binding remain post-MVP and intentionally have not
started; the single-proof import and capability-containment gates are stable.

Still external to this workspace: publishing the repository publicly and
uploading a public demo video. Do not claim either as complete until the final
links are added to the submission package.

## 1. Delivery objective

Build a working AIRLOCK MVP in which real Ethereum Sepolia release events are proven through Attestcoin and consumed by Creditcoin CC3 testnet contracts to issue, enforce, and revoke an AI-agent capability.

Required vertical slice:

~~~text
Sepolia evidence
→ Attestcoin Merkle + continuity proof
→ Creditcoin receipt and semantic validation
→ deterministic capability issuance
→ permitted tool execution
→ rejected policy violations
→ proven revocation
→ blocked execution
~~~

## 2. Submission definition of done

- Four real source events exist for one release digest: publication, evaluation, approval, active status.
- Each event has a real Attestcoin proof accepted by deployed Creditcoin contracts.
- The adapter rejects failed receipts, wrong chains, wrong emitters, wrong topics, mutated fields, stale nonces, and replay.
- A capability is issued only when artifact, evaluation, approval, status, policy, agent, runtime key, scope, and validity match.
- The capability is short-lived, non-transferable, non-widenable, and budget constrained.
- The runtime cannot directly access vault funds or send arbitrary transactions.
- Two tool validators work end to end.
- Allowed execution succeeds; wrong recipient, target, value, calldata, expiry, nonce, or revocation fails.
- A real proven revocation disables a previously valid action.
- Unit, fuzz, invariant, integration, and deployed E2E tests pass.
- README, architecture, threat model, evidence page, demo video, deployment manifest, and reproducible commands are public.
- README honestly states that base mode authorizes an artifact digest to a runtime key but does not prove that the runtime executed those weights.

## 3. Priority and dependency rules

| Priority | Meaning |
| --- | --- |
| P0 | The submission fails without it |
| P1 | Security, judging, or demo reliability improvement |
| P2 | Post-MVP/company roadmap |

No visual polish should block the first real Attestcoin proof. No batch or TEE work should begin before single-proof import and capability containment are stable.

## 4. Phase 0 — Attestcoin proof spike and kill gate

**Priority:** P0

### Tasks

1. Pin the official Attestcoin documentation, SDK version, interfaces, decoder, and example-repository commit.
2. Query Creditcoin ChainInfo and record supported source keys, attested heights, continuity bounds, and current endpoints.
3. Deploy a tiny Sepolia emitter with one typed success event.
4. Emit both a successful event and a reverted transaction fixture.
5. Generate a real proof with the official Proof Builder.
6. Deploy a minimal Creditcoin ASC using the BlockProver at 0x...0FD2.
7. Decode the proven receipt on Creditcoin.
8. Require source chain key, receipt status, emitter, topic, log index, and event fields.
9. Test wrong emitter, wrong topic, mutated field, failed receipt, unsupported chain, and replay.
10. Measure source finality, attestation, proof generation, proof size, and Creditcoin gas.
11. Record all addresses and transaction hashes in docs/evidence.md.

### Done when

- A real Sepolia proof is accepted and decoded inside a deployed Creditcoin transaction.
- Every negative case fails before state mutation.
- No trusted worker signature or mocked verifier is involved.
- If this gate fails, stop product development and resolve the integration first.

## 5. Phase 1 — Repository and CI foundation

**Priority:** P0  
**Depends on:** Phase 0 findings.

### Tasks

1. Create the monorepo:

~~~text
apps/web
apps/worker
contracts/source
contracts/creditcoin
contracts/validators
contracts/interfaces
contracts/libraries
contracts/script
contracts/test
packages/manifest
packages/sdk
packages/schemas
packages/config
fixtures/releases
fixtures/evaluations
fixtures/proofs
docs
~~~

2. Configure Foundry, TypeScript, Ethers v6, workspaces, linting, formatting, and ABI generation.
3. Add CI for build, typecheck, lint, tests, ABI drift, dependency audit, and secret scanning.
4. Add network-specific config and typed address validation.
5. Freeze custom errors, state enums, role IDs, schema versions, and domain separators.
6. Write ADRs for base mode/TEE mode, canonical CBOR, immutable Attestcoin adapter, and mapping-authoritative capabilities.

### Done when

- One clean install and one command run every local check.
- CI is green on the skeleton.
- No secret, private key, or endpoint credential is committed.

## 6. Phase 2 — Canonical manifest CLI

**Priority:** P0  
**Depends on:** Phase 1.

### Tasks

1. Define manifest V1 using canonical CBOR.
2. Normalize paths and reject traversal, duplicate paths, symlink escapes, and Unicode ambiguity.
3. Compute file leaves, sorted Merkle root, manifest hash, and release digest.
4. Include weights/adapters, tokenizer, inference config, prompt bundle, tool schemas, container digest, SBOM, dependency lock, provenance, source revision, and suite ID.
5. Implement commands:
   - airlock manifest build
   - airlock manifest verify
   - airlock artifact prove
   - airlock release inspect
6. Generate TypeScript/solidity golden vectors.
7. Create a one-byte-mutated release fixture.

### Tests and done criteria

- Same input yields identical digest across environments.
- Any byte change changes the release digest.
- File-order changes do not change the root.
- Malicious paths are rejected.
- Golden vectors pass in CLI and contract tests.

## 7. Phase 3 — Sepolia source registries

**Priority:** P0  
**Depends on:** Phase 2 manifest schema.

### Contracts

- ArtifactRegistry
- EvaluationRegistry
- DeploymentApprovalRegistry
- ReleaseStatusRegistry

### Tasks

1. Implement the exact events in context.md.
2. Separate publisher, evaluator, approver, and status roles.
3. Enforce monotonic domain-specific nonces.
4. Bind approval to organization, agent, release digest, runtime key, policy, scope, budgets, and validity.
5. Make status and revocation monotonic.
6. Prevent duplicate publication for the same organization/version.
7. Deploy and verify source contracts on Sepolia.
8. Publish ABIs, addresses, role accounts, and transaction references.

### Tests and done criteria

- Unauthorized role actions revert.
- Duplicate, stale, and malformed nonces revert.
- Invalid time windows revert.
- Revoked digests never reactivate.
- Events decode exactly as expected by the Creditcoin adapter.

## 8. Phase 4 — Creditcoin Attestcoin adapter

**Priority:** P0  
**Depends on:** Phase 0 and Phase 3.

### Contracts

- AirlockAttestcoinAdapter
- ReleaseEvidenceRegistry
- EvidenceTypes
- Official Attestcoin and EVM decoder interfaces

### Tasks

1. Wrap the official BlockProver and ChainInfo interfaces.
2. Implement evidence-specific imports:
   - importArtifactProof
   - importEvaluationProof
   - importApprovalProof
   - importStatusProof
   - importRevocationProof
3. Decode the proven transaction and receipt.
4. Require status 1, expected chain key, emitter, topic, topic count, data length, and log index.
5. Decode fields from the receipt, never from caller payload.
6. Bind all imported fields to organization, release digest, schema, and nonce.
7. Compute queryKey and evidenceId.
8. Mark replay before downstream interaction.
9. Store normalized evidence and emit Creditcoin evidence events.
10. Add immutable or timelocked emitter/schema configuration.
11. Add source-chain pause for exceptional decoder/finality incidents.

### Negative tests

- Correct proof sent to the wrong evidence function.
- Correct event from an unapproved emitter.
- Same emitter on the wrong chain key.
- Reverted source receipt.
- Wrong log index or topic count.
- Mutated caller-decoded data.
- Mixed organization/release digest.
- Replayed query or semantic evidence.
- Stale status after revocation.

### Done when

- Every evidence class imports from a real proof.
- Every negative case fails before evidence changes.
- No owner function can manually write evidence.

## 9. Phase 5 — Policy registry and deterministic conjunction

**Priority:** P0  
**Depends on:** Phase 4.

### Tasks

1. Define OrganizationPolicyV1 with:
   - Required evidence types.
   - Trusted emitters and evaluators.
   - Approved suite hashes.
   - Minimum scores and denied-capability bitmap.
   - Allowed target and validator roots.
   - Spend, per-call, call-count, and TTL ceilings.
   - Status freshness requirement.
   - Optional TEE_REQUIRED flag.
2. Hash policies canonically.
3. Make policy changes create a new policy hash.
4. Ensure policy changes cannot silently widen existing capabilities.
5. Implement the complete issuance conjunction from context.md.
6. Compute scope as the intersection of artifact, evaluator, approval, and organization policy.
7. Implement organization, release, agent, runtime, target, and capability pauses.
8. Ensure guardian actions can only reduce authority.

### Tests and done criteria

- Table-driven tests cover missing/mismatched evidence, score failure, expiry, policy mismatch, excessive scope, excessive budget, stale status, revocation, and pauses.
- The only issuance path is the deterministic conjunction.
- No AI output or worker interpretation participates in authorization.

## 10. Phase 6 — Capability, router, validators, and vault

**Priority:** P0  
**Depends on:** Phase 5.

### Contracts

- CapabilityStore or CapabilityIssuer
- Optional non-transferable CapabilityToken view
- ToolRouter
- AgentVault
- AllowlistedRecipientPaymentValidator
- BoundedDepositValidator
- Mock stablecoin and mock destination protocol

### Tasks

1. Implement authoritative capability mappings.
2. Add expiry, epoch, renewal, local revocation, and release revocation.
3. Implement EIP-712 ToolIntent.
4. Implement scope Merkle proofs binding target, selector, validator, and constraints.
5. Add action nonce and idempotency-key replay protection.
6. Add cumulative spend, per-call value, and call-count accounting.
7. Use checks-effects-interactions and a reentrancy guard.
8. Route vault execution only through validators.
9. Pin validator versions in policy.
10. Emit normalized success and denial events.

### Invariants

- spent is never greater than spendCap.
- callsUsed is never greater than callCap.
- One action nonce and idempotency key execute at most once.
- Scope never grows.
- Vault value exits only through an authorized router or a timelocked recovery path.
- Wrong key, release, target, calldata, value, time, nonce, expiry, and revocation all fail.

### Done when

- One permitted vendor payment and one bounded deposit execute.
- Every listed policy violation reverts.
- Runtime key cannot directly withdraw from the vault.

## 11. Phase 7 — Worker, indexer, and watchdog

**Priority:** P0  
**Depends on:** Source and adapter ABIs.

### Tasks

1. Watch configured source emitters and events only.
2. Record source events as Observed, never Verified.
3. Wait for source finality and attestation frontier.
4. Request proofs with bounded retry/backoff.
5. Submit proofs idempotently.
6. Classify retryable, terminal-invalid, consumed, unsupported, and paused states.
7. Prioritize revocations.
8. Expose structured health/proof APIs.
9. Restart from indexed cursors without duplicates.
10. Add a manual proof-submission CLI.
11. Keep worker keys gas-only; worker never has issuance authority.

### Done when

- Restart and duplicate delivery are safe.
- A second submitter can import valid evidence or receives a clean replay result.
- Prover outage affects liveness only.

## 12. Phase 8 — Agent runtime

**Priority:** P0  
**Depends on:** Router and SDK.

### Tasks

1. Give the LLM no private key or RPC broadcast primitive.
2. Restrict model output to a typed proposed-intent schema.
3. Resolve tools from a fixed adapter registry.
4. Hash exact calldata before signing.
5. Show runtime signer capability, recipient, amount, deadline, and remaining budget.
6. Sign only when local digest and runtime key match the capability.
7. Verify artifact files locally at startup.
8. Refuse activation for the mutated release fixture.
9. Submit through ToolRouter only.
10. Capture result and denial evidence.

### Done when

- The LLM cannot invoke the signer with arbitrary bytes.
- The signer cannot target an unregistered contract.
- Modified artifacts prevent activation.
- Allowed and rejected actions reproduce from a clean setup.

## 13. Phase 9 — Dashboard and proof inspector

**Priority:** P1  
**Depends on:** Contract and indexer schemas.

### Screens

- Organization and agent overview.
- Release and manifest lineage.
- Evidence graph.
- Capability detail and remaining limits.
- Action preview/composer.
- Revocation and emergency controls.
- Proof inspector.
- Demo runbook panel.

### UI rules

- Never display an observed event as verified.
- Show source transaction, chain key, block, emitter, receipt status, event, proof status, and Creditcoin import.
- Show one release digest across every evidence card.
- Show scope, remaining spend, call count, expiry, status freshness, and revocation gap.
- Explain each denial in both human and raw contract terms.
- Label cryptographically verified, governance assertion, locally enforced, and not proven.

### Done when

- A new viewer understands blocked/authorized state within 30 seconds.
- All critical state comes from chain/indexer data, not demo toggles.
- One clean seed script populates the demo.

## 14. Phase 10 — Security hardening

**Priority:** P0/P1  
**Depends on:** Vertical slice.

### Contract tests

- Unit tests for every custom error and state transition.
- Fuzz hashes, paths, bounds, nonces, times, scope proofs, and calldata.
- Stateful invariants for replay, status monotonicity, spending, calls, and vault conservation.
- Malicious target, callback, reentrancy, and validator tests.
- Cross-chain semantic confusion and configuration tests.

### Off-chain tests

- Manifest golden vectors.
- Worker retry, crash recovery, duplicate delivery, and cursor recovery.
- Corrupt proofs and malformed ABI payloads.
- RPC and prover timeouts.
- Runtime signer isolation and malformed model output.
- Dashboard state consistency.

### Review gate

- No delegatecall or arbitrary target forwarding.
- No mutable emitter for an active release.
- No admin evidence injection or winner/approval override.
- No capability widening.
- No secrets in events or logs.
- Emergency controls only reduce authority.
- Slither/static-analysis findings triaged.
- Independent review of adapter and router.

## 15. Phase 11 — Deployment and reproducibility

**Priority:** P0  
**Depends on:** Security gate.

1. Deploy source registries to Sepolia.
2. Deploy Creditcoin contracts in dependency order.
3. Configure policies, emitters, suites, validators, and limits.
4. Fund minimal demo assets and gas.
5. Verify contracts where explorers support it.
6. Record addresses and transactions in deployment.json.
7. Run a clean artifact-to-revocation script.
8. Export non-secret proof fixtures and expected results.
9. Re-run from a second account or machine.
10. Tag the exact submission commit.

### Done when

- A reviewer can reproduce the core flow from README commands.
- All addresses and video transactions match the tagged commit.
- No mock verifier is enabled in testnet configuration.

## 16. Phase 12 — Demo and submission package

**Priority:** P0  
**Depends on:** Deployed E2E.

### Live sequence

1. Agent is blocked without a capability.
2. Show one release digest and its four evidence classes.
3. Import real proofs.
4. Issue the capability.
5. Execute an allowed payment.
6. Reject wrong recipient, excessive value, changed calldata, and replay.
7. Mutate one prompt byte and fail local activation.
8. Prove revocation.
9. Block the formerly valid action.
10. Replay revocation and reject it.

### Submission claims

- Attestcoin proves source transaction inclusion/continuity.
- AIRLOCK separately checks receipt success and event semantics.
- Worker is a liveness component, not an authority.
- Base mode does not prove actual model execution.
- Working source scope is Ethereum to Creditcoin.
- Verification latency begins after source finality and attestation.

### Done when

- Demo works three consecutive times from the frozen runbook.
- Video presents no mocked proof as real.
- README, deck, video, app, repository, and deployment agree.
- Judges can identify the load-bearing Attestcoin transition in under one minute.

## 17. Parallel ownership

| Workstream | Owner | Dependency |
| --- | --- | --- |
| Attestcoin integration | Protocol engineer | Phase 0 |
| Source registries | Solidity engineer | Event schemas |
| Manifest CLI | Security/backend engineer | Hashing spec |
| Policy/capability | Solidity engineer | Evidence types |
| Router/vault | Solidity/security engineer | Capability schema |
| Worker/indexer | Backend engineer | Source/adapter ABI |
| Agent runtime | AI/backend engineer | SDK/router |
| Dashboard | Frontend engineer | Indexed state |
| Adversarial tests | Security engineer | Each merged component |
| Demo/submission | Product/DevRel | Stable E2E |

## 18. Suggested 14-day schedule

| Day | Outcome |
| --- | --- |
| 1 | Real proof accepted and decoded; kill gate passed |
| 2 | Negative proof cases and CI foundation |
| 3 | Manifest V1 and golden vectors |
| 4 | Four source registries deployed |
| 5 | Evidence imports complete |
| 6 | Evidence registry and replay hardening |
| 7 | Policy and conjunction |
| 8 | Capability and scope proofs |
| 9 | Router, vault, first validator |
| 10 | Second validator and runtime |
| 11 | Worker, indexer, dashboard slice |
| 12 | Revocation, pause, fuzz, invariants |
| 13 | Fresh deployment, evidence docs, rehearsal |
| 14 | Video, README/deck, tagged release, buffer |

If late, cut batching, TEE, multi-organization support, and polish before real proofs, receipt validation, capability enforcement, revocation, or negative tests.

## 19. Release gates

### Gate A — Attestcoin

- Real proof accepted.
- Failed receipt rejected.
- Wrong emitter/topic/field rejected.
- Replay rejected.

### Gate B — Authorization

- Four evidence classes bind one digest.
- Scope intersection and all bounds hold.
- No admin evidence bypass.

### Gate C — Containment

- Runtime key cannot directly access vault.
- Router rejects arbitrary target/calldata.
- Validators enforce semantics.
- Replay and reentrancy invariants hold.

### Gate D — Revocation

- Proven revocation disables release.
- Local pause disables actions immediately.
- Freshness window is visible and bounded.
- Revoked digest cannot reactivate.

### Gate E — Submission

- Public source and deployments.
- Reproducible evidence.
- Stable demo.
- Honest claims.
- CEIP plan and design-partner target.

## 20. Metrics

Track and publish:

- Source finalization-to-attestation latency.
- Proof Builder latency and failure rate.
- Proof size and Creditcoin gas by evidence type.
- Import success/rejection counts.
- Evidence-to-capability issuance time.
- Router gas by action.
- Revocation-to-enforcement latency.
- Test coverage and invariant run count.
- Attack fixtures rejected.

## 21. Final handoff checklist

- [ ] context.md matches deployed behavior.
- [ ] plan.md status reflects actual completion.
- [ ] Contract addresses and explorer links are current.
- [ ] Source events and decoders use identical ABI.
- [ ] Supported chain keys come from live configuration.
- [ ] Proof fixtures are non-secret and reproducible.
- [ ] Base and TEE claims are separated.
- [ ] All P0 negative tests pass.
- [ ] Demo has both fresh and pre-staged proof paths.
- [ ] README explains Attestcoin precisely.
- [ ] Submission links point to the tagged release.
- [ ] No private keys or credentials are committed.

## 22. References

- [Attestcoin documentation](https://docs.attestcoin.org/)
- [Attestcoin architecture](https://docs.attestcoin.org/attestcoin-protocol/architecture)
- [Chains and environments](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments)
- [Attestcoin SDK](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk)
- [Official examples](https://github.com/gluwa/attestcoin-protocol-examples)
- [Creditcoin USC SDK](https://github.com/gluwa/cc-next-query-builder)
- [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
