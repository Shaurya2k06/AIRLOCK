# AIRLOCK live deployment evidence

This snapshot records the corrected live testnet run completed on 2026-09-11.
The deployment manifest contains public addresses and transaction hashes only;
private keys and RPC credentials are not committed.

## Networks

| Field | Value |
| --- | --- |
| Source | Ethereum Sepolia (`11155111`) |
| Destination | Creditcoin CC3 testnet (`102031`) |
| Attestcoin chain key | `1` |
| BlockProver | `0x0000000000000000000000000000000000000fd2` |

## Release commitment

| Field | Value |
| --- | --- |
| `orgId` | `0x19f14d9c15d90b47249d88d3fb11ada9dda7ba4d690fc48c533d1217ee726fa0` |
| `releaseId` | `0x8e0a115b6ca14dc079f590175807a4ef26d840174a4e5bdeaed593f888f6324b` |
| `agentId` | `0xc9bb4c9317790d917fe2da888cda19c1c96a65a7b8393ec0959bc352361d8c31` |
| `releaseDigest` | `0xbea1ea89d965991de8970e53575e75b45b88520129f346c4243538965f4f5c86` |
| `manifestHash` | `0xa3202a9663c5a38ff7fcf9b71565f38fa97e9930796fda0d7c7cd68f489a913e` |
| `artifactRoot` | `0xf9c2815cca7dfbb8a62851a696eae7486cdea2dc730785293ed0c0378fdf46cc` |
| `policyHash` | `0xb6f489c5a41ff7f01fdbaffb391a65707d7a2d57a76477d255786c98fb1f88f1` |
| runtime assurance | `L0` — artifact bound, not runtime weight attestation |

## Deployed contracts

| Network | Contract | Address |
| --- | --- | --- |
| Sepolia | ArtifactRegistry | [`0xeAa8d11Fb488adf4cA473A9B970D4155A880C7BF`](https://sepolia.etherscan.io/address/0xeAa8d11Fb488adf4cA473A9B970D4155A880C7BF) |
| Sepolia | EvaluationRegistry | [`0x65F12edb1A6a479B2A6Ad3Bc40d44427aaCB8952`](https://sepolia.etherscan.io/address/0x65F12edb1A6a479B2A6Ad3Bc40d44427aaCB8952) |
| Sepolia | DeploymentApprovalRegistry | [`0xE72e2fF706258DC1E5ef783d8FF9fA5f59A9c92e`](https://sepolia.etherscan.io/address/0xE72e2fF706258DC1E5ef783d8FF9fA5f59A9c92e) |
| Sepolia | ReleaseStatusRegistry | [`0xf392ebcEE8f118696e69C0606C1267afA7816431`](https://sepolia.etherscan.io/address/0xf392ebcEE8f118696e69C0606C1267afA7816431) |
| Creditcoin | OfficialReceiptDecoder | [`0x35b106de527F7fC58fd1936CDd1b4069E0Da42b6`](https://creditcoin-testnet.blockscout.com/address/0x35b106de527F7fC58fd1936CDd1b4069E0Da42b6) |
| Creditcoin | EvidenceRegistry | [`0xCA36Cd4eb2f81eb6A76B8d3701aF17b5b43e5b23`](https://creditcoin-testnet.blockscout.com/address/0xCA36Cd4eb2f81eb6A76B8d3701aF17b5b43e5b23) |
| Creditcoin | AirlockAttestcoinAdapter | [`0x4Cc57B9e9945e7E24EBd9081a3978222bFCe9Eab`](https://creditcoin-testnet.blockscout.com/address/0x4Cc57B9e9945e7E24EBd9081a3978222bFCe9Eab) |
| Creditcoin | PolicyRegistry | [`0x1B43F6B66f200A3cA7f08991fc5D4934A133A8cB`](https://creditcoin-testnet.blockscout.com/address/0x1B43F6B66f200A3cA7f08991fc5D4934A133A8cB) |
| Creditcoin | RuntimeBindingRegistry | [`0x347802C070007E0194169301318E4dCC5d8d646c`](https://creditcoin-testnet.blockscout.com/address/0x347802C070007E0194169301318E4dCC5d8d646c) |
| Creditcoin | CapabilityIssuer | [`0x0f79ab9573ae94544442D0D7DBD0B0eFd6E404d9`](https://creditcoin-testnet.blockscout.com/address/0x0f79ab9573ae94544442D0D7DBD0B0eFd6E404d9) |
| Creditcoin | CapabilityDelegationRegistry | [`0x3672d15Abb4b9C8b9e26b3ba060f69784fe38d7f`](https://creditcoin-testnet.blockscout.com/address/0x3672d15Abb4b9C8b9e26b3ba060f69784fe38d7f) |
| Creditcoin | AgentVault | [`0xb58E4F9aa0e475a80B31bB2E5eE4D6aa824d448A`](https://creditcoin-testnet.blockscout.com/address/0xb58E4F9aa0e475a80B31bB2E5eE4D6aa824d448A) |
| Creditcoin | ToolRouter | [`0x3a217Ce7b91CB7E5d83063496E7b1bD75adEE419`](https://creditcoin-testnet.blockscout.com/address/0x3a217Ce7b91CB7E5d83063496E7b1bD75adEE419) |
| Creditcoin | BoundedDepositProtocol | [`0xA0e835903F8D517ab30410976FB2569e677714f5`](https://creditcoin-testnet.blockscout.com/address/0xA0e835903F8D517ab30410976FB2569e677714f5) |
| Creditcoin | NativePaymentValidator | [`0x4796bE3f0CAC55dCB558D95c6Bc6835040ee5aD5`](https://creditcoin-testnet.blockscout.com/address/0x4796bE3f0CAC55dCB558D95c6Bc6835040ee5aD5) |
| Creditcoin | BoundedDepositValidator | [`0xfAbCF676dAC109092494D156c63f803f6D2Cf901`](https://creditcoin-testnet.blockscout.com/address/0xfAbCF676dAC109092494D156c63f803f6D2Cf901) |

## Proven source events

Each source receipt returned status `1`; each corresponding Attestcoin proof
was accepted by the deployed Creditcoin adapter.

| Evidence | Source transaction | Block | Creditcoin import |
| --- | --- | --- | --- |
| Artifact publication | [`0x995187…d357ea`](https://sepolia.etherscan.io/tx/0x995187db6cb29adc14fe46ef764eaf1894c8e2e719028eb7b0e251254ad357ea) | `11681792` | [`0xc666a0…7f5123`](https://creditcoin-testnet.blockscout.com/tx/0xc666a0cbff1f860fd3ff28b3e338641e0bcb41ffd033fe6e3779398d837f5123) |
| Evaluation certification | [`0xdf4d33…c53c1a2`](https://sepolia.etherscan.io/tx/0xdf4d33b46c2aa0ada036068a8dc3349494c7bec40d031fa56c87e796cc53c1a2) | `11681793` | [`0xd13872…ac8a7`](https://creditcoin-testnet.blockscout.com/tx/0xd1387294266071049f56c57bce8af895eeb3cef6bc00e49156390f92204ac8a7) |
| Deployment approval | [`0x41145a…04de5d`](https://sepolia.etherscan.io/tx/0x41145ad24c74e0c98c18b810ac185a7bef67adae87312d1569143d821704de5d) | `11681794` | [`0x90fa9d…6038c4`](https://creditcoin-testnet.blockscout.com/tx/0x90fa9d9ba211f16b4ac36424ebc5dc9ab84b73ed9d8bbc19d43bebd58b6038c4) |
| Active status | [`0x1568b1…16834`](https://sepolia.etherscan.io/tx/0x1568b177443aee31bd80ae9ac747477a0f559e8383305b126d358e3d81816834) | `11681796` | [`0xb3ee49…8287f`](https://creditcoin-testnet.blockscout.com/tx/0xb3ee49e51ea38e2b14004c10193e407e6ad96dae11e28b6b386addba77c8287f) |
| Revocation | [`0xaa1142…d46f6`](https://sepolia.etherscan.io/tx/0xaa1142d78b7ca6c7c7b64e51dc380a39d05d074dd6d9df258b8323c08aad46f6) | `11681853` | [`0x0f5c09…f0ce9`](https://creditcoin-testnet.blockscout.com/tx/0x0f5c090f5a3b7bc7c21da37471a26113c9eeefad4b45e370d8f06d4eac2f0ce9) |

## Live enforcement

| Result | Evidence |
| --- | --- |
| Capability issued | `0xb14e7b…964196`; issue tx [`0x42f7b2…5f8f4a`](https://creditcoin-testnet.blockscout.com/tx/0x42f7b24e12650531812e63f291183f4606769412ac81b275c07805c9cb5f8f4a) |
| Root native payment allowed | [`0x67f6df…d5c64`](https://creditcoin-testnet.blockscout.com/tx/0x67f6dff4baa1b0c093effabb121f280af8b4066539ac7a44bb3d0a176c4d5c64) |
| Child delegation registered | child `0x28411e…87783`; [`0x7d9434…3df28`](https://creditcoin-testnet.blockscout.com/tx/0x7d94340be2be88b80dbe2dbb34e3d1cfd5a5494ce473c701986d1b07d313df28) |
| Child native payment allowed | [`0x720c4b…8da1d`](https://creditcoin-testnet.blockscout.com/tx/0x720c4b463394ee4aae9e12734dd29526dcb441b6311bc661626b08850188da1d) |
| Post-revocation action | Router `staticCall` rejected with `{ blocked: true, reason: "proven revocation" }` |

The live payment path uses native value and `NativePaymentValidator`; no test
token is deployed by the live deployment script. The local Solidity suite still
contains an isolated token fixture for validator accounting tests.

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
LIVE_STEP=revoke npm run live-step
IMPORT_KIND=revocation npm run import-proof
LIVE_STEP=blocked npm run live-step
```

This is a Sepolia → Attestcoin → Creditcoin CC3 testnet run. L0 binds the
release digest to a runtime key; it does not prove that a running process loaded
the committed model weights. Higher runtime assurance remains opt-in.
