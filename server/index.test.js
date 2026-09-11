const test = require('node:test')
const assert = require('node:assert/strict')
const { simulate, runbook, statusFreshness, timestamp } = require('./index')

test('simulation blocks unapproved recipients and accepts bounded payments', () => {
  assert.deepEqual(simulate({ recipient: '0xnope', amount: 24 }).allowed, false)
  assert.deepEqual(simulate({ recipient: '0x4E…91c2', amount: 24 }).allowed, true)
  assert.deepEqual(simulate({ recipient: '0x4E…91c2', amount: 251 }).allowed, false)
})

test('live simulation blocks inactive chain state before policy checks', () => {
  const current = {
    dataSource: 'creditcoin-chain',
    release: { status: 'REVOKED' },
    capability: { status: 'REVOKED' },
  }
  assert.deepEqual(simulate({ recipient: '0x4E…91c2', amount: 24 }, undefined, current), {
    allowed: false,
    reason: 'release is revoked',
  })
})

test('timestamp treats uint64 revocation sentinel as unbounded', () => {
  assert.equal(timestamp(2n ** 64n - 1n), '—')
  assert.equal(timestamp(1700000000), '2023-11-14T22:13:20.000Z')
})

test('runbook exposes the complete terminal workflow without secrets', () => {
  const value = runbook({ proofs: { artifact: { creditcoinTxHash: '0xproof' } }, live: { allowedActionTx: '0xaction' } })
  assert.deepEqual(value.steps.map((step) => step.id), [
    'preflight', 'deploy', 'proof-artifact', 'proof-evaluation', 'proof-approval', 'proof-status',
    'execute', 'deposit', 'revoke', 'proof-revocation', 'blocked',
  ])
  assert.equal(value.steps.find((step) => step.id === 'proof-artifact').status, 'COMPLETE')
  assert.equal(value.steps.find((step) => step.id === 'execute').status, 'COMPLETE')
  assert.equal(value.steps.some((step) => JSON.stringify(step).includes('PRIVATE_KEY')), false)
})

test('status freshness reports remaining active window and closes after revocation', () => {
  assert.deepEqual(statusFreshness(1000, 2000, 600, true, 1300), {
    maxAgeSeconds: 600,
    ageSeconds: 300,
    remainingSeconds: 300,
    statusIssuedAt: '1970-01-01T00:16:40.000Z',
    statusValidUntil: '1970-01-01T00:33:20.000Z',
  })
  assert.equal(statusFreshness(1000, 2n ** 64n - 1n, 600, false, 1300).remainingSeconds, 0)
})
