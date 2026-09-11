# AIRLOCK agent protocol layer

The control plane exposes the protocol surfaces below. They are backed by the
same Creditcoin capability and do not bypass the existing router.

## Authorization credential

`POST /api/credentials/issue` returns an `AIRLOCK_CREDENTIAL_V1` bundle:

```json
{ "credential": { "releaseDigest": "0x…", "capabilityId": "0x…" }, "signature": "0x…" }
```

The credential is EIP-712 typed, bound to the Creditcoin router, target chain,
MCP audience, release digest, policy hash, runtime key, scope root, budgets,
validity window, evidence root, trace root, and optional A2A task/context IDs.
The server accepts EOA EIP-712 signatures and ERC-1271 contract validation. A child credential can only reduce
budget, calls, tools, risk, and lifetime.

Never put the returned header in logs:

```text
Authorization: Bearer AirlockCredential <base64url-json>
```

Issuance requires the operator authorization used by the hosted runbook and an
active live capability. A revoked or expired release cannot mint a credential.

`POST /api/credentials/delegate` registers an attenuated child in the on-chain
`CapabilityDelegationRegistry` before returning its signed credential. The
registry stores proven scope leaves as well as budget, calls, lifetime, and
depth. The router consumes child budget and calls through the parent chain, so
revoking a parent makes descendants inactive on the next action.

## MCP

`POST /mcp` implements JSON-RPC `initialize`, `tools/list`, `tools/call`, and
`ping`. `tools/list` only returns tools present in the credential. `tools/call`
revalidates release status, recipient, amount, tool scope, remaining credential
budget/calls, and the live capability before invoking the existing allowlisted
runbook path. Low-risk calls return `ALLOW`; high-value payments without the
required risk level return structured `AUTH_REQUIRED`; prohibited calls return
`DENY`. `GET /mcp` with `Accept: text/event-stream` emits
`notifications/tools/list_changed` when release or capability state changes.

The gateway also serves `/.well-known/oauth-protected-resource` for resource
metadata. OAuth authorization is intentionally deployment-owned; AIRLOCK does
not accept or forward tokens issued for another audience.

## A2A

`/.well-known/agent-card.json` advertises the AIRLOCK authorization skill and
credential extension. `POST /a2a` accepts a task action and returns
`COMPLETED`, `AUTH_REQUIRED`, or `FAILED` with an AIRLOCK decision in metadata.

## ERC-8004

Set `AIRLOCK_AGENT_REGISTRY`, `AIRLOCK_AGENT_ID`, and
`AIRLOCK_IDENTITY_RPC_URL` to enable the adapter. The adapter reads the ERC-721
`tokenURI`, resolves HTTPS, IPFS through an explicitly configured gateway, or a
data URI, and validates the registration file, registry, agent ID, and optional
release digest. It does not treat an advertised service as proof that the
service is safe.

## Evaluator quorum

`POST /api/evaluations/quorum` verifies independent EIP-712 evaluator reports,
rejects duplicate signers, checks release/suite/score/validity, and returns a
deterministic evaluator root. Configure `AIRLOCK_APPROVED_EVALUATORS` before
using it. The current deployed evidence registry remains the authoritative
cross-chain source; this endpoint does not turn off-chain reports into proof.

## x402

`/x402/protected` emits an x402 v2 `402 Payment Required` envelope and checks
that a supplied payment payload matches network, recipient, and amount. When
`AIRLOCK_X402_SETTLE_URL` is configured, the payment is forwarded to that
facilitator and only a successful facilitator response is returned as settled.

## Runtime assurance and traces

The service reports L0 artifact-bound assurance by default, L1 only when a
SPIFFE/SPIRE configuration is present, and L2 after a verifier-attested TEE
binding is recorded. L3 is deliberately not claimed. `/api/trace` returns a
privacy-preserving graph of agent, release passport, proven evidence,
capability, and transaction nodes. Action trace roots are stored with runbook
state and are also included in the router's `ActionExecuted` event.
