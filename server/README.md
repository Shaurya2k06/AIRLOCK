# AIRLOCK local API

The server is a dependency-free local control-plane fixture. It gives the
dashboard a stable API while the live proof worker is configured later.

```sh
npm test
npm start
```

Endpoints:

- `GET /health`
- `GET /api/overview`
- `POST /api/actions/simulate` with `{ "recipient": "0x4E…91c2", "amount": 24 }`
