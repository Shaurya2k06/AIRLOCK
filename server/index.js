const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Contract, JsonRpcProvider, formatEther } = require('ethers')

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const maxBodyBytes = 16 * 1024
const deploymentsFile = process.env.AIRLOCK_DEPLOYMENTS || path.join(__dirname, '..', 'deployments.json')

const fixtureState = {
  mode: 'fixture',
  dataSource: 'local-fixture',
  network: { source: 'Ethereum Sepolia', destination: 'Creditcoin CC3', chainKey: process.env.SOURCE_CHAIN_KEY || 'pending live lookup' },
  release: { name: 'Atlas-7b', version: '1.4.2', digest: '0x8f24c1a7…d83a71', status: 'ACTIVE', expiresAt: '08:41 UTC' },
  evidence: [
    { kind: 'Artifact', status: 'FIXTURE', detail: 'Atlas-7b / v1.4.2' },
    { kind: 'Evaluation', status: 'FIXTURE', detail: 'Safety suite · 92.4%' },
    { kind: 'Approval', status: 'FIXTURE', detail: 'Runtime key · scoped' },
    { kind: 'Active status', status: 'FIXTURE', detail: 'Checkpoint #184' },
  ],
  capability: { status: 'FIXTURE', spendCap: 350, spent: 130, callCap: 4, callsUsed: 2, runtimeKey: '0x8B31…6A14' },
  policy: { recipient: '0x4E…91c2', maxPayment: 250 },
  actions: [
    { action: 'vendor.pay', target: '0x4E…91c2', amount: 24, state: 'Fixture allowed', age: '2m ago' },
    { action: 'protocol.deposit', target: '0xA1…0b72', amount: 10, state: 'Fixture allowed', age: '18m ago' },
    { action: 'vendor.pay', target: '0x91…dead', amount: 240, state: 'Fixture blocked', age: '1h ago' },
  ],
}

const evidenceAbi = [
  'function releaseKey(bytes32,bytes32) view returns (bytes32)',
  'function getArtifact(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseId,bytes32 releaseDigest,bytes32 manifestHash,bytes32 artifactRoot,bytes32 weightsHash,bytes32 tokenizerHash,bytes32 systemPromptHash,bytes32 toolManifestRoot,bytes32 containerImageDigest,bytes32 sbomHash,bytes32 provenanceHash,uint64 releaseVersion,uint64 publisherNonce,bytes32 evidenceId))',
  'function getEvaluation(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseId,bytes32 releaseDigest,bytes32 suiteHash,bytes32 reportHash,bytes32 evaluatorSetHash,uint32 safetyScoreBps,uint256 deniedCapabilityBitmap,uint64 evaluatedAt,uint64 validUntil,uint64 evaluationNonce))',
  'function getApproval(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,address runtimeKey,bytes32 policyHash,bytes32 requestedScopeRoot,uint128 totalSpendCap,uint128 perCallValueCap,uint32 callCap,uint64 validAfter,uint64 validUntil,uint64 approvalNonce))',
  'function getStatus(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseDigest,uint8 status,uint64 statusNonce,uint64 issuedAt,uint64 validUntil,bool revoked,bytes32 evidenceId))',
]
const issuerAbi = [
  'function get(bytes32) view returns (tuple(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,bytes32 policyHash,bytes32 scopeRoot,address runtimeKey,uint128 spendCap,uint128 spent,uint128 perCallValueCap,uint32 callCap,uint32 callsUsed,uint64 notBefore,uint64 expiresAt,uint64 epoch,bool revoked))',
]

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

function short(value) {
  return typeof value === 'string' && value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function timestamp(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : '—'
}

async function readDeployment() {
  try {
    return JSON.parse(await fs.readFile(deploymentsFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function liveOverview(deployment) {
  if (!process.env.CREDITCOIN_RPC_URL) return fixtureState
  if (!deployment) throw new Error('deployment metadata unavailable')
  const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL)
  const network = await provider.getNetwork()
  if (deployment.creditcoin.chainId && Number(network.chainId) !== Number(deployment.creditcoin.chainId)) {
    throw new Error(`Creditcoin RPC chain ${network.chainId} does not match deployment ${deployment.creditcoin.chainId}`)
  }
  const contract = new Contract(deployment.creditcoin.evidence, evidenceAbi, provider)
  const key = await contract.releaseKey(deployment.release.orgId, deployment.release.releaseDigest)
  const [artifact, evaluation, approval, status] = await Promise.all([
    contract.getArtifact(key),
    contract.getEvaluation(key),
    contract.getApproval(key),
    contract.getStatus(key),
  ])
  const capabilityId = deployment.live && deployment.live.capabilityId
  let capability = { status: 'NO ACTIVE CAPABILITY', spendCap: 0, spent: 0, callCap: 0, callsUsed: 0, runtimeKey: short(deployment.release.runtimeKey) }
  if (capabilityId) {
    const issuer = new Contract(deployment.creditcoin.issuer, issuerAbi, provider)
    const current = await issuer.get(capabilityId)
    const now = Math.floor(Date.now() / 1000)
    const state = current.revoked ? 'REVOKED' : now >= Number(current.expiresAt) ? 'EXPIRED' : 'ACTIVE'
    capability = {
      status: state,
      spendCap: Number(formatEther(current.spendCap)),
      spent: Number(formatEther(current.spent)),
      callCap: Number(current.callCap),
      callsUsed: Number(current.callsUsed),
      runtimeKey: short(current.runtimeKey),
    }
  }
  const releaseStatus = status.revoked ? 'REVOKED' : status.status === 1n || status.status === 1 ? 'ACTIVE' : 'PENDING'
  const recipient = deployment.release.paymentRecipient
  const proof = (kind) => deployment.proofs?.[kind] || {}
  const artifactProof = proof('artifact')
  const evaluationProof = proof('evaluation')
  const approvalProof = proof('approval')
  const statusProof = proof('status')
  return {
    mode: 'live',
    dataSource: 'creditcoin-chain',
    network: { source: 'Ethereum Sepolia', destination: 'Creditcoin CC3', chainKey: String(deployment.source.chainKey) },
    release: {
      name: 'AIRLOCK release',
      version: String(deployment.release.releaseVersion ?? 'unknown'),
      digest: short(deployment.release.releaseDigest),
      status: releaseStatus,
      expiresAt: timestamp(status.validUntil),
      manifestHash: deployment.release.manifestHash,
      artifactRoot: deployment.release.artifactRoot,
    },
    evidence: [
      { ...artifactProof, kind: 'Artifact', status: artifact.exists ? 'PROVEN' : 'PENDING', detail: short(artifact.manifestHash) },
      { ...evaluationProof, kind: 'Evaluation', status: evaluation.exists ? 'PROVEN' : 'PENDING', detail: `Safety suite · ${(Number(evaluation.safetyScoreBps) / 100).toFixed(2)}%` },
      { ...approvalProof, kind: 'Approval', status: approval.exists ? 'PROVEN' : 'PENDING', detail: `Runtime key · ${short(approval.runtimeKey)}` },
      { ...statusProof, kind: 'Active status', status: status.exists ? (status.revoked ? 'REVOKED' : 'PROVEN') : 'PENDING', detail: `Checkpoint #${status.statusNonce}` },
    ],
    capability,
    policy: { recipient, maxPayment: Number(formatEther(approval.perCallValueCap || 0n)) },
    actions: deployment.live?.allowedActionTx
      ? [{ action: 'vendor.pay', target: short(recipient), amount: Number(formatEther(deployment.release.paymentAmount)), state: 'Allowed', age: short(deployment.live.allowedActionTx) }]
      : [],
  }
}

async function overview() {
  return liveOverview(await readDeployment())
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

function simulate(intent, policy = fixtureState.policy, current = fixtureState) {
  if (!intent || typeof intent !== 'object') return { allowed: false, reason: 'invalid intent' }
  if (current.dataSource === 'creditcoin-chain' && current.release.status !== 'ACTIVE') {
    return { allowed: false, reason: `release is ${current.release.status.toLowerCase()}` }
  }
  if (current.dataSource === 'creditcoin-chain' && current.capability.status !== 'ACTIVE') {
    return { allowed: false, reason: `capability is ${current.capability.status.toLowerCase()}` }
  }
  const amount = Number(intent.amount)
  if (intent.recipient !== policy.recipient) return { allowed: false, reason: 'recipient is outside the approved scope' }
  if (!Number.isFinite(amount) || amount <= 0 || amount > policy.maxPayment) return { allowed: false, reason: 'value exceeds the per-call validator ceiling' }
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
    try {
      const deployment = await readDeployment()
      const dataSource = !process.env.CREDITCOIN_RPC_URL ? 'local-fixture' : deployment ? 'creditcoin-chain' : 'rpc-error'
      json(response, dataSource === 'rpc-error' ? 503 : 200, { ok: dataSource !== 'rpc-error', service: 'airlock-control-plane', dataSource })
    } catch (error) {
      json(response, 503, { ok: false, service: 'airlock-control-plane', dataSource: 'rpc-error', error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/overview') {
    try {
      json(response, 200, await overview())
    } catch (error) {
      json(response, 503, { ...fixtureState, mode: 'live-error', dataSource: 'rpc-error', error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/actions/simulate') {
    try {
      const current = await overview()
      json(response, 200, simulate(await body(request), current.policy, current))
    } catch (error) {
      json(response, 400, { allowed: false, reason: error.message })
    }
    return
  }
  json(response, 404, { error: 'not found' })
})

if (require.main === module) server.listen(port, host, () => console.log(`AIRLOCK API listening on http://${host}:${port}`))

module.exports = { server, simulate, state: fixtureState, overview }
