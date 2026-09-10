# Deployment evidence

This file is a template until a live testnet run is performed. Do not replace
the placeholders with invented values. `deploy-live.ts` writes the same
non-secret data to the ignored `deployments.json` file.

## Networks

| Field | Value |
| --- | --- |
| Source network | Ethereum Sepolia |
| Source EVM chain ID | `11155111` |
| Source Attestcoin chain key | recorded from live ChainInfo |
| Destination network | Creditcoin CC3 testnet |
| Destination EVM chain ID | `102031` |
| BlockProver | `0x0000000000000000000000000000000000000FD2` |
| ChainInfo | `0x0000000000000000000000000000000000000FD3` |

## Release

Record these fields from `airlock-manifest.json` and `deployments.json`:

- `orgId`
- `releaseId`
- `releaseDigest`
- `manifestHash`
- `artifactRoot`
- `policyHash`
- `scopeRoot`

## Required source transactions

| Evidence | Source transaction | Source block | Creditcoin import transaction |
| --- | --- | --- | --- |
| Artifact publication | pending live run | pending | pending |
| Evaluation certification | pending live run | pending | pending |
| Deployment approval | pending live run | pending | pending |
| Active status | pending live run | pending | pending |
| Revocation | pending live run | pending | pending |

For each proof, retain the non-secret `chainKey`, source block, transaction
index, log index, emitter, receipt status, topic0, and the destination import
transaction. A source event is only labelled **proven** after the Creditcoin
import succeeds.
