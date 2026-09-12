# AIRLOCK console

The Vite app has a landing page at `/` and a live control-plane demo at
`/demo`. It reads the server overview, health, and terminal
runbook endpoints. It never receives wallet keys or RPC credentials.

```sh
npm install
npm run build
npm run lint
```

Copy `.env.example` to `.env` only when the API is not at the default
`https://airlock-control-plane.onrender.com`, then set `VITE_API_URL`. The client
has no wallet, RPC, or private-key configuration. The server exposes write
runbook actions only when `AIRLOCK_ENABLE_WRITES=true` is set in its
environment; hosted writes additionally require its operator token.
