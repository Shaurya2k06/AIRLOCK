function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

function requirements({ network = 'eip155:102031', payTo, amount = '0.01', asset = 'native', resource = '' }) {
  return {
    x402Version: 2,
    accepts: [{ scheme: 'exact', network, asset, payTo, amount }],
    resource,
  }
}

function parsePaymentHeader(value) {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64url').toString('utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function settlePayment(url, payment, paymentRequirements, resource) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payment, paymentRequirements, resource }),
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { raw: text } }
  if (!response.ok) throw new Error(`x402 facilitator rejected payment (${response.status})`)
  return payload
}

function validatePayment(payment, expected) {
  if (!payment || typeof payment !== 'object') return { ok: false, reason: 'PAYMENT-SIGNATURE is missing or malformed' }
  const candidate = payment.accepted || payment.paymentRequirements || payment
  if (candidate.network !== expected.network || candidate.payTo?.toLowerCase() !== expected.payTo.toLowerCase() || String(candidate.amount) !== String(expected.amount)) {
    return { ok: false, reason: 'payment does not match the AIRLOCK requirement' }
  }
  if (!payment.payload && !payment.signature) return { ok: false, reason: 'payment signature payload is missing' }
  return { ok: true }
}

function paymentRequired({ network, payTo, amount, resource }) {
  const body = requirements({ network, payTo, amount, resource })
  return {
    status: 402,
    headers: {
      'payment-required': encode(body),
      'content-type': 'application/json; charset=utf-8',
    },
    body: { error: 'payment_required', ...body },
  }
}

module.exports = { requirements, parsePaymentHeader, validatePayment, paymentRequired, settlePayment }
