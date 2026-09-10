const test = require('node:test')
const assert = require('node:assert/strict')
const { simulate } = require('./index')

test('simulation blocks unapproved recipients and accepts bounded payments', () => {
  assert.deepEqual(simulate({ recipient: '0xnope', amount: 24 }).allowed, false)
  assert.deepEqual(simulate({ recipient: '0x4E…91c2', amount: 24 }).allowed, true)
  assert.deepEqual(simulate({ recipient: '0x4E…91c2', amount: 251 }).allowed, false)
})
