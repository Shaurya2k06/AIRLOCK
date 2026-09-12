const test = require('node:test')
const assert = require('node:assert/strict')
const { verifyCycloneDx, verifySlsa } = require('./passport')

test('passport validators require real CycloneDX 1.7 and SLSA v1 inputs', () => {
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    serialNumber: 'urn:uuid:123e4567-e89b-12d3-a456-426614174000',
    version: 1,
    components: [{ type: 'library', name: 'airlock-runtime', version: '1.0.0' }],
  }
  assert.deepEqual(verifyCycloneDx(sbom), { specVersion: '1.7', components: 1 })
  assert.throws(() => verifyCycloneDx({ ...sbom, specVersion: 'demo-sbom-v1' }), /CycloneDX 1.7/)
  assert.equal(verifySlsa({
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: 'airlock-agent', digest: { sha256: 'a'.repeat(64) } }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: { buildDefinition: {}, runDetails: { builder: { id: 'https://github.com/actions/runner' } } },
  }, `sha256:${'a'.repeat(64)}`).subjects, 1)
})
