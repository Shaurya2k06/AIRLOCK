# Attestcoin Protocol Integration

Airlock is a cross-chain release authorization and capability-enforcement system. Its Attestcoin Protocol integration is the mechanism that moves release evidence from Ethereum Sepolia to Creditcoin with a proof that is verified on-chain.

This document is the submission-facing integration summary. It explains what runs, where it runs, which protocol surfaces are used, how to reproduce the flow, and how imported attestations affect real authorization decisions.

## Integration summary

Airlock uses the Attestcoin Protocol in five connected layers:

1. Airlock publishes release evidence as typed events on Ethereum Sepolia.
2. The Attestcoin SDK resolves the source chain key and obtains Merkle and continuity proofs for those source transactions.
3. The Creditcoin Attestcoin block prover verifies those proofs inside the destination transaction.
4. The Airlock Attestcoin adapter decodes the proven receipt, validates the exact event, and stores the evidence on Creditcoin.
5. The capability issuer and tool router use that imported evidence to issue and enforce bounded execution authority.

The proof is therefore part of the authorization path. A source transaction is not accepted merely because an API, RPC response, or worker says that it exists.

| Property | Value |
| --- | --- |
| Source chain | Ethereum Sepolia |
| Source EVM chain ID | 11155111 |
| Attestcoin source chain key | 1 in the deployed snapshot |
| Destination chain | Creditcoin testnet |
| Destination EVM chain ID | 102031 |
| Native proof verifier | 0x0000000000000000000000000000000000000fd2 |
| Receipt decoder | Official EVM V1 decoder from @gluwa/asc-contracts |
| SDK | @gluwa/usc-sdk |
| Supported evidence kinds | artifact, evaluation, approval, status, revocation |
| Batch size | 1 to 10 proven source transactions |
| Destination evidence store | EvidenceRegistry |
| Authorization consumer | CapabilityIssuer, then ToolRouter or DelegationRegistry |

## Why this integration is important

The project needs to answer a security-critical question:

> Why should a Creditcoin execution capability be allowed to operate on behalf of a particular release?

Airlock answers that question using a complete, independently checkable evidence chain:

- The artifact must identify the exact release digest and tool manifest.
- The evaluation must identify the approved suite and evaluator set, provide a safety score, and stay within its validity window.
- The deployment approval must bind the release to an agent, runtime key, policy, scope root, and explicit spend and call limits.
- The status checkpoint must say that the release is active and must still be fresh.
- A later revocation must be able to invalidate the capability before the next call.

Attestcoin supplies the cross-chain integrity boundary for this evidence. The destination adapter verifies the source transaction inclusion proof, then checks the receipt and event shape before it records anything. This prevents the control plane from turning an unverified source-chain claim into execution authority.

The integration is meaningful because it is used for state transition, not only displayed as metadata:

- Imported evidence is stored in Creditcoin contracts.
- CapabilityIssuer refuses to issue a capability when any required evidence is missing or inconsistent.
- CapabilityIssuer re-reads status evidence during every consumption.
- A proven revocation changes the stored status to revoked.
- ToolRouter rejects a subsequent call through the revoked capability.
- The worker continuously discovers new source events and submits proofs.

## Architecture

The live topology is:

    Ethereum Sepolia
      ArtifactRegistry       ─┐
      EvaluationRegistry      ├─ source events
      DeploymentApprovalRegistry
      ReleaseStatusRegistry  ─┘
                │
                │ source transaction hash
                ▼
      @gluwa/usc-sdk
        PrecompileChainInfoProvider
        ProofBuilder
                │
                │ encoded receipt proof
                ▼
    Creditcoin testnet
      BlockProver precompile
          │ verifies Merkle inclusion and continuity
          ▼
      AirlockAttestcoinAdapter
          │ decodes proven receipt and validates event
          ▼
      OfficialReceiptDecoder
          │
          ▼
      EvidenceRegistry
          │
          ├── CapabilityIssuer.issue(...)
          │       └── checks all imported evidence and policy constraints
          │
          └── CapabilityIssuer.consume(...)
                  └── re-checks current status and budgets
                          │
                          ▼
                    ToolRouter / AgentVault

The source registries are role-controlled Airlock contracts. The destination contracts do not trust the source RPC or the proof-builder response by themselves. The destination BlockProver is the cryptographic verification boundary; the adapter is the semantic and replay-protection boundary.

## Protocol surfaces used

### 1. Chain-key discovery

The importer does not blindly hard-code a chain key. It creates an Attestcoin SDK chain information provider over the Creditcoin RPC:

    new chainInfo.PrecompileChainInfoProvider(creditcoinRpc)
    await provider.getSupportedChains()

It filters the supported chains by the configured source EVM chain ID. The configured SOURCE_CHAIN_KEY is accepted only if it is a valid key for that chain. If no key is configured, exactly one matching key is required.

For the deployed release:

- SOURCE_CHAIN_ID is 11155111.
- The live Attestcoin mapping resolves it to chain key 1.
- The adapter stores chain key 1 as its immutable sourceChainKey.
- Every import rejects a request whose chain key differs from that immutable value.

This protects against sending a proof for one source chain while labeling it as another.

### 2. Proof construction

The single-event importer creates:

    new proofProvider.service.ProofBuilder(
        sourceChainKey,
        CREDITCOIN_PROOF_BUILDER_URL,
        PROOF_BUILDER_TIMEOUT_MS
    )

Before requesting the proof, it:

- Reads the source transaction receipt.
- Requires that the source transaction exists.
- Requires source receipt status 1.
- Waits for the source block height to be attested.
- Requests a proof for the source transaction.
- Retries proof retrieval with bounded linear backoff.
- Verifies that the returned proof chain key matches the resolved source chain key.
- Verifies that the returned transaction hash and block header correspond to the requested source transaction.

The proof passed to the Solidity adapter contains:

- chainKey
- blockHeight
- encodedTransaction
- Merkle proof root
- Merkle proof sibling hashes and left/right directions
- continuity proof lower endpoint digest
- continuity proof roots
- source receipt log index

The batch importer uses the SDK batch proof endpoint for up to ten source transactions. It maps returned proof entries back to the requested hashes and rejects a batch if any requested transaction is omitted or mismatched.

### 3. Native destination verification

The adapter calls the Creditcoin BlockProver precompile using the Attestcoin ABI:

    verify(
        uint64 chainKey,
        uint64 height,
        bytes encodedTransaction,
        MerkleProof merkleProof,
        ContinuityProof continuityProof
    ) returns (bool)

For a batch, it calls the overloaded form with arrays of heights, transactions, and Merkle proofs plus one shared continuity proof.

The adapter reverts unless the verifier returns true. It never records evidence before this check succeeds.

The verifier also calculates the source transaction index from the Merkle proof:

    calculateTxIndex(merkleProof)

Airlock includes that index in its deterministic query key, so the same source log cannot be imported twice under a different local request.

### 4. Official receipt decoding

Creditcoin receives an encoded source transaction, not a normal local EVM receipt object. Airlock deploys OfficialReceiptDecoder, which delegates to the pinned Attestcoin EVM V1 decoder:

    EvmV1Decoder.decodeReceiptFields(encodedTransaction)

The adapter checks:

- decoded receipt status is 1;
- the requested log index exists;
- the log emitter is the expected source registry;
- the number of topics is exactly 4;
- topic zero is the exact expected event signature hash;
- the ABI data length is exact for the event kind.

Only after these checks does the adapter ABI-decode the event data.

### 5. Evidence import and replay protection

The adapter has five public import methods:

- importArtifact
- importEvaluation
- importApproval
- importStatus
- importRevocation

Each successful import emits ProofImported with:

- the evidence kind;
- the deterministic query key;
- the deterministic evidence ID.

The query key is:

    keccak256(abi.encode(
        chainKey,
        blockHeight,
        transactionIndex,
        logIndex,
        emitter
    ))

The evidence ID is:

    keccak256(abi.encode(
        kind,
        queryKey,
        releaseDigest
    ))

The adapter stores usedQuery and usedEvidence markers. A replayed source log, replayed evidence ID, or duplicate release evidence is rejected. EvidenceRegistry also allows only the adapter to write evidence.

## Evidence types and semantic checks

### Artifact evidence

Source event:

    ArtifactPublished(
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
    )

The adapter records the release identity and artifact integrity fields. It rejects zero release versions and zero publisher nonces.

The artifact's toolManifestRoot later becomes part of scope validation. The artifactRoot and containerImageDigest are also used when the policy requires a TEE runtime binding.

### Evaluation evidence

Source event:

    EvaluationCertified(
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
    )

The adapter records the evaluation suite, report, evaluator set, score, denied capability bitmap, and validity window. It rejects:

- scores above 10,000 basis points;
- a validity window that does not move forward;
- a zero evaluation nonce.

CapabilityIssuer later compares suiteHash, evaluatorSetHash, score, and deniedCapabilityBitmap against the selected policy.

### Deployment approval evidence

Source event:

    DeploymentApproved(
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
    )

This is the approval that binds a release to an agent and runtime. The adapter rejects a zero runtime key, zero call cap, invalid time window, or zero approval nonce.

CapabilityIssuer later enforces:

- approval release digest equals the requested release;
- approval agent ID equals the requested agent;
- approval policy hash equals the selected policy;
- approval scope root equals both the artifact tool manifest root and the policy allowed scope root;
- total spend cap is within policy ceiling;
- per-call value cap is within policy ceiling;
- call cap is within policy ceiling;
- current time is inside the approval window.

### Active status evidence

Source event:

    ReleaseStatusCheckpoint(
        bytes32 indexed orgId,
        bytes32 indexed releaseDigest,
        uint8 indexed status,
        uint64 statusNonce,
        uint64 issuedAt,
        uint64 validUntil
    )

The adapter only accepts status 1, which is Airlock's active status. It rejects zero nonces and invalid windows. EvidenceRegistry applies monotonic status nonces and refuses status updates after revocation.

CapabilityIssuer checks that the imported status is active, unrevoked, and fresh according to the policy's statusFreshness value. CapabilityIssuer.consume performs the status lookup again before every authorized action. This is what makes later imported status changes operationally meaningful.

### Revocation evidence

Source event:

    ReleaseRevoked(
        bytes32 indexed orgId,
        bytes32 indexed releaseDigest,
        bytes32 indexed reasonHash,
        uint64 statusNonce,
        uint64 revokedAt
    )

The adapter imports revocation through the same proof-verification and receipt-validation path. EvidenceRegistry then writes status 2, sets revoked to true, preserves the reason hash, and prevents later active status writes.

When a capability is consumed after revocation:

1. CapabilityIssuer reads the current status from EvidenceRegistry.
2. It detects revoked or non-active status.
3. It marks the capability revoked.
4. It emits CapabilityRevoked.
5. The requested call reverts.

## Destination enforcement after import

Attestcoin evidence is not an isolated passport record. It feeds the actual execution authorization path.

### Capability issuance

CapabilityIssuer.issue loads:

- ArtifactEvidence;
- EvaluationEvidence;
- ApprovalEvidence;
- StatusEvidence;
- the selected Policy.

It refuses issuance if any item is missing. It then verifies identity and consistency across all records:

- organization and release digest match;
- artifact release ID equals evaluation release ID;
- approval agent and release match;
- status belongs to the same organization and release;
- approval policy equals the selected policy;
- evaluation suite and evaluator set are approved;
- safety score meets the policy minimum;
- denied capabilities do not overlap the policy's denied bitmap;
- approval scope matches artifact and policy scope roots;
- requested budgets fit policy ceilings;
- all time windows are valid and fresh.

The capability expiry is the minimum of approval expiry, evaluation expiry, status expiry, policy TTL, and TEE binding expiry when TEE is required.

### Capability consumption

ToolRouter is the only configured router for direct capability consumption. It passes the capability ID and value to CapabilityIssuer.consume, which checks:

- capability is present and not locally revoked;
- subject, release, agent, and runtime pause switches;
- policy exists and is not paused;
- current imported status remains active and unrevoked;
- TEE binding remains valid when required;
- deadline and capability validity;
- per-call value cap;
- remaining total spend;
- remaining call count.

ToolRouter then validates the typed EIP-712 ToolIntent, target, selector, calldata hash, scope proof, idempotency key, nonce, and signature before forwarding the call to AgentVault.

This gives the Attestcoin proof a concrete effect: without valid imported source evidence, no capability is issued; after a proven revocation, no later tool call succeeds.

## Source-to-destination code path

| Responsibility | Implementation |
| --- | --- |
| Source event production | contracts/contracts/Airlock.sol: ArtifactRegistry, EvaluationRegistry, DeploymentApprovalRegistry, ReleaseStatusRegistry |
| Attestcoin chain-key resolution | contracts/scripts/import-proof.ts and import-batch-proof.ts |
| Proof builder integration | @gluwa/usc-sdk proofProvider.service.ProofBuilder |
| Supported-chain lookup | @gluwa/usc-sdk chainInfo.PrecompileChainInfoProvider |
| Native proof ABI | IBlockProver in contracts/contracts/Airlock.sol |
| Official receipt decoding | OfficialReceiptDecoder using @gluwa/asc-contracts EvmV1Decoder |
| Single-event adapter | AirlockAttestcoinAdapter.importArtifact, importEvaluation, importApproval, importStatus, importRevocation |
| Batch adapter | AirlockAttestcoinAdapter.importBatch, maximum ten entries |
| Durable evidence | EvidenceRegistry |
| Continuous source watcher | contracts/scripts/worker.ts |
| Capability issuance and revocation reaction | CapabilityIssuer |
| Typed execution enforcement | ToolRouter and AgentVault |
| Public deployment/proof metadata | server/deployments.json |
| Public API projection | server/index.js endpoints /api/protocol, /api/release-passport, and /api/trace |

## Live deployed addresses

The repository's public deployment snapshot is server/deployments.json. It contains public addresses and proof metadata only; private keys stay in the local environment.

### Ethereum Sepolia source contracts

| Contract | Address |
| --- | --- |
| ArtifactRegistry | 0xa945B065B89Ca0779c2997bD4A7691d5d90b4Bb8 |
| EvaluationRegistry | 0x2116b934A63062E603426f6269156e5cED9bf68D |
| DeploymentApprovalRegistry | 0xbC09B6bA4A50BBa22190bD004E84a7e83304e708 |
| ReleaseStatusRegistry | 0xf8A11D62745E2F31B5B9Fc2A300de8Ec19a43471 |

### Creditcoin destination contracts

| Contract | Address |
| --- | --- |
| Attestcoin BlockProver precompile | 0x0000000000000000000000000000000000000fd2 |
| OfficialReceiptDecoder | 0xF64aD84D20960E216D1b2D9F608b4D48805e6ca8 |
| EvidenceRegistry | 0x1F3FdFD49BDa4889570d7f1e42630123a0FCcc15 |
| AirlockAttestcoinAdapter | 0x94eA3732Ac915F62dfe9C7DF2422516085c9C256 |
| PolicyRegistry | 0x9bb4BD4Dcc2d35dabF596978EF77655877524Eaf |
| RuntimeBindingRegistry | 0xbd19baa228B99F464fc3C78342c77932a43CcEaC |
| CapabilityIssuer | 0x8FFe9Fb9a96F3CDc0917644EF9C50c143E65dF57 |
| ToolRouter | 0xdC33aCcb30E67A107D11663AEA1B124e02F4dD88 |
| AgentVault | 0x2844649001436f6d6983cEB492B63a7B7422F958 |

## Live proof evidence

The current public snapshot contains four successful single-proof imports. Every row records a source transaction, source chain key, source block and transaction index, decoded log index, proof size, and successful Creditcoin transaction.

| Kind | Source transaction | Source block | Tx index | Log index | Proof bytes | Merkle siblings | Creditcoin import transaction |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| artifact | 0xb68f5d72b3c24c36c6d05bb7273a01bfde7495d22ee5547004ff7ca27cf405c0 | 11688035 | 36 | 0 | 2400 | 7 | 0x26aba4145461d65ac73d060f181b8069120443dee63459eec14d9bdebf1914e3 |
| evaluation | 0xb12322d8b012cc16cf6e31b82300798b5a83fe9493705af7c36a9e30fe57e864 | 11688037 | 87 | 0 | 2208 | 8 | 0x21d471d276b7a2549067bca0d2c88c53a63d08357f3db7acff35bf888a390a1c |
| approval | 0x15c26b30d9d0223dc06b5a011462e9e18e4dc72aa66de6338ae866719bbb4772 | 11688038 | 47 | 0 | 2272 | 7 | 0xf29cf1e03fbae1cd67971a8597812265f246c66bb33bb3f92a4c99c35f6d8906 |
| status | 0x95c8df4043e84fc1d5f2c9906ec8f892211efda8d9c1f1ac2a2b772362905084 | 11688040 | 76 | 0 | 1888 | 8 | 0x4047d2e175ad8d1435614a629d96e79c25eaa45f81936f5ae3478560cf2d02b3 |

The deployment snapshot marks these proofs as cached because they were already produced by the configured proof builder. Cached describes proof-builder storage behavior; the destination adapter still executes the native verifier and all receipt/event checks when the import transaction is submitted.

## Batch import

Batch import is implemented as a real protocol path, not a client-side loop:

1. The SDK returns a proof entry for every requested source transaction.
2. One shared continuity proof is supplied to the adapter.
3. The adapter calls the native batch verifier once.
4. It validates every decoded receipt and event.
5. It records all evidence items in one Creditcoin transaction.
6. Any invalid item reverts the whole batch.

The adapter requires:

- one to ten items;
- equal lengths for kinds, block heights, transactions, Merkle proofs, and log indices;
- one chain key matching sourceChainKey;
- one successful proof result for every transaction.

From the contracts directory, a batch can be run with:

    SOURCE_TX_HASHES=0xSOURCE_TX_1,0xSOURCE_TX_2 \
    IMPORT_KINDS=artifact,evaluation \
    npm run import-proof:batch

SOURCE_LOG_INDICES can optionally provide a comma-separated index for each transaction. If omitted, the script finds the first log whose topic zero matches the expected event signature.

## Continuous worker integration

contracts/scripts/worker.ts provides the operational bridge from new source events to proof imports.

The worker:

- monitors all five event streams;
- scans in configurable block ranges;
- stores a cursor and event journal;
- records observed, retryable, submitted, and consumed states;
- invokes the single-proof importer with the event kind, transaction hash, and log index;
- retries transient failures with WORKER_RETRIES and WORKER_BACKOFF_MS;
- treats an on-chain replay response as consumed, making restarts safe;
- writes state through a temporary file and rename.

Run it once for a bounded scan:

    WORKER_ONCE=true npm run worker

Run it continuously:

    npm run worker

The worker is intentionally a liveness layer. Cryptographic verification, event-shape validation, semantic checks, replay protection, and evidence writes remain in the destination contracts.

## Setup and reproduction

### Prerequisites

- Node.js compatible with the repository toolchain.
- An Ethereum Sepolia RPC endpoint.
- A Creditcoin testnet RPC endpoint.
- An Attestcoin-compatible proof-builder URL.
- Funded source role accounts for deployment and evidence publication.
- A funded Creditcoin worker account for proof imports.
- The repository's existing dependency lockfile.

The integration dependencies are declared in contracts/package.json:

- @gluwa/usc-sdk version range ^0.18.0;
- @gluwa/asc-contracts version range ^0.2.1;
- ethers version range ^6.17.0;
- dotenv for environment loading.

### Configure the environment

Copy contracts/.env.example to contracts/.env and set the private values locally. Do not commit contracts/.env.

The important protocol variables are:

| Variable | Meaning |
| --- | --- |
| SOURCE_CHAIN_RPC_URL | Source Ethereum Sepolia RPC |
| SOURCE_CHAIN_ID | Expected source EVM chain ID; deployed value is 11155111 |
| SOURCE_CHAIN_KEY | Optional explicit Attestcoin key; deployed value is 1 |
| CREDITCOIN_RPC_URL | Creditcoin destination RPC |
| CREDITCOIN_CHAIN_ID | Expected destination chain ID; deployed value is 102031 |
| CREDITCOIN_PROOF_BUILDER_URL | Attestcoin proof-builder service URL |
| PROOF_BUILDER_TIMEOUT_MS | Proof-builder request timeout |
| ATTESTATION_WAIT_TIMEOUT_MS | Maximum wait for a source block to become attested |
| ATTESTATION_POLL_INTERVAL_MS | Attestation polling interval |
| ATTESTATION_EXTRA_DELAY_MS | Additional safety delay after attestation |
| AIRLOCK_ADAPTER_ADDRESS | Optional adapter override; otherwise deployments.json is used |
| CREDITCOIN_WORKER_PRIVATE_KEY | Creditcoin signer that submits proof imports |
| SOURCE_TX_HASH | Source transaction for one import |
| IMPORT_KIND | artifact, evaluation, approval, status, or revocation |
| SOURCE_LOG_INDEX | Optional log index for one import |
| SOURCE_TX_HASHES | Comma-separated source transactions for batch import |
| IMPORT_KINDS | Comma-separated matching kinds for batch import |
| SOURCE_LOG_INDICES | Optional comma-separated batch log indices |

The deployment and live workflow also require the role keys documented in contracts/.env.example. They are deliberately separated by role: publisher, evaluator, approver, status authority, destination worker, policy administrator, guardian, runtime, and optional TEE verifier.

### Validate and deploy

From the repository root:

    cd contracts
    npm install
    npm run ci
    npm run live:check
    npm run deploy-live

live:check is read-only. It verifies the configured RPC chain IDs, required URLs, source/destination role separation, release inputs, funding, and deployment prerequisites.

deploy-live:

- resolves the source chain key through the Attestcoin chain-info precompile;
- deploys the four source registries;
- publishes the release artifact, evaluation, approval, and active status;
- deploys the Creditcoin evidence, decoder, policy, runtime, issuer, adapter, router, and vault contracts;
- configures the adapter with the native BlockProver, official decoder, evidence registry, and expected source emitters;
- writes public deployment metadata.

### Import individual proofs

From contracts, set the source transaction and evidence kind explicitly:

    IMPORT_KIND=artifact SOURCE_TX_HASH=0xSOURCE_ARTIFACT_TX npm run import-proof
    IMPORT_KIND=evaluation SOURCE_TX_HASH=0xSOURCE_EVALUATION_TX npm run import-proof
    IMPORT_KIND=approval SOURCE_TX_HASH=0xSOURCE_APPROVAL_TX npm run import-proof
    IMPORT_KIND=status SOURCE_TX_HASH=0xSOURCE_STATUS_TX npm run import-proof
    IMPORT_KIND=revocation SOURCE_TX_HASH=0xSOURCE_REVOCATION_TX npm run import-proof

For the deployed release, the source transaction can be omitted because deploy-live records the four initial source transaction hashes in deployments.json. A revocation transaction is supplied after the revoke step.

Every command waits for attestation, obtains the proof, calls the matching adapter method, waits for the Creditcoin receipt, and records public proof metadata.

### Run the end-to-end authorization demonstration

The live-step script demonstrates the effect of imported evidence:

    LIVE_STEP=execute npm run live-step
    LIVE_STEP=deposit npm run live-step
    LIVE_STEP=revoke npm run live-step
    IMPORT_KIND=revocation npm run import-proof
    LIVE_STEP=blocked npm run live-step

The expected sequence is:

1. execute verifies the release manifest, issues a capability from imported evidence, signs a typed intent, and runs an allowed call.
2. deposit runs a second bounded action through the same enforcement path.
3. revoke creates a source-chain revocation.
4. import-proof transports that revocation through Attestcoin and stores it on Creditcoin.
5. blocked attempts the same class of action and demonstrates that current status evidence prevents execution.

## Failure behavior

The trust boundary is fail-closed.

| Invalid condition | Result |
| --- | --- |
| Source or destination RPC has the wrong chain ID | Import script aborts before submission |
| Unknown or mismatched source chain key | Import script or adapter rejects |
| Proof verifier returns false | InvalidProof revert |
| Source receipt failed | FailedReceipt revert or importer abort |
| Requested log is absent | MalformedLog revert |
| Emitter is not the configured source registry | WrongEmitter revert |
| Topic count is not exactly four | WrongTopicCount revert |
| Event signature is not exact | WrongTopic revert |
| ABI data length is not exact | WrongDataLength revert |
| Event payload violates semantic rules | MalformedLog or InvalidStatus revert |
| Same proven log is imported again | Replay revert |
| Destination adapter is paused | Paused revert |
| Required evidence is missing | MissingEvidence revert |
| Evidence identities or policy values disagree | Mismatch revert |
| Approval exceeds policy budgets | BudgetExceeded revert |
| Release is revoked or inactive at consumption time | CapabilityPaused/revocation path reverts the action |
| Worker encounters a transient import error | Retryable journal entry |
| Worker encounters an on-chain replay | Consumed journal entry |

No fallback path writes evidence from an unverified RPC response. No fallback path bypasses the adapter to grant a capability.

## Testing and verification

The Solidity integration tests are in contracts/contracts/Airlock.t.sol. They cover the protocol boundary and downstream effect, including:

- official receipt decoder ABI compatibility;
- source chain-key mismatch;
- invalid proofs;
- wrong emitters;
- wrong topics and topic counts;
- wrong data lengths;
- failed receipts;
- malformed semantic payloads;
- single imports;
- successful multi-proof batch imports;
- batch length and array mismatch;
- batch atomicity;
- query replay and evidence replay;
- missing or mismatched evidence;
- capability budget and time-window checks;
- runtime and TEE binding checks;
- direct router authorization;
- typed intent and scope checks;
- post-revocation call rejection.

The repository CI command is:

    cd contracts
    npm run ci

It runs contract compilation, TypeScript checks, manifest tests, ABI checks, secret checks, and the Hardhat test suite.

For a deployed run, inspect:

- server/deployments.json for addresses, release identifiers, proof fields, source hashes, destination hashes, and gas used;
- GET /api/protocol for the integration topology and readiness state;
- GET /api/release-passport for the release and evidence projection;
- GET /api/trace for the privacy-preserving relationship between agent, release, evidence, capability, and action.

## Scope and honest boundary

Airlock uses Attestcoin for the part Attestcoin is designed to provide: verifiable cross-chain transport of source-chain transaction evidence into Creditcoin. Airlock's release semantics are application-specific:

- the four source registries define the release evidence schema;
- the adapter defines which event emitters and topics are trusted for this deployment;
- CapabilityIssuer defines how the evidence becomes authorization;
- ToolRouter defines the final action constraints.

This separation is intentional. Attestcoin proves that the encoded source transaction and receipt were included on the configured source chain. Airlock then proves that the receipt contains the expected release event and that the event satisfies Airlock's policy and lifecycle rules.

## Short evaluator checklist

A reviewer can verify the integration in this order:

1. Open contracts/package.json and confirm the Attestcoin SDK and official decoder dependencies.
2. Open contracts/contracts/Airlock.sol and inspect IBlockProver, OfficialReceiptDecoder, AirlockAttestcoinAdapter, EvidenceRegistry, CapabilityIssuer, and ToolRouter.
3. Run npm run ci from contracts.
4. Inspect import-proof.ts for chain-key discovery, attestation waiting, proof retrieval, and native adapter submission.
5. Inspect import-batch-proof.ts for the one-transaction multi-proof path.
6. Inspect worker.ts for continuous source-event discovery and retry behavior.
7. Inspect server/deployments.json for successful source and Creditcoin proof transaction hashes.
8. Follow the live-step execute, revoke, import, blocked sequence to see imported Attestcoin evidence change real execution behavior.

The integration is complete when a source event is proven by the Attestcoin path, recorded on Creditcoin, consumed by capability issuance, and enforced by the final tool call.
