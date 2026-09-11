const { getAddress, isAddress, parseEther } = require('ethers')

const MCP_PROTOCOL_VERSION = '2026-07-28'
const MCP_COMPATIBLE_PROTOCOL_VERSIONS = new Set([
  MCP_PROTOCOL_VERSION,
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
])

function negotiateProtocolVersion(requested) {
  return MCP_COMPATIBLE_PROTOCOL_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION
}

const toolDefinitions = {
  'vendor.pay': {
    name: 'vendor.pay',
    description: 'Pay the release-approved vendor through the AIRLOCK router.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['recipient', 'amount'],
      properties: {
        recipient: { type: 'string', description: 'Approved recipient address.' },
        amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]{1,18})?$', description: 'Amount in native token units.' },
      },
    },
    riskLevel: 0,
    runbookStep: 'execute',
  },
  'protocol.deposit': {
    name: 'protocol.deposit',
    description: 'Make the release-approved bounded protocol deposit.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {},
    },
    riskLevel: 0,
    runbookStep: 'deposit',
  },
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }
}

function denial(code, reason, extra = {}) {
  return { isError: true, content: [{ type: 'text', text: reason }], structuredContent: { decision: 'DENY', code, reason, ...extra } }
}

function authorizedTools(credential, overview) {
  if (!credential || !overview || overview.release.status !== 'ACTIVE' || overview.capability.status !== 'ACTIVE') return []
  return (credential.allowedTools || []).filter((name) => toolDefinitions[name]).map((name) => {
    const { riskLevel, runbookStep, ...tool } = toolDefinitions[name]
    return tool
  })
}

function validateArguments(name, args, overview, credential) {
  if (credential && Number(credential.maxCalls) < 1) return { ok: false, code: 'CALL_LIMIT_REACHED', reason: 'credential has no calls remaining' }
  if (name === 'vendor.pay') {
    if (!isAddress(args?.recipient)) return { ok: false, code: 'INVALID_RECIPIENT', reason: 'recipient must be an EVM address' }
    const recipient = getAddress(args.recipient)
    if (recipient !== getAddress(overview.policy.recipient)) return { ok: false, code: 'RECIPIENT_OUT_OF_SCOPE', reason: 'recipient is outside the approved capability scope' }
    if (typeof args?.amount !== 'string' || !/^[0-9]+(\.[0-9]{1,18})?$/.test(args.amount)) return { ok: false, code: 'INVALID_AMOUNT', reason: 'amount must be a decimal native-token amount' }
    const amount = Number(args.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, code: 'INVALID_AMOUNT', reason: 'amount must be positive' }
    if (amount > overview.policy.maxPayment) return { ok: false, code: 'BUDGET_EXCEEDED', reason: 'amount exceeds the per-call capability ceiling' }
    if (credential && parseEther(String(args.amount)) > BigInt(credential.budget)) return { ok: false, code: 'BUDGET_EXCEEDED', reason: 'amount exceeds the credential budget' }
    return { ok: true, args: { recipient, amount: String(args.amount) } }
  }
  if (name === 'protocol.deposit') {
    if (credential && overview.policy.depositMax !== undefined && parseEther(String(overview.policy.depositMax)) > BigInt(credential.budget)) {
      return { ok: false, code: 'BUDGET_EXCEEDED', reason: 'deposit exceeds the credential budget' }
    }
    return { ok: true, args: {} }
  }
  return { ok: false, code: 'UNKNOWN_TOOL', reason: 'tool is not registered' }
}

function authorizationRequirement(name, args, overview, credential) {
  if (name !== 'vendor.pay' || Number(credential?.riskLevel || 0) >= 1) return null
  const amount = parseEther(String(args?.amount || '0'))
  const stepUpAt = parseEther(String(overview?.policy?.maxPayment || '0')) / 2n
  if (amount > stepUpAt) {
    return {
      decision: 'AUTH_REQUIRED',
      code: 'STEP_UP_REQUIRED',
      reason: 'payment exceeds the autonomous risk threshold',
      requestedTool: name,
      requiredRiskLevel: 1,
    }
  }
  return null
}

function createMcpGateway({ getOverview, getCredential, execute }) {
  const subscribers = new Set()
  let lastState = ''

  function notifyToolsChanged() {
    const message = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed', params: {} })}\n\n`
    for (const response of subscribers) {
      try { response.write(message) } catch { subscribers.delete(response) }
    }
  }

  function subscribe(response) {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    })
    subscribers.add(response)
    response.write(`event: endpoint\ndata: ${JSON.stringify({ endpoint: '/mcp' })}\n\n`)
    const heartbeat = setInterval(() => {
      try { response.write(': keep-alive\n\n') } catch { clearInterval(heartbeat); subscribers.delete(response) }
    }, 15000)
    response.on('close', () => {
      clearInterval(heartbeat)
      subscribers.delete(response)
    })
  }

  async function handle(request, context = {}) {
    const id = request?.id
    const method = request?.method
    if (request?.jsonrpc !== '2.0' || typeof method !== 'string') return jsonRpcError(id, -32600, 'invalid JSON-RPC request')

    if (method === 'initialize') {
      return jsonRpcResult(id, {
        protocolVersion: negotiateProtocolVersion(request.params?.protocolVersion),
        capabilities: { tools: { listChanged: true }, tasks: { requests: { tools: { call: {} } } } },
        serverInfo: { name: 'AIRLOCK MCP Gateway', version: '1.0.0' },
        instructions: 'AIRLOCK filters tool discovery and revalidates every call against the current release capability.',
      })
    }
    if (method === 'notifications/initialized') return null
    if (method === 'ping') return jsonRpcResult(id, {})

    const overview = await getOverview()
    const credential = await getCredential(context)
    const state = `${overview.release.status}:${overview.capability.status}:${(credential?.allowedTools || []).join(',')}`
    if (lastState && lastState !== state) notifyToolsChanged()
    lastState = state
    if (method === 'tools/list') {
      return jsonRpcResult(id, { tools: authorizedTools(credential, overview), nextCursor: undefined })
    }
    if (method !== 'tools/call') return jsonRpcError(id, -32601, `method not found: ${method}`)
    if (!credential) return jsonRpcError(id, -32001, 'AIRLOCK credential required', { decision: 'AUTH_REQUIRED', authentication: 'Bearer AirlockCredential <base64url-json>' })

    const name = request.params?.name
    const tool = toolDefinitions[name]
    if (!tool || !authorizedTools(credential, overview).some((item) => item.name === name)) {
      return jsonRpcResult(id, denial('TOOL_NOT_AUTHORIZED', 'tool is not authorized by the current capability'))
    }
    const checked = validateArguments(name, request.params?.arguments || {}, overview, credential)
    if (!checked.ok) return jsonRpcResult(id, denial(checked.code, checked.reason))
    const requirement = authorizationRequirement(name, checked.args, overview, credential)
    if (requirement) {
      return jsonRpcResult(id, {
        isError: true,
        content: [{ type: 'text', text: requirement.reason }],
        structuredContent: requirement,
      })
    }
    if (tool.riskLevel > Number(credential.riskLevel || 0)) {
      return jsonRpcResult(id, { isError: true, content: [{ type: 'text', text: 'additional authorization required' }], structuredContent: { decision: 'AUTH_REQUIRED', code: 'STEP_UP_REQUIRED', reason: 'tool risk exceeds the credential risk level', requestedTool: name } })
    }
    const result = await execute(tool.runbookStep, checked.args, { credential, tool: name, requestId: id })
    return jsonRpcResult(id, { content: [{ type: 'text', text: result.message || 'AIRLOCK action completed' }], structuredContent: { decision: result.ok ? 'ALLOW' : 'DENY', ...result } })
  }

  handle.subscribe = subscribe
  handle.notifyToolsChanged = notifyToolsChanged
  return handle
}

module.exports = { MCP_PROTOCOL_VERSION, toolDefinitions, createMcpGateway, jsonRpcError, jsonRpcResult, denial, validateArguments, authorizationRequirement }
