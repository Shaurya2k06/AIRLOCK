# AIRLOCK local API

The server serves a labelled local fixture when no deployment/RPC is
configured. With `deployments.json` and `CREDITCOIN_RPC_URL`, it reads evidence
and capability state from Creditcoin and returns `dataSource: creditcoin-chain`.
RPC failures are returned as `dataSource: rpc-error`; the client must not treat
that state as a fixture or authorization decision.

```sh
npm test
npm start
```

The API never accepts a private key. It is read-only against the chain; proof
submission and runtime signing remain separate commands under `contracts`.

Endpoints:

- `GET /health`
- `GET /api/overview`
- `POST /api/actions/simulate` with `{ "recipient": "0x4E…91c2", "amount": 24 }`
