const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Wallet, id } = require('ethers')
const {
  credentialTypes,
  domain,
  normalizeCredential,
  signCredential,
  verifySignature,
  attenuateCredential,
} = require('./credential')
const { createMcpGateway } = require('./mcp-gateway')
const { evaluationDomain, evaluationTypes, verifyQuorum } = require('./evaluator-quorum')

const sample = (issuer, runtimeKey) => normalizeCredential({
  issuer,
  organizationId: id('org'),
  agentRegistry: 'eip155:11155111:0x0000000000000000000000000000000000000001',
  agentId: id('agent'),
  releaseDigest: id('release'),
  capabilityId: id('capability'),
  scopeRoot: id('scope'),
  budget: '1000000000000000000',
  maxCalls: 2,
  notBefore: 1,
  expiresAt: 1000,
  targetChainId: 102031,
  audience: 'https://airlock.test/mcp',
  evidenceRoot: id('evidence'),
  policyHash: id('policy'),
  allowedTools: ['vendor.pay', 'protocol.deposit'],
  maxDelegationDepth: 2,
  delegationLimit: 1,
  runtimeKey,
})

test('AIRLOCK credential signs and verifies as EIP-712', async () => {
  const issuer = Wallet.createRandom()
  const credential = sample(issuer.address, Wallet.createRandom().address)
  const typedDomain = domain({ chainId: 102031, verifyingContract: Wallet.createRandom().address })
  const bundle = await signCredential(credential, issuer, typedDomain)
  const result = await verifySignature(bundle, typedDomain)
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'eip712-eoa')
  assert.equal(bundle.credential.issuer, issuer.address)
  assert.equal(Object.keys(credentialTypes).length, 1)
})

test('delegation can only attenuate a parent credential', () => {
  const parent = sample(Wallet.createRandom().address, Wallet.createRandom().address)
  const child = attenuateCredential(parent, { budget: '2', maxCalls: 1, allowedTools: ['vendor.pay'], expiresAt: 500, taskId: id('task-child'), contextId: id('context-child') })
  assert.equal(child.parentCapabilityId, parent.capabilityId)
  assert.equal(child.delegationDepth, '1')
  assert.equal(child.taskId, id('task-child'))
  assert.equal(child.contextId, id('context-child'))
  assert.throws(() => attenuateCredential(parent, { budget: '1000000000000000001' }), /budget exceeds parent/)
})

test('MCP gateway exposes and executes only credential-scoped tools', async () => {
  const credential = sample(Wallet.createRandom().address, Wallet.createRandom().address)
  const overview = {
    release: { status: 'ACTIVE' },
    capability: { status: 'ACTIVE' },
    policy: { recipient: '0x0000000000000000000000000000000000000002', maxPayment: 1, depositMax: 0.1 },
  }
  const gateway = createMcpGateway({
    getOverview: async () => overview,
    getCredential: async () => credential,
    execute: async () => ({ ok: true, message: 'executed' }),
  })
  const listed = await gateway({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['protocol.deposit', 'vendor.pay'])
  const denied = await gateway({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'vendor.pay', arguments: { recipient: '0x0000000000000000000000000000000000000003', amount: '0.1' } } })
  assert.equal(denied.result.structuredContent.decision, 'DENY')
  const allowed = await gateway({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vendor.pay', arguments: { recipient: '0x0000000000000000000000000000000000000002', amount: '0.1' } } })
  assert.equal(allowed.result.structuredContent.decision, 'ALLOW')
  const stepUp = await gateway({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'vendor.pay', arguments: { recipient: '0x0000000000000000000000000000000000000002', amount: '0.6' } } })
  assert.equal(stepUp.result.structuredContent.decision, 'AUTH_REQUIRED')
  assert.equal(stepUp.result.structuredContent.code, 'STEP_UP_REQUIRED')
})

test('MCP gateway negotiates protocol versions used by existing clients', async () => {
  const gateway = createMcpGateway({ getOverview: async () => ({}), getCredential: async () => null, execute: async () => ({ ok: true }) })
  const compatible = await gateway({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
  assert.equal(compatible.result.protocolVersion, '2025-06-18')
  const unknown = await gateway({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: 'future-version' } })
  assert.equal(unknown.result.protocolVersion, '2026-07-28')
})

test('MCP gateway rejects calls outside credential budget or call limit', async () => {
  const credential = sample(Wallet.createRandom().address, Wallet.createRandom().address)
  const overview = {
    release: { status: 'ACTIVE' },
    capability: { status: 'ACTIVE' },
    policy: { recipient: '0x0000000000000000000000000000000000000002', maxPayment: 1, depositMax: 0.1 },
  }
  const gateway = createMcpGateway({ getOverview: async () => overview, getCredential: async () => ({ ...credential, budget: '50000000000000000', maxCalls: '1' }), execute: async () => ({ ok: true }) })
  const overBudget = await gateway({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'vendor.pay', arguments: { recipient: overview.policy.recipient, amount: '0.1' } } })
  assert.equal(overBudget.result.structuredContent.code, 'BUDGET_EXCEEDED')
  const noCallsGateway = createMcpGateway({ getOverview: async () => overview, getCredential: async () => ({ ...credential, budget: '50000000000000000', maxCalls: '0' }), execute: async () => ({ ok: true }) })
  const noCalls = await noCallsGateway({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'protocol.deposit', arguments: {} } })
  assert.equal(noCalls.result.structuredContent.code, 'CALL_LIMIT_REACHED')
})

test('independent evaluator quorum rejects duplicate or unapproved signers', async () => {
  const evaluatorA = Wallet.createRandom()
  const evaluatorB = Wallet.createRandom()
  const verifier = Wallet.createRandom().address
  const typedDomain = evaluationDomain(11155111, verifier)
  const value = {
    releaseDigest: id('release'), suiteHash: id('suite'), reportHash: id('report-a'),
    safetyScoreBps: 9200, deniedCapabilityBitmap: 0, evaluatedAt: 10, validUntil: 1000, evaluationNonce: 1,
  }
  const second = { ...value, reportHash: id('report-b'), evaluationNonce: 2 }
  const firstSignature = await evaluatorA.signTypedData(typedDomain, evaluationTypes, value)
  const secondSignature = await evaluatorB.signTypedData(typedDomain, evaluationTypes, second)
  const result = verifyQuorum(
    [{ value, signature: firstSignature }, { value: second, signature: secondSignature }],
    { chainId: 11155111, verifier, releaseDigest: value.releaseDigest, suiteHash: value.suiteHash, approvedEvaluators: [evaluatorA.address, evaluatorB.address], minQuorum: 2, now: 20 },
  )
  assert.equal(result.verified.length, 2)
  assert.throws(() => verifyQuorum([{ value, signature: firstSignature }, { value, signature: firstSignature }], { chainId: 11155111, verifier, releaseDigest: value.releaseDigest, suiteHash: value.suiteHash, approvedEvaluators: [evaluatorA.address], minQuorum: 2, now: 20 }), /independent signers/)
})
