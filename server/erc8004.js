const { JsonRpcProvider, Contract, getAddress, isAddress } = require('ethers')

const identityRegistryAbi = [
  'function tokenURI(uint256) view returns (string)',
  'function ownerOf(uint256) view returns (address)',
]

function parseRegistry(value) {
  const parts = String(value || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'eip155' || !/^\d+$/.test(parts[1]) || !isAddress(parts[2])) {
    throw new Error('agentRegistry must use eip155:<chainId>:<identityRegistry>')
  }
  return { namespace: parts[0], chainId: Number(parts[1]), identityRegistry: getAddress(parts[2]) }
}

function decodeDataUri(uri) {
  if (!uri.startsWith('data:')) return null
  const comma = uri.indexOf(',')
  if (comma < 0) throw new Error('invalid data URI')
  const metadata = uri.slice(0, comma)
  const value = uri.slice(comma + 1)
  const text = metadata.includes(';base64')
    ? Buffer.from(value, 'base64').toString('utf8')
    : decodeURIComponent(value)
  return JSON.parse(text)
}

async function resolveAgentUri(uri) {
  const inline = decodeDataUri(uri)
  if (inline) return inline
  if (uri.startsWith('ipfs://')) {
    const gateway = process.env.AIRLOCK_IPFS_GATEWAY?.trim()
    if (!gateway) throw new Error('IPFS agent URI requires AIRLOCK_IPFS_GATEWAY')
    uri = `${gateway.replace(/\/$/, '')}/${uri.slice('ipfs://'.length)}`
  }
  if (!uri.startsWith('https://')) throw new Error('agent URI must be HTTPS, IPFS with a configured gateway, or data URI')
  const response = await fetch(uri, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`agent registration fetch failed: ${response.status}`)
  return response.json()
}

function validateRegistration(registration, { agentRegistry, agentId, releaseDigest } = {}) {
  if (!registration || registration.type !== 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1') {
    throw new Error('unsupported ERC-8004 registration type')
  }
  if (!Array.isArray(registration.services)) throw new Error('ERC-8004 registration must include services')
  const references = Array.isArray(registration.registrations) ? registration.registrations : []
  const registryMatch = registration.agentRegistry
    ? { agentRegistry: registration.agentRegistry, agentId: registration.agentId }
    : references.find((item) => item?.agentRegistry === agentRegistry && String(item?.agentId) === String(agentId))
  if (agentRegistry && (!registryMatch || registryMatch.agentRegistry !== agentRegistry)) throw new Error('registration agentRegistry mismatch')
  if (agentId !== undefined && (!registryMatch || String(registryMatch.agentId) !== String(agentId))) throw new Error('registration agentId mismatch')
  if (releaseDigest) {
    const advertised = registration.metadata?.releaseDigest || registration.releaseDigest
    if (advertised && String(advertised).toLowerCase() !== String(releaseDigest).toLowerCase()) {
      throw new Error('registration releaseDigest mismatch')
    }
  }
  return registration
}

async function readIdentity({ rpcUrl, agentRegistry, agentId, releaseDigest }) {
  const registry = parseRegistry(agentRegistry)
  if (Number(new URL(rpcUrl).protocol === 'http:' || new URL(rpcUrl).protocol === 'https:' ? 1 : 0) !== 1) {
    throw new Error('rpcUrl must be HTTP(S)')
  }
  const provider = new JsonRpcProvider(rpcUrl)
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== registry.chainId) throw new Error('identity registry chain does not match agentRegistry')
  const contract = new Contract(registry.identityRegistry, identityRegistryAbi, provider)
  const [uri, owner] = await Promise.all([contract.tokenURI(agentId), contract.ownerOf(agentId)])
  const registration = validateRegistration(await resolveAgentUri(uri), { agentRegistry, agentId, releaseDigest })
  return { agentRegistry, agentId: String(agentId), owner: getAddress(owner), agentURI: uri, registration }
}

module.exports = { identityRegistryAbi, parseRegistry, resolveAgentUri, validateRegistration, readIdentity }
