# AIRLOCK console

The Vite app has a landing page at `/` and a live control-plane demo at
`/demo`. It reads the server overview, health, simulation, and terminal
runbook endpoints. It never receives wallet keys or RPC credentials.

```sh
npm install
npm run build
npm run lint
```

Set `VITE_API_URL` when the API is not at `http://127.0.0.1:8787`. The client
has no wallet, RPC, or private-key configuration. The server exposes write
runbook actions only when `AIRLOCK_ENABLE_WRITES=true` is set in its own
environment.
