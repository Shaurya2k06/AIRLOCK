const { TypedDataEncoder, getAddress, id, verifyTypedData } = require('ethers')

const evaluationTypes = {
  AirlockEvaluation: [
    { name: 'releaseDigest', type: 'bytes32' },
    { name: 'suiteHash', type: 'bytes32' },
    { name: 'reportHash', type: 'bytes32' },
    { name: 'safetyScoreBps', type: 'uint32' },
    { name: 'deniedCapabilityBitmap', type: 'uint256' },
    { name: 'evaluatedAt', type: 'uint64' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'evaluationNonce', type: 'uint64' },
  ],
}

const evaluationDomain = (chainId, verifier) => ({
  name: 'AIRLOCK Independent Evaluation',
  version: '1',
  chainId: BigInt(chainId).toString(),
  verifyingContract: verifier,
})

function verifyQuorum(attestations, { chainId, verifier, releaseDigest, suiteHash, approvedEvaluators, minQuorum = 2, minScoreBps = 0, now = Math.floor(Date.now() / 1000) }) {
  if (!Array.isArray(attestations) || attestations.length < minQuorum) throw new Error(`evaluator quorum requires ${minQuorum} attestations`)
  const allowed = new Set((approvedEvaluators || []).map((value) => getAddress(value).toLowerCase()))
  const seen = new Set()
  const verified = []
  for (const item of attestations) {
    const value = item?.value
    if (!value || !item.signature) throw new Error('evaluator attestation is incomplete')
    if (value.releaseDigest.toLowerCase() !== releaseDigest.toLowerCase() || value.suiteHash.toLowerCase() !== suiteHash.toLowerCase()) throw new Error('evaluator attestation release or suite mismatch')
    if (Number(value.safetyScoreBps) < minScoreBps || Number(value.deniedCapabilityBitmap) !== 0) throw new Error('evaluator attestation does not satisfy policy')
    if (Number(value.validUntil) <= now || Number(value.evaluatedAt) > now) throw new Error('evaluator attestation is outside its validity window')
    const signer = getAddress(verifyTypedData(evaluationDomain(chainId, verifier), evaluationTypes, value, item.signature))
    if (!allowed.has(signer.toLowerCase())) throw new Error('evaluator is not approved')
    if (seen.has(signer.toLowerCase())) throw new Error('evaluator quorum requires independent signers')
    seen.add(signer.toLowerCase())
    verified.push({ signer, value })
  }
  if (verified.length < minQuorum) throw new Error('evaluator quorum is incomplete')
  const evaluatorRoot = id(verified.map(({ signer, value }) => `${signer.toLowerCase()}:${value.reportHash.toLowerCase()}:${value.evaluationNonce}`).sort().join('|'))
  return { evaluatorRoot, verified }
}

module.exports = { evaluationTypes, evaluationDomain, verifyQuorum, TypedDataEncoder }
