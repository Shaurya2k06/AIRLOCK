# AIRLOCK console

The Vite app is the local evidence and capability console. It is intentionally
dependency-free beyond React and uses fixture data until the indexer API is
connected to a deployed Creditcoin instance.

```sh
npm install
npm run build
npm run lint
```

Set `VITE_API_URL` when the API is not at `http://127.0.0.1:8787`. The client
has no wallet, RPC, or private-key configuration.
