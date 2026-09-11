// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {
    AirlockAttestcoinAdapter,
    AgentVault,
    ArtifactRegistry,
    BoundedDepositProtocol,
    BoundedDepositValidator,
    CapabilityIssuer,
    DeploymentApprovalRegistry,
    EvaluationRegistry,
    EvidenceRegistry,
    IBlockProver,
    IReceiptDecoder,
    NativePaymentValidator,
    OfficialReceiptDecoder,
    PolicyRegistry,
    ReleaseStatusRegistry,
    RuntimeBindingRegistry,
    CapabilityDelegationRegistry,
    RoleAddress,
    ToolRouter,
    AllowlistedStablecoinPaymentValidator
} from "./Airlock.sol";

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

    function verify(
        uint64,
        uint64[] calldata,
        bytes[] calldata encodedTransactions,
        MerkleProof[] calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        for (uint256 i; i < encodedTransactions.length; ++i) {
            if (!validProof[keccak256(encodedTransactions[i])]) return false;
        }
        return true;
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

contract OfficialReceiptDecoderTest is Test {
    struct TestLog {
        address address_;
        bytes32[] topics;
        bytes data;
    }

    function test_decodesOfficialReceiptShape() public {
        OfficialReceiptDecoder decoder = new OfficialReceiptDecoder();
        bytes32 topic = keccak256("AIRLOCK_TEST_EVENT");
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = topic;
        TestLog[] memory logs = new TestLog[](1);
        logs[0] = TestLog({address_: address(0xBEEF), topics: topics, data: hex"1234"});

        bytes[] memory chunks = new bytes[](3);
        chunks[2] = abi.encode(uint8(1), uint64(21), logs, bytes(""));
        bytes memory encodedTransaction = abi.encode(uint8(2), chunks);

        IReceiptDecoder.ReceiptFields memory receipt = decoder.decodeReceiptFields(encodedTransaction);
        assertEq(receipt.status, 1);
        assertEq(receipt.logs.length, 1);
        assertEq(receipt.logs[0].emitter, address(0xBEEF));
        assertEq(receipt.logs[0].topics[0], topic);
        assertEq(receipt.logs[0].data, hex"1234");
    }
}

contract AirlockTest is Test {
    uint256 private constant RUNTIME_PK = 0xA11CE;
    uint64 private constant SOURCE_CHAIN_KEY = 1;

    address private publisher = address(0x1001);
    address private evaluator = address(0x1002);
    address private approver = address(0x1003);
    address private statusAuthority = address(0x1004);
    address private admin = address(0x1005);
    address private guardian = address(0x1006);
    address private teeVerifier = address(0x1007);

    bytes32 private orgId = keccak256("airlock-demo-org");
    bytes32 private releaseId = keccak256("airlock-demo-release");
    bytes32 private releaseDigest = keccak256("airlock-demo-digest");
    bytes32 private agentId = keccak256("airlock-demo-agent");
    bytes32 private suiteHash = keccak256("airlock-demo-suite");
    bytes32 private evaluatorSetHash = keccak256("airlock-demo-evaluators");
    bytes32 private paymentConstraints = keccak256("payment-v1");
    bytes32 private depositConstraints = keccak256("deposit-v1");
    bytes32 private depositPosition = keccak256("airlock-demo-position");

    ArtifactRegistry private artifactRegistry;
    EvaluationRegistry private evaluationRegistry;
    DeploymentApprovalRegistry private approvalRegistry;
    ReleaseStatusRegistry private statusRegistry;
    MockBlockProver private prover;
    MockReceiptDecoder private decoder;
    EvidenceRegistry private evidence;
    AirlockAttestcoinAdapter private adapter;
    PolicyRegistry private policies;
    RuntimeBindingRegistry private runtimeBindings;
    CapabilityIssuer private issuer;
    CapabilityDelegationRegistry private delegation;
    ToolRouter private router;
    AgentVault private vault;
    MockStablecoin private stablecoin;
    BoundedDepositProtocol private protocol;
    AllowlistedStablecoinPaymentValidator private paymentValidator;
    NativePaymentValidator private nativePaymentValidator;
    BoundedDepositValidator private depositValidator;

    address private runtimeKey;
    address private vendorRecipient = address(0xBEEF);
    bytes32 private paymentLeaf;
    bytes32 private depositLeaf;
    bytes32 private scopeRoot;
    bytes32 private policyHash;
    bytes32 private capabilityId;

    function setUp() public {
        vm.warp(1_000_000);
        runtimeKey = vm.addr(RUNTIME_PK);

        artifactRegistry = new ArtifactRegistry(publisher);
        evaluationRegistry = new EvaluationRegistry(evaluator);
        approvalRegistry = new DeploymentApprovalRegistry(approver);
        statusRegistry = new ReleaseStatusRegistry(statusAuthority);
        prover = new MockBlockProver();
        decoder = new MockReceiptDecoder();
        evidence = new EvidenceRegistry(admin);
        adapter = new AirlockAttestcoinAdapter(
            admin,
            guardian,
            SOURCE_CHAIN_KEY,
            address(prover),
            address(decoder),
            address(evidence),
            address(artifactRegistry),
            address(evaluationRegistry),
            address(approvalRegistry),
            address(statusRegistry)
        );
        vm.prank(admin);
        evidence.setAdapter(address(adapter));

        policies = new PolicyRegistry(admin, guardian);
        runtimeBindings = new RuntimeBindingRegistry(teeVerifier);
        issuer = new CapabilityIssuer(admin, guardian, address(evidence), address(policies), address(runtimeBindings));
        delegation = new CapabilityDelegationRegistry(admin, guardian, address(issuer));
        vault = new AgentVault(admin);
        router = new ToolRouter(admin, address(issuer), address(vault), address(delegation));
        vm.prank(admin);
        vault.setRouter(address(router));
        vm.prank(admin);
        issuer.setRouter(address(router));
        vm.prank(admin);
        issuer.setDelegationRegistry(address(delegation));
        vm.prank(admin);
        delegation.setRouter(address(router));

        stablecoin = new MockStablecoin();
        protocol = new BoundedDepositProtocol();
        paymentValidator = new AllowlistedStablecoinPaymentValidator(
            address(stablecoin),
            vendorRecipient,
            0.25 ether,
            MockStablecoin.transfer.selector
        );
        nativePaymentValidator = new NativePaymentValidator(vendorRecipient, 0.25 ether);
        depositValidator = new BoundedDepositValidator(
            address(protocol),
            depositPosition,
            0.1 ether,
            BoundedDepositProtocol.deposit.selector
        );

        vm.prank(admin);
        paymentLeaf = router.registerAction(
            address(stablecoin),
            MockStablecoin.transfer.selector,
            address(paymentValidator),
            paymentConstraints
        );
        vm.prank(admin);
        depositLeaf = router.registerAction(
            address(protocol),
            BoundedDepositProtocol.deposit.selector,
            address(depositValidator),
            depositConstraints
        );
        scopeRoot = _pair(paymentLeaf, depositLeaf);

        PolicyRegistry.PolicyInput memory input = PolicyRegistry.PolicyInput({
            approvedSuiteHash: suiteHash,
            approvedEvaluatorSetHash: evaluatorSetHash,
            allowedToolScopeRoot: scopeRoot,
            minSafetyScoreBps: 8_000,
            deniedCapabilityBitmap: 0,
            spendCeiling: 0.35 ether,
            perCallCeiling: 0.25 ether,
            callCeiling: 2,
            capabilityTtl: 600,
            statusFreshness: 900,
            teeRequired: false
        });
        vm.prank(admin);
        policyHash = policies.register(input);

        _importAllEvidence();
        vm.prank(address(this));
        capabilityId = issuer.issue(orgId, agentId, releaseDigest, policyHash);
        vm.deal(address(vault), 1 ether);
        stablecoin.mint(address(vault), 1 ether);
    }

    function test_SourceRolesAndProofImports() public {
        EvidenceRegistry.ArtifactEvidence memory artifact = evidence.getArtifact(
            evidence.releaseKey(orgId, releaseDigest)
        );
        EvidenceRegistry.EvaluationEvidence memory evaluation = evidence.getEvaluation(
            evidence.releaseKey(orgId, releaseDigest)
        );
        EvidenceRegistry.ApprovalEvidence memory approval = evidence.getApproval(
            evidence.releaseKey(orgId, releaseDigest)
        );
        EvidenceRegistry.StatusEvidence memory status = evidence.getStatus(
            evidence.releaseKey(orgId, releaseDigest)
        );

        assertTrue(artifact.exists);
        assertEq(artifact.releaseDigest, releaseDigest);
        assertEq(evaluation.safetyScoreBps, 9_000);
        assertEq(approval.runtimeKey, runtimeKey);
        assertEq(status.status, 1);
        assertFalse(status.revoked);
    }

    function test_IssuanceBindsReleaseIdAndEvaluationStart() public {
        bytes32 mismatchedDigest = keccak256("mismatched-release-id");
        _importEvidence(mismatchedDigest, keccak256("artifact-release"), keccak256("evaluation-release"), uint64(block.timestamp));
        vm.expectRevert(CapabilityIssuer.Mismatch.selector);
        issuer.issue(orgId, agentId, mismatchedDigest, policyHash);

        bytes32 futureDigest = keccak256("future-evaluation");
        bytes32 futureReleaseId = keccak256("future-release");
        _importEvidence(futureDigest, futureReleaseId, futureReleaseId, uint64(block.timestamp + 1));
        vm.expectRevert(CapabilityIssuer.InvalidWindow.selector);
        issuer.issue(orgId, agentId, futureDigest, policyHash);
    }

    function test_DelegationIsAttenuatedAndParentRevocationCascades() public {
        bytes32 childId = keccak256("child-capability");
        bytes32[] memory childLeaves = new bytes32[](1);
        childLeaves[0] = paymentLeaf;
        bytes32[][] memory childProofs = new bytes32[][](1);
        childProofs[0] = new bytes32[](1);
        childProofs[0][0] = depositLeaf;
        vm.prank(admin);
        delegation.register(
            childId,
            capabilityId,
            keccak256("child-agent"),
            scopeRoot,
            address(0xCAFE),
            0.1 ether,
            1,
            uint64(block.timestamp),
            uint64(block.timestamp + 300),
            1,
            keccak256("a2a-task"),
            childLeaves,
            childProofs
        );
        assertTrue(delegation.isActive(childId));
        assertTrue(delegation.allowsScope(childId, paymentLeaf));
        assertFalse(delegation.allowsScope(childId, depositLeaf));

        vm.prank(guardian);
        issuer.revoke(capabilityId);
        assertFalse(delegation.isActive(childId));
    }

    function test_AdapterRejectsMalformedReceiptsBeforeEvidenceMutation() public {
        bytes32 malformedArtifactTx = keccak256("malformed-artifact-tx");
        bytes32 malformedOrg = keccak256("malformed-org");
        bytes32 malformedReleaseId = keccak256("malformed-release-id");
        bytes32 malformedDigest = keccak256("malformed-digest");
        _setReceipt(
            malformedArtifactTx,
            address(artifactRegistry),
            _topics(adapter.ARTIFACT_TOPIC(), malformedOrg, malformedReleaseId, malformedDigest),
            hex"01"
        );
        vm.expectRevert(AirlockAttestcoinAdapter.WrongDataLength.selector);
        adapter.importArtifact(_request(malformedArtifactTx, 0));
        assertFalse(evidence.getArtifact(evidence.releaseKey(malformedOrg, malformedDigest)).exists);

        bytes32 invalidStatusTx = keccak256("invalid-status-tx");
        bytes32 invalidStatusOrg = keccak256("invalid-status-org");
        bytes32 invalidStatusDigest = keccak256("invalid-status-digest");
        _setReceipt(
            invalidStatusTx,
            address(statusRegistry),
            _topics(adapter.STATUS_TOPIC(), invalidStatusOrg, invalidStatusDigest, bytes32(0)),
            abi.encode(uint64(1), uint64(block.timestamp), uint64(block.timestamp + 1 days))
        );
        vm.expectRevert(AirlockAttestcoinAdapter.InvalidStatus.selector);
        adapter.importStatus(_request(invalidStatusTx, 0));
        assertFalse(evidence.getStatus(evidence.releaseKey(invalidStatusOrg, invalidStatusDigest)).exists);

        bytes32 nonCanonicalStatusTx = keccak256("non-canonical-status-tx");
        _setReceipt(
            nonCanonicalStatusTx,
            address(statusRegistry),
            _topics(adapter.STATUS_TOPIC(), invalidStatusOrg, invalidStatusDigest, bytes32(uint256(257))),
            abi.encode(uint64(1), uint64(block.timestamp), uint64(block.timestamp + 1 days))
        );
        vm.expectRevert(AirlockAttestcoinAdapter.InvalidStatus.selector);
        adapter.importStatus(_request(nonCanonicalStatusTx, 0));

        bytes32 failedTx = keccak256("failed-source-receipt");
        _setReceiptStatus(
            failedTx,
            address(artifactRegistry),
            _topics(adapter.ARTIFACT_TOPIC(), malformedOrg, malformedReleaseId, malformedDigest),
            new bytes(352),
            0
        );
        vm.expectRevert(AirlockAttestcoinAdapter.FailedReceipt.selector);
        adapter.importArtifact(_request(failedTx, 0));

        bytes32 wrongLogIndexTx = keccak256("wrong-log-index");
        _setReceipt(
            wrongLogIndexTx,
            address(artifactRegistry),
            _topics(adapter.ARTIFACT_TOPIC(), malformedOrg, malformedReleaseId, malformedDigest),
            new bytes(352)
        );
        vm.expectRevert(AirlockAttestcoinAdapter.MalformedLog.selector);
        adapter.importArtifact(_request(wrongLogIndexTx, 1));
    }

    function test_AdapterRejectsWrongProofBindings() public {
        bytes32 txHash = keccak256("wrong-proof-binding");
        bytes memory data = abi.encode(
            keccak256("manifest"),
            keccak256("root"),
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            uint64(1),
            uint64(1)
        );
        bytes32[] memory validTopics = _topics(adapter.ARTIFACT_TOPIC(), orgId, releaseId, keccak256("other-digest"));

        _setReceipt(txHash, address(0xBAD), validTopics, data);
        vm.expectRevert(AirlockAttestcoinAdapter.WrongEmitter.selector);
        adapter.importArtifact(_request(txHash, 0));

        validTopics[0] = keccak256("wrong-topic");
        _setReceipt(txHash, address(artifactRegistry), validTopics, data);
        vm.expectRevert(AirlockAttestcoinAdapter.WrongTopic.selector);
        adapter.importArtifact(_request(txHash, 0));

        validTopics[0] = adapter.ARTIFACT_TOPIC();
        _setReceipt(txHash, address(artifactRegistry), validTopics, data);
        AirlockAttestcoinAdapter.ImportRequest memory wrongChain = _request(txHash, 0);
        wrongChain.chainKey = SOURCE_CHAIN_KEY + 1;
        vm.expectRevert(AirlockAttestcoinAdapter.UnsupportedChain.selector);
        adapter.importArtifact(wrongChain);

        _setReceipt(txHash, address(artifactRegistry), validTopics, data);
        adapter.importArtifact(_request(txHash, 0));
        vm.expectRevert(AirlockAttestcoinAdapter.Replay.selector);
        adapter.importArtifact(_request(txHash, 0));
    }

    function test_AdapterBatchImportsMixedEvidenceWithOneContinuityProof() public {
        bytes32 digest = keccak256("batch-digest");
        bytes32 batchReleaseId = keccak256("batch-release");
        bytes32 artifactTx = keccak256("batch-artifact-tx");
        bytes32 evaluationTx = keccak256("batch-evaluation-tx");
        _setReceipt(
            artifactTx,
            address(artifactRegistry),
            _topics(adapter.ARTIFACT_TOPIC(), orgId, batchReleaseId, digest),
            abi.encode(
                keccak256("batch-manifest"),
                keccak256("batch-artifact-root"),
                keccak256("batch-weights"),
                keccak256("batch-tokenizer"),
                keccak256("batch-prompt"),
                scopeRoot,
                keccak256("batch-container"),
                keccak256("batch-sbom"),
                keccak256("batch-provenance"),
                uint64(1),
                uint64(1)
            )
        );
        _setReceipt(
            evaluationTx,
            address(evaluationRegistry),
            _topics(adapter.EVALUATION_TOPIC(), orgId, batchReleaseId, digest),
            abi.encode(
                suiteHash,
                keccak256("batch-report"),
                evaluatorSetHash,
                uint32(9_000),
                uint256(0),
                uint64(block.timestamp),
                uint64(block.timestamp + 1 days),
                uint64(1)
            )
        );

        bytes32[] memory txHashes = new bytes32[](2);
        txHashes[0] = artifactTx;
        txHashes[1] = evaluationTx;
        uint8[] memory kinds = new uint8[](2);
        kinds[0] = adapter.ARTIFACT();
        kinds[1] = adapter.EVALUATION();
        AirlockAttestcoinAdapter.BatchImportRequest memory request = _batchRequest(txHashes, kinds);

        bytes32[] memory evidenceIds = adapter.importBatch(request);
        assertEq(evidenceIds.length, 2);
        assertTrue(evidence.getArtifact(evidence.releaseKey(orgId, digest)).exists);
        assertTrue(evidence.getEvaluation(evidence.releaseKey(orgId, digest)).exists);
    }

    function test_AdapterBatchRejectsInvalidProofBeforeEvidenceMutation() public {
        bytes32 firstDigest = keccak256("batch-invalid-first");
        bytes32 secondDigest = keccak256("batch-invalid-second");
        bytes32 firstTx = keccak256("batch-invalid-first-tx");
        bytes32 secondTx = keccak256("batch-invalid-second-tx");
        bytes memory artifactData = abi.encode(
            keccak256("manifest"),
            keccak256("root"),
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            uint64(1),
            uint64(1)
        );
        _setReceipt(firstTx, address(artifactRegistry), _topics(adapter.ARTIFACT_TOPIC(), orgId, releaseId, firstDigest), artifactData);
        _setReceipt(secondTx, address(artifactRegistry), _topics(adapter.ARTIFACT_TOPIC(), orgId, releaseId, secondDigest), artifactData);
        prover.setProof(abi.encode(secondTx), false);

        bytes32[] memory txHashes = new bytes32[](2);
        txHashes[0] = firstTx;
        txHashes[1] = secondTx;
        uint8[] memory kinds = new uint8[](2);
        kinds[0] = adapter.ARTIFACT();
        kinds[1] = adapter.ARTIFACT();
        vm.expectRevert(AirlockAttestcoinAdapter.InvalidProof.selector);
        adapter.importBatch(_batchRequest(txHashes, kinds));
        assertFalse(evidence.getArtifact(evidence.releaseKey(orgId, firstDigest)).exists);
        assertFalse(evidence.getArtifact(evidence.releaseKey(orgId, secondDigest)).exists);
    }

    function test_SourceRegistryRejectsWrongRolesAndScores() public {
        vm.expectRevert(RoleAddress.Unauthorized.selector);
        artifactRegistry.publish(
            orgId,
            releaseId,
            keccak256("unauthorized"),
            keccak256("manifest"),
            keccak256("root"),
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            1,
            1
        );

        vm.prank(evaluator);
        vm.expectRevert(EvaluationRegistry.InvalidScore.selector);
        evaluationRegistry.certify(
            orgId,
            releaseId,
            releaseDigest,
            suiteHash,
            keccak256("report"),
            evaluatorSetHash,
            10_001,
            0,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days),
            1
        );

        vm.prank(publisher);
        artifactRegistry.publish(
            orgId,
            releaseId,
            keccak256("first-digest"),
            keccak256("manifest"),
            keccak256("root"),
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            1,
            1
        );
        vm.prank(publisher);
        vm.expectRevert(ArtifactRegistry.DuplicateVersion.selector);
        artifactRegistry.publish(
            orgId,
            releaseId,
            keccak256("second-digest"),
            keccak256("manifest"),
            keccak256("root"),
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            1,
            2
        );
    }

    function test_CapabilityAndRouterContainment() public {
        bytes memory paymentData = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.2 ether)
        );
        ToolRouter.ToolIntent memory payment = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            paymentData,
            0,
            0,
            keccak256("payment-0")
        );
        bytes memory signature = _sign(payment);
        router.execute(payment, signature);

        assertEq(stablecoin.balanceOf(vendorRecipient), 0.2 ether);

        bytes memory depositData = abi.encodeWithSelector(
            BoundedDepositProtocol.deposit.selector,
            depositPosition
        );
        ToolRouter.ToolIntent memory deposit = _intent(
            depositLeaf,
            address(protocol),
            BoundedDepositProtocol.deposit.selector,
            depositData,
            0.1 ether,
            1,
            keccak256("deposit-1")
        );
        router.execute(deposit, _sign(deposit));
        assertEq(protocol.deposits(depositPosition), 0.1 ether);
        assertEq(issuer.get(capabilityId).spent, 0.3 ether);

        ToolRouter.ToolIntent memory replay = payment;
        replay.idempotencyKey = keccak256("payment-replay");
        replay.actionNonce = 0;
        bytes memory replaySignature = _sign(replay);
        vm.expectRevert(ToolRouter.Replay.selector);
        router.execute(replay, replaySignature);
    }

    function test_RouterRejectsIntentIntegrityAndBounds() public {
        bytes memory paymentData = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.1 ether)
        );

        ToolRouter.ToolIntent memory mutated = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            paymentData,
            0,
            0,
            keccak256("mutated-calldata")
        );
        bytes memory signature = _sign(mutated);
        mutated.data = abi.encodeWithSelector(MockStablecoin.transfer.selector, vendorRecipient, uint256(0.11 ether));
        vm.expectRevert(ToolRouter.InvalidIntent.selector);
        router.execute(mutated, signature);

        ToolRouter.ToolIntent memory wrongTarget = _intent(
            paymentLeaf,
            address(protocol),
            MockStablecoin.transfer.selector,
            paymentData,
            0,
            0,
            keccak256("wrong-target")
        );
        bytes memory wrongTargetSignature = _sign(wrongTarget);
        vm.expectRevert(ToolRouter.UnsupportedAction.selector);
        router.execute(wrongTarget, wrongTargetSignature);

        ToolRouter.ToolIntent memory expired = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            paymentData,
            0,
            0,
            keccak256("expired")
        );
        expired.deadline = uint64(block.timestamp - 1);
        bytes memory expiredSignature = _sign(expired);
        vm.expectRevert(ToolRouter.Expired.selector);
        router.execute(expired, expiredSignature);

        bytes memory depositData = abi.encodeWithSelector(
            BoundedDepositProtocol.deposit.selector,
            keccak256("invalid-deposit")
        );
        ToolRouter.ToolIntent memory invalidDeposit = _intent(
            depositLeaf,
            address(protocol),
            BoundedDepositProtocol.deposit.selector,
            depositData,
            0.1 ether,
            0,
            keccak256("invalid-deposit")
        );
        bytes memory invalidDepositSignature = _sign(invalidDeposit);
        vm.expectRevert(BoundedDepositValidator.InvalidDeposit.selector);
        router.execute(invalidDeposit, invalidDepositSignature);

        ToolRouter.ToolIntent memory allowed = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            paymentData,
            0,
            0,
            keccak256("idempotency")
        );
        router.execute(allowed, _sign(allowed));
        allowed.actionNonce = 1;
        bytes memory replaySignature = _sign(allowed);
        vm.expectRevert(ToolRouter.Replay.selector);
        router.execute(allowed, replaySignature);
    }

    function testFuzz_StablecoinPaymentChargesExactAmount(uint128 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 0.25 ether);
        bytes memory data = abi.encodeWithSelector(MockStablecoin.transfer.selector, vendorRecipient, amount);
        ToolRouter.ToolIntent memory intent = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            data,
            0,
            0,
            keccak256("fuzz-payment")
        );

        router.execute(intent, _sign(intent));

        assertEq(stablecoin.balanceOf(vendorRecipient), amount);
        assertEq(issuer.get(capabilityId).spent, amount);
    }

    function invariant_CapabilityAccountingNeverExceedsCaps() public view {
        CapabilityIssuer.Capability memory current = issuer.get(capabilityId);
        assertLe(current.spent, current.spendCap);
        assertLe(current.callsUsed, current.callCap);
    }

    function test_RejectedActionsAndProvenRevocation() public {
        bytes memory wrongRecipientData = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            address(0xBAD),
            uint256(0.1 ether)
        );
        ToolRouter.ToolIntent memory wrongRecipient = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            wrongRecipientData,
            0,
            0,
            keccak256("wrong-recipient")
        );
        bytes memory wrongRecipientSignature = _sign(wrongRecipient);
        vm.expectRevert(AllowlistedStablecoinPaymentValidator.InvalidPayment.selector);
        router.execute(wrongRecipient, wrongRecipientSignature);

        bytes memory tooLargeData = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.3 ether)
        );
        ToolRouter.ToolIntent memory tooLarge = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            tooLargeData,
            0,
            0,
            keccak256("too-large")
        );
        bytes memory tooLargeSignature = _sign(tooLarge);
        vm.expectRevert(AllowlistedStablecoinPaymentValidator.InvalidPayment.selector);
        router.execute(tooLarge, tooLargeSignature);

        _importRevocation();
        bytes memory validData = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.1 ether)
        );
        ToolRouter.ToolIntent memory validAfterRevocation = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            validData,
            0,
            0,
            keccak256("after-revocation")
        );
        bytes memory revokedSignature = _sign(validAfterRevocation);
        vm.expectRevert(CapabilityIssuer.PausedCapability.selector);
        router.execute(validAfterRevocation, revokedSignature);
        assertEq(evidence.getStatus(evidence.releaseKey(orgId, releaseDigest)).reasonHash, keccak256("security"));

        bytes32 reactivationTx = keccak256("reactivation-after-revocation");
        _setReceipt(
            reactivationTx,
            address(statusRegistry),
            _topics(adapter.STATUS_TOPIC(), orgId, releaseDigest, bytes32(uint256(1))),
            abi.encode(uint64(3), uint64(block.timestamp), uint64(block.timestamp + 1 days))
        );
        vm.expectRevert(EvidenceRegistry.AlreadyRevoked.selector);
        adapter.importStatus(_request(reactivationTx, 0));
    }

    function test_GuardianTargetPauseOnlyReducesAuthority() public {
        bytes memory data = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.1 ether)
        );
        ToolRouter.ToolIntent memory intent = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            data,
            0,
            0,
            keccak256("target-pause")
        );
        vm.prank(guardian);
        issuer.pauseTarget(address(stablecoin));
        bytes memory pausedSignature = _sign(intent);
        vm.expectRevert(ToolRouter.PausedTarget.selector);
        router.execute(intent, pausedSignature);

        vm.prank(admin);
        issuer.unpauseTarget(address(stablecoin));
        router.execute(intent, _sign(intent));
        assertEq(stablecoin.balanceOf(vendorRecipient), 0.1 ether);
    }

    function test_PolicyPauseReducesExistingCapability() public {
        bytes memory data = abi.encodeWithSelector(MockStablecoin.transfer.selector, vendorRecipient, uint256(0.1 ether));
        ToolRouter.ToolIntent memory intent = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            data,
            0,
            0,
            keccak256("policy-pause")
        );
        bytes memory signature = _sign(intent);
        vm.prank(guardian);
        policies.pause(policyHash);
        vm.expectRevert(CapabilityIssuer.PausedCapability.selector);
        router.execute(intent, signature);

        vm.prank(admin);
        policies.unpause(policyHash);
        router.execute(intent, signature);
        assertEq(stablecoin.balanceOf(vendorRecipient), 0.1 ether);
    }

    function test_TEERequiredBindsArtifactAndRuntimeUntilRevoked() public {
        PolicyRegistry.PolicyInput memory teeInput = PolicyRegistry.PolicyInput({
            approvedSuiteHash: suiteHash,
            approvedEvaluatorSetHash: evaluatorSetHash,
            allowedToolScopeRoot: scopeRoot,
            minSafetyScoreBps: 8_000,
            deniedCapabilityBitmap: 0,
            spendCeiling: 0.35 ether,
            perCallCeiling: 0.25 ether,
            callCeiling: 2,
            capabilityTtl: 600,
            statusFreshness: 900,
            teeRequired: true
        });
        vm.prank(admin);
        bytes32 teePolicyHash = policies.register(teeInput);

        bytes32 teeDigest = keccak256("tee-release-digest");
        bytes32 teeReleaseId = keccak256("tee-release-id");
        _importEvidenceWithPolicy(teeDigest, teeReleaseId, teeReleaseId, uint64(block.timestamp), teePolicyHash);
        vm.expectRevert(CapabilityIssuer.TEERequired.selector);
        issuer.issue(orgId, agentId, teeDigest, teePolicyHash);

        uint64 bindingValidUntil = uint64(block.timestamp + 1 days);
        vm.prank(teeVerifier);
        bytes32 bindingId = runtimeBindings.register(
            RuntimeBindingRegistry.BindingInput({
                orgId: orgId,
                agentId: agentId,
                releaseDigest: teeDigest,
                runtimeKey: runtimeKey,
                teeMeasurement: keccak256("tee-measurement"),
                quoteHash: keccak256("tee-quote"),
                artifactRoot: keccak256("artifact-root"),
                containerImageDigest: keccak256("container"),
                validAfter: uint64(block.timestamp - 1),
                validUntil: bindingValidUntil,
                runtimeNonce: 1
            })
        );
        assertEq(bindingId, runtimeBindings.bindingKey(orgId, agentId, teeDigest, runtimeKey));

        bytes32 teeCapabilityId = issuer.issue(orgId, agentId, teeDigest, teePolicyHash);
        CapabilityIssuer.Capability memory capability = issuer.get(teeCapabilityId);
        assertGt(capability.expiresAt, uint64(block.timestamp));
        assertLe(capability.expiresAt, bindingValidUntil);

        vm.prank(teeVerifier);
        runtimeBindings.revoke(orgId, agentId, teeDigest, runtimeKey, 2);
        vm.prank(address(router));
        vm.expectRevert(CapabilityIssuer.TEERequired.selector);
        issuer.consume(teeCapabilityId, 0);
    }

    function test_AdapterGuardianPauseRequiresAdminToUnpause() public {
        vm.prank(guardian);
        adapter.pause();
        vm.prank(guardian);
        vm.expectRevert(RoleAddress.Unauthorized.selector);
        adapter.unpause();
        vm.prank(admin);
        adapter.unpause();
    }

    function test_VaultAndRuntimeContainment() public {
        bytes memory data = abi.encodeWithSelector(
            MockStablecoin.transfer.selector,
            vendorRecipient,
            uint256(0.1 ether)
        );
        vm.expectRevert(AgentVault.Unauthorized.selector);
        vault.execute(address(stablecoin), 0, data);

        ToolRouter.ToolIntent memory intent = _intent(
            paymentLeaf,
            address(stablecoin),
            MockStablecoin.transfer.selector,
            data,
            0,
            0,
            keccak256("wrong-runtime")
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xA11CF, router.hashIntent(intent));
        vm.expectRevert(ToolRouter.InvalidSignature.selector);
        router.execute(intent, abi.encodePacked(r, s, v));
    }

    function test_ValidatorsRejectInvalidConfiguration() public {
        vm.expectRevert(AllowlistedStablecoinPaymentValidator.InvalidConfiguration.selector);
        new AllowlistedStablecoinPaymentValidator(address(0), vendorRecipient, 1, MockStablecoin.transfer.selector);

        vm.expectRevert(BoundedDepositValidator.InvalidConfiguration.selector);
        new BoundedDepositValidator(address(0), depositPosition, 1, BoundedDepositProtocol.deposit.selector);

        vm.expectRevert(BoundedDepositValidator.InvalidConfiguration.selector);
        new BoundedDepositValidator(address(protocol), bytes32(0), 1, BoundedDepositProtocol.deposit.selector);

        vm.expectRevert(NativePaymentValidator.InvalidConfiguration.selector);
        new NativePaymentValidator(address(0), 1);
    }

    function test_NativePaymentValidatorChargesNativeValueOnly() public {
        assertEq(nativePaymentValidator.validate(vendorRecipient, bytes4(0), bytes(""), 0.2 ether, bytes32(0)), 0.2 ether);

        vm.expectRevert(NativePaymentValidator.InvalidPayment.selector);
        nativePaymentValidator.validate(vendorRecipient, bytes4(0), bytes("0x01"), 0.2 ether, bytes32(0));

        vm.expectRevert(NativePaymentValidator.InvalidPayment.selector);
        nativePaymentValidator.validate(address(0xBAD), bytes4(0), bytes(""), 0.2 ether, bytes32(0));
    }

    function _importAllEvidence() internal {
        _importEvidence(releaseDigest, releaseId, releaseId, uint64(block.timestamp));
    }

    function _importEvidence(
        bytes32 digest,
        bytes32 artifactReleaseId,
        bytes32 evaluationReleaseId,
        uint64 evaluatedAt
    ) internal {
        _importEvidenceWithPolicy(digest, artifactReleaseId, evaluationReleaseId, evaluatedAt, policyHash);
    }

    function _importEvidenceWithPolicy(
        bytes32 digest,
        bytes32 artifactReleaseId,
        bytes32 evaluationReleaseId,
        uint64 evaluatedAt,
        bytes32 approvalPolicyHash
    ) internal {
        bytes32 artifactTx = keccak256(abi.encode("artifact-tx", digest));
        bytes32 evaluationTx = keccak256(abi.encode("evaluation-tx", digest));
        bytes32 approvalTx = keccak256(abi.encode("approval-tx", digest));
        bytes32 statusTx = keccak256(abi.encode("status-tx", digest));

        bytes32 artifactRoot = keccak256("artifact-root");
        bytes memory artifactData = abi.encode(
            keccak256("manifest"),
            artifactRoot,
            keccak256("weights"),
            keccak256("tokenizer"),
            keccak256("prompt"),
            scopeRoot,
            keccak256("container"),
            keccak256("sbom"),
            keccak256("provenance"),
            uint64(1),
            uint64(1)
        );
        _setReceipt(
            artifactTx,
            address(artifactRegistry),
            _topics(adapter.ARTIFACT_TOPIC(), orgId, artifactReleaseId, digest),
            artifactData
        );
        adapter.importArtifact(_request(artifactTx, 0));

        bytes memory evaluationData = abi.encode(
            suiteHash,
            keccak256("report"),
            evaluatorSetHash,
            uint32(9_000),
            uint256(0),
            evaluatedAt,
            uint64(block.timestamp + 1 days),
            uint64(1)
        );
        _setReceipt(
            evaluationTx,
            address(evaluationRegistry),
            _topics(adapter.EVALUATION_TOPIC(), orgId, evaluationReleaseId, digest),
            evaluationData
        );
        adapter.importEvaluation(_request(evaluationTx, 0));

        bytes memory approvalData = abi.encode(
            runtimeKey,
            approvalPolicyHash,
            scopeRoot,
            uint128(0.35 ether),
            uint128(0.25 ether),
            uint32(2),
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days),
            uint64(1)
        );
        _setReceipt(
            approvalTx,
            address(approvalRegistry),
            _topics(adapter.APPROVAL_TOPIC(), orgId, agentId, digest),
            approvalData
        );
        adapter.importApproval(_request(approvalTx, 0));

        bytes memory statusData = abi.encode(uint64(1), uint64(block.timestamp), uint64(block.timestamp + 1 days));
        _setReceipt(
            statusTx,
            address(statusRegistry),
            _topics(adapter.STATUS_TOPIC(), orgId, digest, bytes32(uint256(1))),
            statusData
        );
        adapter.importStatus(_request(statusTx, 0));
    }

    function _importRevocation() internal {
        bytes32 revocationTx = keccak256("revocation-tx");
        bytes memory data = abi.encode(uint64(2), uint64(block.timestamp));
        _setReceipt(
            revocationTx,
            address(statusRegistry),
            _topics(adapter.REVOCATION_TOPIC(), orgId, releaseDigest, keccak256("security")),
            data
        );
        adapter.importRevocation(_request(revocationTx, 0));
    }

    function _setReceipt(bytes32 txHash, address emitter, bytes32[] memory topics, bytes memory data) internal {
        _setReceiptStatus(txHash, emitter, topics, data, 1);
    }

    function _setReceiptStatus(
        bytes32 txHash,
        address emitter,
        bytes32[] memory topics,
        bytes memory data,
        uint8 status
    ) internal {
        prover.setProof(abi.encode(txHash), true);
        decoder.setReceipt(abi.encode(txHash), status, emitter, topics, data);
    }

    function _topics(bytes32 topic0, bytes32 a, bytes32 b, bytes32 c)
        internal
        pure
        returns (bytes32[] memory topics)
    {
        topics = new bytes32[](4);
        topics[0] = topic0;
        topics[1] = a;
        topics[2] = b;
        topics[3] = c;
    }

    function _request(bytes32 txHash, uint32 logIndex)
        internal
        pure
        returns (AirlockAttestcoinAdapter.ImportRequest memory request)
    {
        IBlockProver.MerkleProofEntry[] memory siblings = new IBlockProver.MerkleProofEntry[](0);
        bytes32[] memory roots = new bytes32[](0);
        request = AirlockAttestcoinAdapter.ImportRequest({
            chainKey: SOURCE_CHAIN_KEY,
            blockHeight: uint64(uint256(txHash)),
            encodedTransaction: abi.encode(txHash),
            merkleProof: IBlockProver.MerkleProof({root: bytes32(0), siblings: siblings}),
            continuityProof: IBlockProver.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots}),
            logIndex: logIndex
        });
    }

    function _batchRequest(bytes32[] memory txHashes, uint8[] memory kinds)
        internal
        pure
        returns (AirlockAttestcoinAdapter.BatchImportRequest memory request)
    {
        uint256 length = txHashes.length;
        request.chainKey = SOURCE_CHAIN_KEY;
        request.blockHeights = new uint64[](length);
        request.encodedTransactions = new bytes[](length);
        request.merkleProofs = new IBlockProver.MerkleProof[](length);
        request.logIndices = new uint32[](length);
        request.kinds = kinds;
        request.continuityProof = IBlockProver.ContinuityProof({
            lowerEndpointDigest: bytes32(0),
            roots: new bytes32[](0)
        });
        for (uint256 i; i < length; ++i) {
            IBlockProver.MerkleProofEntry[] memory siblings = new IBlockProver.MerkleProofEntry[](0);
            request.blockHeights[i] = uint64(uint256(txHashes[i]));
            request.encodedTransactions[i] = abi.encode(txHashes[i]);
            request.merkleProofs[i] = IBlockProver.MerkleProof({root: bytes32(0), siblings: siblings});
        }
    }

    function _intent(
        bytes32 leaf,
        address target,
        bytes4 selector,
        bytes memory data,
        uint256 value,
        uint64 actionNonce,
        bytes32 idempotencyKey
    ) internal view returns (ToolRouter.ToolIntent memory intent) {
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf == paymentLeaf ? depositLeaf : paymentLeaf;
        intent = ToolRouter.ToolIntent({
            capabilityId: capabilityId,
            agentId: agentId,
            target: target,
            functionSelector: selector,
            calldataHash: keccak256(data),
            value: value,
            deadline: uint64(block.timestamp + 60),
            actionNonce: actionNonce,
            idempotencyKey: idempotencyKey,
            traceRoot: keccak256(abi.encode("AIRLOCK_TRACE_V1", idempotencyKey)),
            scopeLeaf: leaf,
            scopeProof: proof,
            data: data
        });
    }

    function _sign(ToolRouter.ToolIntent memory intent) internal returns (bytes memory signature) {
        bytes32 digest = router.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(RUNTIME_PK, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
