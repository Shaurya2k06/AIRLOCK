const LEVELS = ['L0', 'L1', 'L2', 'L3']

function spiffeIdValid(value) {
  return typeof value === 'string' && /^spiffe:\/\/[^/]+\/.+/.test(value)
}

function runtimeAssurance(deployment = {}) {
  if (deployment.teeBinding?.creditcoinTxHash && deployment.release?.runtimeAssurance === 'L2') {
    return { level: 'L2', name: 'hardware bound', verified: true, source: 'RuntimeBindingRegistry' }
  }
  if (process.env.SPIFFE_ENDPOINT_SOCKET?.trim() && spiffeIdValid(process.env.SPIFFE_ID?.trim())) {
    return { level: 'L1', name: 'workload bound', verified: false, source: 'SPIFFE/SPIRE configuration', note: 'SVID verification belongs to the workload identity provider.' }
  }
  return { level: 'L0', name: 'artifact bound', verified: Boolean(deployment.release?.releaseDigest), source: 'AIRLOCK release evidence', note: 'Base mode does not prove which weights a running process loaded.' }
}

module.exports = { LEVELS, spiffeIdValid, runtimeAssurance }
