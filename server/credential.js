const {
  Contract,
  TypedDataEncoder,
  getAddress,
  isAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
} = require('ethers')

const ZERO_BYTES32 = `0x${'00'.repeat(32)}`
const CREDENTIAL_SCHEMA = 'AIRLOCK_CREDENTIAL_V1'
const CREDENTIAL_DOMAIN_NAME = 'AIRLOCK Authorization Credential'
const CREDENTIAL_DOMAIN_VERSION = '1'
const ERC1271_MAGIC_VALUE = '0x1626ba7e'

const credentialTypes = {
  AirlockCredential: [
    { name: 'schema', type: 'string' },
    { name: 'issuer', type: 'address' },
    { name: 'organizationId', type: 'bytes32' },
    { name: 'agentRegistry', type: 'string' },
    { name: 'agentId', type: 'bytes32' },
    { name: 'releaseDigest', type: 'bytes32' },
    { name: 'capabilityId', type: 'bytes32' },
    { name: 'parentCapabilityId', type: 'bytes32' },
    { name: 'parentCredentialId', type: 'bytes32' },
    { name: 'taskId', type: 'bytes32' },
    { name: 'contextId', type: 'bytes32' },
    { name: 'scopeRoot', type: 'bytes32' },
    { name: 'budget', type: 'uint256' },
    { name: 'maxCalls', type: 'uint32' },
    { name: 'notBefore', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
    { name: 'targetChainId', type: 'uint256' },
    { name: 'audience', type: 'string' },
    { name: 'evidenceRoot', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'traceRoot', type: 'bytes32' },
    { name: 'allowedTools', type: 'string[]' },
    { name: 'delegationDepth', type: 'uint8' },
    { name: 'maxDelegationDepth', type: 'uint8' },
    { name: 'riskLevel', type: 'uint8' },
    { name: 'delegationLimit', type: 'uint8' },
    { name: 'runtimeKey', type: 'address' },
  ],
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function bytes32(value, field) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${field} must be bytes32`)
  return value.toLowerCase()
}

function address(value, field) {
  if (!isAddress(value)) throw new Error(`${field} must be an address`)
  return getAddress(value)
}

function uint(value, field, max = Number.MAX_SAFE_INTEGER) {
  const parsed = BigInt(value)
  if (parsed < 0n || parsed > BigInt(max)) throw new Error(`${field} is out of range`)
  return parsed.toString()
}

function normalizeCredential(input) {
  if (!input || typeof input !== 'object') throw new Error('credential must be an object')
  const credential = {
    schema: input.schema || CREDENTIAL_SCHEMA,
    issuer: address(input.issuer, 'issuer'),
    organizationId: bytes32(input.organizationId, 'organizationId'),
    agentRegistry: String(input.agentRegistry || ''),
    agentId: bytes32(input.agentId, 'agentId'),
    releaseDigest: bytes32(input.releaseDigest, 'releaseDigest'),
    capabilityId: bytes32(input.capabilityId, 'capabilityId'),
    parentCapabilityId: bytes32(input.parentCapabilityId || ZERO_BYTES32, 'parentCapabilityId'),
    parentCredentialId: bytes32(input.parentCredentialId || ZERO_BYTES32, 'parentCredentialId'),
    taskId: bytes32(input.taskId || ZERO_BYTES32, 'taskId'),
    contextId: bytes32(input.contextId || ZERO_BYTES32, 'contextId'),
    scopeRoot: bytes32(input.scopeRoot, 'scopeRoot'),
    budget: uint(input.budget, 'budget', (1n << 256n) - 1n),
    maxCalls: uint(input.maxCalls, 'maxCalls', 0xffffffff),
    notBefore: uint(input.notBefore, 'notBefore', 0xffffffffffffffffn),
    expiresAt: uint(input.expiresAt, 'expiresAt', 0xffffffffffffffffn),
    targetChainId: uint(input.targetChainId, 'targetChainId', (1n << 256n) - 1n),
    audience: String(input.audience || ''),
    evidenceRoot: bytes32(input.evidenceRoot, 'evidenceRoot'),
    policyHash: bytes32(input.policyHash, 'policyHash'),
    traceRoot: bytes32(input.traceRoot || ZERO_BYTES32, 'traceRoot'),
    allowedTools: [...new Set((input.allowedTools || []).map(String))].sort(),
    delegationDepth: uint(input.delegationDepth || 0, 'delegationDepth', 255),
    maxDelegationDepth: uint(input.maxDelegationDepth || 0, 'maxDelegationDepth', 255),
    riskLevel: uint(input.riskLevel || 0, 'riskLevel', 255),
    delegationLimit: uint(input.delegationLimit || 0, 'delegationLimit', 255),
    runtimeKey: address(input.runtimeKey, 'runtimeKey'),
  }
  if (credential.schema !== CREDENTIAL_SCHEMA) throw new Error(`unsupported credential schema: ${credential.schema}`)
  if (!credential.agentRegistry) throw new Error('agentRegistry is required')
  if (!credential.audience) throw new Error('audience is required')
  if (BigInt(credential.expiresAt) <= BigInt(credential.notBefore)) throw new Error('credential expiry must follow notBefore')
  if (Number(credential.delegationDepth) > Number(credential.maxDelegationDepth)) throw new Error('delegation depth exceeds maximum')
  return credential
}

function domain({ chainId, verifyingContract }) {
  return {
    name: CREDENTIAL_DOMAIN_NAME,
    version: CREDENTIAL_DOMAIN_VERSION,
    chainId: BigInt(chainId).toString(),
    verifyingContract: address(verifyingContract, 'verifyingContract'),
  }
}

function credentialDigest(credential, credentialDomain) {
  return TypedDataEncoder.hash(credentialDomain, credentialTypes, normalizeCredential(credential))
}

function credentialId(credential) {
  return keccak256(toUtf8Bytes(canonical(normalizeCredential(credential))))
}

async function signCredential(credential, signer, credentialDomain) {
  const normalized = normalizeCredential(credential)
  return {
    credential: normalized,
    signature: await signer.signTypedData(credentialDomain, credentialTypes, normalized),
    credentialId: credentialId(normalized),
  }
}

function encodeCredential(bundle) {
  const json = JSON.stringify(bundle)
  return Buffer.from(json).toString('base64url')
}

function decodeCredential(value) {
  if (!value) return null
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    const bundle = JSON.parse(decoded)
    if (!bundle?.credential || !bundle?.signature) return null
    return bundle
  } catch {
    return null
  }
}

function extractCredential(headers) {
  const authorization = headers?.authorization || ''
  const match = authorization.match(/^Bearer\s+(?:AirlockCredential\s+)?(.+)$/i)
  return match ? decodeCredential(match[1].trim()) : null
}

async function verifySignature(bundle, credentialDomain, provider) {
  const credential = normalizeCredential(bundle.credential)
  const digest = credentialDigest(credential, credentialDomain)
  let recovered
  try {
    recovered = getAddress(verifyTypedData(credentialDomain, credentialTypes, credential, bundle.signature))
  } catch {
    recovered = null
  }
  if (recovered === credential.issuer) return { ok: true, signer: recovered, digest, mode: 'eip712-eoa' }
  if (!provider) return { ok: false, reason: 'credential signature is not valid for the issuer' }
  const code = await provider.getCode(credential.issuer)
  if (code === '0x') return { ok: false, reason: 'credential signature is not valid for the issuer' }
  try {
    const validator = new Contract(credential.issuer, ['function isValidSignature(bytes32,bytes) view returns (bytes4)'], provider)
    const result = await validator.isValidSignature(digest, bundle.signature)
    if (String(result).toLowerCase() === ERC1271_MAGIC_VALUE) return { ok: true, signer: credential.issuer, digest, mode: 'erc1271' }
  } catch {
    // A contract issuer that does not implement ERC-1271 is not a valid signer.
  }
  return { ok: false, reason: 'credential signature is not valid for the issuer' }
}

function subset(parent, child) {
  return child.every((item) => parent.includes(item))
}

function attenuateCredential(parentInput, childInput) {
  const parent = normalizeCredential(parentInput)
  const child = normalizeCredential({
    ...parent,
    ...childInput,
    parentCapabilityId: parent.capabilityId,
    parentCredentialId: credentialId(parent),
    delegationDepth: Number(parent.delegationDepth) + 1,
    maxDelegationDepth: Math.min(Number(parent.maxDelegationDepth), Number(childInput.maxDelegationDepth ?? parent.maxDelegationDepth)),
    maxCalls: Math.min(Number(parent.maxCalls), Number(childInput.maxCalls ?? parent.maxCalls)),
    budget: childInput.budget ?? parent.budget,
    expiresAt: childInput.expiresAt ?? parent.expiresAt,
    notBefore: childInput.notBefore ?? parent.notBefore,
    allowedTools: childInput.allowedTools ?? parent.allowedTools,
  })
  const failures = []
  if (child.issuer !== parent.issuer || child.organizationId !== parent.organizationId || child.agentRegistry !== parent.agentRegistry) failures.push('issuer or organization identity cannot change')
  if (child.releaseDigest !== parent.releaseDigest) failures.push('release cannot change')
  if (child.policyHash !== parent.policyHash || child.scopeRoot !== parent.scopeRoot) failures.push('policy or scope cannot expand')
  if (child.audience !== parent.audience || child.targetChainId !== parent.targetChainId) failures.push('audience or chain cannot change')
  if (child.evidenceRoot !== parent.evidenceRoot || child.traceRoot !== parent.traceRoot) failures.push('evidence or trace binding cannot change')
  if (BigInt(child.budget) > BigInt(parent.budget)) failures.push('budget exceeds parent remaining budget')
  if (Number(child.maxCalls) > Number(parent.maxCalls)) failures.push('call limit exceeds parent')
  if (BigInt(child.notBefore) < BigInt(parent.notBefore) || BigInt(child.expiresAt) > BigInt(parent.expiresAt)) failures.push('validity exceeds parent')
  if (!subset(parent.allowedTools, child.allowedTools)) failures.push('tool scope exceeds parent')
  if (Number(child.riskLevel) > Number(parent.delegationLimit)) failures.push('risk exceeds delegation limit')
  if (Number(child.delegationLimit) > Number(parent.delegationLimit)) failures.push('delegation limit exceeds parent')
  if (Number(child.delegationDepth) > Number(parent.maxDelegationDepth)) failures.push('delegation depth exceeds parent')
  if (failures.length) throw new Error(failures.join('; '))
  return child
}

module.exports = {
  CREDENTIAL_SCHEMA,
  CREDENTIAL_DOMAIN_NAME,
  CREDENTIAL_DOMAIN_VERSION,
  ZERO_BYTES32,
  credentialTypes,
  canonical,
  credentialDigest,
  credentialId,
  decodeCredential,
  domain,
  encodeCredential,
  extractCredential,
  normalizeCredential,
  attenuateCredential,
  signCredential,
  verifySignature,
}
