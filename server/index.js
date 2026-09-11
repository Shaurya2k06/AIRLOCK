const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawn } = require('node:child_process')
const { Contract, JsonRpcProvider, Wallet, formatEther, keccak256, toUtf8Bytes } = require('ethers')
const {
  ZERO_BYTES32,
  canonical,
  domain: credentialDomain,
  extractCredential,
  signCredential,
  verifySignature,
  credentialId,
  normalizeCredential,
  attenuateCredential,
} = require('./credential')
const { createMcpGateway, toolDefinitions, jsonRpcError, validateArguments } = require('./mcp-gateway')
const { agentCard, handleTask } = require('./a2a')
const { parsePaymentHeader, validatePayment, paymentRequired, settlePayment } = require('./x402')
const { readIdentity } = require('./erc8004')
const { verifyQuorum } = require('./evaluator-quorum')
const { buildTraceGraph } = require('./trace')
const { runtimeAssurance } = require('./runtime-assurance')

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const maxBodyBytes = 16 * 1024
const deploymentsFile = process.env.AIRLOCK_DEPLOYMENTS || path.join(__dirname, '..', 'deployments.json')
const contractsDir = path.join(__dirname, '..', 'contracts')
const commandTimeoutMs = Number(process.env.AIRLOCK_COMMAND_TIMEOUT_MS || 15 * 60 * 1000)
const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`
const writeOrigins = new Set((process.env.AIRLOCK_CLIENT_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean))
let activeRunbookJob = false
const credentialIssuerKey = () => process.env.AIRLOCK_CREDENTIAL_ISSUER_PRIVATE_KEY?.trim() || process.env.CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY?.trim()

const evidenceAbi = [
  'function releaseKey(bytes32,bytes32) view returns (bytes32)',
  'function getArtifact(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseId,bytes32 releaseDigest,bytes32 manifestHash,bytes32 artifactRoot,bytes32 weightsHash,bytes32 tokenizerHash,bytes32 systemPromptHash,bytes32 toolManifestRoot,bytes32 containerImageDigest,bytes32 sbomHash,bytes32 provenanceHash,uint64 releaseVersion,uint64 publisherNonce,bytes32 evidenceId))',
  'function getEvaluation(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseId,bytes32 releaseDigest,bytes32 suiteHash,bytes32 reportHash,bytes32 evaluatorSetHash,uint32 safetyScoreBps,uint256 deniedCapabilityBitmap,uint64 evaluatedAt,uint64 validUntil,uint64 evaluationNonce))',
  'function getApproval(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,address runtimeKey,bytes32 policyHash,bytes32 requestedScopeRoot,uint128 totalSpendCap,uint128 perCallValueCap,uint32 callCap,uint64 validAfter,uint64 validUntil,uint64 approvalNonce))',
  'function getStatus(bytes32) view returns (tuple(bool exists,bytes32 orgId,bytes32 releaseDigest,uint8 status,uint64 statusNonce,uint64 issuedAt,uint64 validUntil,bool revoked,bytes32 reasonHash,bytes32 evidenceId))',
]
const issuerAbi = [
  'function get(bytes32) view returns (tuple(bytes32 orgId,bytes32 agentId,bytes32 releaseDigest,bytes32 policyHash,bytes32 scopeRoot,address runtimeKey,uint128 spendCap,uint128 spent,uint128 perCallValueCap,uint32 callCap,uint32 callsUsed,uint64 notBefore,uint64 expiresAt,uint64 epoch,bool revoked))',
]
const policyAbi = [
  'function get(bytes32) view returns (tuple(bool exists,bool paused,bytes32 approvedSuiteHash,bytes32 approvedEvaluatorSetHash,bytes32 allowedToolScopeRoot,uint32 minSafetyScoreBps,uint256 deniedCapabilityBitmap,uint128 spendCeiling,uint128 perCallCeiling,uint32 callCeiling,uint64 capabilityTtl,uint64 statusFreshness,bool teeRequired))',
]
const delegationAbi = [
  'function isActive(bytes32) view returns (bool)',
  'function get(bytes32) view returns (tuple(bool exists,bool revoked,bytes32 childCapabilityId,bytes32 parentCapabilityId,bytes32 childAgentId,bytes32 scopeRoot,address runtimeKey,uint128 budget,uint128 spent,uint32 maxCalls,uint32 callsUsed,uint64 validAfter,uint64 validUntil,uint8 depth,bytes32 taskId))',
  'function allowsScope(bytes32 childCapabilityId,bytes32 scopeLeaf) view returns (bool)',
  'function register(bytes32 childCapabilityId,bytes32 parentCapabilityId,bytes32 childAgentId,bytes32 scopeRoot,address runtimeKey,uint128 budget,uint32 maxCalls,uint64 validAfter,uint64 validUntil,uint8 depth,bytes32 taskId,bytes32[] scopeLeaves,bytes32[][] scopeProofs)',
]

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function short(value) {
  return typeof value === 'string' && value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function baseUrl(request) {
  const configured = process.env.AIRLOCK_PUBLIC_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const origin = request?.headers?.origin?.trim()
  if (origin) return origin.replace(/\/$/, '')
  return `http://${request?.headers?.host || `${host}:${port}`}`
}

function credentialAudience(request) {
  return process.env.AIRLOCK_MCP_AUDIENCE?.trim() || `${baseUrl(request)}/mcp`
}

function credentialEvidenceRoot(deployment) {
  const proven = Object.entries(deployment?.proofs || {}).map(([kind, value]) => ({
    kind,
    sourceTxHash: value?.txHash || '',
    creditcoinTxHash: value?.creditcoinTxHash || '',
  })).sort((left, right) => left.kind.localeCompare(right.kind))
  return keccak256(toUtf8Bytes(canonical(proven)))
}

function timestampSeconds(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
}

function credentialFailure(reason, status = 401) {
  const error = new Error(reason)
  error.statusCode = status
  return error
}

async function issueCredential(request, deployment, current) {
  if (!deployment || current.dataSource !== 'creditcoin-chain') throw credentialFailure('live chain state is required', 503)
  if (current.release.status !== 'ACTIVE' || current.capability.status !== 'ACTIVE' || !deployment.live?.capabilityId) {
    throw credentialFailure('an active release capability is required', 409)
  }
  const privateKey = credentialIssuerKey()
  if (!privateKey) throw credentialFailure('credential issuer key is not configured', 503)
  const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL)
  const signer = new Wallet(privateKey, provider)
  const issuer = await signer.getAddress()
  const chainId = Number(deployment.creditcoin.chainId)
  const verifier = deployment.creditcoin.router
  const now = Math.floor(Date.now() / 1000)
  const capExpiry = timestampSeconds(current.capability.expiresAt)
  const ttl = Math.max(60, Number(process.env.AIRLOCK_CREDENTIAL_TTL_SECONDS || 300))
  const issuerContract = new Contract(deployment.creditcoin.issuer, issuerAbi, provider)
  const onChainCapability = await issuerContract.get(deployment.live.capabilityId)
  const credential = normalizeCredential({
    schema: 'AIRLOCK_CREDENTIAL_V1',
    issuer,
    organizationId: deployment.release.orgId,
    agentRegistry: process.env.AIRLOCK_AGENT_REGISTRY?.trim() || deployment.release.agentRegistry || 'airlock:unregistered',
    agentId: deployment.release.agentId,
    releaseDigest: deployment.release.releaseDigest,
    capabilityId: deployment.live.capabilityId,
    parentCapabilityId: ZERO_BYTES32,
    parentCredentialId: ZERO_BYTES32,
    scopeRoot: deployment.release.scopeRoot,
    budget: (onChainCapability.spendCap - onChainCapability.spent).toString(),
    maxCalls: Math.max(0, Number(onChainCapability.callCap) - Number(onChainCapability.callsUsed)),
    notBefore: Math.max(0, now - 5),
    expiresAt: Math.min(now + ttl, capExpiry || now + ttl),
    targetChainId: chainId,
    audience: credentialAudience(request),
    evidenceRoot: credentialEvidenceRoot(deployment),
    policyHash: deployment.release.policyHash,
    traceRoot: keccak256(toUtf8Bytes(`AIRLOCK_TRACE:${deployment.live.capabilityId}`)),
    allowedTools: Object.keys(toolDefinitions),
    delegationDepth: 0,
    maxDelegationDepth: Number(process.env.AIRLOCK_MAX_DELEGATION_DEPTH || 3),
    riskLevel: 0,
    delegationLimit: Number(process.env.AIRLOCK_DELEGATION_RISK_LIMIT || 1),
    runtimeKey: deployment.release.runtimeKey,
  })
  return signCredential(credential, signer, credentialDomain({ chainId, verifyingContract: verifier }))
}

async function verifyCredentialBundle(bundle, request, deployment, current) {
  if (!bundle || !deployment || current.dataSource !== 'creditcoin-chain') return null
  const chainId = Number(deployment.creditcoin.chainId)
  const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL)
  const signature = await verifySignature(bundle, credentialDomain({ chainId, verifyingContract: deployment.creditcoin.router }), provider)
  if (!signature.ok) throw credentialFailure(signature.reason)
  const credential = normalizeCredential(bundle.credential)
  const configuredIssuer = credentialIssuerKey()
  let derivedIssuer = null
  if (configuredIssuer) {
    try { derivedIssuer = new Wallet(configuredIssuer).address } catch { derivedIssuer = null }
  }
  const trusted = new Set([
    deployment.creditcoin.roles?.policyAdmin,
    process.env.AIRLOCK_CREDENTIAL_ISSUER_ADDRESS,
    derivedIssuer,
  ].filter(Boolean).map((value) => value.toLowerCase()))
  if (!trusted.has(credential.issuer.toLowerCase())) throw credentialFailure('credential issuer is not trusted')
  if (credential.audience !== credentialAudience(request)) throw credentialFailure('credential audience does not match this MCP resource')
  if (credential.targetChainId !== String(chainId)) throw credentialFailure('credential target chain does not match Creditcoin')
  if (credential.organizationId.toLowerCase() !== deployment.release.orgId.toLowerCase()) throw credentialFailure('credential organization mismatch')
  if (credential.releaseDigest.toLowerCase() !== deployment.release.releaseDigest.toLowerCase()) throw credentialFailure('credential release mismatch')
  if (credential.policyHash.toLowerCase() !== deployment.release.policyHash.toLowerCase()) throw credentialFailure('credential policy mismatch')
  if (credential.scopeRoot.toLowerCase() !== deployment.release.scopeRoot.toLowerCase()) throw credentialFailure('credential scope mismatch')
  if (current.release.status !== 'ACTIVE' || current.capability.status !== 'ACTIVE') throw credentialFailure('release or capability is not active', 403)
  const delegated = credential.parentCapabilityId.toLowerCase() !== ZERO_BYTES32
  if (!delegated) {
    if (credential.capabilityId.toLowerCase() !== deployment.live?.capabilityId?.toLowerCase()) throw credentialFailure('credential capability mismatch')
    if (credential.agentId.toLowerCase() !== deployment.release.agentId.toLowerCase()) throw credentialFailure('credential agent mismatch')
    if (credential.runtimeKey.toLowerCase() !== deployment.release.runtimeKey.toLowerCase()) throw credentialFailure('credential runtime mismatch')
  } else {
    if (!deployment.creditcoin.delegationRegistry) throw credentialFailure('delegation registry is not configured', 503)
    const registry = new Contract(deployment.creditcoin.delegationRegistry, delegationAbi, provider)
    const [active, state] = await Promise.all([
      registry.isActive(credential.capabilityId),
      registry.get(credential.capabilityId),
    ])
    if (!active || !state.exists || state.revoked) throw credentialFailure('delegated capability is not active', 403)
    if (state.childCapabilityId.toLowerCase() !== credential.capabilityId.toLowerCase()) throw credentialFailure('delegated capability id mismatch')
    if (state.parentCapabilityId.toLowerCase() !== credential.parentCapabilityId.toLowerCase()) throw credentialFailure('delegated parent mismatch')
    if (state.childAgentId.toLowerCase() !== credential.agentId.toLowerCase()) throw credentialFailure('delegated agent mismatch')
    if (state.scopeRoot.toLowerCase() !== credential.scopeRoot.toLowerCase() || state.runtimeKey.toLowerCase() !== credential.runtimeKey.toLowerCase()) throw credentialFailure('delegated scope or runtime mismatch')
    if (BigInt(credential.budget) > BigInt(state.budget) || Number(credential.maxCalls) > Number(state.maxCalls)) throw credentialFailure('delegated budget exceeds on-chain delegation')
    if (BigInt(credential.notBefore) < BigInt(state.validAfter) || BigInt(credential.expiresAt) > BigInt(state.validUntil) || Number(credential.delegationDepth) !== Number(state.depth)) throw credentialFailure('delegated validity exceeds on-chain delegation')
    const scope = scopeForTools(deployment, credential.allowedTools)
    const scopeAllowed = await Promise.all(scope.leaves.map((leaf) => registry.allowsScope(credential.capabilityId, leaf)))
    if (scopeAllowed.some((allowed) => !allowed)) throw credentialFailure('delegated tool scope exceeds on-chain delegation')
  }
  const now = Math.floor(Date.now() / 1000)
  if (now < Number(credential.notBefore) || now >= Number(credential.expiresAt)) throw credentialFailure('credential is outside its validity window', 401)
  const computedCredentialId = credentialId(credential)
  if (bundle.credentialId && (typeof bundle.credentialId !== 'string' || bundle.credentialId.toLowerCase() !== computedCredentialId.toLowerCase())) throw credentialFailure('credential id does not match its contents')
  return { ...bundle, credential, credentialId: computedCredentialId, digest: signature.digest }
}

async function verifyRequestCredential(request, deployment, current) {
  const bundle = extractCredential(request.headers)
  return verifyCredentialBundle(bundle, request, deployment, current)
}

function delegationTaskId(value) {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase()
  return keccak256(toUtf8Bytes(String(value || `AIRLOCK_TASK:${Date.now()}:${randomBytes(8).toString('hex')}`)))
}

function scopeForTools(deployment, tools) {
  const leaves = []
  const proofs = []
  for (const tool of tools || []) {
    const leaf = tool === 'vendor.pay' ? deployment.release.paymentLeaf : tool === 'protocol.deposit' ? deployment.release.depositLeaf : null
    if (!leaf) throw credentialFailure(`tool scope is not registered: ${tool}`)
    const sibling = tool === 'vendor.pay' ? deployment.release.depositLeaf : deployment.release.paymentLeaf
    if (!sibling) throw credentialFailure('deployment scope proofs are unavailable', 503)
    leaves.push(leaf)
    proofs.push([sibling])
  }
  if (!leaves.length) throw credentialFailure('delegated credential must retain at least one tool')
  return { leaves, proofs }
}

async function issueDelegatedCredential(request, deployment, current, payload) {
  if (!deployment?.creditcoin?.delegationRegistry) throw credentialFailure('delegation registry is not configured', 503)
  const parentBundle = payload?.parent
  const parent = await verifyCredentialBundle(parentBundle, request, deployment, current)
  if (!parent) throw credentialFailure('parent credential is required')
  const privateKey = credentialIssuerKey()
  const policyKey = process.env.CREDITCOIN_POLICY_ADMIN_PRIVATE_KEY?.trim() || privateKey
  if (!privateKey || !policyKey) throw credentialFailure('credential issuer and delegation signer keys are not configured', 503)
  const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL)
  const issuer = new Wallet(privateKey, provider)
  if (issuer.address.toLowerCase() !== parent.credential.issuer.toLowerCase()) throw credentialFailure('parent credential issuer is not this deployment issuer')
  const child = attenuateCredential(parent.credential, {
    capabilityId: payload.capabilityId || keccak256(randomBytes(32)),
    agentId: payload.agentId || parent.credential.agentId,
    runtimeKey: payload.runtimeKey || parent.credential.runtimeKey,
    budget: payload.budget ?? parent.credential.budget,
    maxCalls: payload.maxCalls ?? parent.credential.maxCalls,
    notBefore: payload.notBefore ?? parent.credential.notBefore,
    expiresAt: payload.expiresAt ?? parent.credential.expiresAt,
    allowedTools: payload.allowedTools ?? parent.credential.allowedTools,
    riskLevel: payload.riskLevel ?? parent.credential.riskLevel,
    maxDelegationDepth: payload.maxDelegationDepth ?? parent.credential.maxDelegationDepth,
    delegationLimit: payload.delegationLimit ?? parent.credential.delegationLimit,
  })
  if (BigInt(child.budget) > (1n << 128n) - 1n) throw credentialFailure('delegated budget exceeds on-chain uint128', 400)
  const signer = new Wallet(policyKey, provider)
  const registry = new Contract(deployment.creditcoin.delegationRegistry, delegationAbi, signer)
  const taskId = delegationTaskId(payload.taskId)
  const scope = scopeForTools(deployment, child.allowedTools)
  const transaction = await registry.register(
    child.capabilityId,
    child.parentCapabilityId,
    child.agentId,
    child.scopeRoot,
    child.runtimeKey,
    BigInt(child.budget),
    Number(child.maxCalls),
    BigInt(child.notBefore),
    BigInt(child.expiresAt),
    Number(child.delegationDepth),
    taskId,
    scope.leaves,
    scope.proofs,
  )
  await transaction.wait()
  const signed = await signCredential(child, issuer, credentialDomain({ chainId: Number(deployment.creditcoin.chainId), verifyingContract: deployment.creditcoin.router }))
  const next = {
    ...(deployment.delegations ? { delegations: deployment.delegations } : {}),
  }
  next.delegations = [...(deployment.delegations || []), {
    childCapabilityId: child.capabilityId,
    parentCapabilityId: child.parentCapabilityId,
    scopeLeaves: scope.leaves,
    taskId,
    txHash: transaction.hash,
  }]
  await fs.writeFile(deploymentsFile, `${JSON.stringify({ ...deployment, ...next }, null, 2)}\n`)
  return { ...signed, delegation: { childCapabilityId: child.capabilityId, parentCapabilityId: child.parentCapabilityId, txHash: transaction.hash } }
}

function timestamp(value) {
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return '—'
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString()
}

function statusFreshness(statusIssuedAt, statusValidUntil, maxAgeSeconds, active, nowSeconds = Math.floor(Date.now() / 1000)) {
  const ageSeconds = Math.max(0, nowSeconds - Number(statusIssuedAt))
  return {
    maxAgeSeconds: Number(maxAgeSeconds),
    ageSeconds,
    remainingSeconds: active ? Math.max(0, Number(maxAgeSeconds) - ageSeconds) : 0,
    statusIssuedAt: timestamp(statusIssuedAt),
    statusValidUntil: timestamp(statusValidUntil),
  }
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
  if (!process.env.CREDITCOIN_RPC_URL) throw new Error('CREDITCOIN_RPC_URL is required for live state')
  if (!deployment) throw new Error('deployment metadata unavailable')
  const provider = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL)
  const network = await provider.getNetwork()
  if (deployment.creditcoin.chainId && Number(network.chainId) !== Number(deployment.creditcoin.chainId)) {
    throw new Error(`Creditcoin RPC chain ${network.chainId} does not match deployment ${deployment.creditcoin.chainId}`)
  }
  const contract = new Contract(deployment.creditcoin.evidence, evidenceAbi, provider)
  const key = await contract.releaseKey(deployment.release.orgId, deployment.release.releaseDigest)
  const policies = new Contract(deployment.creditcoin.policies, policyAbi, provider)
  const [artifact, evaluation, approval, status] = await Promise.all([
    contract.getArtifact(key),
    contract.getEvaluation(key),
    contract.getApproval(key),
    contract.getStatus(key),
  ])
  const policy = await policies.get(deployment.release.policyHash)
  const capabilityId = deployment.live && deployment.live.capabilityId
  const releaseStatus = status.revoked ? 'REVOKED' : status.status === 1n || status.status === 1 ? 'ACTIVE' : 'PENDING'
  let capability = { id: capabilityId || '', status: 'NO ACTIVE CAPABILITY', spendCap: 0, spent: 0, callCap: 0, callsUsed: 0, runtimeKey: short(deployment.release.runtimeKey), scopeRoot: '—', expiresAt: '—' }
  if (capabilityId) {
    const issuer = new Contract(deployment.creditcoin.issuer, issuerAbi, provider)
    const current = await issuer.get(capabilityId)
    let accounting = current
    let delegatedActive = true
    if (String(current.runtimeKey).toLowerCase() === ZERO_ADDRESS && deployment.creditcoin.delegationRegistry) {
      const delegation = new Contract(deployment.creditcoin.delegationRegistry, delegationAbi, provider)
      accounting = await delegation.get(capabilityId)
      delegatedActive = await delegation.isActive(capabilityId)
    }
    const now = Math.floor(Date.now() / 1000)
    const statusRevoked = status.revoked || status.status === 2n || status.status === 2
    const state = statusRevoked || releaseStatus !== 'ACTIVE' || current.revoked || accounting.revoked || !delegatedActive
      ? 'REVOKED'
      : now >= Number(accounting.expiresAt)
        ? 'EXPIRED'
        : 'ACTIVE'
    capability = {
      id: capabilityId,
      status: state,
      spendCap: Number(formatEther(accounting.spendCap ?? accounting.budget)),
      spent: Number(formatEther(accounting.spent)),
      callCap: Number(accounting.callCap ?? accounting.maxCalls),
      callsUsed: Number(accounting.callsUsed),
      runtimeKey: short(accounting.runtimeKey),
      scopeRoot: short(accounting.scopeRoot),
      expiresAt: timestamp(accounting.expiresAt ?? accounting.validUntil),
    }
  }
  const statusFreshnessSeconds = Number(policy.statusFreshness)
  const recipient = deployment.release.paymentRecipient
  const proof = (kind) => deployment.proofs?.[kind] || {}
  const artifactProof = proof('artifact')
  const evaluationProof = proof('evaluation')
  const approvalProof = proof('approval')
  const statusProof = proof('status')
  const actions = []
  if (deployment.live?.allowedActionTx) {
    const paymentAmount = deployment.live.proposedAmount || deployment.release.paymentAmount
    actions.push({ action: 'vendor.pay', target: short(recipient), amount: Number(formatEther(BigInt(paymentAmount))), state: 'Allowed', age: short(deployment.live.allowedActionTx), txHash: deployment.live.allowedActionTx, traceRoot: deployment.live.traceRoot })
  }
  if (deployment.live?.depositActionTx) {
    actions.push({ action: 'protocol.deposit', target: short(deployment.creditcoin.protocol), amount: Number(formatEther(BigInt(deployment.release.depositAmount || '100000000000000000'))), state: 'Allowed', age: short(deployment.live.depositActionTx), txHash: deployment.live.depositActionTx, traceRoot: deployment.live.depositTraceRoot })
  }
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
      { ...statusProof, kind: 'Active status', status: status.exists ? (status.revoked ? 'REVOKED' : 'PROVEN') : 'PENDING', detail: status.revoked ? `Revoked · ${short(status.reasonHash)}` : `Checkpoint #${status.statusNonce}` },
    ],
    freshness: statusFreshness(status.issuedAt, status.validUntil, statusFreshnessSeconds, releaseStatus === 'ACTIVE'),
    capability,
    policy: {
      recipient,
      maxPayment: Number(formatEther(approval.perCallValueCap || 0n)),
      depositMax: Number(formatEther(BigInt(deployment.release.depositAmount || '100000000000000000'))),
      policyHash: deployment.release.policyHash,
      capabilityTtl: Number(policy.capabilityTtl),
      statusFreshness: Number(policy.statusFreshness),
    },
    actions,
    traceRoot: deployment.live?.traceRoot || deployment.live?.depositTraceRoot || null,
  }
}

async function overview() {
  return liveOverview(await readDeployment())
}

function runbook(deployment) {
  const proofs = deployment?.proofs || {}
  const live = deployment?.live || {}
  const writeAuthRequired = !localHosts.has(host)
  const writesEnabled = Boolean(process.env.CREDITCOIN_RPC_URL)
    && process.env.AIRLOCK_ENABLE_WRITES === 'true'
    && (!writeAuthRequired || Boolean(process.env.AIRLOCK_WRITE_TOKEN?.trim()))
  const complete = (value) => Boolean(value)
  const steps = [
    { id: 'preflight', label: 'Preflight checks', command: 'npm run live:check', kind: 'read-only', status: 'READY', canRun: true },
    { id: 'deploy', label: 'Deploy and seed release', command: 'npm run deploy-live', kind: 'write', status: complete(deployment) ? 'COMPLETE' : 'READY', canRun: writesEnabled },
    ...['artifact', 'evaluation', 'approval', 'status'].map((kind) => ({
      id: `proof-${kind}`,
      label: `Import ${kind} proof`,
      command: `IMPORT_KIND=${kind} npm run import-proof`,
      kind: 'write',
      status: complete(proofs[kind]?.creditcoinTxHash) ? 'COMPLETE' : 'READY',
      canRun: writesEnabled,
      env: { IMPORT_KIND: kind },
    })),
    { id: 'proof-batch', label: 'Import batch proofs', command: 'npm run import-proof:batch', kind: 'write', status: complete(proofs.batch?.creditcoinTxHash) ? 'COMPLETE' : 'READY', canRun: writesEnabled },
    { id: 'tee-binding', label: 'Register TEE runtime binding', command: 'npm run register-tee-binding', kind: 'write', status: complete(deployment?.teeBinding?.creditcoinTxHash) ? 'COMPLETE' : 'READY', canRun: writesEnabled },
    { id: 'execute', label: 'Issue capability and run allowed call', command: 'LIVE_STEP=execute npm run live-step', kind: 'write', status: complete(live.allowedActionTx) ? 'COMPLETE' : 'READY', canRun: writesEnabled, env: { LIVE_STEP: 'execute' } },
    { id: 'deposit', label: 'Run bounded deposit', command: 'LIVE_STEP=deposit npm run live-step', kind: 'write', status: complete(live.depositActionTx) ? 'COMPLETE' : 'READY', canRun: writesEnabled, env: { LIVE_STEP: 'deposit' } },
    { id: 'revoke', label: 'Revoke release', command: 'LIVE_STEP=revoke npm run live-step', kind: 'write', status: complete(deployment?.source?.transactions?.revocationTx) ? 'COMPLETE' : 'READY', canRun: writesEnabled, env: { LIVE_STEP: 'revoke' } },
    { id: 'proof-revocation', label: 'Import revocation proof', command: 'IMPORT_KIND=revocation npm run import-proof', kind: 'write', status: complete(proofs.revocation?.creditcoinTxHash) ? 'COMPLETE' : 'READY', canRun: writesEnabled, env: { IMPORT_KIND: 'revocation' } },
    { id: 'blocked', label: 'Verify blocked post-revocation call', command: 'LIVE_STEP=blocked npm run live-step', kind: 'write', status: complete(live.blockedAction) ? 'COMPLETE' : 'READY', canRun: writesEnabled, env: { LIVE_STEP: 'blocked' } },
  ]
  return {
    mode: deployment && process.env.CREDITCOIN_RPC_URL ? 'live' : 'unavailable',
    writesEnabled,
    writeAuthRequired: writesEnabled && writeAuthRequired,
    steps: steps.map(({ env, ...step }) => ({ ...step, requiresWrite: step.kind === 'write' })),
  }
}

function writeAuthorized(request) {
  if (localHosts.has(host)) return true
  const configuredToken = process.env.AIRLOCK_WRITE_TOKEN?.trim()
  const authorization = request.headers.authorization || ''
  return Boolean(configuredToken && authorization === `Bearer ${configuredToken}`)
}

const runbookCommands = new Map([
  ['preflight', { args: ['run', 'live:check'] }],
  ['deploy', { args: ['run', 'deploy-live'] }],
  ['proof-artifact', { args: ['run', 'import-proof'], env: { IMPORT_KIND: 'artifact' } }],
  ['proof-evaluation', { args: ['run', 'import-proof'], env: { IMPORT_KIND: 'evaluation' } }],
  ['proof-approval', { args: ['run', 'import-proof'], env: { IMPORT_KIND: 'approval' } }],
  ['proof-status', { args: ['run', 'import-proof'], env: { IMPORT_KIND: 'status' } }],
  ['proof-batch', { args: ['run', 'import-proof:batch'] }],
  ['tee-binding', { args: ['run', 'register-tee-binding'] }],
  ['execute', { args: ['run', 'live-step'], env: { LIVE_STEP: 'execute' } }],
  ['deposit', { args: ['run', 'live-step'], env: { LIVE_STEP: 'deposit' } }],
  ['revoke', { args: ['run', 'live-step'], env: { LIVE_STEP: 'revoke' } }],
  ['proof-revocation', { args: ['run', 'import-proof'], env: { IMPORT_KIND: 'revocation' } }],
  ['blocked', { args: ['run', 'live-step'], env: { LIVE_STEP: 'blocked' } }],
])

function executeRunbookStep(stepId, extraEnv = {}) {
  const command = runbookCommands.get(stepId)
  if (!command) return Promise.resolve({ ok: false, code: null, output: 'unknown runbook step' })
  const safeEnv = Object.fromEntries(Object.entries(extraEnv).filter(([name, value]) => ['LIVE_RECIPIENT', 'LIVE_AMOUNT', 'AIRLOCK_TRACE_ROOT', 'LIVE_CAPABILITY_ID', 'LIVE_AGENT_ID'].includes(name) && typeof value === 'string'))
  return new Promise((resolve) => {
    const output = []
    let outputSize = 0
    let timedOut = false
    const append = (chunk) => {
      if (outputSize >= 64 * 1024) return
      const text = chunk.toString()
      output.push(text.slice(0, 64 * 1024 - outputSize))
      outputSize += text.length
    }
    const child = spawn('npm', command.args, {
      cwd: contractsDir,
      env: { ...process.env, ...command.env, ...safeEnv },
      shell: false,
    })
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, Number.isFinite(commandTimeoutMs) && commandTimeoutMs > 0 ? commandTimeoutMs : 15 * 60 * 1000)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, code: null, output: `${output.join('')}\n${error.message}`.trim() })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0 && !timedOut, code, output: `${output.join('')}${timedOut ? '\ncommand timed out' : ''}`.trim() })
    })
  })
}

async function executeProtocolAction(step, args, context = {}) {
  const traceRoot = keccak256(toUtf8Bytes(canonical({
    requestId: context.requestId || '',
    tool: context.tool || step,
    args: args || {},
    credentialId: context.credential?.credentialId || (context.credential ? credentialId(context.credential) : ''),
  })))
  const env = { AIRLOCK_TRACE_ROOT: traceRoot }
  if (context.credential?.capabilityId) env.LIVE_CAPABILITY_ID = context.credential.capabilityId
  if (context.credential?.agentId) env.LIVE_AGENT_ID = context.credential.agentId
  if (step === 'execute') {
    env.LIVE_RECIPIENT = args.recipient
    env.LIVE_AMOUNT = args.amount
  }
  const result = await executeRunbookStep(step, env)
  const current = await overview()
  return {
    ok: result.ok,
    message: result.ok ? `${context.tool || step} allowed through AIRLOCK` : result.output || `${context.tool || step} denied`,
    output: result.output,
    traceRoot,
    overview: current,
  }
}

async function getProtocolCredential(request) {
  const deployment = await readDeployment()
  const current = await overview()
  return { deployment, current, credential: await verifyRequestCredential(request, deployment, current) }
}

const mcpGateway = createMcpGateway({
  getOverview: overview,
  getCredential: async (request) => {
    const { credential } = await getProtocolCredential({ headers: request.headers || {} })
    return credential?.credential || null
  },
  execute: (step, args, context) => executeProtocolAction(step, args, context),
})

async function authorizeProtocolAction(action, credential) {
  const current = await overview()
  const tool = toolDefinitions[action.tool]
  if (!tool) return { decision: 'DENY', reason: 'tool is not registered' }
  if (!(credential.allowedTools || []).includes(action.tool)) return { decision: 'DENY', reason: 'tool is outside the credential scope' }
  const checked = validateArguments(action.tool, action.arguments || {}, current, credential)
  if (!checked.ok) return { decision: 'DENY', reason: checked.reason }
  const amount = Number(action.arguments?.amount || 0)
  if (action.tool === 'vendor.pay' && amount > current.policy.maxPayment / 2 && Number(credential.riskLevel || 0) < 1) {
    return { decision: 'AUTH_REQUIRED', reason: 'payment requires step-up authorization' }
  }
  return { decision: 'ALLOW', step: tool.runbookStep, args: checked.args }
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

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' })
    response.end()
    return
  }
  if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
    const resource = `${baseUrl(request)}/mcp`
    const authorizationServer = process.env.AIRLOCK_AUTHORIZATION_SERVER?.trim()
    json(response, 200, {
      resource,
      authorization_servers: authorizationServer ? [authorizationServer] : [],
      scopes_supported: ['airlock:tools', 'airlock:delegation'],
      bearer_methods_supported: ['header'],
    })
    return
  }
  if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
    try {
      const deployment = await readDeployment()
      json(response, 200, agentCard({
        baseUrl: baseUrl(request),
        agentRegistry: process.env.AIRLOCK_AGENT_REGISTRY || deployment?.release?.agentRegistry || 'airlock:unregistered',
        agentId: deployment?.release?.agentId || ZERO_BYTES32,
        releaseDigest: deployment?.release?.releaseDigest || ZERO_BYTES32,
      }))
    } catch (error) {
      json(response, 503, { error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/protocol') {
    try {
      const deployment = await readDeployment()
      const current = await overview()
      json(response, 200, {
        protocolVersion: 'AIRLOCK_PROTOCOL_V1',
        dataSource: current.dataSource,
        releaseDigest: deployment?.release?.releaseDigest || null,
        mcp: { endpoint: `${baseUrl(request)}/mcp`, protocolVersion: '2026-07-28', tools: Object.keys(toolDefinitions) },
        a2a: { endpoint: `${baseUrl(request)}/a2a`, agentCard: `${baseUrl(request)}/.well-known/agent-card.json` },
        credential: { schema: 'AIRLOCK_CREDENTIAL_V1', audience: credentialAudience(request), eip712: true, erc1271: true, attenuable: true },
        delegation: { endpoint: `${baseUrl(request)}/api/credentials/delegate`, recursive: true, registry: deployment?.creditcoin?.delegationRegistry || null },
        identity: { configured: Boolean(process.env.AIRLOCK_AGENT_REGISTRY && process.env.AIRLOCK_AGENT_ID) },
        releasePassport: { manifest: deployment?.release?.manifestHash || null, artifactRoot: deployment?.release?.artifactRoot || null },
        runtimeAssurance: runtimeAssurance(deployment),
      })
    } catch (error) {
      json(response, 503, { error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/trace') {
    try {
      const deployment = await readDeployment()
      json(response, 200, buildTraceGraph(deployment, await overview()))
    } catch (error) {
      json(response, 503, { error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/runtime-assurance') {
    try {
      json(response, 200, runtimeAssurance(await readDeployment()))
    } catch (error) {
      json(response, 503, { error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/credentials/issue') {
    try {
      if (!writeAuthorized(request)) return json(response, process.env.AIRLOCK_WRITE_TOKEN ? 401 : 503, { ok: false, error: 'operator authorization required' })
      const deployment = await readDeployment()
      const current = await overview()
      json(response, 200, await issueCredential(request, deployment, current))
    } catch (error) {
      json(response, error.statusCode || 400, { ok: false, error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/credentials/delegate') {
    try {
      if (!writeAuthorized(request)) return json(response, process.env.AIRLOCK_WRITE_TOKEN ? 401 : 503, { ok: false, error: 'operator authorization required' })
      const deployment = await readDeployment()
      const current = await overview()
      json(response, 200, await issueDelegatedCredential(request, deployment, current, await body(request)))
    } catch (error) {
      json(response, error.statusCode || 400, { ok: false, error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/evaluations/quorum') {
    try {
      const deployment = await readDeployment()
      const payload = await body(request)
      const approvedEvaluators = (process.env.AIRLOCK_APPROVED_EVALUATORS || '').split(',').map((value) => value.trim()).filter(Boolean)
      if (!deployment || !approvedEvaluators.length) throw credentialFailure('configure AIRLOCK_APPROVED_EVALUATORS before verifying an independent quorum', 503)
      const result = verifyQuorum(payload.attestations, {
        chainId: Number(deployment.source.chainId),
        verifier: deployment.source.statusRegistry,
        releaseDigest: deployment.release.releaseDigest,
        suiteHash: payload.suiteHash,
        approvedEvaluators,
        minQuorum: Number(payload.minQuorum || process.env.AIRLOCK_MIN_EVALUATOR_QUORUM || 2),
        minScoreBps: Number(payload.minScoreBps || 0),
      })
      json(response, 200, { ok: true, evaluatorRoot: result.evaluatorRoot, evaluators: result.verified.map((item) => item.signer) })
    } catch (error) {
      json(response, error.statusCode || 400, { ok: false, error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/identity') {
    try {
      const deployment = await readDeployment()
      const agentRegistry = process.env.AIRLOCK_AGENT_REGISTRY?.trim() || deployment?.release?.agentRegistry
      const agentId = process.env.AIRLOCK_AGENT_ID?.trim() || deployment?.release?.agentId
      if (!agentRegistry || !agentId || !process.env.AIRLOCK_IDENTITY_RPC_URL) {
        json(response, 200, { configured: false, reason: 'set AIRLOCK_AGENT_REGISTRY, AIRLOCK_AGENT_ID, and AIRLOCK_IDENTITY_RPC_URL to enable ERC-8004 verification' })
      } else {
        json(response, 200, { configured: true, ...(await readIdentity({ rpcUrl: process.env.AIRLOCK_IDENTITY_RPC_URL, agentRegistry, agentId, releaseDigest: deployment?.release?.releaseDigest })) })
      }
    } catch (error) {
      json(response, 400, { configured: false, error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/mcp') {
    try {
      const payload = await body(request)
      const result = await mcpGateway(payload, { headers: request.headers })
      if (result === null) {
        response.writeHead(202, { 'cache-control': 'no-store' })
        response.end()
      } else {
        json(response, 200, result)
      }
    } catch (error) {
      const status = error.statusCode || 400
      const headers = status === 401 ? { 'www-authenticate': `Bearer resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource"` } : {}
      json(response, status, { error: error.message }, headers)
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/a2a') {
    try {
      const payload = await body(request)
      const { credential } = await getProtocolCredential(request)
      const result = await handleTask(payload, {
        credential: credential?.credential,
        authorize: authorizeProtocolAction,
        execute: async (action, signedCredential) => {
          const decision = await authorizeProtocolAction(action, signedCredential)
          if (decision.decision !== 'ALLOW') return decision
          return executeProtocolAction(decision.step, decision.args, { credential: signedCredential, tool: action.tool, requestId: payload.id })
        },
      })
      json(response, 200, result)
    } catch (error) {
      const status = error.statusCode || 400
      const headers = status === 401 ? { 'www-authenticate': `Bearer resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource"` } : {}
      json(response, status, { error: error.message }, headers)
    }
    return
  }
  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/x402/protected') {
    try {
      const { deployment, credential } = await getProtocolCredential(request)
      if (!credential) throw credentialFailure('AIRLOCK credential required')
      const requirement = paymentRequired({
        network: `eip155:${deployment.creditcoin.chainId}`,
        payTo: deployment.release.paymentRecipient,
        amount: process.env.AIRLOCK_X402_PRICE?.trim() || formatEther(BigInt(deployment.release.paymentAmount)),
        resource: `${baseUrl(request)}/x402/protected`,
      })
      const header = request.headers['payment-signature']
      if (!header) return json(response, requirement.status, requirement.body, requirement.headers)
      const payment = parsePaymentHeader(header)
      const check = validatePayment(payment, requirement.body.accepts[0])
      if (!check.ok) return json(response, requirement.status, { ...requirement.body, error: check.reason }, requirement.headers)
      const settleUrl = process.env.AIRLOCK_X402_SETTLE_URL?.trim()
      if (!settleUrl) return json(response, 503, { error: 'x402 payment matched but no settlement facilitator is configured' })
      const settlement = await settlePayment(settleUrl, payment, requirement.body.accepts[0], requirement.body.resource)
      json(response, 200, { ok: true, settlement })
    } catch (error) {
      const status = error.statusCode || 401
      const headers = status === 401 ? { 'www-authenticate': `Bearer resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource"` } : {}
      json(response, status, { error: error.message }, headers)
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    try {
      const deployment = await readDeployment()
      const dataSource = !process.env.CREDITCOIN_RPC_URL
        ? 'unconfigured'
        : deployment
          ? 'creditcoin-chain'
          : 'deployment-missing'
      const ok = dataSource === 'creditcoin-chain'
      json(response, ok ? 200 : 503, { ok, service: 'airlock-control-plane', dataSource })
    } catch (error) {
      json(response, 503, { ok: false, service: 'airlock-control-plane', dataSource: 'rpc-error', error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/overview') {
    try {
      json(response, 200, await overview())
    } catch (error) {
      json(response, 503, { mode: 'live-error', dataSource: 'rpc-error', error: error.message })
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/runbook') {
    try {
      json(response, 200, runbook(await readDeployment()))
    } catch (error) {
      json(response, 503, { error: error.message })
    }
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/runbook/execute') {
    try {
      const { step } = await body(request)
      const deployment = await readDeployment()
      const selected = runbook(deployment).steps.find((item) => item.id === step)
      if (!selected) return json(response, 400, { ok: false, error: 'unknown runbook step' })
      if (selected.requiresWrite && process.env.AIRLOCK_ENABLE_WRITES !== 'true') {
        return json(response, 403, { ok: false, error: 'write actions are disabled; set AIRLOCK_ENABLE_WRITES=true on the server' })
      }
      if (selected.requiresWrite && !writeAuthorized(request)) {
        return json(response, process.env.AIRLOCK_WRITE_TOKEN ? 401 : 503, { ok: false, error: process.env.AIRLOCK_WRITE_TOKEN ? 'operator authorization required' : 'remote writes require AIRLOCK_WRITE_TOKEN on the server' })
      }
      if (selected.requiresWrite && request.headers.origin && !writeOrigins.has(request.headers.origin)) {
        return json(response, 403, { ok: false, error: 'write origin is not allowed; set AIRLOCK_CLIENT_ORIGIN on the server' })
      }
      if (activeRunbookJob) return json(response, 409, { ok: false, error: 'another runbook action is already running' })
      activeRunbookJob = true
      const result = await executeRunbookStep(step)
      activeRunbookJob = false
      json(response, result.ok ? 200 : 400, { ...result, runbook: runbook(await readDeployment()) })
    } catch (error) {
      activeRunbookJob = false
      json(response, 400, { ok: false, error: error.message })
    }
    return
  }
  json(response, 404, { error: 'not found' })
})

if (require.main === module) server.listen(port, host, () => console.log(`AIRLOCK API listening on http://${host}:${port}`))

module.exports = { server, overview, runbook, statusFreshness, timestamp }
