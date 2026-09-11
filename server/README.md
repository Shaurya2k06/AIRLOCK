# AIRLOCK local API

The server is chain-backed only. With `deployments.json` and
`CREDITCOIN_RPC_URL`, it reads evidence and capability state from Creditcoin.
Missing configuration or RPC failures are returned as non-healthy states; the
client must not treat them as authorization decisions.

The server needs no private key. Copy `.env.example` to `.env` and set
`CREDITCOIN_RPC_URL`; `AIRLOCK_DEPLOYMENTS` is optional and defaults to
`../deployments.json`.

```sh
npm test
npm start
```

The API never accepts a private key. `GET /api/runbook` exposes the complete
terminal workflow and current saved status. `POST /api/runbook/execute` can
run only its allowlisted steps, and write steps are disabled by default; set
`AIRLOCK_ENABLE_WRITES=true` on the server to enable them. On a hosted server,
also set `AIRLOCK_WRITE_TOKEN`; the browser sends that operator token as a
Bearer token after the operator confirms a real testnet transaction. The
browser never sees `contracts/.env`. `AIRLOCK_COMMAND_TIMEOUT_MS` optionally
bounds a command; the default is 15 minutes. Write steps require an allowed
browser origin. `AIRLOCK_CLIENT_ORIGIN` overrides the default Vite origins
(`http://127.0.0.1:5173,http://localhost:5173`).

Endpoints:

- `GET /health`
- `GET /api/overview`
- `GET /api/runbook`
- `POST /api/runbook/execute` with `{ "step": "preflight" }`
- `GET /api/protocol`
- `GET /api/trace`
- `GET /api/runtime-assurance`
- `POST /api/credentials/issue` (operator-authenticated, active live capability required)
- `POST /api/credentials/delegate` (operator-authenticated, on-chain parent/child registration)
- `POST /api/evaluations/quorum`
- `GET /api/identity`
- `POST /mcp` (JSON-RPC `initialize`, `tools/list`, `tools/call`, `ping`)
- `POST /a2a` and `GET /.well-known/agent-card.json`
- `GET|POST /x402/protected`

Protocol details, credential fields, and configuration gates are in
[`../docs/protocol.md`](../docs/protocol.md). Hosted client action buttons use
the live runbook and router path.
