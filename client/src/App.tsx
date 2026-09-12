import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, Position, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'

type IconName =
  | 'activity'
  | 'arrow'
  | 'box'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'copy'
  | 'external'
  | 'fingerprint'
  | 'grid'
  | 'lock'
  | 'pause'
  | 'play'
  | 'shield'
  | 'terminal'
  | 'wallet'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    activity: 'M3 12h4l2-7 4 14 2-7h6',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    box: 'm4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10',
    check: 'm5 12 4 4L19 6',
    chevron: 'm7 10 5 5 5-5',
    clock: 'M12 7v5l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    copy: 'M8 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3M6 8h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    external: 'M14 4h6v6m-1-5-8 8M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
    fingerprint: 'M12 11a2 2 0 0 1 2 2v5m-6 0v-5a4 4 0 0 1 8 0v5M5 18v-5a7 7 0 0 1 14 0v5M3 13a9 9 0 0 1 18 0',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    lock: 'M6 10V7a6 6 0 0 1 12 0v3m-13 0h14v10H5V10Z',
    pause: 'M8 5v14M16 5v14',
    play: 'm8 5 10 7-10 7V5Z',
    shield: 'M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z',
    terminal: 'm5 7 4 5-4 5m7 0h7',
    wallet: 'M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2m-16 0h16v12H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm11 6h3',
  }

  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={paths[name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Overview = {
  mode: string
  dataSource: string
  network: { source: string; destination: string; chainKey: string }
  release: { name: string; version: string; digest: string; status: string; expiresAt: string; manifestHash?: string; artifactRoot?: string }
  evidence: Array<{ kind: string; status: string; detail: string; txHash?: string; creditcoinTxHash?: string; sourceChainKey?: number; sourceEmitter?: string; sourceTopic0?: string; sourceBlock?: number; logIndex?: number; receiptStatus?: number }>
  capability: { id?: string; status: string; spendCap: number; spent: number; callCap: number; callsUsed: number; runtimeKey: string; scopeRoot?: string; expiresAt?: string }
  freshness?: { maxAgeSeconds: number; ageSeconds: number; remainingSeconds: number; statusIssuedAt: string; statusValidUntil: string }
  policy: { recipient: string; maxPayment: number; depositMax?: number }
  actions: Array<{ action: string; target: string; amount: number; state: string; age: string; txHash?: string }>
  transactions?: {
    source?: Record<string, string>
    proofs?: Record<string, { txHash?: string; creditcoinTxHash?: string }>
    live?: Record<string, string>
  }
}
type Protocol = {
  protocolVersion: string
  dataSource: string
  releaseDigest: string | null
  mcp: { endpoint: string; protocolVersion: string; tools: string[] }
  a2a: { endpoint: string; agentCard: string }
  credential: { schema: string; audience: string; eip712: boolean; erc1271: boolean; attenuable: boolean }
  delegation: { endpoint: string; recursive: boolean; registry: string | null }
  identity: { configured: boolean; agentRegistry?: string | null; agentId?: string | null }
  releasePassport: { endpoint?: string; manifest: string | null; artifactRoot: string | null; passportHash?: string | null; verified?: boolean; verification?: { verified: boolean; checks: Record<string, PassportCheck>; errors?: string[] } }
  runtimeAssurance: RuntimeAssurance
}

type PassportCheck = { status: string; digest?: string; components?: number; specVersion?: string; predicateType?: string; builder?: string; entries?: number; error?: string }
type RuntimeAssurance = { level: string; name: string; verified: boolean; source: string; note?: string; binding?: { id?: string | null; measurement?: string | null; quoteHash?: string | null; runtimeNonce?: number | null; validAfter?: number | null; validUntil?: number | null; creditcoinTxHash?: string | null } }
type ReleasePassport = {
  verified: boolean
  releaseVersion: number
  releaseDigest: string
  manifestHash: string
  artifactRoot: string
  components: Record<string, string>
  passport: Record<string, string>
  fileCount: number
  passportVerification?: { verified: boolean; checks: Record<string, PassportCheck>; errors?: string[] }
}

type DisplayEvidence = { label: string; detail: string; time?: string; status: string; icon: IconName; txHash?: string; creditcoinTxHash?: string; sourceChainKey?: number; sourceEmitter?: string; sourceTopic0?: string; sourceBlock?: number; logIndex?: number; receiptStatus?: number }
type RunbookStep = { id: string; label: string; command: string; kind: string; status: string; canRun: boolean; requiresWrite: boolean }
type Runbook = { mode: string; writesEnabled: boolean; writeAuthRequired?: boolean; steps: RunbookStep[] }
type ExplorerLink = { label: string; hash: string; href: string }
type LiveRunStep = { id: string; label: string; status: 'queued' | 'running' | 'complete' | 'failed'; message?: string; links: ExplorerLink[] }
type RunbookResult = { ok: boolean; message: string; runbook?: Runbook; overview?: Overview; output?: string }
const API_URL = (import.meta.env.VITE_API_URL ?? 'https://airlock-control-plane.onrender.com').replace(/\/$/, '')
const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io/tx/'
const CREDITCOIN_EXPLORER = 'https://creditcoin-testnet.blockscout.com/tx/'
const liveRunPlan = [
  { id: 'preflight', label: 'Preflight checks' },
  { id: 'deploy', label: 'Deploy and seed release' },
  { id: 'proof-batch', label: 'Import four evidence proofs' },
  { id: 'execute', label: 'Issue capability and run allowed call' },
  { id: 'deposit', label: 'Run bounded protocol deposit' },
  { id: 'credential', label: 'Issue scoped AIRLOCK credential' },
  { id: 'mcp', label: 'Run the authorized MCP payment' },
  { id: 'revoke', label: 'Publish release revocation' },
  { id: 'proof-revocation', label: 'Import revocation proof' },
  { id: 'blocked', label: 'Verify the blocked post-revocation call' },
] as const

function explorerLink(hash: string | undefined, base: string, label: string): ExplorerLink | null {
  return hash ? { label, hash, href: `${base}${hash}` } : null
}

function linksForLiveStep(overview: Overview | null, stepId: string): ExplorerLink[] {
  const links: ExplorerLink[] = []
  const add = (link: ExplorerLink | null) => { if (link && !links.some((item) => item.href === link.href)) links.push(link) }
  const source = overview?.transactions?.source ?? {}
  const proofs = overview?.transactions?.proofs ?? {}
  const live = overview?.transactions?.live ?? {}
  if (stepId === 'deploy') {
    for (const [name, hash] of Object.entries(source)) add(explorerLink(hash, SEPOLIA_EXPLORER, `Sepolia ${name.replace(/Tx$/, '')}`))
  }
  if (stepId === 'proof-batch') {
    for (const [kind, value] of Object.entries(proofs).filter(([kind]) => kind !== 'revocation')) {
      add(explorerLink(value.txHash, SEPOLIA_EXPLORER, `Sepolia ${kind} event`))
      add(explorerLink(value.creditcoinTxHash, CREDITCOIN_EXPLORER, `Creditcoin ${kind} proof`))
    }
  }
  if (stepId === 'execute') {
    add(explorerLink(live.issueTx, CREDITCOIN_EXPLORER, 'Creditcoin capability issuance'))
    add(explorerLink(live.allowedActionTx, CREDITCOIN_EXPLORER, 'Creditcoin allowed action'))
  }
  if (stepId === 'mcp') add(explorerLink(live.allowedActionTx, CREDITCOIN_EXPLORER, 'Creditcoin MCP action'))
  if (stepId === 'deposit') add(explorerLink(live.depositActionTx, CREDITCOIN_EXPLORER, 'Creditcoin bounded deposit'))
  if (stepId === 'revoke') add(explorerLink(source.revocationTx, SEPOLIA_EXPLORER, 'Sepolia revocation event'))
  if (stepId === 'proof-revocation') {
    const value = proofs.revocation
    add(explorerLink(value?.txHash, SEPOLIA_EXPLORER, 'Sepolia revocation event'))
    add(explorerLink(value?.creditcoinTxHash, CREDITCOIN_EXPLORER, 'Creditcoin revocation proof'))
  }
  return links
}

function allProofLinks(overview: Overview | null): ExplorerLink[] {
  return ['artifact', 'evaluation', 'approval', 'status', 'revocation'].flatMap((kind) => linksForLiveStep(overview, kind === 'revocation' ? 'proof-revocation' : 'proof-batch').filter((link) => link.label.toLowerCase().includes(kind)))
}

const architectureNodes: Node[] = [
  { id: 'source', position: { x: 0, y: 72 }, data: { label: 'Sepolia release\nregistries' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'proof', position: { x: 180, y: 72 }, data: { label: 'Attestcoin\ninclusion + continuity' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'adapter', position: { x: 360, y: 72 }, data: { label: 'Receipt decoder\n+ proof adapter' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'evidence', position: { x: 540, y: 72 }, data: { label: 'Evidence + policy\nregistries' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'issuer', position: { x: 720, y: 72 }, data: { label: 'Capability\nissuer' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'router', position: { x: 900, y: 72 }, data: { label: 'ToolRouter\nEIP-712 + validators' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'vault', position: { x: 1080, y: 72 }, data: { label: 'AgentVault\nallowlisted action' }, targetPosition: Position.Left },
  { id: 'runtime', position: { x: 540, y: 238 }, data: { label: 'Optional TEE\nruntime binding' }, sourcePosition: Position.Right, targetPosition: Position.Left },
  { id: 'delegation', position: { x: 810, y: 238 }, data: { label: 'Attenuated child\ncapabilities' }, sourcePosition: Position.Right, targetPosition: Position.Left },
]

const architectureEdges: Edge[] = [
  { id: 'source-proof', source: 'source', target: 'proof', animated: true },
  { id: 'proof-adapter', source: 'proof', target: 'adapter', animated: true },
  { id: 'adapter-evidence', source: 'adapter', target: 'evidence', animated: true },
  { id: 'evidence-issuer', source: 'evidence', target: 'issuer', animated: true },
  { id: 'issuer-router', source: 'issuer', target: 'router', animated: true },
  { id: 'router-vault', source: 'router', target: 'vault', animated: true },
  { id: 'runtime-issuer', source: 'runtime', target: 'issuer' },
  { id: 'issuer-delegation', source: 'issuer', target: 'delegation' },
  { id: 'delegation-router', source: 'delegation', target: 'router' },
]

function ArchitectureDiagram() {
  return <div className="architecture-flow"><ReactFlow nodes={architectureNodes} edges={architectureEdges} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} panOnDrag zoomOnScroll={false} proOptions={{ hideAttribution: true }}><Background color="#243438" gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
}

function shortHash(value?: string | null) {
  return value && value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || '—'
}

function checkName(name: string) {
  return name === 'sbom' ? 'CycloneDX SBOM' : name === 'provenance' ? 'SLSA provenance' : name === 'sigstore' ? 'Sigstore' : name === 'rekor' ? 'Rekor' : name === 'oci' ? 'OCI registry' : 'Container digest'
}

function PassportChecks({ checks }: { checks?: Record<string, PassportCheck> }) {
  return <div className="passport-checks">{['container', 'sbom', 'provenance', 'sigstore', 'rekor', 'oci'].map((name) => { const check = checks?.[name]; const status = check?.status ?? 'not-configured'; return <span className={`passport-check ${status}`} key={name}><i /> {checkName(name)} · {status}</span> })}</div>
}

async function waitForRunbookStep(
  step: RunbookStep,
  beforeOverview: Overview | null,
  headers: Record<string, string>,
  onRefresh: (runbook?: Runbook, overview?: Overview) => void,
): Promise<RunbookResult> {
  const startedAt = Date.now()
  const proofEvidence: Record<string, string> = {
    'proof-artifact': 'Artifact',
    'proof-evaluation': 'Evaluation',
    'proof-approval': 'Approval',
    'proof-status': 'Active status',
    'proof-revocation': 'Active status',
  }
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 3000))
    try {
      const [runbookResponse, overviewResponse] = await Promise.all([
        fetch(`${API_URL}/api/runbook`, { headers }),
        fetch(`${API_URL}/api/overview`, { headers }),
      ])
      const nextRunbook = runbookResponse.ok ? await runbookResponse.json() as Runbook : undefined
      const nextOverview = overviewResponse.ok ? await overviewResponse.json() as Overview : undefined
      onRefresh(nextRunbook, nextOverview)
      const nextStep = nextRunbook?.steps.find((item) => item.id === step.id)
      const evidenceKind = proofEvidence[step.id]
      const evidenceDone = evidenceKind && nextOverview?.evidence.some((item) => item.kind === evidenceKind && (item.status === 'PROVEN' || (step.id === 'proof-revocation' && item.status === 'REVOKED')))
      const chainStateChanged = beforeOverview && nextOverview && (
        (step.id === 'deploy' && beforeOverview.release.digest !== nextOverview.release.digest)
        || (step.id === 'execute' && beforeOverview.capability.status !== 'ACTIVE' && nextOverview.capability.status === 'ACTIVE')
        || (step.id === 'deposit' && nextOverview.actions.length > beforeOverview.actions.length)
        || (step.id === 'revoke' && beforeOverview.release.status !== 'REVOKED' && nextOverview.release.status === 'REVOKED')
        || (step.id === 'proof-revocation' && nextOverview.release.status === 'REVOKED')
      )
      if ((nextStep?.status === 'COMPLETE' && step.status !== 'COMPLETE') || evidenceDone || chainStateChanged) {
        return { ok: true, message: `${step.label} complete`, runbook: nextRunbook, overview: nextOverview }
      }
    } catch {
      // Keep polling while the control-plane request is still running.
    }
  }
  return { ok: false, message: `${step.label} is still running on the control plane; refresh Runbook to check its status` }
}

function DemoPage({ onHome }: { onHome: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [actionResult, setActionResult] = useState<'idle' | 'allowed' | 'blocked'>('idle')
  const [actionReason, setActionReason] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [runbook, setRunbook] = useState<Runbook | null>(null)
  const [runbookRunning, setRunbookRunning] = useState('')
  const [runbookMessage, setRunbookMessage] = useState('')
  const [writeToken, setWriteToken] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [passport, setPassport] = useState<ReleasePassport | null>(null)
  const [credentialToken, setCredentialToken] = useState('')
  const [protocolMessage, setProtocolMessage] = useState('')
  const [liveRunState, setLiveRunState] = useState<'idle' | 'running' | 'complete' | 'failed'>('idle')
  const [liveRunMessage, setLiveRunMessage] = useState('')
  const [liveRunSteps, setLiveRunSteps] = useState<LiveRunStep[]>(liveRunPlan.map((step) => ({ ...step, status: 'queued', links: [] })))

  useEffect(() => {
    let mounted = true
    fetch(`${API_URL}/api/overview`)
      .then((response) => response.json().then((value: Overview) => { if (mounted) { setOverview(value); setLoadError(false) }; return value }))
      .catch(() => { if (mounted) setLoadError(true) })
    fetch(`${API_URL}/api/runbook`)
      .then((response) => response.json().then((value: Runbook) => { if (mounted) setRunbook(value); return value }))
      .catch(() => { if (mounted) setRunbook(null) })
    fetch(`${API_URL}/api/protocol`)
      .then((response) => response.json().then((value: Protocol) => { if (mounted) setProtocol(value); return value }))
      .catch(() => { if (mounted) setProtocol(null) })
    fetch(`${API_URL}/api/release-passport`)
      .then((response) => response.json().then((value: ReleasePassport) => { if (mounted) setPassport(value); return value }))
      .catch(() => { if (mounted) setPassport(null) })
    return () => { mounted = false }
  }, [])

  const issueCredential = async (operatorTokenOverride?: string): Promise<{ ok: boolean; message: string; token?: string }> => {
    const operatorToken = runbook?.writeAuthRequired && !writeToken
      ? operatorTokenOverride || window.prompt('Enter the AIRLOCK operator token')?.trim() || ''
      : operatorTokenOverride || writeToken
    if (runbook?.writeAuthRequired && !operatorToken) {
      const message = 'operator token required; no credential was issued'
      setProtocolMessage(message)
      return { ok: false, message }
    }
    if (operatorToken && operatorToken !== writeToken) setWriteToken(operatorToken)
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (operatorToken) headers.authorization = `Bearer ${operatorToken}`
      const response = await fetch(`${API_URL}/api/credentials/issue`, { method: 'POST', headers, body: '{}' })
      const value = await response.json() as { credential?: object; signature?: string; error?: string }
      if (!response.ok || !value.credential || !value.signature) throw new Error(value.error || 'credential issuance failed')
      const encoded = btoa(JSON.stringify({ credential: value.credential, signature: value.signature })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
      const token = `Bearer AirlockCredential ${encoded}`
      const message = 'credential issued; copy it into the agent runtime Authorization header'
      setCredentialToken(token)
      setProtocolMessage(message)
      return { ok: true, message, token }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'credential issuance failed'
      setProtocolMessage(message)
      return { ok: false, message }
    }
  }

  const callMcp = async (currentOverview: Overview | null = displayOverview, credentialOverride = credentialToken): Promise<{ ok: boolean; message: string; overview?: Overview }> => {
    if (!credentialOverride) {
      const message = 'issue an AIRLOCK credential first'
      setProtocolMessage(message)
      return { ok: false, message }
    }
    const recipient = currentOverview?.policy.recipient
    if (!recipient) {
      const message = 'live policy unavailable; no MCP call was submitted'
      setProtocolMessage(message)
      return { ok: false, message }
    }
    try {
      const response = await fetch(`${API_URL}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: credentialOverride },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'web-payment',
          method: 'tools/call',
          params: { name: 'vendor.pay', arguments: { recipient, amount: (Math.min(currentOverview?.policy.maxPayment ? currentOverview.policy.maxPayment / 4 : 0.0001, 0.0001)).toFixed(18).replace(/0+$/, '') } },
        }),
      })
      const value = await response.json() as { result?: { structuredContent?: { decision?: string; reason?: string; message?: string; overview?: Overview } }; error?: string }
      if (!response.ok || value.error) throw new Error(value.error || 'MCP request failed')
      const decision = value.result?.structuredContent?.decision || 'UNKNOWN'
      const result = value.result?.structuredContent
      const reason = result?.reason || result?.message || 'live MCP response received'
      const message = `MCP ${decision}: ${reason}`
      setProtocolMessage(message)
      return { ok: decision === 'ALLOW', message, overview: result?.overview }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP request failed'
      setProtocolMessage(message)
      return { ok: false, message }
    }
  }

  const liveData = overview?.dataSource === 'creditcoin-chain'
  const chainUnavailable = loadError || overview?.dataSource === 'rpc-error'
  const displayOverview = liveData && !chainUnavailable ? overview : null
  const displayEvidence: DisplayEvidence[] = displayOverview?.evidence.map((item, index) => ({ label: item.kind, detail: item.detail, status: item.status, time: 'chain', icon: ['box', 'activity', 'fingerprint', 'shield'][index] as IconName, txHash: item.txHash, creditcoinTxHash: item.creditcoinTxHash, sourceChainKey: item.sourceChainKey, sourceEmitter: item.sourceEmitter, sourceTopic0: item.sourceTopic0, sourceBlock: item.sourceBlock, logIndex: item.logIndex, receiptStatus: item.receiptStatus })) ?? []
  const displayActivity = displayOverview?.actions.map((item) => ({ ...item, amount: `${item.amount.toFixed(4)} native`, state: item.state.includes('Allowed') ? 'Allowed' : 'Blocked' })) ?? []
  const release = displayOverview?.release ?? { name: '—', version: '—', digest: '—', status: 'UNAVAILABLE', expiresAt: '—' }
  const displayCapability = displayOverview?.capability
  const freshness = displayOverview?.freshness
  const verifiedEvidence = displayEvidence.filter((item) => item.status === 'PROVEN' || item.status === 'REVOKED').length
  const network = displayOverview?.network ?? { source: '—', destination: '—', chainKey: '—' }
  const capabilityState = displayOverview?.capability.status ?? 'UNAVAILABLE'
  const releaseStatus = release.status
  const actionCopy = useMemo(() => {
    if (actionResult === 'allowed') return { title: 'Intent authorized', body: actionReason || 'Scope, validator, nonce, and budget checks passed.', tone: 'success' }
    if (actionResult === 'blocked') return { title: 'Intent blocked', body: actionReason || 'Recipient is outside the approved capability scope.', tone: 'danger' }
    return null
  }, [actionResult, actionReason])

  const executeRunbook = async (step: RunbookStep, options: { confirm?: boolean; operatorToken?: string } = {}): Promise<RunbookResult> => {
    if (step.requiresWrite && options.confirm !== false && !window.confirm(`Run ${step.label}? This may send a real testnet transaction.`)) return { ok: false, message: 'action cancelled' }
    const operatorToken = step.requiresWrite && runbook?.writeAuthRequired && !writeToken
      ? options.operatorToken || window.prompt('Enter the AIRLOCK operator token')?.trim() || ''
      : options.operatorToken || writeToken
    if (step.requiresWrite && runbook?.writeAuthRequired && !operatorToken) {
      const message = 'operator token required; no action was submitted'
      setRunbookMessage(message)
      return { ok: false, message }
    }
    if (operatorToken && operatorToken !== writeToken) setWriteToken(operatorToken)
    setRunbookRunning(step.id)
    setRunbookMessage('')
    const beforeOverview = overview
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (operatorToken) headers.authorization = `Bearer ${operatorToken}`
      const response = await fetch(`${API_URL}/api/runbook/execute`, {
        method: 'POST', headers, body: JSON.stringify({ step: step.id }),
      })
      const result = await response.json() as { ok?: boolean; output?: string; error?: string; runbook?: Runbook }
      if (result.runbook) setRunbook(result.runbook)
      const message = result.output || result.error || (result.ok ? 'step complete' : 'step failed')
      setRunbookMessage(message)
      let nextOverview: Overview | undefined
      if (result.ok) {
        const refreshed = await fetch(`${API_URL}/api/overview`)
        if (refreshed.ok) {
          nextOverview = await refreshed.json() as Overview
          setOverview(nextOverview)
        }
      }
      return { ok: Boolean(result.ok && response.ok), message, runbook: result.runbook, overview: nextOverview, output: result.output }
    } catch {
      setRunbookMessage(`${step.label} is running on the control plane…`)
      const recovered = await waitForRunbookStep(step, beforeOverview, operatorToken ? { authorization: `Bearer ${operatorToken}` } : {}, (nextRunbook, nextOverview) => {
        if (nextRunbook) setRunbook(nextRunbook)
        if (nextOverview) setOverview(nextOverview)
      })
      const message = recovered.message
      setRunbookMessage(message)
      return recovered
    } finally {
      setRunbookRunning('')
    }
  }

  const runActualAction = async (stepId: 'execute' | 'blocked') => {
    const step = runbook?.steps.find((item) => item.id === stepId)
    if (!step) {
      setActionResult('blocked')
      setActionReason('live runbook unavailable; no action was submitted')
      return
    }
    const result = await executeRunbook(step)
    setActionResult(stepId === 'blocked' ? 'blocked' : result.ok ? 'allowed' : 'blocked')
    setActionReason(stepId === 'blocked' && result.ok ? 'post-revocation router rejection confirmed on-chain' : result.message)
  }

  const runLive = async () => {
    setActiveNav('Live')
    if (liveRunState === 'running') return
    if (!runbook?.writesEnabled) {
      const message = 'live writes are disabled on the control plane'
      setLiveRunState('failed')
      setLiveRunMessage(message)
      return
    }
    if (!window.confirm('Run the complete live protocol path? This submits real testnet transactions and ends with a revocation check.')) return
    const operatorToken = runbook.writeAuthRequired && !writeToken
      ? window.prompt('Enter the AIRLOCK operator token')?.trim() || ''
      : writeToken
    if (runbook.writeAuthRequired && !operatorToken) {
      const message = 'operator token required; no live run was submitted'
      setLiveRunState('failed')
      setLiveRunMessage(message)
      return
    }
    if (operatorToken && operatorToken !== writeToken) setWriteToken(operatorToken)
    setCredentialToken('')
    setLiveRunSteps(liveRunPlan.map((step) => ({ ...step, status: 'queued' as const, links: [] })))
    setLiveRunState('running')
    setLiveRunMessage('Starting the live protocol path…')
    let currentOverview = overview
    let issuedCredential = ''
    const updateStep = (id: string, update: Partial<LiveRunStep>) => setLiveRunSteps((current) => current.map((step) => step.id === id ? { ...step, ...update } : step))
    const refreshOverview = async () => {
      try {
        const response = await fetch(`${API_URL}/api/overview`)
        if (!response.ok) return currentOverview
        const next = await response.json() as Overview
        currentOverview = next
        setOverview(next)
        return next
      } catch {
        return currentOverview
      }
    }
    try {
      for (const planStep of liveRunPlan) {
        updateStep(planStep.id, { status: 'running', message: 'Submitting…' })
        let result: RunbookResult
        if (planStep.id === 'credential') {
          const credentialResult = await issueCredential(operatorToken)
          issuedCredential = credentialResult.token || issuedCredential
          result = { ok: credentialResult.ok, message: credentialResult.message }
        } else if (planStep.id === 'mcp') {
          const mcpResult = await callMcp(currentOverview, issuedCredential)
          result = { ok: mcpResult.ok, message: mcpResult.message, overview: mcpResult.overview }
        } else {
          const runbookStep = runbook.steps.find((step) => step.id === planStep.id)
          if (!runbookStep) throw new Error(`${planStep.label} is not available in the server runbook`)
          result = await executeRunbook(runbookStep, { confirm: false, operatorToken })
        }
        currentOverview = result.overview || await refreshOverview()
        if (!result.ok) throw new Error(result.message)
        const links = linksForLiveStep(currentOverview, planStep.id)
        updateStep(planStep.id, { status: 'complete', message: result.message, links })
        setLiveRunMessage(result.message)
      }
      setLiveRunState('complete')
      setLiveRunMessage('Live protocol path complete: authority was issued, used, revoked, and rejected after revocation.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'live run failed'
      setLiveRunState('failed')
      setLiveRunMessage(message)
      setLiveRunSteps((current) => current.map((step) => step.status === 'running' ? { ...step, status: 'failed', message } : step))
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-head"><button className="brand brand-link" onClick={onHome} aria-label="Back to AIRLOCK landing page">
          <div className="brand-mark"><span /></div>
          <div><div className="brand-name">AIRLOCK</div><div className="brand-subtitle">release firewall</div></div>
        </button><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name="chevron" size={16} /></button></div>
        <div className="network-status"><span className="status-dot" /> CC3 TESTNET <span className="network-chevron">⌄</span></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {[
            ['Overview', 'grid'],
            ['Evidence graph', 'shield'],
            ['Capabilities', 'lock'],
            ['Action log', 'activity'],
            ['Runbook', 'terminal'],
            ['Protocol', 'fingerprint'],
          ].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => setActiveNav(label)}>
              <Icon name={icon as IconName} size={17} /><span>{label}</span>{label === 'Evidence graph' && <span className="nav-count">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-live"><div className="nav-label">Live</div><button className={`live-run-button ${liveRunState}`} onClick={runLive} disabled={liveRunState === 'running'} title="Run the live protocol path end to end"><Icon name={liveRunState === 'running' ? 'activity' : 'play'} size={16} /><span>{liveRunState === 'running' ? 'Running…' : liveRunState === 'complete' ? 'Run again' : 'Run end to end'}</span></button><small>{liveRunState === 'running' ? liveRunSteps.find((step) => step.status === 'running')?.label ?? 'working' : 'testnet transactions + proofs'}</small></div>
        <div className="sidebar-bottom">
          <div className="nav-label">Current release</div>
          <div className="release-mini"><div className="release-mini-icon"><Icon name="box" size={16} /></div><div className="release-mini-copy"><strong>{release.name}</strong><span>v{release.version} · {releaseStatus.toLowerCase()}</span></div><span className="mini-check"><Icon name="check" size={12} /></span></div>
          <button className="settings-button" onClick={() => setActiveNav('Runbook')}><Icon name="terminal" size={16} /><span>Runbook</span></button>
          <div className="user-row"><div className="avatar">OP</div><div><strong>Organization</strong><span>Operator</span></div><Icon name="chevron" size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Organization</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="live-indicator"><span className="status-dot" /> {chainUnavailable ? 'chain unavailable' : liveData ? 'chain data' : 'waiting for chain'}</div><button className="icon-button" aria-label="Open proof inspector" onClick={() => setActiveNav('Evidence graph')}><Icon name="terminal" size={17} /></button><div className="wallet-chip"><span className="wallet-avatar"><Icon name="wallet" size={14} /></span><span>{displayOverview?.capability.runtimeKey ?? '—'}</span></div></div></header>

        {activeNav === 'Overview' && <div className="page-body">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / RELEASE AUTHORITY</div><h1>Release firewall</h1><p>Cryptographic evidence decides what your agent can do.</p></div><div className="heading-actions">{displayEvidence[0]?.creditcoinTxHash && <a className="secondary-button" href={`${CREDITCOIN_EXPLORER}${displayEvidence[0].creditcoinTxHash}`} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> View proof on Blockscout</a>}<button className="primary-button" disabled={!runbook?.writesEnabled || liveRunState === 'running'} onClick={() => setActiveNav('Live')}><Icon name="play" size={15} /> Open live run</button></div></section>
          <section className="metric-grid" aria-label="Release metrics"><div className="metric-card metric-highlight"><div className="metric-top"><span>Release state</span><Icon name="shield" size={18} /></div><div className="metric-value status-value"><span className="large-dot" /> {capabilityState}</div><div className="metric-foot">{liveData ? 'Read from Creditcoin' : 'Waiting for chain data'}</div></div><div className="metric-card"><div className="metric-top"><span>Evidence records</span><span className="metric-accent">{`${verifiedEvidence.toString().padStart(2, '0')} / 04`}</span></div><div className="metric-value">{liveData ? (verifiedEvidence === 4 ? 'VERIFIED' : 'PENDING') : 'UNAVAILABLE'}</div><div className="metric-foot">Active status may now be revoked</div></div><div className="metric-card"><div className="metric-top"><span>Spend remaining</span><span className="metric-accent">{displayOverview ? `${Math.max(0, Math.round(((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100))}%` : '—'}</span></div><div className="metric-value">{displayOverview ? `${Math.max(0, displayOverview.capability.spendCap - displayOverview.capability.spent).toFixed(4)} native` : '—'}</div><div className="meter"><span style={{ width: `${displayOverview ? Math.max(0, Math.min(100, ((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100)) : 0}%` }} /></div><div className="metric-foot">{displayOverview ? `of ${displayOverview.capability.spendCap.toFixed(4)} native total cap` : 'No chain decision'}</div></div><div className="metric-card"><div className="metric-top"><span>Status freshness</span><Icon name="clock" size={17} /></div><div className="metric-value">{displayOverview ? releaseStatus === 'REVOKED' ? 'closed' : freshness ? `${Math.ceil(freshness.remainingSeconds / 60)}m` : '—' : '—'}</div><div className="metric-foot">{liveData ? `max age ${Math.ceil((freshness?.maxAgeSeconds ?? 0) / 60)}m · source status` : 'No chain decision'}</div></div></section>

          <section className="release-layout"><div className="panel release-panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZED RELEASE</div><h2>{release.name} <span>/</span> v{release.version}</h2></div><div className="verified-badge"><Icon name="check" size={13} /> {liveData ? release.status : 'UNAVAILABLE'}</div></div><div className="digest-row"><span className="digest-label">releaseDigest</span><code>{release.digest}</code><button className="copy-button" aria-label="Copy release digest" title="Copy release digest" onClick={() => navigator.clipboard?.writeText(protocol?.releaseDigest || release.digest)}><Icon name="copy" size={14} /></button></div><div className="release-divider" /><div className="release-details"><div><span>Runtime key</span><strong><span className="key-dot" /> {displayOverview?.capability.runtimeKey ?? '—'}</strong></div><div><span>Policy</span><strong>{displayOverview ? 'on-chain policy' : '—'}</strong></div><div><span>Status issued</span><strong>{freshness?.statusIssuedAt ?? '—'}</strong></div><div><span>Expires</span><strong>{displayOverview?.capability.expiresAt ?? '—'}</strong></div><div><span>Manifest hash</span><strong>{release.manifestHash ? `${release.manifestHash.slice(0, 10)}…${release.manifestHash.slice(-8)}` : '—'}</strong></div><div><span>Artifact root</span><strong>{release.artifactRoot ? `${release.artifactRoot.slice(0, 10)}…${release.artifactRoot.slice(-8)}` : '—'}</strong></div></div><div className="source-chain"><span className="chain-icon eth">◆</span><span>{network.source}</span><Icon name="arrow" size={16} /><span className="chain-icon cc">C</span><span>{network.destination}</span><span className="chain-confirm"><Icon name="check" size={12} /> {liveData ? 'proof verified' : 'waiting for chain'}</span></div></div>
            <div className="panel boundary-panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>What the agent can do</h2></div><span className="live-pill"><span className="status-dot" /> {liveData ? 'chain' : 'unavailable'}</span></div><div className="boundary-list"><div className="boundary-row"><div className="boundary-icon green"><Icon name="wallet" size={16} /></div><div><strong>Vendor payment</strong><span>Registered recipient</span></div><b>≤ {displayOverview ? `${displayOverview.policy.maxPayment} native` : '—'}</b></div><div className="boundary-row"><div className="boundary-icon amber"><Icon name="box" size={16} /></div><div><strong>Protocol deposit</strong><span>Bounded service call</span></div><b>≤ {displayOverview?.policy.depositMax ? `${displayOverview.policy.depositMax} native` : '—'}</b></div><div className="boundary-row"><div className="boundary-icon purple"><Icon name="activity" size={16} /></div><div><strong>Call budget</strong><span>Nonces are single-use</span></div><b>{displayOverview ? `${displayOverview.capability.callCap} calls` : '—'}</b></div></div><div className="boundary-note"><Icon name="lock" size={14} /> No raw transaction access · no vault withdrawal</div></div></section>

          <section className="assurance-grid" aria-label="Release assurance"><div className="panel assurance-panel"><div className="panel-kicker">RUNTIME ASSURANCE</div><div className="assurance-heading"><h2>{protocol?.runtimeAssurance.level ?? '—'} · {protocol?.runtimeAssurance.name ?? 'unavailable'}</h2><span className="verified-badge"><Icon name="check" size={12} /> {protocol?.runtimeAssurance.verified ? 'verified' : 'unavailable'}</span></div><div className="assurance-details"><div><span>TEE measurement</span><code>{shortHash(protocol?.runtimeAssurance.binding?.measurement)}</code></div><div><span>Quote hash</span><code>{shortHash(protocol?.runtimeAssurance.binding?.quoteHash)}</code></div><div><span>Binding transaction</span>{protocol?.runtimeAssurance.binding?.creditcoinTxHash ? <a href={`${CREDITCOIN_EXPLORER}${protocol.runtimeAssurance.binding.creditcoinTxHash}`} target="_blank" rel="noreferrer">{shortHash(protocol.runtimeAssurance.binding.creditcoinTxHash)} <Icon name="external" size={11} /></a> : <code>—</code>}</div></div></div><div className="panel assurance-panel"><div className="panel-kicker">RELEASE PASSPORT</div><div className="assurance-heading"><h2>{protocol?.releasePassport.verified ? 'Verified content' : 'Passport unavailable'}</h2><span className="live-pill"><span className="status-dot" /> {protocol?.releasePassport.verification?.verified ? 'chain matched' : 'inspect'}</span></div><PassportChecks checks={protocol?.releasePassport.verification?.checks} /></div><div className="panel assurance-panel"><div className="panel-kicker">AGENT IDENTITY</div><div className="assurance-heading"><h2>{protocol?.identity.configured ? `ERC-8004 · ${protocol.identity.agentId}` : 'Not configured'}</h2><span className="live-pill"><span className="status-dot" /> {protocol?.identity.configured ? 'registered' : '—'}</span></div><code>{protocol?.identity.agentRegistry ?? '—'}</code><p className="assurance-note">The identity discovers the agent. AIRLOCK still decides whether this release may act.</p></div></section>

          <section className="panel evidence-panel"><div className="panel-header evidence-heading"><div><div className="panel-kicker">EVIDENCE GRAPH</div><h2>Four independent proofs. One release.</h2></div><button className="text-button" onClick={() => setActiveNav('Evidence graph')}>Open inspector <Icon name="arrow" size={14} /></button></div><div className="evidence-track">{displayEvidence.map((item, index) => <div className="evidence-item" key={item.label}><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><div className="evidence-copy"><strong>{item.label}</strong><span>{item.detail}</span><small>{item.time ?? 'chain'} · <b>{item.status}</b></small></div>{index < displayEvidence.length - 1 && <div className="evidence-connector"><span /></div>}</div>)}</div><div className="evidence-footer"><span><span className="status-dot" /> {liveData ? 'All proofs read from Creditcoin for ' : 'Chain data unavailable for '}<code>{release.digest}</code></span><span>source chain key <b>{liveData ? network.chainKey : '—'}</b></span></div></section>

          <section className="bottom-grid"><div className="panel action-panel"><div className="panel-header"><div><div className="panel-kicker">ACTION GATE</div><h2>Execute through the boundary</h2></div><span className="action-state"><span className="status-dot" /> {liveData && releaseStatus === 'ACTIVE' && runbook?.writesEnabled ? 'signer ready' : releaseStatus === 'REVOKED' ? 'release revoked' : liveData ? 'writes disabled' : 'unavailable'}</span></div><p className="panel-description">The model proposes. AIRLOCK validates the exact intent before the vault can move value.</p><div className="intent-preview"><div className="intent-line"><span>tool</span><code>vendor.pay</code><span className="intent-allow">ALLOWLISTED</span></div><div className="intent-line"><span>recipient</span><code>{displayOverview?.policy.recipient ?? '—'}</code><span>{displayOverview ? `≤ $${displayOverview.policy.maxPayment.toFixed(2)}` : '—'}</span></div><div className="intent-line"><span>nonce</span><code>01</code><span>deadline 60s</span></div></div><div className="action-buttons"><button className="primary-button" disabled={!displayOverview || releaseStatus !== 'ACTIVE' || !runbook?.writesEnabled || runbookRunning !== ''} onClick={() => runActualAction('execute')}><Icon name="play" size={15} /> {releaseStatus === 'REVOKED' ? 'Release revoked' : 'Run allowed call'}</button><button className="danger-button" disabled={!displayOverview || !runbook?.writesEnabled || runbookRunning !== ''} onClick={() => runActualAction('blocked')}><Icon name="shield" size={15} /> Run blocked check</button></div>{actionCopy && <div className={`action-result ${actionCopy.tone}`}><span className="result-icon"><Icon name={actionCopy.tone === 'success' ? 'check' : 'shield'} size={15} /></span><div><strong>{actionCopy.title}</strong><span>{actionCopy.body}</span></div><button onClick={() => { setActionResult('idle'); setActionReason('') }} aria-label="Dismiss result">×</button></div>}</div>
            <div className="panel activity-panel"><div className="panel-header"><div><div className="panel-kicker">RECENT ACTIVITY</div><h2>Enforcement log</h2></div><button className="text-button" onClick={() => setActiveNav('Action log')}>View all <Icon name="arrow" size={14} /></button></div><div className="activity-table"><div className="table-head"><span>Action</span><span>Value</span><span>Result</span></div>{displayActivity.map((row) => <div className="table-row" key={`${row.action}-${row.age}`}><div><strong>{row.action}</strong><small>{row.target} · {row.age}</small></div><span>{row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b></div>)}</div></div></section>
        </div>}

        {activeNav === 'Live' && <LiveRunPanel state={liveRunState} steps={liveRunSteps} message={liveRunMessage} overview={displayOverview} protocol={protocol} passport={passport} writesEnabled={Boolean(runbook?.writesEnabled)} onRun={runLive} />}
        {activeNav !== 'Overview' && activeNav !== 'Live' && <DetailView activeNav={activeNav} onBack={() => setActiveNav('Overview')} evidenceItems={displayEvidence} capability={displayCapability} activity={displayActivity} unavailable={!displayOverview} runbook={runbook} runbookRunning={runbookRunning} runbookMessage={runbookMessage} onRunbookStep={executeRunbook} protocol={protocol} credentialToken={credentialToken} protocolMessage={protocolMessage} onIssueCredential={issueCredential} onCallMcp={callMcp} />}
      </main>
    </div>
  )
}

const liveStepTechnical: Record<string, string> = {
  preflight: 'Checks both chain IDs, funded roles, the release manifest, Proof Builder, and deployment addresses without submitting a transaction.',
  deploy: 'Deploys the registries, adapter, policy, issuer, delegation registry, router, vault, and validators, then emits four source-chain release events.',
  'proof-batch': 'Attestcoin supplies inclusion, Merkle, and continuity data. Creditcoin decodes each receipt and accepts only matching evidence fields.',
  execute: 'The issuer creates a release-bound capability. The runtime signs an EIP-712 ToolIntent; the router checks scope, calldata, recipient, value, nonce, deadline, and budget.',
  deposit: 'A second allowlisted function proves that authority is scoped to exact target/function pairs, not a general-purpose wallet or raw transaction path.',
  credential: 'The server signs AIRLOCK_CREDENTIAL_V1 with the release digest, capability ID, audience, evidence root, policy hash, scope, budget, and expiry.',
  mcp: 'The MCP gateway filters tools/list and revalidates tools/call against live Creditcoin capability state immediately before execution.',
  revoke: 'A monotonic ReleaseRevoked event is published on Sepolia with a higher status nonce. Existing runtime signatures cannot override current status.',
  'proof-revocation': 'The revocation receipt is proven through Attestcoin and imported into Creditcoin, marking the release unusable.',
  blocked: 'The previously signed intent is replayed as a static call. The router rejects it because the release status is revoked.',
}

function LiveRunPanel({ state, steps, message, overview, protocol, passport, writesEnabled, onRun }: { state: 'idle' | 'running' | 'complete' | 'failed'; steps: LiveRunStep[]; message: string; overview: Overview | null; protocol: Protocol | null; passport: ReleasePassport | null; writesEnabled: boolean; onRun: () => void }) {
  const proofLinks = allProofLinks(overview)
  const liveLinks = Object.entries(overview?.transactions?.live ?? {}).map(([name, hash]) => explorerLink(hash, CREDITCOIN_EXPLORER, `Creditcoin ${name.replace(/Tx$/, '')}`)).filter((link): link is ExplorerLink => Boolean(link))
  const proofRecords = Object.entries(overview?.transactions?.proofs ?? {}).filter(([kind]) => kind !== 'batch')
  return <div className="detail-page live-run-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / LIVE PROTOCOL</div><h1>Run the authority path</h1><p>Deploy, prove, authorize, execute, revoke, and verify the final rejection from one control surface.</p></div><button className="primary-button" onClick={onRun} disabled={state === 'running' || !writesEnabled}><Icon name={state === 'running' ? 'activity' : 'play'} size={15} />{state === 'running' ? 'Running…' : state === 'complete' ? 'Run again' : writesEnabled ? 'Run end to end' : 'Writes disabled'}</button></div>
    {message && <pre className={`live-run-message ${state}`}>{message}</pre>}
    <div className="live-run-trust"><div><span>Runtime</span><strong>{protocol?.runtimeAssurance.level ?? '—'} · {protocol?.runtimeAssurance.name ?? 'unavailable'}</strong><small>{shortHash(protocol?.runtimeAssurance.binding?.measurement)} measurement</small></div><div><span>Passport</span><strong>{passport?.passportVerification?.verified ? 'verified' : 'unavailable'}</strong><small>{passport ? `${passport.fileCount} files · ${passport.releaseDigest}` : 'release content not loaded'}</small></div><div><span>Identity</span><strong>{protocol?.identity.configured ? `ERC-8004 #${protocol.identity.agentId}` : 'unavailable'}</strong><small>{protocol?.identity.agentRegistry ?? 'agent registry not configured'}</small></div></div>
    <div className="live-run-layout"><section className="panel live-run-panel"><div className="panel-header"><div><div className="panel-kicker">LIVE RUN</div><h2>Protocol steps</h2></div><span className={`runbook-mode ${state === 'complete' ? 'enabled' : ''}`}><span className="status-dot" /> {state}</span></div><div className="live-run-list">{steps.map((step, index) => <div className={`live-run-row ${step.status}`} key={step.id}><span className="live-run-number">{String(index + 1).padStart(2, '0')}</span><span className="live-run-dot" /><div className="live-run-copy"><strong>{step.label}</strong><small>{step.message || step.status}</small><p className="live-run-detail">{liveStepTechnical[step.id]}</p>{step.links.length > 0 && <div className="live-run-links">{step.links.map((link) => <a href={link.href} target="_blank" rel="noreferrer" key={`${step.id}-${link.href}`}>{link.label} <Icon name="external" size={11} /></a>)}</div>}</div></div>)}</div></section>
      <section className="panel live-evidence-panel"><div className="panel-header"><div><div className="panel-kicker">CHAIN RECEIPTS</div><h2>Evidence ledger</h2></div><span className="live-pill"><span className="status-dot" /> {overview?.network.destination ?? 'waiting'}</span></div><div className="live-state-grid"><div><span>Release</span><strong>{overview?.release.status ?? '—'}</strong></div><div><span>Evidence</span><strong>{overview ? `${overview.evidence.filter((item) => item.status === 'PROVEN' || item.status === 'REVOKED').length} / 4` : '—'}</strong></div><div><span>Capability</span><strong>{overview?.capability.status ?? '—'}</strong></div></div><div className="live-proof-list">{proofRecords.map(([kind, record]) => <div className="live-proof-row" key={kind}><div><strong>{kind}</strong><small>{record.txHash ? 'source event' : 'proof pending'} · {record.creditcoinTxHash ? 'imported on Creditcoin' : 'import pending'}</small></div><div>{record.txHash && <a href={`${SEPOLIA_EXPLORER}${record.txHash}`} target="_blank" rel="noreferrer">Sepolia <Icon name="external" size={11} /></a>}{record.creditcoinTxHash && <a href={`${CREDITCOIN_EXPLORER}${record.creditcoinTxHash}`} target="_blank" rel="noreferrer">Creditcoin <Icon name="external" size={11} /></a>}</div></div>)}</div>{(proofLinks.length > 0 || liveLinks.length > 0) && <div className="live-ledger-footer"><span>{proofLinks.length + liveLinks.length} explorer links captured from the current run</span><div>{[...proofLinks, ...liveLinks].map((link) => <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label} <Icon name="external" size={11} /></a>)}</div></div>}</section></div>
  </div>
}

function DetailView({ activeNav, onBack, evidenceItems, capability, activity: displayActivity, unavailable, runbook, runbookRunning, runbookMessage, onRunbookStep, protocol, credentialToken, protocolMessage, onIssueCredential, onCallMcp }: { activeNav: string; onBack: () => void; evidenceItems: DisplayEvidence[]; capability?: Overview['capability']; activity: Array<{ action: string; target: string; amount: number | string; state: string; age: string; txHash?: string }>; unavailable: boolean; runbook: Runbook | null; runbookRunning: string; runbookMessage: string; onRunbookStep: (step: RunbookStep) => void; protocol: Protocol | null; credentialToken: string; protocolMessage: string; onIssueCredential: () => void; onCallMcp: () => void }) {
  const titles: Record<string, string> = { 'Evidence graph': 'Evidence inspector', Capabilities: 'Capability registry', 'Action log': 'Action log', Runbook: 'Terminal runbook', Protocol: 'Agent protocol' }
  return <div className="detail-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / INSPECTOR</div><h1>{titles[activeNav]}</h1><p>Verified state from the current release firewall.</p></div><button className="secondary-button" onClick={onBack}><Icon name="arrow" size={15} /> Back to overview</button></div>
    {activeNav === 'Evidence graph' && (evidenceItems.length ? <div className="detail-grid">{evidenceItems.map((item) => <div className="panel detail-card" key={item.label}><div className="detail-card-top"><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><span className="verified-badge"><Icon name="check" size={12} /> {item.status}</span></div><h2>{item.label}</h2><p>{item.detail}</p><code>{item.txHash ? <a href={`${SEPOLIA_EXPLORER}${item.txHash}`} target="_blank" rel="noreferrer">{`${item.txHash.slice(0, 10)}…${item.txHash.slice(-8)} · log ${item.logIndex ?? '—'}`} <Icon name="external" size={11} /></a> : item.time ?? 'chain data'}</code><div className="detail-meta"><span>{item.sourceChainKey ? `chain key ${item.sourceChainKey}` : 'Ethereum Sepolia'} · block {item.sourceBlock ?? '—'}</span><span>{item.receiptStatus === 1 ? 'receipt status 1' : item.status === 'PROVEN' ? 'receipt metadata pending' : 'not verified'}</span></div>{item.sourceEmitter && <small>Emitter: {item.sourceEmitter.slice(0, 10)}…{item.sourceEmitter.slice(-8)} · event: {item.label}</small>}{item.creditcoinTxHash && <small>Creditcoin import: <a href={`${CREDITCOIN_EXPLORER}${item.creditcoinTxHash}`} target="_blank" rel="noreferrer">{item.creditcoinTxHash.slice(0, 10)}…{item.creditcoinTxHash.slice(-8)} <Icon name="external" size={11} /></a></small>}</div>)}</div> : <div className="panel runbook-empty">No evidence is available from Creditcoin.</div>)}
    {activeNav === 'Capabilities' && <div className="panel capability-detail"><div className="capability-summary"><div className="capability-lock"><Icon name="lock" size={24} /></div><div><div className="panel-kicker">CAPABILITY ID</div><h2>chain capability</h2><p>Non-transferable authority bound to <code>{capability?.runtimeKey ?? '—'}</code></p></div><span className="verified-badge"><Icon name="check" size={12} /> {unavailable ? 'UNAVAILABLE' : capability?.status ?? 'UNAVAILABLE'}</span></div><div className="capability-grid"><div><span>Scope root</span><strong>{capability?.scopeRoot ?? '—'}</strong></div><div><span>Total spend</span><strong>{capability ? `$${capability.spent.toFixed(2)} / $${capability.spendCap.toFixed(2)}` : '—'}</strong></div><div><span>Calls used</span><strong>{capability ? `${capability.callsUsed} / ${capability.callCap}` : '—'}</strong></div><div><span>Valid until</span><strong>{capability?.expiresAt ?? '—'}</strong></div></div><div className="boundary-note"><Icon name="shield" size={14} /> {unavailable ? 'No chain decision available.' : 'Every action is revalidated against current release status.'}</div></div>}
    {activeNav === 'Action log' && <div className="panel full-table"><div className="panel-header"><div><div className="panel-kicker">CHAIN-BOUND EVENTS</div><h2>All enforcement decisions</h2></div><span className="live-pill"><span className="status-dot" /> {unavailable ? 'unavailable' : 'indexed'}</span></div><div className="expanded-table">{displayActivity.map((row) => <div className="expanded-row" key={`${row.action}-${row.age}`}><span className="row-time">{row.age}</span><div><strong>{row.action}</strong><small>{row.target}</small></div><span>{typeof row.amount === 'number' ? `${row.amount.toFixed(4)} native` : row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b>{'txHash' in row && typeof row.txHash === 'string' ? <a href={`${CREDITCOIN_EXPLORER}${row.txHash}`} target="_blank" rel="noreferrer" aria-label="Open transaction in Blockscout"><Icon name="external" size={15} /></a> : <span />}</div>)}</div></div>}
    {activeNav === 'Runbook' && <div className="panel runbook-panel"><div className="panel-header"><div><div className="panel-kicker">CONTROL PLANE WORKFLOW</div><h2>Terminal actions, surfaced safely</h2><p className="panel-description">Read-only checks run from the server. Write steps stay disabled until the server explicitly enables them.</p></div><span className={`runbook-mode ${runbook?.writesEnabled ? 'enabled' : ''}`}><span className="status-dot" /> {runbook?.writesEnabled ? 'writes enabled' : 'writes disabled'}</span></div>{runbookMessage && <pre className="runbook-output">{runbookMessage}</pre>}<div className="runbook-list">{runbook?.steps.map((step) => <div className="runbook-row" key={step.id}><div className="runbook-status"><span className={`runbook-dot ${step.status.toLowerCase()}`} /></div><div className="runbook-copy"><strong>{step.label}</strong><span>{step.status.toLowerCase()} · {step.kind}</span><code>{step.command}</code></div><button className={step.requiresWrite ? 'secondary-button' : 'primary-button'} disabled={!step.canRun || runbookRunning !== ''} onClick={() => onRunbookStep(step)}>{runbookRunning === step.id ? 'Running…' : step.status === 'COMPLETE' ? 'Run again' : 'Run'}</button></div>) ?? <div className="runbook-empty">Runbook unavailable. Start the server and refresh the demo.</div>}</div></div>}
    {activeNav === 'Protocol' && <div className="protocol-detail">
      <div className="protocol-grid">
        <div className="panel protocol-card"><div className="panel-kicker">MCP ENFORCEMENT GATEWAY</div><h2>{protocol?.mcp.endpoint ?? 'unavailable'}</h2><p>Tool discovery and every call are filtered against the current credential, release status, scope, and budget.</p><div className="protocol-lines"><span>protocol</span><strong>{protocol?.mcp.protocolVersion ?? '—'}</strong><span>tools</span><strong>{protocol?.mcp.tools.join(' · ') ?? '—'}</strong></div></div>
        <div className="panel protocol-card"><div className="panel-kicker">A2A AUTHORIZATION</div><h2>{protocol?.a2a.endpoint ?? 'unavailable'}</h2><p>Tasks return ALLOW, AUTH_REQUIRED, or DENY with a credential bound to one agent release.</p><a className="text-button" href={protocol?.a2a.agentCard} target="_blank" rel="noreferrer">Open agent card <Icon name="external" size={14} /></a></div>
        <div className="panel protocol-card"><div className="panel-kicker">AIRLOCK CREDENTIAL</div><h2>{protocol?.credential.schema ?? 'unavailable'}</h2><p>EIP-712 signed, audience-bound, ERC-1271 compatible, short-lived, and attenuable.</p><div className="protocol-lines"><span>audience</span><code>{protocol?.credential.audience ?? '—'}</code><span>identity</span><strong>{protocol?.identity.configured ? 'ERC-8004 configured' : 'ERC-8004 adapter unconfigured'}</strong></div><div className="protocol-actions"><button className="primary-button" onClick={onIssueCredential} disabled={!protocol || !runbook?.writesEnabled || Boolean(credentialToken)}>Issue credential</button><button className="secondary-button" onClick={onCallMcp} disabled={!credentialToken}>Run MCP payment</button></div>{protocolMessage && <small className="protocol-message">{protocolMessage}</small>}{credentialToken && <textarea className="credential-token" readOnly value={credentialToken} aria-label="AIRLOCK credential authorization header" />}</div>
        <div className="panel protocol-card"><div className="panel-kicker">RELEASE PASSPORT</div><h2>{protocol?.runtimeAssurance.level ?? '—'} · {protocol?.runtimeAssurance.name ?? 'unavailable'}</h2><p>{protocol?.runtimeAssurance.note ?? 'Passport state is read from the current deployment.'}</p><div className="protocol-lines"><span>manifest</span><code>{protocol?.releasePassport.manifest ?? '—'}</code><span>artifact root</span><code>{protocol?.releasePassport.artifactRoot ?? '—'}</code><span>verified</span><strong>{protocol?.releasePassport.verified ? 'yes' : 'unavailable'}</strong></div><PassportChecks checks={protocol?.releasePassport.verification?.checks} /></div>
      </div>
    </div>}
  </div>
}

function LandingPage({ onEnterDemo }: { onEnterDemo: () => void }) {
  const [landingOverview, setLandingOverview] = useState<Overview | null>(null)
  const [landingPassport, setLandingPassport] = useState<ReleasePassport | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/overview`)
      .then((response) => response.ok ? response.json() as Promise<Overview> : Promise.reject(new Error('chain unavailable')))
      .then((value) => { if (value.dataSource === 'creditcoin-chain') setLandingOverview(value) })
      .catch(() => setLandingOverview(null))
    fetch(`${API_URL}/api/release-passport`)
      .then((response) => response.ok ? response.json() as Promise<ReleasePassport> : Promise.reject(new Error('passport unavailable')))
      .then(setLandingPassport)
      .catch(() => setLandingPassport(null))
  }, [])

  const liveRelease = landingOverview?.dataSource === 'creditcoin-chain' ? landingOverview.release : null
  const liveCapability = landingOverview?.dataSource === 'creditcoin-chain' ? landingOverview.capability : null
  const liveDigest = liveRelease?.digest ?? 'release digest unavailable'
  const liveEvidence = new Map((landingOverview?.evidence ?? []).map((item) => [item.kind, item.status]))

  return <div className="product-landing">
    <header className="product-nav">
      <a className="product-brand" href="#product" aria-label="AIRLOCK home"><span className="brand-mark"><span /></span><span><strong>AIRLOCK</strong><small>release firewall</small></span></a>
      <nav className="product-nav-links" aria-label="Product navigation">
        <a href="#product">Product</a><a href="#lifecycle">How it works</a><a href="#security">Security</a><a href="#use-cases">Use cases</a><a href="#enterprise">Enterprise</a><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/README.md" target="_blank" rel="noreferrer">Documentation</a>
      </nav>
      <div className="product-nav-actions"><button className="product-demo-link" onClick={onEnterDemo}>Open live demo <Icon name="arrow" size={14} /></button></div>
    </header>

    <main>
      <section className="product-hero product-container" id="product">
        <div className="product-hero-copy"><p className="product-kicker">RELEASE AUTHORITY FOR AUTONOMOUS AGENTS</p><h1>Give your AI agent authority only when its <em>release has earned it.</em></h1><p className="product-hero-lede">AIRLOCK is a release firewall for autonomous agents. It binds authority to a specific artifact, a verified evaluation, governance approval, active status, and a bounded runtime capability. Source-chain events are proven through Attestcoin, semantically checked on Creditcoin, and conjoined before a router accepts one exact EIP-712 intent.</p><div className="product-hero-actions"><button className="product-button product-button-primary" onClick={onEnterDemo}>Open live demo <Icon name="arrow" size={15} /></button><a className="product-button product-button-secondary" href="#lifecycle">See how it works <Icon name="arrow" size={15} /></a></div><div className="product-hero-note"><Icon name="lock" size={14} /> Runtime keys stay behind the enforcement boundary.</div></div>
        <div className="hero-release-card"><div className="hero-card-top"><span>AUTHORITY GATE</span><span className="hero-card-status"><i /> {liveRelease?.status?.toLowerCase() ?? 'chain-backed'}</span></div><div className="hero-card-title">A capability is earned, not assumed.</div><div className="hero-gate-list"><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Release identity</span><b>{liveEvidence.get('Artifact') ?? 'required'}</b></div><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Evaluation evidence</span><b>{liveEvidence.get('Evaluation') ?? 'required'}</b></div><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Approval and status</span><b>{liveEvidence.get('Approval') ?? 'required'}</b></div><div><span className="gate-check gate-check-open"><Icon name="lock" size={11} /></span><span>Runtime capability</span><b>{liveCapability?.status?.toLowerCase() ?? 'bounded'}</b></div></div><div className="hero-card-footer"><code>releaseDigest</code><strong>{liveDigest}</strong></div></div>
      </section>

      <section className="proof-strip product-container" aria-label="AIRLOCK proof properties"><div className="proof-strip-label">BUILT AROUND PROOF</div><div className="proof-strip-items"><span>Four evidence classes</span><span>One shared <code>releaseDigest</code></span><span>Short-lived capabilities</span><span>Scope and budget enforcement</span><span>Attestcoin verification</span><span>Revocation-aware execution</span></div></section>

      <section className="product-section product-container problem-section" id="problem"><div className="section-intro"><p className="product-kicker">THE PRODUCTION PROBLEM</p><h2>Agent authority outlives the thing you meant to approve.</h2><p>Model weights, prompts, tools, containers, and policies change independently. A wallet address or API key sees none of that context.</p></div><div className="problem-grid"><div className="problem-card"><span>01</span><h3>Keys authorize addresses</h3><p>Normal wallets and multisigs authorize a signer. They do not know which release produced the next action.</p></div><div className="problem-card"><span>02</span><h3>Workers are not truth</h3><p>A relayer signature can prove that a worker spoke. It cannot prove the exact source-chain event, receipt, emitter, and decoded fields.</p></div><div className="problem-card"><span>03</span><h3>Revocation has to reach execution</h3><p>A compromised or outdated release can retain authority unless every later action checks current evidence and status.</p></div></div><div className="section-callout"><Icon name="shield" size={18} /><span>Multisig protects approval. AIRLOCK connects approval to the exact release that is allowed to act.</span></div></section>

      <section className="product-section product-container" id="outcomes"><div className="section-intro section-intro-wide"><p className="product-kicker">WHAT AIRLOCK GIVES TEAMS</p><h2>Release-level authority with an explicit boundary.</h2></div><div className="outcome-grid"><div className="outcome-card"><span className="outcome-number">01</span><h3>Release-level authority</h3><p>Attach authority to one exact release commitment, not merely an agent address.</p><a href="#release-identity">See release identity <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">02</span><h3>Bounded autonomy</h3><p>Set targets, functions, recipients, spend, call counts, expiry, and freshness before the agent acts.</p><a href="#policy">Open policy studio <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">03</span><h3>Cross-chain evidence</h3><p>Verify source-chain facts on Creditcoin through Attestcoin proofs instead of trusting a centralized worker.</p><a href="#attestcoin">Trace the proof path <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">04</span><h3>Fast containment</h3><p>Proven revocation and local guardian pauses stop later actions even when a runtime still signs.</p><a href="#revocation">See containment <Icon name="arrow" size={13} /></a></div></div></section>

      <section className="product-section product-container release-identity-section" id="release-identity"><div className="section-intro"><p className="product-kicker">RELEASE IDENTITY</p><h2>One byte changes the authority you can issue.</h2><p>The canonical manifest commits the model and the system around it: weights or adapters, tokenizer, prompts, tools, container, lockfile, SBOM, provenance, source revision, and evaluation suite.</p></div><div className="release-identity-grid"><div className="manifest-card"><div className="manifest-card-header"><span>CANONICAL MANIFEST</span><span>{landingPassport?.verified ? 'VERIFIED' : liveRelease?.status ?? 'UNAVAILABLE'}</span></div><div className="manifest-rows">{[['Model weights / adapters', landingPassport?.components.weightsHash], ['Tokenizer', landingPassport?.components.tokenizerHash], ['Prompt bundle', landingPassport?.passport.promptTemplateHash], ['Tool / MCP schemas', landingPassport?.components.toolManifestRoot], ['Container image', landingPassport?.components.containerImageDigest], ['SBOM / provenance', landingPassport ? `${shortHash(landingPassport.components.sbomHash)} · ${shortHash(landingPassport.components.provenanceHash)}` : undefined]].map(([row, value]) => <div key={row}><span className="manifest-check"><Icon name="check" size={11} /></span><span>{row}</span><code>{shortHash(value)}</code></div>)}</div><a className="digest-toggle" href="/demo" onClick={(event) => { event.preventDefault(); onEnterDemo() }}><span className="digest-toggle-dot" /> Inspect the live release passport <Icon name="arrow" size={13} /></a></div><div className="digest-visual"><div className="digest-visual-label">{liveRelease ? 'CHAIN RELEASE DIGEST' : 'LIVE RELEASE DIGEST'}</div><code>{liveDigest}</code><div className="digest-delta"><span>{liveRelease ? `${liveRelease.status.toLowerCase()} release state` : 'no chain state loaded on the landing page'}</span><b>{liveCapability?.status?.toLowerCase() ?? 'inspect demo'}</b></div><div className="digest-visual-footer"><span>releaseDigest</span><span>{landingPassport?.verified ? `passport ${shortHash(landingPassport.passport.passportHash)}` : 'passport unavailable'}</span></div></div></div></section>

      <section className="product-section product-container lifecycle-section" id="lifecycle"><div className="section-intro section-intro-wide"><p className="product-kicker">HOW A RELEASE BECOMES AUTHORITY</p><h2>From manifest to bounded capability.</h2><p>Each stage creates evidence that the next stage can verify. The product does not skip from “model exists” to “wallet can spend.”</p></div><div className="lifecycle-grid">{[['01','Publish','Build the artifact manifest and publish the release commitment.'],['02','Evaluate','Certify the exact release with an approved evaluation suite.'],['03','Approve','Register deployment parameters and governance approval.'],['04','Activate','Mark the release active with a current validity window.'],['05','Prove','Verify source events through Attestcoin on Creditcoin.'],['06','Issue','Issue a bounded capability bound to the runtime key.'],['07','Act','Submit typed intents through the enforcement router.'],['08','Contain','Revoke or pause when the release or runtime is unsafe.']].map(([number,title,copy]) => <a className="lifecycle-step" href={number === '05' ? '#attestcoin' : number === '08' ? '#revocation' : number === '07' ? '#execution' : '#evidence'} key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div><Icon name="arrow" size={15} /></a>)}</div></section>

      <section className="product-section product-container evidence-section" id="evidence"><div className="section-intro"><p className="product-kicker">EVIDENCE GRAPH</p><h2>Four independent events become one deterministic authorization decision.</h2><p>Every evidence class is keyed to the same organization and release digest. Evaluation contributes suite and evaluator constraints; approval binds the agent, runtime, policy, scope, and budgets; every source registry independently enforces its nonce and validity window.</p></div><div className="evidence-graph-card"><div className="evidence-graph-line"><div><span className="evidence-graph-node"><Icon name="box" size={18} /></span><strong>Artifact publication</strong><small>manifest and artifact root</small></div><i /><div><span className="evidence-graph-node"><Icon name="activity" size={18} /></span><strong>Evaluation certification</strong><small>suite, score, evaluator set</small></div><i /><div><span className="evidence-graph-node"><Icon name="fingerprint" size={18} /></span><strong>Deployment approval</strong><small>agent, runtime, policy, budgets</small></div><i /><div><span className="evidence-graph-node"><Icon name="shield" size={18} /></span><strong>Active status</strong><small>fresh checkpoint or revocation</small></div></div><div className="evidence-graph-footer"><code>shared: orgId + releaseDigest · constrained: releaseId + agentId + policy + scope + independent nonces</code><a href="/demo" onClick={(event) => { event.preventDefault(); onEnterDemo() }}>Inspect an evidence graph <Icon name="arrow" size={13} /></a></div></div></section>

      <section className="product-section product-container attestcoin-section" id="attestcoin"><div className="section-intro section-intro-wide"><p className="product-kicker">ATTESTCOIN VERIFICATION LAYER</p><h2>Source-chain facts, verified where authority is enforced.</h2><p>For the current supported path, events originate on Ethereum Sepolia, Attestcoin proves inclusion and continuity, and the pinned receipt decoder plus AIRLOCK adapter validate semantics before normalized evidence reaches the Creditcoin authority path.</p></div><ArchitectureDiagram /><div className="attestcoin-notes"><div><strong>Receipt truth</strong><span>Status, chain key, emitter, topic count, data length, log index, schema, and decoded fields are checked on Creditcoin.</span></div><div><strong>Deterministic authority</strong><span>Policy, evidence, runtime binding, capability issuance, delegation, and router checks narrow authority before execution.</span></div><div><strong>Worker liveness</strong><span>Workers discover, batch, and submit proofs. They do not decide truth or issue capabilities.</span></div></div><div className="architecture-caption"><code>Sepolia registries → Attestcoin → decoder + adapter → evidence + policy → capability → router → vault</code><a href="https://github.com/Shaurya2k06/AIRLOCK#attestcoin-integration" target="_blank" rel="noreferrer">Read the integration notes <Icon name="external" size={13} /></a></div></section>



      <section className="product-section product-container execution-section" id="execution"><div className="section-intro"><p className="product-kicker">AGENT EXECUTION BOUNDARY</p><h2>The model proposes. AIRLOCK decides.</h2><p>The model never holds the vault key and never gets a raw transaction forwarding path. Intent is typed, checked, and constrained before value moves.</p></div><div className="execution-flow">{[['01','LLM proposes intent','tool + arguments'],['02','Typed EIP-712 intent','signable action'],['03','Scope and policy checks','target + recipient'],['04','Calldata validator','exact function data'],['05','Budget and nonce','value + replay'],['06','AgentVault execution','router only']].map(([number,title,copy], index) => <div className="execution-step" key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small>{index < 5 && <Icon name="arrow" size={15} />}</div>)}</div><div className="execution-outcomes"><div className="allowed-action"><span><Icon name="check" size={14} /></span><div><strong>Allowed</strong><code>vendor.pay({landingOverview?.policy.recipient ?? 'approved recipient'}, {landingOverview ? `${landingOverview.policy.maxPayment} native` : 'policy-bounded value'})</code><small>allowlisted target · within cap · fresh nonce</small></div></div><div className="rejected-actions"><span><Icon name="shield" size={14} /></span><div><strong>Rejected at the boundary</strong><div><code>unknown target</code><code>unknown recipient</code><code>replayed nonce</code><code>expired capability</code></div></div></div></div></section>

      <section className="product-section product-container revocation-section" id="revocation"><div className="revocation-copy"><p className="product-kicker">REVOCATION AND INCIDENT RESPONSE</p><h2>When a release becomes unsafe, authority closes around it.</h2><p>A source-chain revocation is published, proven through Attestcoin, imported to Creditcoin, and checked on the next action. The capability becomes unusable even if the runtime still signs.</p><div className="revocation-list"><div><span>01</span><strong>Publish revocation</strong><small>Governance marks the release unsafe.</small></div><div><span>02</span><strong>Prove and import</strong><small>Receipt semantics are verified cross-chain.</small></div><div><span>03</span><strong>Reject future calls</strong><small>AIRLOCK denies the next execution.</small></div></div></div><div className="incident-card"><div className="incident-header"><span>INCIDENT RESPONSE</span><span className="incident-closed"><i /> {liveRelease?.status ?? 'LIVE STATE'}</span></div><div className="incident-release"><strong>release status</strong><b>{liveRelease?.status ?? 'CHAIN-BACKED'}</b><code>{liveRelease ? liveDigest : 'inspect the live release for reason data'}</code></div><div className="incident-checks"><span><Icon name="check" size={12} /> source event proven</span><span><Icon name="check" size={12} /> capability revalidated</span><span><Icon name="check" size={12} /> later intent checked</span></div><p>Cross-chain revocation is not instantaneous. Short TTLs, freshness windows, watchers, and local guardian pauses narrow the gap.</p><a href="/demo" onClick={(event) => { event.preventDefault(); onEnterDemo() }}>See revocation protection <Icon name="arrow" size={13} /></a></div></section>

      <section className="product-section product-container surfaces-section" id="surfaces"><div className="section-intro section-intro-wide"><p className="product-kicker">PRODUCT SURFACES</p><h2>One authority system, six places your team works.</h2></div><div className="surface-grid"><div><span>01 / registry</span><h3>Release registry</h3><p>Manage versions, digests, artifacts, and deployment states.</p></div><div><span>02 / explorer</span><h3>Evidence explorer</h3><p>Inspect source transactions, proofs, decoded receipts, and Creditcoin imports.</p></div><div><span>03 / policy</span><h3>Policy studio</h3><p>Define evidence, scope, budget, freshness, and guardian requirements.</p></div><div><span>04 / authority</span><h3>Capability registry</h3><p>View active, expired, paused, and revoked capabilities.</p></div><div><span>05 / enforcement</span><h3>Enforcement log</h3><p>Review allowed, rejected, replayed, expired, and revoked actions.</p></div><div id="enterprise"><span>06 / organization</span><h3>Organization settings</h3><p>Manage publishers, evaluators, approvers, guardians, runtime keys, and workers.</p></div></div></section>

      <section className="product-section product-container modes-section" id="modes"><div className="section-intro"><p className="product-kicker">DEPLOYMENT MODES</p><h2>Choose the claim your runtime can support.</h2><p>AIRLOCK is explicit about what each mode proves.</p></div><div className="mode-grid"><div className="mode-card"><div className="mode-card-top"><span>BASE MODE</span><Icon name="lock" size={18} /></div><h3>Release-bound authority</h3><p>Binds a release digest to a runtime signing key and enforces what that key can do.</p><ul><li>Exact release commitment</li><li>Evidence conjunction</li><li>Bounded capability and router checks</li><li>Does not attest which weights a running process loaded</li></ul></div><div className="mode-card mode-card-featured"><div className="mode-card-top"><span>TEE-REQUIRED MODE</span><Icon name="shield" size={18} /></div><h3>Runtime-bound authority</h3><p>Adds verifier-attested measurement, container binding, artifact binding, and validity windows.</p><ul><li>Runtime measurement registration</li><li>Container and artifact binding</li><li>Verifier-attested quote hash</li><li>Independent runtime validity window</li></ul></div></div></section>

      <section className="product-section product-container use-cases-section" id="use-cases"><div className="section-intro section-intro-wide"><p className="product-kicker">USE CASES</p><h2>For teams that let agents touch real value.</h2></div><div className="use-case-grid"><div><Icon name="wallet" size={19} /><h3>DAO and treasury agents</h3><p>Limit payouts to approved recipients, functions, budgets, and release versions.</p></div><div><Icon name="activity" size={19} /><h3>Stablecoin and payment agents</h3><p>Keep payment authority current while every call remains bounded and replay-safe.</p></div><div><Icon name="box" size={19} /><h3>Agent-wallet and MCP infrastructure</h3><p>Give tools explicit capabilities instead of handing models unrestricted wallet access.</p></div><div><Icon name="shield" size={19} /><h3>On-chain funds and custodians</h3><p>Connect governance evidence to the exact software release operating capital.</p></div><div><Icon name="grid" size={19} /><h3>DePIN operators</h3><p>Constrain automated protocol operations as deployments and policies evolve.</p></div><div><Icon name="lock" size={19} /><h3>Enterprise agents</h3><p>Make approved payments and protocol actions auditable, bounded, and containable.</p></div></div></section>


      <section className="product-section product-container security-section" id="security"><div className="section-intro section-intro-wide"><p className="product-kicker">SECURITY MODEL</p><h2>Every check closes a different escape route.</h2></div><div className="security-grid"><div><Icon name="check" size={17} /><strong>Receipt validation</strong><p>Status, emitter, event schema, and decoded fields are checked.</p></div><div><Icon name="fingerprint" size={17} /><strong>Exact digest matching</strong><p>Artifact, evaluation, approval, and status must share the release identity.</p></div><div><Icon name="lock" size={17} /><strong>Replay protection</strong><p>Nonces, deadlines, and monotonic state prevent reuse.</p></div><div><Icon name="grid" size={17} /><strong>Scope intersection</strong><p>Policy and capability limits can only narrow the action.</p></div><div><Icon name="wallet" size={17} /><strong>Calldata validation</strong><p>Exact targets, functions, recipients, and values are enforced.</p></div><div><Icon name="shield" size={17} /><strong>Direct-vault protection</strong><p>The vault is callable only through the router boundary.</p></div><div><Icon name="pause" size={17} /><strong>Monotonic revocation</strong><p>Revoked status cannot be silently replaced by stale evidence.</p></div><div><Icon name="terminal" size={17} /><strong>Least-privilege workers</strong><p>Proof workers provide liveness without authority to issue capabilities.</p></div><div><Icon name="grid" size={17} /><strong>Delegation containment</strong><p>Child capabilities can only attenuate authority, and parent revocation disables descendants.</p></div><div><Icon name="clock" size={17} /><strong>Vault recovery delay</strong><p>Router-only custody includes timelocked recovery instead of an immediate bypass.</p></div></div><div className="security-links"><a href="https://github.com/Shaurya2k06/AIRLOCK#security-model-and-limits" target="_blank" rel="noreferrer">Read the security model <Icon name="external" size={13} /></a><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/contracts/contracts/Airlock.sol" target="_blank" rel="noreferrer">Review the contracts <Icon name="external" size={13} /></a></div></section>


      <section className="product-section product-container operations-section"><div className="section-intro"><p className="product-kicker">RELIABILITY AND OPERATIONS</p><h2>Proof infrastructure stays replaceable. The decision stays verifiable.</h2><p>Cursor-based discovery, retries, atomic proof batches, live tool-change notifications, freshness checks, trace roots, and guardian controls keep the system operating without making a worker the source of truth.</p></div><div className="operations-grid"><div><span>liveness</span><strong>Proof-worker retries</strong><p>Workers discover events, retry failed submissions, and expose their cursor.</p></div><div><span>availability</span><strong>Permissionless proof batches</strong><p>Anyone can submit valid proofs, individually or in atomic batches of up to ten; the worker is not a privileged oracle.</p></div><div><span>containment</span><strong>Guardian emergency controls</strong><p>Local pauses narrow the cross-chain freshness window during an incident.</p></div><div><span>auditability</span><strong>Traceable execution</strong><p>Release passports, evidence roots, capability state, and action trace roots remain inspectable.</p></div></div></section>

      <section className="product-section product-container faq-section"><div className="section-intro section-intro-wide"><p className="product-kicker">FAQ</p><h2>Direct answers for security and platform teams.</h2></div><div className="faq-list"><details><summary>Is AIRLOCK a bridge?</summary><p>No. Attestcoin proofs carry source-chain facts to Creditcoin for verification. AIRLOCK uses the verified result to decide whether authority exists.</p></details><details><summary>What exactly does Attestcoin prove?</summary><p>Transaction inclusion and continuity, which AIRLOCK combines with receipt status, approved emitter, topic, log index, schema, and decoded-field checks.</p></details><details><summary>Can an agent bypass the router?</summary><p>The model does not hold the vault key, raw transaction forwarding is rejected, and the AgentVault is callable only through the router.</p></details><details><summary>Can a capability be transferred?</summary><p>No. Capabilities are bound to a runtime key, a release digest, an explicit scope, budgets, and an expiry window.</p></details><details><summary>What happens when a release is revoked?</summary><p>After the revocation is proven and imported, future AIRLOCK actions fail even if the old runtime continues to sign.</p></details><details><summary>How long does cross-chain verification take?</summary><p>It depends on source finality, proof generation, submission, and polling. Freshness limits and short capability TTLs prevent stale authority from lasting indefinitely.</p></details><details><summary>Does AIRLOCK prove that the model is intelligent?</summary><p>No. AIRLOCK controls release authority and execution boundaries. Evaluation quality and model behavior remain responsibilities of the organization.</p></details><details><summary>Can organizations self-host the proof worker?</summary><p>Yes. The worker is designed as a replaceable liveness component; the verifier and on-chain contracts remain the authority boundary.</p></details></div></section>
    </main>

    <footer className="product-footer product-container" id="access"><div><p className="product-kicker">READY WHEN YOUR AGENT TOUCHES REAL VALUE</p><h2>Protect the next release your agent ships.</h2><p>Run AIRLOCK in your own environment, inspect the architecture, or start with the live proof surface.</p></div><div className="product-footer-actions"><a className="product-button product-button-secondary" href="https://github.com/Shaurya2k06/AIRLOCK#architecture" target="_blank" rel="noreferrer">Read the architecture <Icon name="external" size={14} /></a><button className="product-button product-button-ghost" onClick={onEnterDemo}>Open live demo <Icon name="arrow" size={14} /></button></div></footer>
  </div>
}
function App() {
  const [route, setRoute] = useState(window.location.pathname === '/demo' ? '/demo' : '/')

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname === '/demo' ? '/demo' : '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (path: '/' | '/demo') => {
    window.history.pushState({}, '', path)
    setRoute(path)
  }

  return route === '/demo' ? <DemoPage onHome={() => navigate('/')} /> : <LandingPage onEnterDemo={() => navigate('/demo')} />
}

export default App
