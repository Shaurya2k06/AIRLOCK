# Independent live rehearsal

This is a second live run from a clean clone of commit
`c6126538f3960bd13e44e96c7327a4d69a345c0f`, completed on 2026-09-11. It used
fresh ephemeral role accounts and a separate deployment. Private keys were
held only in the runner's process and are not retained here.

Network: Ethereum Sepolia (`11155111`, Attestcoin chain key `1`) to Creditcoin
CC3 testnet (`102031`). The four source events, five proof imports, capability
issuance, two allowed actions, revocation, and post-revocation block all
completed successfully.

## Source events and imports

| Evidence | Sepolia transaction | Block / tx index | Creditcoin import |
| --- | --- | --- | --- |
| Artifact publication | [`0x2fc457…048b82`](https://sepolia.etherscan.io/tx/0x2fc45750f416082c0eec09382673a6f533c94e82e6a80af5217ba34d89048b82) | `11679377 / 123` | [`0x017761…23235e`](https://creditcoin-testnet.blockscout.com/tx/0x017761e9ec88aafef479602df821c4103067888b4c8aecf1e0c56ff11123235e) |
| Evaluation certification | [`0x0f9ac5…93dc24`](https://sepolia.etherscan.io/tx/0x0f9ac5d09aaae5b478a53d7952f034f7f82c5240b8bf20aa4f51438fd793dc24) | `11679378 / 31` | [`0x84d695…ad966`](https://creditcoin-testnet.blockscout.com/tx/0x84d695c21f8580fdab3526f5ca3c168038ac38ea5b64642ee11858f0f79ad966) |
| Deployment approval | [`0x9a1b35…b80f8`](https://sepolia.etherscan.io/tx/0x9a1b353e590594780622ec00b1d1612ab5460b920f4bd0c4458f7cbb100b80f8) | `11679379 / 91` | [`0xf4537c…a430b`](https://creditcoin-testnet.blockscout.com/tx/0xf4537cfce1bc47167cb1fcae9affbd362f83d9fc82ae4814a2d680dc525a430b) |
| Active status | [`0xdfded3…0c5e0`](https://sepolia.etherscan.io/tx/0xdfded33632cdf2387c14af32b45ceab2e728d86b243c15245f157a8437e0c5e0) | `11679380 / 105` | [`0x10b224…b57a4a`](https://creditcoin-testnet.blockscout.com/tx/0x10b224c5013880f2af36575cd198db38d62ae4b00f7a9a1c0ab9f141f3b57a4a) |
| Revocation | [`0xf39304…9c22`](https://sepolia.etherscan.io/tx/0xf3930430a0a97330e97b247ae59d832c7fa3f1ac69ca7e0250da417ff3293c22) | `11679430 / 84` | [`0xd9c292…49c19`](https://creditcoin-testnet.blockscout.com/tx/0xd9c29224b21896f8c01741650b32dfd0ce8f964d660afb7f13366c86ee049c19) |

The imported proof sizes / Creditcoin gas were `2400 B / 470210`,
`2208 B / 391174`, `2272 B / 389550`, `1888 B / 375886`, and
`1824 B / 374094` in the order above.

## Enforcement result

Release digest: `0x51c96ea7c921e0a8ecfc40a90bd1c52f76984edc2dc2f6c8fb264a1c8d50139f`

| Result | Evidence |
| --- | --- |
| Capability issued | `0xca8b620b41d9728368924ec8cb313852c4a42d44b7860c9ea66b2a1280c1ee03`; issue tx [`0x0c09f7…c32ee`](https://creditcoin-testnet.blockscout.com/tx/0x0c09f7dbdbc3e9ac7adeab819b680604f4e972f3053287389ca3342340fc32ee) |
| Allowed payment | [`0x6798db…b962`](https://creditcoin-testnet.blockscout.com/tx/0x6798dbb22508c64084ace27693bf1d40e6663fc39f01dd44f7b83871e3a2b962) |
| Allowed bounded deposit | [`0xe26bc4…b9ba`](https://creditcoin-testnet.blockscout.com/tx/0xe26bc46115bd4a69e8e7c2dfe2c27e66a6f52ea09d065b856e9d200ac245b9ba) |
| Post-revocation action | `LIVE_STEP=blocked` passed; the formerly valid nonce `2` was rejected for proven revocation |

The clean clone also passed `cd contracts && npm run ci`, `cd server && npm test`,
and `cd client && npm run build && npm run lint` after the live sequence.
