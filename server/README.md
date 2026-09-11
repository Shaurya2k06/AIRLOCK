# AIRLOCK local API

The server serves a labelled local fixture when no deployment/RPC is
configured. With `deployments.json` and `CREDITCOIN_RPC_URL`, it reads evidence
and capability state from Creditcoin and returns `dataSource: creditcoin-chain`.
RPC failures are returned as `dataSource: rpc-error`; the client must not treat
that state as a fixture or authorization decision.

The server needs no private key. Set `CREDITCOIN_RPC_URL`; `AIRLOCK_DEPLOYMENTS`
is optional and defaults to `../deployments.json`.

```sh
npm test
npm start
```

The API never accepts a private key. `GET /api/runbook` exposes the complete
terminal workflow and current saved status. `POST /api/runbook/execute` can
run only its allowlisted steps, and write steps are disabled by default; set
`AIRLOCK_ENABLE_WRITES=true` on the server to enable them. The browser still
never sees `contracts/.env`. `AIRLOCK_COMMAND_TIMEOUT_MS` optionally bounds a
command; the default is 15 minutes. Write steps also require the server to be
bound to loopback (`HOST=127.0.0.1`, the default).

Endpoints:

- `GET /health`
- `GET /api/overview`
- `GET /api/runbook`
- `POST /api/runbook/execute` with `{ "step": "preflight" }`
- `POST /api/actions/simulate` with `{ "recipient": "0x4E…91c2", "amount": 24 }`
