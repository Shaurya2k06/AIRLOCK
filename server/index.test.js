const test = require('node:test')
const assert = require('node:assert/strict')
const { simulate, timestamp } = require('./index')

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
