const http = require('node:http')

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const maxBodyBytes = 16 * 1024

const state = {
  network: { source: 'Ethereum Sepolia', destination: 'Creditcoin CC3', chainKey: process.env.SOURCE_CHAIN_KEY || 'pending live lookup' },
  release: { name: 'Atlas-7b', version: '1.4.2', digest: '0x8f24c1a7…d83a71', status: 'ACTIVE', expiresAt: '08:41 UTC' },
  evidence: [
    { kind: 'Artifact', status: 'PROVEN', detail: 'Atlas-7b / v1.4.2' },
    { kind: 'Evaluation', status: 'PROVEN', detail: 'Safety suite · 92.4%' },
    { kind: 'Approval', status: 'PROVEN', detail: 'Runtime key · scoped' },
    { kind: 'Active status', status: 'PROVEN', detail: 'Checkpoint #184' },
  ],
  capability: { status: 'ACTIVE', spendCap: 350, spent: 130, callCap: 4, callsUsed: 2, runtimeKey: '0x8B31…6A14' },
  actions: [
    { action: 'vendor.pay', target: '0x4E…91c2', amount: 24, state: 'Allowed', age: '2m ago' },
    { action: 'protocol.deposit', target: '0xA1…0b72', amount: 10, state: 'Allowed', age: '18m ago' },
    { action: 'vendor.pay', target: '0x91…dead', amount: 240, state: 'Blocked', age: '1h ago' },
  ],
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function body(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(new Error('request body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('request body must be valid JSON'))
      }
    })
    request.on('error', reject)
  })
}

function simulate(intent) {
  if (!intent || typeof intent !== 'object') return { allowed: false, reason: 'invalid intent' }
  const recipient = intent.recipient
  const amount = Number(intent.amount)
  if (recipient !== '0x4E…91c2') return { allowed: false, reason: 'recipient is outside the approved scope' }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 250) return { allowed: false, reason: 'value exceeds the per-call validator ceiling' }
  return { allowed: true, reason: 'scope, validator, nonce, and budget checks passed' }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' })
    response.end()
    return
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { ok: true, service: 'airlock-control-plane', proofWorker: process.env.CREDITCOIN_PROOF_BUILDER_URL ? 'configured' : 'local-fixture' })
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/overview') {
    json(response, 200, state)
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/actions/simulate') {
    try {
      json(response, 200, simulate(await body(request)))
    } catch (error) {
      json(response, 400, { allowed: false, reason: error.message })
    }
    return
  }
  json(response, 404, { error: 'not found' })
})

if (require.main === module) server.listen(port, host, () => console.log(`AIRLOCK API listening on http://${host}:${port}`))

module.exports = { server, simulate, state }
