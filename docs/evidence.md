# AIRLOCK live deployment evidence

This is the non-secret evidence snapshot from the live run completed on
2026-09-11. The exact public deployment record is in
[`deployment-manifest.json`](deployment-manifest.json). Private keys and RPC
credentials are intentionally excluded. The independent clean-clone replay is
summarized in [`rehearsal.md`](rehearsal.md).

## Networks

| Field | Value |
| --- | --- |
| Source network | Ethereum Sepolia |
| Source EVM chain ID | `11155111` |
| Source Attestcoin chain key | `1` |
| Destination network | Creditcoin CC3 testnet |
| Destination EVM chain ID | `102031` |
| BlockProver | `0x0000000000000000000000000000000000000fd2` |
| ChainInfo | `0x0000000000000000000000000000000000000fd3` |

## Release commitment

| Field | Value |
| --- | --- |
| `orgId` | `0x19f14d9c15d90b47249d88d3fb11ada9dda7ba4d690fc48c533d1217ee726fa0` |
| `releaseId` | `0x8e0a115b6ca14dc079f590175807a4ef26d840174a4e5bdeaed593f888f6324b` |
| `agentId` | `0xc9bb4c9317790d917fe2da888cda19c1c96a65a7b8393ec0959bc352361d8c31` |
| `releaseDigest` | `0x29f4f4adeda033296787e13806c9634b6c00f984035ac1605f21fdd21ffddecc` |
| `manifestHash` | `0x0012b5d8bc3785a644ba5dc270b56e9b25507d661ddf13effd8f26c0e55b43f3` |
| `artifactRoot` | `0xe7b55ed2c63a87e94b60b7e90052f43a411a6bbfe1cbe38add7bf44fe269c322` |
| `policyHash` | `0x460c17c0044cc16883183ad9ecc9e78e425ccbaf2ee469deaba209c5cf867b21` |
| `scopeRoot` | `0x40f775477891f156919c91d48025c10865db151cf7fe5c930d45a11d7f954ce0` |

## Deployed contracts

| Network | Contract | Address |
| --- | --- | --- |
| Sepolia | ArtifactRegistry | [`0xe2817553339aCFC3a16DFDe0C2e858e10b617017`](https://sepolia.etherscan.io/address/0xe2817553339aCFC3a16DFDe0C2e858e10b617017) |
| Sepolia | EvaluationRegistry | [`0x0549a6e3aE3cf058BE3d20FBECe468e6c234b76b`](https://sepolia.etherscan.io/address/0x0549a6e3aE3cf058BE3d20FBECe468e6c234b76b) |
| Sepolia | DeploymentApprovalRegistry | [`0x6031c4818E94beC3D909188312F8dB0001db6d1d`](https://sepolia.etherscan.io/address/0x6031c4818E94beC3D909188312F8dB0001db6d1d) |
| Sepolia | ReleaseStatusRegistry | [`0xC2fFBDFF6f4C29Dc3D506534ffcc91B67f5618D0`](https://sepolia.etherscan.io/address/0xC2fFBDFF6f4C29Dc3D506534ffcc91B67f5618D0) |
| Creditcoin | OfficialReceiptDecoder | [`0x9c3E58A02803BA1c3F9AD92fbac9DeAF26429467`](https://creditcoin-testnet.blockscout.com/address/0x9c3E58A02803BA1c3F9AD92fbac9DeAF26429467) |
| Creditcoin | EvidenceRegistry | [`0x25F25A9604783CFecAff97e90B0927d006B11C1a`](https://creditcoin-testnet.blockscout.com/address/0x25F25A9604783CFecAff97e90B0927d006B11C1a) |
| Creditcoin | AirlockAttestcoinAdapter | [`0x8B85fC6c3295a442e158eD88CBAEa1c6A9D2676d`](https://creditcoin-testnet.blockscout.com/address/0x8B85fC6c3295a442e158eD88CBAEa1c6A9D2676d) |
| Creditcoin | PolicyRegistry | [`0x039DAfa5FaB66797Df264b251d07FBaC06f7a2B8`](https://creditcoin-testnet.blockscout.com/address/0x039DAfa5FaB66797Df264b251d07FBaC06f7a2B8) |
| Creditcoin | CapabilityIssuer | [`0xB63a439a53490006b136d332fb0433A6d3208C16`](https://creditcoin-testnet.blockscout.com/address/0xB63a439a53490006b136d332fb0433A6d3208C16) |
| Creditcoin | AgentVault | [`0x8d3344a2d5780c83E1a887AbaeFcCcdBfF1A3bA3`](https://creditcoin-testnet.blockscout.com/address/0x8d3344a2d5780c83E1a887AbaeFcCcdBfF1A3bA3) |
| Creditcoin | ToolRouter | [`0xC2B3B8D4bc80409FB17C74B6C0dfC808f234Ca76`](https://creditcoin-testnet.blockscout.com/address/0xC2B3B8D4bc80409FB17C74B6C0dfC808f234Ca76) |
| Creditcoin | MockStablecoin | [`0x4f55c93d57dB7c64bF6a6384EC6C74e3f838d124`](https://creditcoin-testnet.blockscout.com/address/0x4f55c93d57dB7c64bF6a6384EC6C74e3f838d124) |
| Creditcoin | BoundedDepositProtocol | [`0x4A72223f069E0066Ed8B624bCf35C582bbCE8ff9`](https://creditcoin-testnet.blockscout.com/address/0x4A72223f069E0066Ed8B624bCf35C582bbCE8ff9) |
| Creditcoin | PaymentValidator | [`0x1919318D729FCf06AA9197b34E227F9fe04139B6`](https://creditcoin-testnet.blockscout.com/address/0x1919318D729FCf06AA9197b34E227F9fe04139B6) |
| Creditcoin | DepositValidator | [`0x2C975DfCf837969bc19fcA27930Ad1E40CB2055c`](https://creditcoin-testnet.blockscout.com/address/0x2C975DfCf837969bc19fcA27930Ad1E40CB2055c) |

The four Sepolia registries are source-verified on Sourcify: [ArtifactRegistry](https://sourcify.dev/server/repo-ui/11155111/0xe2817553339aCFC3a16DFDe0C2e858e10b617017), [EvaluationRegistry](https://sourcify.dev/server/repo-ui/11155111/0x0549a6e3aE3cf058BE3d20FBECe468e6c234b76b), [DeploymentApprovalRegistry](https://sourcify.dev/server/repo-ui/11155111/0x6031c4818E94beC3D909188312F8dB0001db6d1d), and [ReleaseStatusRegistry](https://sourcify.dev/server/repo-ui/11155111/0xC2fFBDFF6f4C29Dc3D506534ffcc91B67f5618D0). All eleven Creditcoin contracts are source-verified on Blockscout; their `#code` links are recorded in [`deployment-manifest.json`](deployment-manifest.json).

## Proven source events

Every row below uses the same `releaseDigest`. Each source receipt had status
`1`; the corresponding import transaction was accepted by the deployed
Creditcoin adapter.

| Evidence | Source transaction | Block / tx index | Creditcoin import |
| --- | --- | --- | --- |
| Artifact publication | [`0x444a13…5726bf1`](https://sepolia.etherscan.io/tx/0x444a13f744582ff57802057b1737ccf3f86c9e8b220fbf737926ae0ea5726bf1) | `11679084 / 130` | [`0x431257…137b8cb`](https://creditcoin-testnet.blockscout.com/tx/0x431257721df68650444414a9ef91cd2361a9fe7614ceb1f8e806f0461137b8cb) |
| Evaluation certification | [`0xc4bcc…78b257`](https://sepolia.etherscan.io/tx/0xc4bccce810a22c764f83cbc1ce2650b3f4166087109052c0973a93d69778b257) | `11679085 / 105` | [`0xbbe108…153b34`](https://creditcoin-testnet.blockscout.com/tx/0xbbe108730d7f94a837820e72209c42d35236f9dcafd827218a12aabe10153b34) |
| Deployment approval | [`0xd31d96…bfeaac`](https://sepolia.etherscan.io/tx/0xd31d96c805cd9eb500e3d434d2566cc4c1aba0402dce020e68003e23ebbfeaac) | `11679086 / 78` | [`0x30b61a…c5cc`](https://creditcoin-testnet.blockscout.com/tx/0x30b61e8ee7e80e35c092674972575dc28707233e27717a5456c1a63ddc3cc5cc) |
| Active status | [`0x32a745…fc581`](https://sepolia.etherscan.io/tx/0x32a7450775f33be76fada63fb9a3b639ca357fd8b8cf65a221394f3cc25fc581) | `11679087 / 131` | [`0x1aaf01…7bfe`](https://creditcoin-testnet.blockscout.com/tx/0x1aaf017bcc69a8794703a09ca17b70b8c3ec3467fa4d79a48528f87652c77bfe) |
| Revocation | [`0x3231c6…6a167`](https://sepolia.etherscan.io/tx/0x3231c60436ee086643f41a5e853a1b32edbe88f30405a4fb910cd0590876a167) | `11679139 / 75` | [`0x13b2cc…bfe24`](https://creditcoin-testnet.blockscout.com/tx/0x13b2cc9dfd0b5f013016f296f50ec781060d406edcafacdd9ae4ec74873bfe24) |

Proof sizes / Creditcoin gas: artifact `2400 B / 471418`, evaluation
`2208 B / 392518`, approval `2272 B / 389998`, status `1888 B / 377230`, and
revocation `1824 B / 374542`.

## Live enforcement

| Result | Transaction / evidence |
| --- | --- |
| Capability issued | `0xdd3f8e3f3eeb713e5e103da58825b6464c5392d558f81ee378d143aa7158dd9c`; issue tx [`0xff372a…f4814`](https://creditcoin-testnet.blockscout.com/tx/0xff372aa96df54e202644b3294f63ae7071be96b844b20addcffa17561f8f4814) |
| Allowed payment | [`0xcaa17e…a416f`](https://creditcoin-testnet.blockscout.com/tx/0xcaa17e9c1c9648f2bfccaacbe71e4c55fd1869129aa68bf4cea67f7221da416f) |
| Allowed bounded deposit | [`0x2fdbde…f37e8`](https://creditcoin-testnet.blockscout.com/tx/0x2fdbde8adeb856b911d9e9d3c44dfff4d3605a2af0b7493bb0aedb505d9f37e8) |
| Post-revocation action | Static router simulation rejected: `{ blocked: true, reason: "proven revocation" }` |

The capability consumed `0.11` total spend across the two allowed validators
(`0.01` payment plus `0.10` deposit) before the proven revocation. The local
contract suite separately covers wrong recipient, excessive value, calldata
mutation, replay, direct-vault, signature, pause, fuzz, and invariant cases.

## Reproduction

```sh
cd contracts
npm run live:check
npm run deploy-live
IMPORT_KIND=artifact npm run import-proof
IMPORT_KIND=evaluation npm run import-proof
IMPORT_KIND=approval npm run import-proof
IMPORT_KIND=status npm run import-proof
LIVE_STEP=execute npm run live-step
LIVE_STEP=deposit npm run live-step
LIVE_STEP=revoke npm run live-step
IMPORT_KIND=revocation npm run import-proof
LIVE_STEP=blocked npm run live-step
```

This is a Sepolia → Attestcoin → Creditcoin CC3 testnet run. Base mode binds
the release digest to a runtime key; it does not prove that a running process
loaded the committed model weights. The optional TEE mode remains separate.
