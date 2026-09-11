const { keccak256, toUtf8Bytes } = require('ethers')
const { canonical } = require('./credential')

function buildTraceGraph(deployment, overview) {
  const release = deployment?.release || {}
  const proofs = deployment?.proofs || {}
  const nodes = [
    { id: 'agent', kind: 'agent', label: release.agentId || 'agent', value: release.agentId || null },
    { id: 'release', kind: 'release', label: release.releaseDigest || 'release', value: release.releaseDigest || null },
    { id: 'passport', kind: 'passport', label: release.passportHash || release.manifestHash || 'passport', value: release.passportHash || release.manifestHash || null },
    ...['artifact', 'evaluation', 'approval', 'status', 'revocation'].filter((kind) => proofs[kind]).map((kind) => ({
      id: `proof-${kind}`,
      kind: 'proof',
      label: kind,
      value: proofs[kind].creditcoinTxHash || proofs[kind].txHash || null,
    })),
    ...(deployment?.live?.capabilityId ? [{ id: 'capability', kind: 'capability', label: deployment.live.capabilityId, value: deployment.live.capabilityId }] : []),
    ...(overview?.actions || []).map((action, index) => ({ id: `action-${index}`, kind: 'action', label: action.action, value: action.txHash || null, traceRoot: action.traceRoot || null })),
  ]
  const edges = [
    ['agent', 'release'],
    ['release', 'passport'],
    ...nodes.filter((node) => node.kind === 'proof').map((node) => ['release', node.id]),
    ...(deployment?.live?.capabilityId ? [['release', 'capability']] : []),
    ...nodes.filter((node) => node.kind === 'action').map((node) => ['capability', node.id]),
  ].map(([source, target]) => ({ source, target }))
  const traceRoot = overview?.traceRoot || keccak256(toUtf8Bytes(canonical({ release: release.releaseDigest, nodes, edges })))
  return { traceRoot, nodes, edges }
}

module.exports = { buildTraceGraph }
