// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @notice The native Attestcoin proof surface on Creditcoin.
interface IBlockProver {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);

    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}

/// @notice ABI boundary for the official EVM V1 receipt decoder.
///
/// The production deployment points this interface at the pinned decoder
/// library. The local suite uses MockReceiptDecoder with the same ABI shape.
interface IReceiptDecoder {
    struct LogEntry {
        address emitter;
        bytes32[] topics;
        bytes data;
    }

    struct ReceiptFields {
        uint8 status;
        LogEntry[] logs;
    }

    function decodeReceiptFields(bytes calldata encodedTransaction)
        external
        view
        returns (ReceiptFields memory);
}

/// @notice Production adapter for the pinned Attestcoin EVM V1 decoder.
/// @dev Maps the official field names to AIRLOCK's smaller receipt ABI.
contract OfficialReceiptDecoder is IReceiptDecoder {
    function decodeReceiptFields(bytes calldata encodedTransaction)
        external
        pure
        returns (ReceiptFields memory receipt)
    {
        EvmV1Decoder.ReceiptFields memory decoded = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        receipt.status = decoded.receiptStatus;
        receipt.logs = new LogEntry[](decoded.receiptLogs.length);
        for (uint256 i; i < decoded.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory log = decoded.receiptLogs[i];
            receipt.logs[i] = LogEntry({emitter: log.address_, topics: log.topics, data: log.data});
        }
    }
}

library ScopeProof {
    function leaf(
        address target,
        bytes4 selector,
        address validator,
        bytes32 constraintsHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, selector, validator, constraintsHash));
    }

    function verify(bytes32 root, bytes32 leafHash, bytes32[] calldata proof)
        internal
        pure
        returns (bool)
    {
        bytes32 current = leafHash;
        for (uint256 i; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            current = current < sibling
                ? keccak256(abi.encodePacked(current, sibling))
                : keccak256(abi.encodePacked(sibling, current));
        }
        return current == root;
    }
}

abstract contract RoleAddress {
    error Unauthorized();
    error ZeroAddress();

    address public immutable role;

    constructor(address role_) {
        if (role_ == address(0)) revert ZeroAddress();
        role = role_;
    }

    modifier onlyRole() {
        if (msg.sender != role) revert Unauthorized();
        _;
    }
}

contract ArtifactRegistry is RoleAddress {
    error DuplicateRelease();
    error DuplicateVersion();
    error StaleNonce();
    error InvalidVersion();

    mapping(bytes32 => uint64) public latestNonce;
    mapping(bytes32 => bool) public publishedDigest;
    mapping(bytes32 => mapping(uint64 => bool)) public publishedVersion;

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

    constructor(address publisher) RoleAddress(publisher) {}

    function publish(
        bytes32 orgId,
        bytes32 releaseId,
        bytes32 releaseDigest,
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
    ) external onlyRole {
        if (releaseVersion == 0) revert InvalidVersion();
        if (publishedDigest[releaseDigest]) revert DuplicateRelease();
        if (publishedVersion[orgId][releaseVersion]) revert DuplicateVersion();
        if (publisherNonce <= latestNonce[orgId]) revert StaleNonce();

        latestNonce[orgId] = publisherNonce;
        publishedDigest[releaseDigest] = true;
        publishedVersion[orgId][releaseVersion] = true;
        emit ArtifactPublished(
            orgId,
            releaseId,
            releaseDigest,
            manifestHash,
            artifactRoot,
            weightsHash,
            tokenizerHash,
            systemPromptHash,
            toolManifestRoot,
            containerImageDigest,
            sbomHash,
            provenanceHash,
            releaseVersion,
            publisherNonce
        );
    }
}

contract EvaluationRegistry is RoleAddress {
    error StaleNonce();
    error InvalidWindow();
    error InvalidScore();

    mapping(bytes32 => uint64) public latestNonce;

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

    constructor(address evaluator) RoleAddress(evaluator) {}

    function certify(
        bytes32 orgId,
        bytes32 releaseId,
        bytes32 releaseDigest,
        bytes32 suiteHash,
        bytes32 reportHash,
        bytes32 evaluatorSetHash,
        uint32 safetyScoreBps,
        uint256 deniedCapabilityBitmap,
        uint64 evaluatedAt,
        uint64 validUntil,
        uint64 evaluationNonce
    ) external onlyRole {
        if (evaluationNonce <= latestNonce[orgId]) revert StaleNonce();
        if (validUntil <= evaluatedAt) revert InvalidWindow();
        if (safetyScoreBps > 10_000) revert InvalidScore();
        latestNonce[orgId] = evaluationNonce;
        emit EvaluationCertified(
            orgId,
            releaseId,
            releaseDigest,
            suiteHash,
            reportHash,
            evaluatorSetHash,
            safetyScoreBps,
            deniedCapabilityBitmap,
            evaluatedAt,
            validUntil,
            evaluationNonce
        );
    }
}

contract DeploymentApprovalRegistry is RoleAddress {
    error StaleNonce();
    error InvalidWindow();

    mapping(bytes32 => uint64) public latestNonce;

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

    constructor(address approver) RoleAddress(approver) {}

    function approve(
        bytes32 orgId,
        bytes32 agentId,
        bytes32 releaseDigest,
        address runtimeKey,
        bytes32 policyHash,
        bytes32 requestedScopeRoot,
        uint128 totalSpendCap,
        uint128 perCallValueCap,
        uint32 callCap,
        uint64 validAfter,
        uint64 validUntil,
        uint64 approvalNonce
    ) external onlyRole {
        if (approvalNonce <= latestNonce[agentId]) revert StaleNonce();
        if (runtimeKey == address(0)) revert ZeroAddress();
        if (validUntil <= validAfter || callCap == 0) revert InvalidWindow();
        latestNonce[agentId] = approvalNonce;
        emit DeploymentApproved(
            orgId,
            agentId,
            releaseDigest,
            runtimeKey,
            policyHash,
            requestedScopeRoot,
            totalSpendCap,
            perCallValueCap,
            callCap,
            validAfter,
            validUntil,
            approvalNonce
        );
    }
}

contract ReleaseStatusRegistry is RoleAddress {
    error StaleNonce();
    error InvalidWindow();
    error AlreadyRevoked();

    mapping(bytes32 => uint64) public latestNonce;
    mapping(bytes32 => bool) public revoked;

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

    constructor(address statusAuthority) RoleAddress(statusAuthority) {}

    function checkpoint(
        bytes32 orgId,
        bytes32 releaseDigest,
        uint8 status,
        uint64 statusNonce,
        uint64 issuedAt,
        uint64 validUntil
    ) external onlyRole {
        bytes32 key = keyFor(orgId, releaseDigest);
        if (revoked[key]) revert AlreadyRevoked();
        if (statusNonce <= latestNonce[key]) revert StaleNonce();
        if (status != 1 || validUntil <= issuedAt) revert InvalidWindow();
        latestNonce[key] = statusNonce;
        emit ReleaseStatusCheckpoint(orgId, releaseDigest, status, statusNonce, issuedAt, validUntil);
    }

    function revoke(
        bytes32 orgId,
        bytes32 releaseDigest,
        bytes32 reasonHash,
        uint64 statusNonce,
        uint64 revokedAt
    ) external onlyRole {
        bytes32 key = keyFor(orgId, releaseDigest);
        if (revoked[key]) revert AlreadyRevoked();
        if (statusNonce <= latestNonce[key]) revert StaleNonce();
        latestNonce[key] = statusNonce;
        revoked[key] = true;
        emit ReleaseRevoked(orgId, releaseDigest, reasonHash, statusNonce, revokedAt);
    }

    function keyFor(bytes32 orgId, bytes32 releaseDigest) public pure returns (bytes32) {
        return keccak256(abi.encode(orgId, releaseDigest));
    }
}

contract EvidenceRegistry is RoleAddress {
    error Replay();
    error StaleStatus();
    error AlreadyRevoked();
    error AdapterAlreadySet();
    error UnauthorizedAdapter();

    struct ArtifactEvidence {
        bool exists;
        bytes32 orgId;
        bytes32 releaseId;
        bytes32 releaseDigest;
        bytes32 manifestHash;
        bytes32 artifactRoot;
        bytes32 weightsHash;
        bytes32 tokenizerHash;
        bytes32 systemPromptHash;
        bytes32 toolManifestRoot;
        bytes32 containerImageDigest;
        bytes32 sbomHash;
        bytes32 provenanceHash;
        uint64 releaseVersion;
        uint64 publisherNonce;
        bytes32 evidenceId;
    }

    struct EvaluationEvidence {
        bool exists;
        bytes32 orgId;
        bytes32 releaseId;
        bytes32 releaseDigest;
        bytes32 suiteHash;
        bytes32 reportHash;
        bytes32 evaluatorSetHash;
        uint32 safetyScoreBps;
        uint256 deniedCapabilityBitmap;
        uint64 evaluatedAt;
        uint64 validUntil;
        uint64 evaluationNonce;
        bytes32 evidenceId;
    }

    struct ApprovalEvidence {
        bool exists;
        bytes32 orgId;
        bytes32 agentId;
        bytes32 releaseDigest;
        address runtimeKey;
        bytes32 policyHash;
        bytes32 requestedScopeRoot;
        uint128 totalSpendCap;
        uint128 perCallValueCap;
        uint32 callCap;
        uint64 validAfter;
        uint64 validUntil;
        uint64 approvalNonce;
        bytes32 evidenceId;
    }

    struct StatusEvidence {
        bool exists;
        bytes32 orgId;
        bytes32 releaseDigest;
        uint8 status;
        uint64 statusNonce;
        uint64 issuedAt;
        uint64 validUntil;
        bool revoked;
        bytes32 evidenceId;
    }

    mapping(bytes32 => ArtifactEvidence) private _artifacts;
    mapping(bytes32 => EvaluationEvidence) private _evaluations;
    mapping(bytes32 => ApprovalEvidence) private _approvals;
    mapping(bytes32 => StatusEvidence) private _statuses;
    address public adapter;

    event EvidenceImported(uint8 indexed kind, bytes32 indexed evidenceId, bytes32 indexed releaseKey);

    constructor(address admin) RoleAddress(admin) {}

    function setAdapter(address adapter_) external onlyRole {
        if (adapter != address(0) || adapter_ == address(0)) revert AdapterAlreadySet();
        adapter = adapter_;
    }

    modifier onlyAdapter() {
        if (msg.sender != adapter) revert UnauthorizedAdapter();
        _;
    }

    function releaseKey(bytes32 orgId, bytes32 releaseDigest) public pure returns (bytes32) {
        return keccak256(abi.encode(orgId, releaseDigest));
    }

    function getArtifact(bytes32 key) external view returns (ArtifactEvidence memory) {
        return _artifacts[key];
    }

    function getEvaluation(bytes32 key) external view returns (EvaluationEvidence memory) {
        return _evaluations[key];
    }

    function getApproval(bytes32 key) external view returns (ApprovalEvidence memory) {
        return _approvals[key];
    }

    function getStatus(bytes32 key) external view returns (StatusEvidence memory) {
        return _statuses[key];
    }

    function recordArtifact(ArtifactEvidence calldata value) external onlyAdapter {
        bytes32 key = releaseKey(value.orgId, value.releaseDigest);
        if (_artifacts[key].exists) revert Replay();
        _artifacts[key] = value;
        emit EvidenceImported(1, value.evidenceId, key);
    }

    function recordEvaluation(EvaluationEvidence calldata value) external onlyAdapter {
        bytes32 key = releaseKey(value.orgId, value.releaseDigest);
        if (_evaluations[key].exists) revert Replay();
        _evaluations[key] = value;
        emit EvidenceImported(2, value.evidenceId, key);
    }

    function recordApproval(ApprovalEvidence calldata value) external onlyAdapter {
        bytes32 key = releaseKey(value.orgId, value.releaseDigest);
        if (_approvals[key].exists) revert Replay();
        _approvals[key] = value;
        emit EvidenceImported(3, value.evidenceId, key);
    }

    function recordStatus(StatusEvidence calldata value) external onlyAdapter {
        bytes32 key = releaseKey(value.orgId, value.releaseDigest);
        if (_statuses[key].exists && value.statusNonce <= _statuses[key].statusNonce) revert StaleStatus();
        if (_statuses[key].revoked) revert AlreadyRevoked();
        _statuses[key] = value;
        emit EvidenceImported(4, value.evidenceId, key);
    }

    function recordRevocation(
        bytes32 orgId,
        bytes32 releaseDigest,
        uint64 statusNonce,
        uint64 revokedAt,
        bytes32 evidenceId
    ) external onlyAdapter {
        bytes32 key = releaseKey(orgId, releaseDigest);
        if (_statuses[key].exists && statusNonce <= _statuses[key].statusNonce) revert StaleStatus();
        _statuses[key] = StatusEvidence({
            exists: true,
            orgId: orgId,
            releaseDigest: releaseDigest,
            status: 2,
            statusNonce: statusNonce,
            issuedAt: revokedAt,
            validUntil: type(uint64).max,
            revoked: true,
            evidenceId: evidenceId
        });
        emit EvidenceImported(5, evidenceId, key);
    }
}

contract AirlockAttestcoinAdapter is RoleAddress {
    error Paused();
    error UnsupportedChain();
    error InvalidProof();
    error FailedReceipt();
    error WrongEmitter();
    error WrongTopic();
    error WrongTopicCount();
    error WrongDataLength();
    error InvalidStatus();
    error Replay();
    error MalformedLog();

    uint8 public constant ARTIFACT = 1;
    uint8 public constant EVALUATION = 2;
    uint8 public constant APPROVAL = 3;
    uint8 public constant STATUS = 4;
    uint8 public constant REVOCATION = 5;

    bytes32 public constant ARTIFACT_TOPIC = keccak256(
        "ArtifactPublished(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64)"
    );
    bytes32 public constant EVALUATION_TOPIC = keccak256(
        "EvaluationCertified(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint32,uint256,uint64,uint64,uint64)"
    );
    bytes32 public constant APPROVAL_TOPIC = keccak256(
        "DeploymentApproved(bytes32,bytes32,bytes32,address,bytes32,bytes32,uint128,uint128,uint32,uint64,uint64,uint64)"
    );
    bytes32 public constant STATUS_TOPIC = keccak256(
        "ReleaseStatusCheckpoint(bytes32,bytes32,uint8,uint64,uint64,uint64)"
    );
    bytes32 public constant REVOCATION_TOPIC = keccak256(
        "ReleaseRevoked(bytes32,bytes32,bytes32,uint64,uint64)"
    );

    struct ImportRequest {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        IBlockProver.MerkleProof merkleProof;
        IBlockProver.ContinuityProof continuityProof;
        uint32 logIndex;
    }

    uint64 public immutable sourceChainKey;
    IBlockProver public immutable verifier;
    IReceiptDecoder public immutable decoder;
    EvidenceRegistry public immutable evidence;

    address public immutable artifactEmitter;
    address public immutable evaluationEmitter;
    address public immutable approvalEmitter;
    address public immutable statusEmitter;
    address public immutable admin;

    bool public paused;
    mapping(bytes32 => bool) public usedQuery;
    mapping(bytes32 => bool) public usedEvidence;

    event ProofImported(uint8 indexed kind, bytes32 indexed queryKey, bytes32 indexed evidenceId);

    constructor(
        address admin_,
        address guardian,
        uint64 sourceChainKey_,
        address verifier_,
        address decoder_,
        address evidence_,
        address artifactEmitter_,
        address evaluationEmitter_,
        address approvalEmitter_,
        address statusEmitter_
    ) RoleAddress(guardian) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (
            verifier_ == address(0)
                || decoder_ == address(0)
                || evidence_ == address(0)
                || artifactEmitter_ == address(0)
                || evaluationEmitter_ == address(0)
                || approvalEmitter_ == address(0)
                || statusEmitter_ == address(0)
        ) revert ZeroAddress();
        sourceChainKey = sourceChainKey_;
        admin = admin_;
        verifier = IBlockProver(verifier_);
        decoder = IReceiptDecoder(decoder_);
        evidence = EvidenceRegistry(evidence_);
        artifactEmitter = artifactEmitter_;
        evaluationEmitter = evaluationEmitter_;
        approvalEmitter = approvalEmitter_;
        statusEmitter = statusEmitter_;
    }

    function pause() external onlyRole {
        paused = true;
    }

    function unpause() external {
        if (msg.sender != admin) revert Unauthorized();
        paused = false;
    }

    function importArtifact(ImportRequest calldata request) external returns (bytes32 evidenceId) {
        (bytes32 queryKey, bytes32[] memory topics, bytes memory data) = _prepare(
            ARTIFACT,
            request,
            artifactEmitter,
            ARTIFACT_TOPIC,
            4,
            352
        );
        if (data.length == 0 || topics.length != 4) revert MalformedLog();
        (
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
        ) = abi.decode(data, (bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, uint64, uint64));
        if (releaseVersion == 0 || publisherNonce == 0) revert MalformedLog();
        bytes32 orgId = topics[1];
        bytes32 releaseId = topics[2];
        bytes32 releaseDigest = topics[3];
        evidenceId = _mark(ARTIFACT, queryKey, releaseDigest);
        evidence.recordArtifact(
            EvidenceRegistry.ArtifactEvidence({
                exists: true,
                orgId: orgId,
                releaseId: releaseId,
                releaseDigest: releaseDigest,
                manifestHash: manifestHash,
                artifactRoot: artifactRoot,
                weightsHash: weightsHash,
                tokenizerHash: tokenizerHash,
                systemPromptHash: systemPromptHash,
                toolManifestRoot: toolManifestRoot,
                containerImageDigest: containerImageDigest,
                sbomHash: sbomHash,
                provenanceHash: provenanceHash,
                releaseVersion: releaseVersion,
                publisherNonce: publisherNonce,
                evidenceId: evidenceId
            })
        );
        emit ProofImported(ARTIFACT, queryKey, evidenceId);
    }

    function importEvaluation(ImportRequest calldata request) external returns (bytes32 evidenceId) {
        (bytes32 queryKey, bytes32[] memory topics, bytes memory data) = _prepare(
            EVALUATION,
            request,
            evaluationEmitter,
            EVALUATION_TOPIC,
            4,
            256
        );
        (
            bytes32 suiteHash,
            bytes32 reportHash,
            bytes32 evaluatorSetHash,
            uint32 safetyScoreBps,
            uint256 deniedCapabilityBitmap,
            uint64 evaluatedAt,
            uint64 validUntil,
            uint64 evaluationNonce
        ) = abi.decode(data, (bytes32, bytes32, bytes32, uint32, uint256, uint64, uint64, uint64));
        if (safetyScoreBps > 10_000 || validUntil <= evaluatedAt || evaluationNonce == 0) revert MalformedLog();
        bytes32 orgId = topics[1];
        bytes32 releaseId = topics[2];
        bytes32 releaseDigest = topics[3];
        evidenceId = _mark(EVALUATION, queryKey, releaseDigest);
        evidence.recordEvaluation(
            EvidenceRegistry.EvaluationEvidence({
                exists: true,
                orgId: orgId,
                releaseId: releaseId,
                releaseDigest: releaseDigest,
                suiteHash: suiteHash,
                reportHash: reportHash,
                evaluatorSetHash: evaluatorSetHash,
                safetyScoreBps: safetyScoreBps,
                deniedCapabilityBitmap: deniedCapabilityBitmap,
                evaluatedAt: evaluatedAt,
                validUntil: validUntil,
                evaluationNonce: evaluationNonce,
                evidenceId: evidenceId
            })
        );
        emit ProofImported(EVALUATION, queryKey, evidenceId);
    }

    function importApproval(ImportRequest calldata request) external returns (bytes32 evidenceId) {
        (bytes32 queryKey, bytes32[] memory topics, bytes memory data) = _prepare(
            APPROVAL,
            request,
            approvalEmitter,
            APPROVAL_TOPIC,
            4,
            288
        );
        (
            address runtimeKey,
            bytes32 policyHash,
            bytes32 requestedScopeRoot,
            uint128 totalSpendCap,
            uint128 perCallValueCap,
            uint32 callCap,
            uint64 validAfter,
            uint64 validUntil,
            uint64 approvalNonce
        ) = abi.decode(data, (address, bytes32, bytes32, uint128, uint128, uint32, uint64, uint64, uint64));
        if (runtimeKey == address(0) || callCap == 0 || validUntil <= validAfter || approvalNonce == 0) {
            revert MalformedLog();
        }
        bytes32 orgId = topics[1];
        bytes32 agentId = topics[2];
        bytes32 releaseDigest = topics[3];
        evidenceId = _mark(APPROVAL, queryKey, releaseDigest);
        evidence.recordApproval(
            EvidenceRegistry.ApprovalEvidence({
                exists: true,
                orgId: orgId,
                agentId: agentId,
                releaseDigest: releaseDigest,
                runtimeKey: runtimeKey,
                policyHash: policyHash,
                requestedScopeRoot: requestedScopeRoot,
                totalSpendCap: totalSpendCap,
                perCallValueCap: perCallValueCap,
                callCap: callCap,
                validAfter: validAfter,
                validUntil: validUntil,
                approvalNonce: approvalNonce,
                evidenceId: evidenceId
            })
        );
        emit ProofImported(APPROVAL, queryKey, evidenceId);
    }

    function importStatus(ImportRequest calldata request) external returns (bytes32 evidenceId) {
        (bytes32 queryKey, bytes32[] memory topics, bytes memory data) = _prepare(
            STATUS,
            request,
            statusEmitter,
            STATUS_TOPIC,
            4,
            96
        );
        (uint64 statusNonce, uint64 issuedAt, uint64 validUntil) = abi.decode(data, (uint64, uint64, uint64));
        bytes32 orgId = topics[1];
        bytes32 releaseDigest = topics[2];
        uint8 status = uint8(uint256(topics[3]));
        if (status != 1 || statusNonce == 0 || validUntil <= issuedAt) revert InvalidStatus();
        evidenceId = _mark(STATUS, queryKey, releaseDigest);
        evidence.recordStatus(
            EvidenceRegistry.StatusEvidence({
                exists: true,
                orgId: orgId,
                releaseDigest: releaseDigest,
                status: status,
                statusNonce: statusNonce,
                issuedAt: issuedAt,
                validUntil: validUntil,
                revoked: false,
                evidenceId: evidenceId
            })
        );
        emit ProofImported(STATUS, queryKey, evidenceId);
    }

    function importRevocation(ImportRequest calldata request) external returns (bytes32 evidenceId) {
        (bytes32 queryKey, bytes32[] memory topics, bytes memory data) = _prepare(
            REVOCATION,
            request,
            statusEmitter,
            REVOCATION_TOPIC,
            4,
            64
        );
        (uint64 statusNonce, uint64 revokedAt) = abi.decode(data, (uint64, uint64));
        bytes32 orgId = topics[1];
        bytes32 releaseDigest = topics[2];
        if (statusNonce == 0) revert MalformedLog();
        evidenceId = _mark(REVOCATION, queryKey, releaseDigest);
        evidence.recordRevocation(orgId, releaseDigest, statusNonce, revokedAt, evidenceId);
        emit ProofImported(REVOCATION, queryKey, evidenceId);
    }

    function queryKeyFor(
        uint64 chainKey,
        uint64 blockHeight,
        uint64 transactionIndex,
        uint32 logIndex,
        address emitter
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(chainKey, blockHeight, transactionIndex, logIndex, emitter));
    }

    function evidenceIdFor(uint8 kind, bytes32 queryKey, bytes32 releaseDigest)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(kind, queryKey, releaseDigest));
    }

    function _prepare(
        uint8 kind,
        ImportRequest calldata request,
        address expectedEmitter,
        bytes32 expectedTopic,
        uint256 expectedTopicCount,
        uint256 expectedDataLength
    ) internal view returns (bytes32 queryKey, bytes32[] memory topics, bytes memory data) {
        if (paused) revert Paused();
        if (request.chainKey != sourceChainKey) revert UnsupportedChain();
        if (!verifier.verify(
            request.chainKey,
            request.blockHeight,
            request.encodedTransaction,
            request.merkleProof,
            request.continuityProof
        )) revert InvalidProof();

        IReceiptDecoder.ReceiptFields memory receipt = decoder.decodeReceiptFields(request.encodedTransaction);
        if (receipt.status != 1) revert FailedReceipt();
        if (request.logIndex >= receipt.logs.length) revert MalformedLog();
        IReceiptDecoder.LogEntry memory log = receipt.logs[request.logIndex];
        if (log.emitter != expectedEmitter) revert WrongEmitter();
        if (log.topics.length != expectedTopicCount) revert WrongTopicCount();
        if (log.topics[0] != expectedTopic) revert WrongTopic();
        if (log.data.length != expectedDataLength) revert WrongDataLength();

        uint64 transactionIndex = verifier.calculateTxIndex(request.merkleProof);
        queryKey = queryKeyFor(request.chainKey, request.blockHeight, transactionIndex, request.logIndex, log.emitter);
        if (usedQuery[queryKey]) revert Replay();
        topics = log.topics;
        data = log.data;
        // `kind` is deliberately referenced here so each evidence-class call
        // remains distinct at the compiler/API boundary.
        kind;
    }

    function _mark(uint8 kind, bytes32 queryKey, bytes32 releaseDigest)
        internal
        returns (bytes32 evidenceId)
    {
        usedQuery[queryKey] = true;
        evidenceId = evidenceIdFor(kind, queryKey, releaseDigest);
        if (usedEvidence[evidenceId]) revert Replay();
        usedEvidence[evidenceId] = true;
    }
}

contract PolicyRegistry is RoleAddress {
    error DuplicatePolicy();
    error PausedPolicy();

    struct PolicyInput {
        bytes32 approvedSuiteHash;
        bytes32 approvedEvaluatorSetHash;
        bytes32 allowedToolScopeRoot;
        uint32 minSafetyScoreBps;
        uint256 deniedCapabilityBitmap;
        uint128 spendCeiling;
        uint128 perCallCeiling;
        uint32 callCeiling;
        uint64 capabilityTtl;
        uint64 statusFreshness;
        bool teeRequired;
    }

    struct Policy {
        bool exists;
        bool paused;
        bytes32 approvedSuiteHash;
        bytes32 approvedEvaluatorSetHash;
        bytes32 allowedToolScopeRoot;
        uint32 minSafetyScoreBps;
        uint256 deniedCapabilityBitmap;
        uint128 spendCeiling;
        uint128 perCallCeiling;
        uint32 callCeiling;
        uint64 capabilityTtl;
        uint64 statusFreshness;
        bool teeRequired;
    }

    address public immutable guardian;
    mapping(bytes32 => Policy) private _policies;

    event PolicyRegistered(bytes32 indexed policyHash);
    event PolicyPaused(bytes32 indexed policyHash, bool paused);

    constructor(address admin, address guardian_) RoleAddress(admin) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    function hashPolicy(PolicyInput calldata value) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                value.approvedSuiteHash,
                value.approvedEvaluatorSetHash,
                value.allowedToolScopeRoot,
                value.minSafetyScoreBps,
                value.deniedCapabilityBitmap,
                value.spendCeiling,
                value.perCallCeiling,
                value.callCeiling,
                value.capabilityTtl,
                value.statusFreshness,
                value.teeRequired
            )
        );
    }

    function register(PolicyInput calldata value) external onlyRole returns (bytes32 policyHash) {
        policyHash = hashPolicy(value);
        if (_policies[policyHash].exists) revert DuplicatePolicy();
        _policies[policyHash] = Policy({
            exists: true,
            paused: false,
            approvedSuiteHash: value.approvedSuiteHash,
            approvedEvaluatorSetHash: value.approvedEvaluatorSetHash,
            allowedToolScopeRoot: value.allowedToolScopeRoot,
            minSafetyScoreBps: value.minSafetyScoreBps,
            deniedCapabilityBitmap: value.deniedCapabilityBitmap,
            spendCeiling: value.spendCeiling,
            perCallCeiling: value.perCallCeiling,
            callCeiling: value.callCeiling,
            capabilityTtl: value.capabilityTtl,
            statusFreshness: value.statusFreshness,
            teeRequired: value.teeRequired
        });
        emit PolicyRegistered(policyHash);
    }

    function get(bytes32 policyHash) external view returns (Policy memory) {
        return _policies[policyHash];
    }

    function pause(bytes32 policyHash) external {
        if (msg.sender != guardian && msg.sender != role) revert Unauthorized();
        if (!_policies[policyHash].exists) revert PausedPolicy();
        _policies[policyHash].paused = true;
        emit PolicyPaused(policyHash, true);
    }

    function unpause(bytes32 policyHash) external onlyRole {
        if (!_policies[policyHash].exists) revert PausedPolicy();
        _policies[policyHash].paused = false;
        emit PolicyPaused(policyHash, false);
    }
}

contract CapabilityIssuer is RoleAddress {
    error MissingEvidence();
    error Mismatch();
    error InvalidWindow();
    error BudgetExceeded();
    error PausedCapability();
    error TEERequired();
    error InvalidRouter();

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

    EvidenceRegistry public immutable evidence;
    PolicyRegistry public immutable policies;
    address public immutable guardian;
    address public router;
    mapping(bytes32 => Capability) private _capabilities;
    mapping(bytes32 => uint64) public nextEpoch;
    mapping(bytes32 => bool) public orgPaused;
    mapping(bytes32 => bool) public releasePaused;
    mapping(bytes32 => bool) public agentPaused;
    mapping(address => bool) public runtimePaused;
    mapping(address => bool) public targetPaused;

    event CapabilityIssued(bytes32 indexed capabilityId, bytes32 indexed releaseDigest, address indexed runtimeKey);
    event CapabilityRevoked(bytes32 indexed capabilityId);
    event AuthorityPaused(bytes32 indexed subject, uint8 indexed kind, bool paused);

    constructor(address admin, address guardian_, address evidence_, address policies_)
        RoleAddress(admin)
    {
        if (guardian_ == address(0)) revert ZeroAddress();
        evidence = EvidenceRegistry(evidence_);
        policies = PolicyRegistry(policies_);
        guardian = guardian_;
    }

    function setRouter(address router_) external onlyRole {
        if (router != address(0) || router_ == address(0)) revert InvalidRouter();
        router = router_;
    }

    function get(bytes32 capabilityId) external view returns (Capability memory) {
        return _capabilities[capabilityId];
    }

    function issue(bytes32 orgId, bytes32 agentId, bytes32 releaseDigest, bytes32 policyHash)
        external
        returns (bytes32 capabilityId)
    {
        bytes32 key = evidence.releaseKey(orgId, releaseDigest);
        EvidenceRegistry.ArtifactEvidence memory artifact = evidence.getArtifact(key);
        EvidenceRegistry.EvaluationEvidence memory evaluation = evidence.getEvaluation(key);
        EvidenceRegistry.ApprovalEvidence memory approval = evidence.getApproval(key);
        EvidenceRegistry.StatusEvidence memory status = evidence.getStatus(key);
        PolicyRegistry.Policy memory policy = policies.get(policyHash);

        if (!artifact.exists || !evaluation.exists || !approval.exists || !status.exists || !policy.exists) {
            revert MissingEvidence();
        }
        if (artifact.orgId != orgId || artifact.releaseDigest != releaseDigest) revert Mismatch();
        if (evaluation.orgId != orgId || evaluation.releaseDigest != releaseDigest) revert Mismatch();
        if (approval.orgId != orgId || approval.agentId != agentId || approval.releaseDigest != releaseDigest) {
            revert Mismatch();
        }
        if (status.orgId != orgId || status.releaseDigest != releaseDigest || status.status != 1 || status.revoked) {
            revert Mismatch();
        }
        if (approval.policyHash != policyHash || evaluation.suiteHash != policy.approvedSuiteHash) revert Mismatch();
        if (evaluation.evaluatorSetHash != policy.approvedEvaluatorSetHash) revert Mismatch();
        if (evaluation.safetyScoreBps < policy.minSafetyScoreBps) revert Mismatch();
        if ((evaluation.deniedCapabilityBitmap & policy.deniedCapabilityBitmap) != 0) revert Mismatch();
        if (approval.requestedScopeRoot != artifact.toolManifestRoot) revert Mismatch();
        if (approval.requestedScopeRoot != policy.allowedToolScopeRoot) revert Mismatch();
        if (approval.totalSpendCap > policy.spendCeiling || approval.perCallValueCap > policy.perCallCeiling) {
            revert BudgetExceeded();
        }
        if (approval.callCap > policy.callCeiling) revert BudgetExceeded();
        if (policy.teeRequired) revert TEERequired();

        uint64 nowTime = uint64(block.timestamp);
        if (nowTime < approval.validAfter || nowTime >= approval.validUntil) revert InvalidWindow();
        if (nowTime < status.issuedAt || nowTime >= evaluation.validUntil || nowTime >= status.validUntil) {
            revert InvalidWindow();
        }
        if (nowTime > status.issuedAt + policy.statusFreshness) revert InvalidWindow();
        if (policy.paused) revert PausedCapability();

        uint64 expiresAt = approval.validUntil;
        if (evaluation.validUntil < expiresAt) expiresAt = evaluation.validUntil;
        if (status.validUntil < expiresAt) expiresAt = status.validUntil;
        uint64 ttlExpiry = nowTime + policy.capabilityTtl;
        if (ttlExpiry < expiresAt) expiresAt = ttlExpiry;
        if (expiresAt <= nowTime) revert InvalidWindow();

        bytes32 binding = keccak256(abi.encode(orgId, agentId, releaseDigest, approval.runtimeKey, policyHash));
        if (orgPaused[orgId] || releasePaused[releaseDigest] || agentPaused[agentId] || runtimePaused[approval.runtimeKey]) {
            revert PausedCapability();
        }
        uint64 epoch = nextEpoch[binding] + 1;
        nextEpoch[binding] = epoch;
        capabilityId = keccak256(
            abi.encode("AIRLOCK_CAPABILITY_V1", orgId, agentId, releaseDigest, approval.runtimeKey, policyHash, epoch)
        );
        _capabilities[capabilityId] = Capability({
            orgId: orgId,
            agentId: agentId,
            releaseDigest: releaseDigest,
            policyHash: policyHash,
            scopeRoot: approval.requestedScopeRoot,
            runtimeKey: approval.runtimeKey,
            spendCap: approval.totalSpendCap,
            spent: 0,
            perCallValueCap: approval.perCallValueCap,
            callCap: approval.callCap,
            callsUsed: 0,
            notBefore: approval.validAfter,
            expiresAt: expiresAt,
            epoch: epoch,
            revoked: false
        });
        emit CapabilityIssued(capabilityId, releaseDigest, approval.runtimeKey);
    }

    function consume(bytes32 capabilityId, uint256 value) external returns (Capability memory capability) {
        if (msg.sender != router || router == address(0)) revert Unauthorized();
        Capability storage current = _capabilities[capabilityId];
        if (current.runtimeKey == address(0) || current.revoked) revert PausedCapability();
        if (
            orgPaused[current.orgId]
                || releasePaused[current.releaseDigest]
                || agentPaused[current.agentId]
                || runtimePaused[current.runtimeKey]
        ) revert PausedCapability();
        EvidenceRegistry.StatusEvidence memory currentStatus = evidence.getStatus(
            evidence.releaseKey(current.orgId, current.releaseDigest)
        );
        if (!currentStatus.exists || currentStatus.revoked || currentStatus.status != 1) {
            current.revoked = true;
            emit CapabilityRevoked(capabilityId);
            revert PausedCapability();
        }
        if (block.timestamp < current.notBefore || block.timestamp >= current.expiresAt) revert InvalidWindow();
        if (value > current.perCallValueCap || value > current.spendCap - current.spent) revert BudgetExceeded();
        if (current.callsUsed >= current.callCap) revert BudgetExceeded();
        current.spent += uint128(value);
        current.callsUsed += 1;
        return current;
    }

    function revoke(bytes32 capabilityId) external {
        if (msg.sender != guardian && msg.sender != role) revert Unauthorized();
        _capabilities[capabilityId].revoked = true;
        emit CapabilityRevoked(capabilityId);
    }

    function pauseOrg(bytes32 orgId) external onlyGuardian {
        orgPaused[orgId] = true;
        emit AuthorityPaused(orgId, 1, true);
    }

    function pauseRelease(bytes32 releaseDigest) external onlyGuardian {
        releasePaused[releaseDigest] = true;
        emit AuthorityPaused(releaseDigest, 2, true);
    }

    function pauseAgent(bytes32 agentId) external onlyGuardian {
        agentPaused[agentId] = true;
        emit AuthorityPaused(agentId, 3, true);
    }

    function pauseRuntime(address runtimeKey) external onlyGuardian {
        runtimePaused[runtimeKey] = true;
        emit AuthorityPaused(bytes32(uint256(uint160(runtimeKey))), 4, true);
    }

    function pauseTarget(address target) external onlyGuardian {
        targetPaused[target] = true;
        emit AuthorityPaused(bytes32(uint256(uint160(target))), 5, true);
    }

    function unpauseOrg(bytes32 orgId) external onlyRole {
        orgPaused[orgId] = false;
    }

    function unpauseRelease(bytes32 releaseDigest) external onlyRole {
        releasePaused[releaseDigest] = false;
    }

    function unpauseAgent(bytes32 agentId) external onlyRole {
        agentPaused[agentId] = false;
    }

    function unpauseRuntime(address runtimeKey) external onlyRole {
        runtimePaused[runtimeKey] = false;
    }

    function unpauseTarget(address target) external onlyRole {
        targetPaused[target] = false;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert Unauthorized();
        _;
    }
}

interface IIntentValidator {
    function validate(
        address target,
        bytes4 selector,
        bytes calldata data,
        uint256 value,
        bytes32 constraintsHash
    ) external view returns (uint256 chargedValue);
}

contract AgentVault {
    error Unauthorized();
    error RouterAlreadySet();
    error RecoveryNotReady();
    error CallFailed(bytes reason);

    address public router;
    address public immutable recoveryAdmin;
    uint64 public constant RECOVERY_DELAY = 2 days;
    address payable public recoveryRecipient;
    uint256 public recoveryValue;
    uint64 public recoveryAt;

    constructor(address recoveryAdmin_) {
        if (recoveryAdmin_ == address(0)) revert Unauthorized();
        recoveryAdmin = recoveryAdmin_;
    }

    receive() external payable {}

    function setRouter(address router_) external {
        if (msg.sender != recoveryAdmin || router != address(0) || router_ == address(0)) {
            revert RouterAlreadySet();
        }
        router = router_;
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        returns (bytes memory result)
    {
        if (msg.sender != router) revert Unauthorized();
        (bool success, bytes memory returned) = target.call{value: value}(data);
        if (!success) revert CallFailed(returned);
        return returned;
    }

    function scheduleRecovery(address payable recipient, uint256 value) external {
        if (msg.sender != recoveryAdmin) revert Unauthorized();
        recoveryRecipient = recipient;
        recoveryValue = value;
        recoveryAt = uint64(block.timestamp) + RECOVERY_DELAY;
    }

    function executeRecovery() external {
        if (msg.sender != recoveryAdmin || recoveryAt == 0 || block.timestamp < recoveryAt) {
            revert RecoveryNotReady();
        }
        uint256 value = recoveryValue;
        address payable recipient = recoveryRecipient;
        recoveryAt = 0;
        recoveryValue = 0;
        recoveryRecipient = payable(address(0));
        (bool success,) = recipient.call{value: value}("");
        if (!success) revert RecoveryNotReady();
    }
}

contract ToolRouter is RoleAddress {
    error InvalidIntent();
    error InvalidSignature();
    error Replay();
    error Expired();
    error UnsupportedAction();
    error PausedTarget();
    error Reentrancy();

    struct ActionRule {
        bool exists;
        address target;
        bytes4 selector;
        address validator;
        bytes32 constraintsHash;
    }

    struct ToolIntent {
        bytes32 capabilityId;
        bytes32 agentId;
        address target;
        bytes4 functionSelector;
        bytes32 calldataHash;
        uint256 value;
        uint64 deadline;
        uint64 actionNonce;
        bytes32 idempotencyKey;
        bytes32 scopeLeaf;
        bytes32[] scopeProof;
        bytes data;
    }

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "ToolIntent(bytes32 capabilityId,bytes32 agentId,address target,bytes4 functionSelector,bytes32 calldataHash,uint256 value,uint64 deadline,uint64 actionNonce,bytes32 idempotencyKey,bytes32 scopeLeaf)"
    );

    CapabilityIssuer public immutable issuer;
    AgentVault public immutable vault;
    mapping(bytes32 => ActionRule) public actions;
    mapping(bytes32 => uint64) public nextNonce;
    mapping(bytes32 => bool) public usedIdempotency;
    bool private locked;

    event ActionRegistered(bytes32 indexed scopeLeaf, address indexed target, bytes4 indexed selector);
    event ActionExecuted(
        bytes32 indexed capabilityId,
        bytes32 indexed idempotencyKey,
        address target,
        uint256 value,
        uint256 chargedValue
    );
    event ActionDenied(bytes32 indexed capabilityId, bytes32 indexed idempotencyKey, bytes32 reason);

    constructor(address admin, address issuer_, address vault_) RoleAddress(admin) {
        issuer = CapabilityIssuer(issuer_);
        vault = AgentVault(payable(vault_));
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AIRLOCK Tool Router"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function registerAction(
        address target,
        bytes4 selector,
        address validator,
        bytes32 constraintsHash
    ) external onlyRole returns (bytes32 scopeLeaf) {
        scopeLeaf = ScopeProof.leaf(target, selector, validator, constraintsHash);
        actions[scopeLeaf] = ActionRule({
            exists: true,
            target: target,
            selector: selector,
            validator: validator,
            constraintsHash: constraintsHash
        });
        emit ActionRegistered(scopeLeaf, target, selector);
    }

    function hashIntent(ToolIntent calldata intent) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.capabilityId,
                intent.agentId,
                intent.target,
                intent.functionSelector,
                intent.calldataHash,
                intent.value,
                intent.deadline,
                intent.actionNonce,
                intent.idempotencyKey,
                intent.scopeLeaf
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function execute(ToolIntent calldata intent, bytes calldata signature)
        external
        returns (bytes memory result)
    {
        if (locked) revert Reentrancy();
        locked = true;

        CapabilityIssuer.Capability memory capability = issuer.get(intent.capabilityId);
        if (capability.runtimeKey == address(0) || capability.agentId != intent.agentId) revert InvalidIntent();
        if (issuer.targetPaused(intent.target)) revert PausedTarget();
        if (intent.deadline < block.timestamp || intent.deadline >= capability.expiresAt) revert Expired();
        if (intent.actionNonce != nextNonce[intent.capabilityId]) revert Replay();
        if (usedIdempotency[intent.idempotencyKey]) revert Replay();
        if (keccak256(intent.data) != intent.calldataHash) revert InvalidIntent();
        if (intent.data.length < 4 || bytes4(intent.data) != intent.functionSelector) revert InvalidIntent();
        if (!ScopeProof.verify(capability.scopeRoot, intent.scopeLeaf, intent.scopeProof)) revert UnsupportedAction();

        ActionRule memory action = actions[intent.scopeLeaf];
        if (!action.exists || action.target != intent.target || action.selector != intent.functionSelector) {
            revert UnsupportedAction();
        }
        if (
            ScopeProof.leaf(action.target, action.selector, action.validator, action.constraintsHash)
                != intent.scopeLeaf
        ) revert UnsupportedAction();

        _checkSignature(intent, signature, capability.runtimeKey);
        uint256 chargedValue = IIntentValidator(action.validator).validate(
            intent.target,
            intent.functionSelector,
            intent.data,
            intent.value,
            action.constraintsHash
        );

        issuer.consume(intent.capabilityId, chargedValue);
        nextNonce[intent.capabilityId] = intent.actionNonce + 1;
        usedIdempotency[intent.idempotencyKey] = true;
        result = vault.execute(intent.target, intent.value, intent.data);
        emit ActionExecuted(intent.capabilityId, intent.idempotencyKey, intent.target, intent.value, chargedValue);
        locked = false;
    }

    function _checkSignature(ToolIntent calldata intent, bytes calldata signature, address expected)
        internal
        view
    {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidSignature();
        }
        if (ecrecover(hashIntent(intent), v, r, s) != expected) revert InvalidSignature();
    }
}

contract MockStablecoin {
    error InsufficientBalance();

    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }
}

contract AllowlistedStablecoinPaymentValidator is IIntentValidator {
    error InvalidPayment();

    address public immutable token;
    address public immutable recipient;
    uint256 public immutable maxAmount;
    bytes4 public immutable expectedSelector;

    constructor(address token_, address recipient_, uint256 maxAmount_, bytes4 selector_) {
        token = token_;
        recipient = recipient_;
        maxAmount = maxAmount_;
        expectedSelector = selector_;
    }

    function validate(
        address target,
        bytes4 selector,
        bytes calldata data,
        uint256 value,
        bytes32
    ) external view returns (uint256 chargedValue) {
        if (
            target != token
                || selector != expectedSelector
                || value != 0
                || data.length != 68
        ) {
            revert InvalidPayment();
        }
        (address requestedRecipient, uint256 amount) = abi.decode(data[4:], (address, uint256));
        if (requestedRecipient != recipient || amount == 0 || amount > maxAmount) revert InvalidPayment();
        return amount;
    }
}

contract BoundedDepositValidator is IIntentValidator {
    error InvalidDeposit();

    address public immutable protocol;
    uint256 public immutable maxValue;
    bytes4 public immutable expectedSelector;

    constructor(address protocol_, uint256 maxValue_, bytes4 selector_) {
        protocol = protocol_;
        maxValue = maxValue_;
        expectedSelector = selector_;
    }

    function validate(
        address target,
        bytes4 selector,
        bytes calldata data,
        uint256 value,
        bytes32
    ) external view returns (uint256 chargedValue) {
        if (target != protocol || selector != expectedSelector || value == 0 || value > maxValue || data.length != 36) {
            revert InvalidDeposit();
        }
        return value;
    }
}

contract BoundedDepositProtocol {
    mapping(bytes32 => uint256) public deposits;
    event Deposited(bytes32 indexed position, uint256 amount);

    function deposit(bytes32 position) external payable {
        deposits[position] += msg.value;
        emit Deposited(position, msg.value);
    }
}

contract MockBlockProver is IBlockProver {
    mapping(bytes32 => bool) public validProof;

    function setProof(bytes calldata encodedTransaction, bool valid) external {
        validProof[keccak256(encodedTransaction)] = valid;
    }

    function verify(
        uint64,
        uint64,
        bytes calldata encodedTransaction,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        return validProof[keccak256(encodedTransaction)];
    }

    function calculateTxIndex(MerkleProof calldata proof) external pure returns (uint64 index) {
        for (uint256 i; i < proof.siblings.length; ++i) {
            if (proof.siblings[i].isLeft) index |= uint64(1) << uint64(i);
        }
    }
}

contract MockReceiptDecoder is IReceiptDecoder {
    mapping(bytes32 => ReceiptFields) private receipts;

    function setReceipt(
        bytes calldata encodedTransaction,
        uint8 status,
        address emitter,
        bytes32[] calldata topics,
        bytes calldata data
    ) external {
        bytes32 key = keccak256(encodedTransaction);
        delete receipts[key].logs;
        receipts[key].status = status;
        receipts[key].logs.push(LogEntry({emitter: emitter, topics: topics, data: data}));
    }

    function decodeReceiptFields(bytes calldata encodedTransaction)
        external
        view
        returns (ReceiptFields memory)
    {
        return receipts[keccak256(encodedTransaction)];
    }
}
