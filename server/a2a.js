const { randomUUID } = require('node:crypto')

function agentCard({ baseUrl, agentRegistry, agentId, releaseDigest }) {
  return {
    name: 'AIRLOCK Release Authority',
    description: 'An authorization gateway for release-bound autonomous agents.',
    url: `${baseUrl}/a2a`,
    version: '1.0.0',
    protocolVersion: '0.3.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [{
      id: 'airlock.authorize',
      name: 'Authorize bounded agent actions',
      description: 'Evaluates a typed action against an AIRLOCK credential and current release status.',
      tags: ['authorization', 'release', 'capability'],
      examples: ['Authorize an approved vendor payment'],
    }],
    extensions: [{
      uri: 'https://airlock.dev/spec/authorization-credential/v1',
      required: false,
      params: { credential: 'AirlockCredential', releaseDigest, agentRegistry, agentId },
    }],
  }
}

function authRequired(taskId, reason = 'AIRLOCK credential required') {
  return {
    id: taskId,
    status: { state: 'AUTH_REQUIRED', message: { role: 'agent', parts: [{ kind: 'text', text: reason }] } },
    metadata: { airlock: { decision: 'AUTH_REQUIRED', extension: 'https://airlock.dev/spec/authorization-credential/v1' } },
  }
}

function deny(taskId, reason) {
  return {
    id: taskId,
    status: { state: 'FAILED', message: { role: 'agent', parts: [{ kind: 'text', text: reason }] } },
    metadata: { airlock: { decision: 'DENY', reason } },
  }
}

function allow(taskId, result) {
  return {
    id: taskId,
    status: { state: 'COMPLETED', message: { role: 'agent', parts: [{ kind: 'data', data: result }] } },
    metadata: { airlock: { decision: 'ALLOW', ...result } },
  }
}

async function handleTask(body, { credential, authorize, execute }) {
  const params = body?.params || {}
  const taskId = params.id || randomUUID()
  if (!credential) return authRequired(taskId)
  const action = params.action || params.message?.metadata?.airlock?.action
  if (!action || typeof action !== 'object') return deny(taskId, 'A2A action must include tool and arguments')
  const decision = await authorize(action, credential)
  if (decision.decision === 'AUTH_REQUIRED') return authRequired(taskId, decision.reason)
  if (decision.decision !== 'ALLOW') return deny(taskId, decision.reason)
  return allow(taskId, await execute(action, credential))
}

module.exports = { agentCard, handleTask, authRequired, deny, allow }
