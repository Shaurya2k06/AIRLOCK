const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')

const ZERO_BYTES32 = `0x${'00'.repeat(32)}`
const DEFAULT_FILES = {
  container: 'container.digest',
  sbom: 'sbom.json',
  provenance: 'provenance.json',
  sigstoreBundle: 'sigstore.bundle.json',
  rekorProof: 'rekor-proof.json',
}

function sha256(value) {
  return `0x${createHash('sha256').update(value).digest('hex')}`
}

function signaturePayload(document) {
  return Buffer.from([
    'AIRLOCK_RELEASE_CONTENT_V1',
    document.artifactRoot,
    document.payload.components.containerImageDigest,
    document.payload.components.sbomHash,
    document.payload.components.provenanceHash,
  ].join('\n'))
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value
}

function verifyCycloneDx(value) {
  requireObject(value, 'CycloneDX SBOM')
  if (value.bomFormat !== 'CycloneDX' || String(value.specVersion) !== '1.7') throw new Error('SBOM must be CycloneDX 1.7')
  if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(String(value.serialNumber || ''))) throw new Error('CycloneDX SBOM serialNumber is invalid')
  if (!Number.isInteger(value.version) || value.version < 1) throw new Error('CycloneDX SBOM version is invalid')
  if (!Array.isArray(value.components) || value.components.length === 0) throw new Error('CycloneDX SBOM must contain components')
  for (const component of value.components) {
    if (!component || typeof component.name !== 'string' || typeof component.version !== 'string' || typeof component.type !== 'string') {
      throw new Error('CycloneDX component is incomplete')
    }
  }
  return { specVersion: String(value.specVersion), components: value.components.length }
}

function verifySlsa(value, containerDigest) {
  requireObject(value, 'SLSA provenance')
  if (value._type !== 'https://in-toto.io/Statement/v1') throw new Error('provenance must be an in-toto Statement v1')
  if (value.predicateType !== 'https://slsa.dev/provenance/v1') throw new Error('provenance must use SLSA v1')
  if (!Array.isArray(value.subject) || value.subject.length === 0) throw new Error('SLSA provenance has no subject')
  const digest = containerDigest.slice('sha256:'.length)
  if (!value.subject.some((subject) => subject?.digest?.sha256?.toLowerCase() === digest.toLowerCase())) throw new Error('SLSA subject does not match the OCI digest')
  if (!value.predicate?.buildDefinition || !value.predicate?.runDetails?.builder?.id) throw new Error('SLSA provenance is missing buildDefinition or builder identity')
  return { predicateType: value.predicateType, subjects: value.subject.length, builder: value.predicate.runDetails.builder.id }
}

function verifyRekorProof(value, document) {
  requireObject(value, 'Rekor proof')
  if (value.schema !== 'AIRLOCK_REKOR_PROOF_V1') throw new Error('unsupported Rekor proof schema')
  if (value.payloadSha256 !== sha256(signaturePayload(document))) throw new Error('Rekor proof payload does not match the release content')
  if (!Array.isArray(value.entries) || value.entries.length === 0) throw new Error('Rekor proof has no transparency-log entries')
  if (value.entries.some((entry) => !entry?.logId?.keyId || entry.logIndex === undefined || !entry.inclusionProof?.rootHash)) throw new Error('Rekor proof entry is incomplete')
  return { entries: value.entries.length }
}

async function readJson(releaseDir, file) {
  const content = await fs.readFile(path.join(releaseDir, file), 'utf8')
  return JSON.parse(content)
}

async function verifySigstore(bundle, document) {
  requireObject(bundle, 'Sigstore bundle')
  if (typeof bundle.mediaType !== 'string' || !bundle.verificationMaterial) throw new Error('Sigstore bundle is incomplete')
  if (!bundle.messageSignature && !bundle.dsseEnvelope) throw new Error('Sigstore bundle has no signature payload')
  const { verify } = await import('sigstore')
  const options = {}
  if (process.env.SIGSTORE_CERTIFICATE_IDENTITY_URI?.trim()) options.certificateIdentityURI = process.env.SIGSTORE_CERTIFICATE_IDENTITY_URI.trim()
  if (process.env.SIGSTORE_CERTIFICATE_ISSUER?.trim()) options.certificateIssuer = process.env.SIGSTORE_CERTIFICATE_ISSUER.trim()
  const signer = await verify(bundle, signaturePayload(document), options)
  return { mediaType: bundle.mediaType, identity: signer.identity || null }
}

async function verifyOciRegistry(containerDigest) {
  const image = process.env.AIRLOCK_OCI_IMAGE_REF?.trim() || 'ghcr.io/shaurya2k06/airlock-agent'
  if (!image) return { status: 'not-configured' }
  const separator = image.indexOf('/')
  if (separator < 1) throw new Error('AIRLOCK_OCI_IMAGE_REF must include a registry and repository')
  const registry = image.slice(0, separator)
  const repository = image.slice(separator + 1)
  const manifestUrl = `https://${registry}/v2/${repository}/manifests/${containerDigest}`
  const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'
  let response = await fetch(manifestUrl, { headers: { accept } })
  if (response.status === 401 || response.status === 403) {
    const challenge = response.headers.get('www-authenticate') || ''
    const realm = challenge.match(/realm="([^"]+)"/i)?.[1]
    if (realm) {
      const params = new URL(realm)
      const service = challenge.match(/service="([^"]+)"/i)?.[1]
      const scope = challenge.match(/scope="([^"]+)"/i)?.[1]
      if (service) params.searchParams.set('service', service)
      if (scope) params.searchParams.set('scope', scope)
      const tokenHeaders = {}
      const registryToken = process.env.AIRLOCK_OCI_REGISTRY_TOKEN?.trim()
      if (registryToken) {
        const username = process.env.AIRLOCK_OCI_REGISTRY_USERNAME?.trim() || 'airlock'
        tokenHeaders.authorization = `Basic ${Buffer.from(`${username}:${registryToken}`).toString('base64')}`
      }
      const tokenResponse = await fetch(params, { headers: tokenHeaders })
      if (tokenResponse.ok) {
        const token = await tokenResponse.json()
        const bearer = token.token || token.access_token
        if (typeof bearer === 'string' && bearer) response = await fetch(manifestUrl, { headers: { accept, authorization: `Bearer ${bearer}` } })
      }
    }
  }
  if (!response.ok) throw new Error(`OCI registry returned ${response.status} for ${image}@${containerDigest}`)
  const resolved = response.headers.get('docker-content-digest')
  if (resolved && resolved.toLowerCase() !== containerDigest.toLowerCase()) throw new Error('OCI registry digest mismatch')
  return { status: 'verified', image, digest: resolved || containerDigest }
}

async function verifyPassportArtifacts(document, releaseDir, { requireExternal = false } = {}) {
  const checks = {}
  const errors = []
  const file = (name) => path.join(releaseDir, name)
  const check = async (name, callback) => {
    try {
      checks[name] = await callback()
    } catch (error) {
      checks[name] = { status: 'failed', error: error.message }
      errors.push(`${name}: ${error.message}`)
    }
  }

  await check('container', async () => {
    const content = (await fs.readFile(file(DEFAULT_FILES.container), 'utf8')).trim()
    if (!/^sha256:[0-9a-f]{64}$/i.test(content)) throw new Error('container.digest must contain an OCI sha256 digest')
    const expected = document.payload.components.containerImageDigest.toLowerCase()
    if (sha256(Buffer.from(`${content}\n`)).toLowerCase() !== expected) throw new Error('container digest file hash does not match the manifest')
    return { status: 'verified', digest: content }
  })
  let containerDigest = checks.container?.digest
  await check('sbom', async () => {
    const value = await readJson(releaseDir, DEFAULT_FILES.sbom)
    const result = verifyCycloneDx(value)
    const expected = document.payload.components.sbomHash.toLowerCase()
    const actual = sha256(await fs.readFile(file(DEFAULT_FILES.sbom))).toLowerCase()
    if (actual !== expected) throw new Error('SBOM hash does not match the manifest')
    return { status: 'verified', ...result }
  })
  await check('provenance', async () => {
    const value = await readJson(releaseDir, DEFAULT_FILES.provenance)
    const result = verifySlsa(value, containerDigest || '')
    const expected = document.payload.components.provenanceHash.toLowerCase()
    const actual = sha256(await fs.readFile(file(DEFAULT_FILES.provenance))).toLowerCase()
    if (actual !== expected) throw new Error('provenance hash does not match the manifest')
    return { status: 'verified', ...result }
  })

  const hasSignature = document.payload.passport?.sigstoreBundleHash && document.payload.passport.sigstoreBundleHash.toLowerCase() !== ZERO_BYTES32
  const hasRekor = document.payload.passport?.rekorProofHash && document.payload.passport.rekorProofHash.toLowerCase() !== ZERO_BYTES32
  if (hasSignature) {
    await check('sigstore', async () => {
      const content = await fs.readFile(file(DEFAULT_FILES.sigstoreBundle))
      if (sha256(content).toLowerCase() !== document.payload.passport.sigstoreBundleHash.toLowerCase()) throw new Error('Sigstore bundle hash does not match the manifest')
      return { status: 'verified', ...(await verifySigstore(JSON.parse(content), document)) }
    })
  } else checks.sigstore = { status: 'missing' }
  if (hasRekor) {
    await check('rekor', async () => {
      const content = await fs.readFile(file(DEFAULT_FILES.rekorProof))
      if (sha256(content).toLowerCase() !== document.payload.passport.rekorProofHash.toLowerCase()) throw new Error('Rekor proof hash does not match the manifest')
      return { status: 'verified', ...verifyRekorProof(JSON.parse(content), document) }
    })
  } else checks.rekor = { status: 'missing' }
  await check('oci', async () => verifyOciRegistry(containerDigest || ''))

  const externalChecks = ['container', 'sbom', 'provenance', 'sigstore', 'rekor']
  if (checks.oci?.status !== 'not-configured') externalChecks.push('oci')
  const externalVerified = externalChecks.every((name) => checks[name]?.status === 'verified')
  if (requireExternal && !externalVerified) errors.push('external release passport verification is required')
  return { verified: errors.length === 0 && (!requireExternal || externalVerified), checks, errors }
}

module.exports = { signaturePayload, verifyCycloneDx, verifySlsa, verifyPassportArtifacts }
