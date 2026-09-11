# AIRLOCK threat model

## Protected asset

The protected asset is the ability to make bounded calls from `AgentVault`.
The model, proof worker, runtime process, and source roles must not be able to
turn that ability into arbitrary or unbounded authority.

## Security properties

1. No capability without artifact, evaluation, approval, active status, and a
   matching policy for one release digest.
2. No imported evidence from a wrong chain, emitter, event, receipt status,
   schema, log index, or data length.
3. No query, evidence class, action nonce, or idempotency key executes twice.
4. Scope, spend, per-call value, calls, and expiry can only shrink as the
   request moves through policy, approval, capability, and router checks.
5. The runtime key must match the capability and sign the exact calldata hash.
6. Vault value exits only through the router or a two-day recovery path.
7. A proven revocation or local guardian pause blocks later actions.

## Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Worker fabricates fields | Creditcoin decodes the proven transaction itself |
| Reverted source transaction | Explicit receipt status `1` check |
| Wrong source event | Immutable emitter, topic, topic count, data length, and class checks |
| Cross-release mixing | Every evidence record and capability matches org, agent, and digest |
| Proof replay | Query key plus evidence ID and registry nonce checks |
| Runtime calldata mutation | EIP-712 calldata hash, selector, validator, and scope proof |
| Runtime direct withdrawal | Vault rejects all callers except the router |
| Validator bypass or target substitution | Scope leaf commits target, selector, validator, constraints |
| Reentrancy | Router lock plus consume/accounting before vault call |
| Revocation race | Current status is checked on every consume; TTL and freshness bound the gap |
| Runtime loads an unapproved artifact in TEE mode | Verifier-attested binding matches runtime key, artifact root, container digest, and expiry; the verifier must validate the quote |
| Emergency misuse | Guardian functions only pause or revoke; unpause is admin-only |
| Artifact substitution | Canonical CBOR manifest, sorted leaves, and release digest |

Base mode intentionally does not claim that the runtime loaded the approved
weights. TEE-required mode adds a verifier-attested binding, but AIRLOCK does
not verify hardware quotes on-chain or make that verifier's off-chain work
disappear.
