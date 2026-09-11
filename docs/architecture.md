# AIRLOCK architecture

AIRLOCK is a release firewall. A source-chain release is not executable
authority by itself; authority exists only after four independently governed
events are proven on Creditcoin and conjoined by deterministic contracts.

```text
Sepolia registries
  ├─ ArtifactPublished
  ├─ EvaluationCertified
  ├─ DeploymentApproved
  └─ ReleaseStatusCheckpoint / ReleaseRevoked
          │
          ▼ Attestcoin proof: inclusion + continuity + receipt decoding
Creditcoin AirlockAttestcoinAdapter
          │
          ▼ normalized evidence for one (orgId, releaseDigest)
EvidenceRegistry + PolicyRegistry
          │
          ▼ deterministic conjunction
CapabilityIssuer → ToolRouter → AgentVault → allowlisted destination
        ▲
        │ optional verifier-attested runtime binding
RuntimeBindingRegistry
```

## Trust boundaries

- Source role keys can emit only their own event class.
- Attestcoin and the native BlockProver establish source transaction history;
  the worker does not attest facts.
- `OfficialReceiptDecoder` wraps the pinned EVM V1 decoder. The adapter checks
  receipt status, source chain key, emitter, topic, topic count, data length,
  log index, and decoded field semantics.
- `EvidenceRegistry` accepts writes only from the one configured adapter.
- `CapabilityIssuer` is permissionless but can issue only from normalized,
  matching evidence and a registered policy.
- The runtime signs EIP-712 intents. It never receives the vault key and the
  router never accepts arbitrary target forwarding.

## Contracts

| Contract | Boundary | Responsibility |
| --- | --- | --- |
| `ArtifactRegistry` | Sepolia | artifact release event and publisher nonce |
| `EvaluationRegistry` | Sepolia | evaluator result and evaluation window |
| `DeploymentApprovalRegistry` | Sepolia | runtime key, scope, policy, budgets |
| `ReleaseStatusRegistry` | Sepolia | active checkpoints and monotonic revocation |
| `AirlockAttestcoinAdapter` | Creditcoin | proof verification, receipt decoding, semantic import, replay; atomic batches up to 10 |
| `EvidenceRegistry` | Creditcoin | adapter-only normalized evidence |
| `PolicyRegistry` | Creditcoin | immutable-by-hash policy records and pauses |
| `CapabilityIssuer` | Creditcoin | deterministic issuance, accounting, current-status checks |
| `RuntimeBindingRegistry` | Creditcoin | verifier-attested measurement/key/artifact binding for TEE-required policies |
| `ToolRouter` | Creditcoin | EIP-712, scope proof, validator, nonce, idempotency, execution |
| `AgentVault` | Creditcoin | custody and router-only execution with timelocked recovery |
| `NativePaymentValidator` | Creditcoin | validates bounded native-value payments to the approved recipient |

Base mode binds a release digest to a runtime signing key. It does not prove
that a running process loaded those weights. TEE-required mode adds a
verifier-attested measurement/quote hash, matches it to the artifact and
container digests, intersects capability expiry with the binding window, and
rechecks the binding on consume. The verifier must validate the underlying
quote; the registry does not claim to verify hardware quotes on-chain.
