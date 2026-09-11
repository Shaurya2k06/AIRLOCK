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
  capability: { status: string; spendCap: number; spent: number; callCap: number; callsUsed: number; runtimeKey: string; scopeRoot?: string; expiresAt?: string }
  freshness?: { maxAgeSeconds: number; ageSeconds: number; remainingSeconds: number; statusIssuedAt: string; statusValidUntil: string }
  policy: { recipient: string; maxPayment: number; depositMax?: number }
  actions: Array<{ action: string; target: string; amount: number; state: string; age: string }>
}

type DisplayEvidence = { label: string; detail: string; time?: string; status: string; icon: IconName; txHash?: string; creditcoinTxHash?: string; sourceChainKey?: number; sourceEmitter?: string; sourceTopic0?: string; sourceBlock?: number; logIndex?: number; receiptStatus?: number }
type RunbookStep = { id: string; label: string; command: string; kind: string; status: string; canRun: boolean; requiresWrite: boolean }
type Runbook = { mode: string; writesEnabled: boolean; writeAuthRequired?: boolean; steps: RunbookStep[] }
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

const architectureNodes: Node[] = [
  { id: 'source', position: { x: 0, y: 112 }, data: { label: 'Ethereum\nsource event' }, sourcePosition: Position.Right, targetPosition: Position.Left, style: { background: '#18233b', border: '1px solid #526ba8', color: '#d9e4ff' } },
  { id: 'proof', position: { x: 190, y: 112 }, data: { label: 'Attestcoin\nproof' }, sourcePosition: Position.Right, targetPosition: Position.Left, style: { background: '#2b2341', border: '1px solid #8069b7', color: '#e6dcff' } },
  { id: 'verify', position: { x: 380, y: 112 }, data: { label: 'Creditcoin\nverification' }, sourcePosition: Position.Right, targetPosition: Position.Left, style: { background: '#17372e', border: '1px solid #4c9c78', color: '#d7ffe4' } },
  { id: 'registry', position: { x: 570, y: 112 }, data: { label: 'AIRLOCK evidence\nregistry' }, sourcePosition: Position.Right, targetPosition: Position.Left, style: { background: '#183a39', border: '1px solid #4c9b98', color: '#d5fffa' } },
  { id: 'decision', position: { x: 760, y: 112 }, data: { label: 'Capability\ndecision' }, targetPosition: Position.Left, style: { background: '#3a3020', border: '1px solid #b49a55', color: '#fff0bd' } },
]

const architectureEdges: Edge[] = [
  { id: 'source-proof', source: 'source', target: 'proof', animated: true, style: { stroke: '#8fa4e1' } },
  { id: 'proof-verify', source: 'proof', target: 'verify', animated: true, style: { stroke: '#a992d8' } },
  { id: 'verify-registry', source: 'verify', target: 'registry', animated: true, style: { stroke: '#72d29e' } },
  { id: 'registry-decision', source: 'registry', target: 'decision', animated: true, style: { stroke: '#dbbf6e' } },
]

function ArchitectureDiagram() {
  return <div className="architecture-flow"><ReactFlow nodes={architectureNodes} edges={architectureEdges} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} panOnDrag zoomOnScroll={false} proOptions={{ hideAttribution: true }}><Background color="#243438" gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
}

function DemoPage({ onHome }: { onHome: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [simulation, setSimulation] = useState<'idle' | 'allowed' | 'blocked'>('idle')
  const [simulationReason, setSimulationReason] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [runbook, setRunbook] = useState<Runbook | null>(null)
  const [runbookRunning, setRunbookRunning] = useState('')
  const [runbookMessage, setRunbookMessage] = useState('')
  const [writeToken, setWriteToken] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch(`${API_URL}/api/overview`)
      .then((response) => response.json().then((value: Overview) => { if (mounted) { setOverview(value); setLoadError(false) }; return value }))
      .catch(() => { if (mounted) setLoadError(true) })
    fetch(`${API_URL}/api/runbook`)
      .then((response) => response.json().then((value: Runbook) => { if (mounted) setRunbook(value); return value }))
      .catch(() => { if (mounted) setRunbook(null) })
    return () => { mounted = false }
  }, [])

  const liveData = overview?.dataSource === 'creditcoin-chain'
  const chainUnavailable = loadError || overview?.dataSource === 'rpc-error'
  const displayOverview = liveData && !chainUnavailable ? overview : null
  const displayEvidence: DisplayEvidence[] = displayOverview?.evidence.map((item, index) => ({ label: item.kind, detail: item.detail, status: item.status, time: 'chain', icon: ['box', 'activity', 'fingerprint', 'shield'][index] as IconName, txHash: item.txHash, creditcoinTxHash: item.creditcoinTxHash, sourceChainKey: item.sourceChainKey, sourceEmitter: item.sourceEmitter, sourceTopic0: item.sourceTopic0, sourceBlock: item.sourceBlock, logIndex: item.logIndex, receiptStatus: item.receiptStatus })) ?? []
  const displayActivity = displayOverview?.actions.map((item) => ({ ...item, amount: `$${item.amount.toFixed(2)}`, state: item.state.includes('Allowed') ? 'Allowed' : 'Blocked' })) ?? []
  const release = displayOverview?.release ?? { name: '—', version: '—', digest: '—', status: 'UNAVAILABLE', expiresAt: '—' }
  const displayCapability = displayOverview?.capability
  const freshness = displayOverview?.freshness
  const provenEvidence = displayEvidence.filter((item) => item.status === 'PROVEN').length
  const network = displayOverview?.network ?? { source: '—', destination: '—', chainKey: '—' }
  const capabilityState = displayOverview?.capability.status ?? 'UNAVAILABLE'
  const releaseStatus = release.status
  const simulationCopy = useMemo(() => {
    if (simulation === 'allowed') return { title: 'Intent authorized', body: simulationReason || 'Scope, validator, nonce, and budget checks passed.', tone: 'success' }
    if (simulation === 'blocked') return { title: 'Intent blocked', body: simulationReason || 'Recipient is outside the approved capability scope.', tone: 'danger' }
    return null
  }, [simulation, simulationReason])

  const executeRunbook = async (step: RunbookStep): Promise<{ ok: boolean; message: string; runbook?: Runbook }> => {
    if (step.requiresWrite && !window.confirm(`Run ${step.label}? This may send a real testnet transaction.`)) return { ok: false, message: 'action cancelled' }
    const operatorToken = step.requiresWrite && runbook?.writeAuthRequired && !writeToken
      ? window.prompt('Enter the AIRLOCK operator token')?.trim() || ''
      : writeToken
    if (step.requiresWrite && runbook?.writeAuthRequired && !operatorToken) {
      const message = 'operator token required; no action was submitted'
      setRunbookMessage(message)
      return { ok: false, message }
    }
    if (operatorToken && operatorToken !== writeToken) setWriteToken(operatorToken)
    setRunbookRunning(step.id)
    setRunbookMessage('')
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
      if (result.ok) {
        const refreshed = await fetch(`${API_URL}/api/overview`)
        if (refreshed.ok) setOverview(await refreshed.json() as Overview)
      }
      return { ok: Boolean(result.ok && response.ok), message, runbook: result.runbook }
    } catch {
      const message = 'control plane unavailable; no terminal action was started'
      setRunbookMessage(message)
      return { ok: false, message }
    } finally {
      setRunbookRunning('')
    }
  }

  const runActualAction = async (stepId: 'execute' | 'blocked') => {
    const step = runbook?.steps.find((item) => item.id === stepId)
    if (!step) {
      setSimulation('blocked')
      setSimulationReason('live runbook unavailable; no action was submitted')
      return
    }
    const result = await executeRunbook(step)
    setSimulation(stepId === 'blocked' ? 'blocked' : result.ok ? 'allowed' : 'blocked')
    setSimulationReason(stepId === 'blocked' && result.ok ? 'post-revocation router rejection confirmed on-chain' : result.message)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-link" onClick={onHome} aria-label="Back to AIRLOCK landing page">
          <div className="brand-mark"><span /></div>
          <div><div className="brand-name">AIRLOCK</div><div className="brand-subtitle">release firewall</div></div>
        </button>
        <div className="network-status"><span className="status-dot" /> CC3 TESTNET <span className="network-chevron">⌄</span></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {[
            ['Overview', 'grid'],
            ['Evidence graph', 'shield'],
            ['Capabilities', 'lock'],
            ['Action log', 'activity'],
            ['Runbook', 'terminal'],
          ].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => setActiveNav(label)}>
              <Icon name={icon as IconName} size={17} /><span>{label}</span>{label === 'Evidence graph' && <span className="nav-count">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Current release</div>
          <div className="release-mini"><div className="release-mini-icon"><Icon name="box" size={16} /></div><div className="release-mini-copy"><strong>{release.name}</strong><span>v{release.version} · {releaseStatus.toLowerCase()}</span></div><span className="mini-check"><Icon name="check" size={12} /></span></div>
          <button className="settings-button" onClick={() => setActiveNav('Runbook')}><Icon name="terminal" size={16} /><span>Runbook & settings</span></button>
          <div className="user-row"><div className="avatar">OP</div><div><strong>Organization</strong><span>Operator</span></div><Icon name="chevron" size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Organization</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="live-indicator"><span className="status-dot" /> {chainUnavailable ? 'chain unavailable' : liveData ? 'chain data' : 'waiting for chain'}</div><button className="icon-button" aria-label="Open proof inspector"><Icon name="terminal" size={17} /></button><button className="wallet-chip"><span className="wallet-avatar"><Icon name="wallet" size={14} /></span><span>{displayOverview?.capability.runtimeKey ?? '—'}</span><Icon name="chevron" size={14} /></button></div></header>

        {activeNav === 'Overview' && <div className="page-body">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / RELEASE AUTHORITY</div><h1>Release firewall</h1><p>Cryptographic evidence decides what your agent can do.</p></div><div className="heading-actions"><button className="secondary-button"><Icon name="external" size={15} /> View on Blockscout</button><button className="primary-button" disabled title={liveData ? 'Use the guardian runbook for live emergency controls' : 'Chain data unavailable'}><Icon name="shield" size={15} /> {liveData ? 'Guardian control in runbook' : 'Chain data unavailable'}</button></div></section>
          <section className="metric-grid" aria-label="Release metrics"><div className="metric-card metric-highlight"><div className="metric-top"><span>Release state</span><Icon name="shield" size={18} /></div><div className="metric-value status-value"><span className="large-dot" /> {capabilityState}</div><div className="metric-foot">{liveData ? 'Read from Creditcoin' : 'Waiting for chain data'}</div></div><div className="metric-card"><div className="metric-top"><span>Evidence</span><span className="metric-accent">{`${provenEvidence.toString().padStart(2, '0')} / 04`}</span></div><div className="metric-value">{liveData ? (provenEvidence === 4 ? 'VERIFIED' : 'PENDING') : 'UNAVAILABLE'}</div><div className="metric-foot">One digest across all proofs</div></div><div className="metric-card"><div className="metric-top"><span>Spend remaining</span><span className="metric-accent">{displayOverview ? `${Math.max(0, Math.round(((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100))}%` : '—'}</span></div><div className="metric-value">{displayOverview ? `$${Math.max(0, displayOverview.capability.spendCap - displayOverview.capability.spent).toFixed(2)}` : '—'}</div><div className="meter"><span style={{ width: `${displayOverview ? Math.max(0, Math.min(100, ((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100)) : 0}%` }} /></div><div className="metric-foot">{displayOverview ? `of $${displayOverview.capability.spendCap.toFixed(2)} total cap` : 'No chain decision'}</div></div><div className="metric-card"><div className="metric-top"><span>Status freshness</span><Icon name="clock" size={17} /></div><div className="metric-value">{displayOverview ? releaseStatus === 'REVOKED' ? 'closed' : freshness ? `${Math.ceil(freshness.remainingSeconds / 60)}m` : '—' : '—'}</div><div className="metric-foot">{liveData ? `max age ${Math.ceil((freshness?.maxAgeSeconds ?? 0) / 60)}m · source status` : 'No chain decision'}</div></div></section>

          <section className="release-layout"><div className="panel release-panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZED RELEASE</div><h2>{release.name} <span>/</span> v{release.version}</h2></div><div className="verified-badge"><Icon name="check" size={13} /> {liveData ? release.status : 'UNAVAILABLE'}</div></div><div className="digest-row"><span className="digest-label">releaseDigest</span><code>{release.digest}</code><button className="copy-button" aria-label="Copy release digest"><Icon name="copy" size={14} /></button></div><div className="release-divider" /><div className="release-details"><div><span>Runtime key</span><strong><span className="key-dot" /> {displayOverview?.capability.runtimeKey ?? '—'}</strong></div><div><span>Policy</span><strong>{displayOverview ? 'on-chain policy' : '—'}</strong></div><div><span>Status issued</span><strong>{freshness?.statusIssuedAt ?? '—'}</strong></div><div><span>Expires</span><strong>{displayOverview?.capability.expiresAt ?? '—'}</strong></div><div><span>Manifest hash</span><strong>{release.manifestHash ? `${release.manifestHash.slice(0, 10)}…${release.manifestHash.slice(-8)}` : '—'}</strong></div><div><span>Artifact root</span><strong>{release.artifactRoot ? `${release.artifactRoot.slice(0, 10)}…${release.artifactRoot.slice(-8)}` : '—'}</strong></div></div><div className="source-chain"><span className="chain-icon eth">◆</span><span>{network.source}</span><Icon name="arrow" size={16} /><span className="chain-icon cc">C</span><span>{network.destination}</span><span className="chain-confirm"><Icon name="check" size={12} /> {liveData ? 'proof verified' : 'waiting for chain'}</span></div></div>
            <div className="panel boundary-panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>What the agent can do</h2></div><span className="live-pill"><span className="status-dot" /> {liveData ? 'chain' : 'unavailable'}</span></div><div className="boundary-list"><div className="boundary-row"><div className="boundary-icon green"><Icon name="wallet" size={16} /></div><div><strong>Vendor payment</strong><span>Registered recipient</span></div><b>≤ {displayOverview?.policy.maxPayment ?? '—'}</b></div><div className="boundary-row"><div className="boundary-icon amber"><Icon name="box" size={16} /></div><div><strong>Protocol deposit</strong><span>Bounded service call</span></div><b>≤ {displayOverview?.policy.depositMax ? `$${displayOverview.policy.depositMax}` : '—'}</b></div><div className="boundary-row"><div className="boundary-icon purple"><Icon name="activity" size={16} /></div><div><strong>Call budget</strong><span>Nonces are single-use</span></div><b>{displayOverview ? `${displayOverview.capability.callCap} calls` : '—'}</b></div></div><div className="boundary-note"><Icon name="lock" size={14} /> No raw transaction access · no vault withdrawal</div></div></section>

          <section className="panel evidence-panel"><div className="panel-header evidence-heading"><div><div className="panel-kicker">EVIDENCE GRAPH</div><h2>Four independent proofs. One release.</h2></div><button className="text-button" onClick={() => setActiveNav('Evidence graph')}>Open inspector <Icon name="arrow" size={14} /></button></div><div className="evidence-track">{displayEvidence.map((item, index) => <div className="evidence-item" key={item.label}><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><div className="evidence-copy"><strong>{item.label}</strong><span>{item.detail}</span><small>{item.time ?? 'chain'} · <b>{item.status}</b></small></div>{index < displayEvidence.length - 1 && <div className="evidence-connector"><span /></div>}</div>)}</div><div className="evidence-footer"><span><span className="status-dot" /> {liveData ? 'All proofs read from Creditcoin for ' : 'Chain data unavailable for '}<code>{release.digest}</code></span><span>source chain key <b>{liveData ? network.chainKey : '—'}</b></span></div></section>

          <section className="bottom-grid"><div className="panel action-panel"><div className="panel-header"><div><div className="panel-kicker">ACTION GATE</div><h2>Execute through the boundary</h2></div><span className="action-state"><span className="status-dot" /> {liveData && runbook?.writesEnabled ? 'signer ready' : liveData ? 'writes disabled' : 'unavailable'}</span></div><p className="panel-description">The model proposes. AIRLOCK validates the exact intent before the vault can move value.</p><div className="intent-preview"><div className="intent-line"><span>tool</span><code>vendor.pay</code><span className="intent-allow">ALLOWLISTED</span></div><div className="intent-line"><span>recipient</span><code>{displayOverview?.policy.recipient ?? '—'}</code><span>{displayOverview ? `≤ $${displayOverview.policy.maxPayment.toFixed(2)}` : '—'}</span></div><div className="intent-line"><span>nonce</span><code>01</code><span>deadline 60s</span></div></div><div className="action-buttons"><button className="primary-button" disabled={!displayOverview || !runbook?.writesEnabled || runbookRunning !== ''} onClick={() => runActualAction('execute')}><Icon name="play" size={15} /> Run allowed call</button><button className="danger-button" disabled={!displayOverview || !runbook?.writesEnabled || runbookRunning !== ''} onClick={() => runActualAction('blocked')}><Icon name="shield" size={15} /> Run blocked check</button></div>{simulationCopy && <div className={`simulation-result ${simulationCopy.tone}`}><span className="result-icon"><Icon name={simulationCopy.tone === 'success' ? 'check' : 'shield'} size={15} /></span><div><strong>{simulationCopy.title}</strong><span>{simulationCopy.body}</span></div><button onClick={() => { setSimulation('idle'); setSimulationReason('') }} aria-label="Dismiss result">×</button></div>}</div>
            <div className="panel activity-panel"><div className="panel-header"><div><div className="panel-kicker">RECENT ACTIVITY</div><h2>Enforcement log</h2></div><button className="text-button" onClick={() => setActiveNav('Action log')}>View all <Icon name="arrow" size={14} /></button></div><div className="activity-table"><div className="table-head"><span>Action</span><span>Value</span><span>Result</span></div>{displayActivity.map((row) => <div className="table-row" key={`${row.action}-${row.age}`}><div><strong>{row.action}</strong><small>{row.target} · {row.age}</small></div><span>{row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b></div>)}</div></div></section>
        </div>}

        {activeNav !== 'Overview' && <DetailView activeNav={activeNav} onBack={() => setActiveNav('Overview')} evidenceItems={displayEvidence} capability={displayCapability} activity={displayActivity} unavailable={!displayOverview} runbook={runbook} runbookRunning={runbookRunning} runbookMessage={runbookMessage} onRunbookStep={executeRunbook} />}
      </main>
    </div>
  )
}

function DetailView({ activeNav, onBack, evidenceItems, capability, activity: displayActivity, unavailable, runbook, runbookRunning, runbookMessage, onRunbookStep }: { activeNav: string; onBack: () => void; evidenceItems: DisplayEvidence[]; capability?: Overview['capability']; activity: Array<{ action: string; target: string; amount: number | string; state: string; age: string }>; unavailable: boolean; runbook: Runbook | null; runbookRunning: string; runbookMessage: string; onRunbookStep: (step: RunbookStep) => void }) {
  const titles: Record<string, string> = { 'Evidence graph': 'Evidence inspector', Capabilities: 'Capability registry', 'Action log': 'Action log', Runbook: 'Terminal runbook' }
  return <div className="detail-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / INSPECTOR</div><h1>{titles[activeNav]}</h1><p>Verified state from the current release firewall.</p></div><button className="secondary-button" onClick={onBack}><Icon name="arrow" size={15} /> Back to overview</button></div>
    {activeNav === 'Evidence graph' && (evidenceItems.length ? <div className="detail-grid">{evidenceItems.map((item) => <div className="panel detail-card" key={item.label}><div className="detail-card-top"><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><span className="verified-badge"><Icon name="check" size={12} /> {item.status}</span></div><h2>{item.label}</h2><p>{item.detail}</p><code>{item.txHash ? `${item.txHash.slice(0, 10)}…${item.txHash.slice(-8)} · log ${item.logIndex ?? '—'}` : item.time ?? 'chain data'}</code><div className="detail-meta"><span>{item.sourceChainKey ? `chain key ${item.sourceChainKey}` : 'Ethereum Sepolia'} · block {item.sourceBlock ?? '—'}</span><span>{item.receiptStatus === 1 ? 'receipt status 1' : item.status === 'PROVEN' ? 'receipt metadata pending' : 'not verified'}</span></div>{item.sourceEmitter && <small>Emitter: {item.sourceEmitter.slice(0, 10)}…{item.sourceEmitter.slice(-8)} · event: {item.label}</small>}{item.creditcoinTxHash && <small>Creditcoin import: {item.creditcoinTxHash.slice(0, 10)}…{item.creditcoinTxHash.slice(-8)}</small>}</div>)}</div> : <div className="panel runbook-empty">No evidence is available from Creditcoin.</div>)}
    {activeNav === 'Capabilities' && <div className="panel capability-detail"><div className="capability-summary"><div className="capability-lock"><Icon name="lock" size={24} /></div><div><div className="panel-kicker">CAPABILITY ID</div><h2>chain capability</h2><p>Non-transferable authority bound to <code>{capability?.runtimeKey ?? '—'}</code></p></div><span className="verified-badge"><Icon name="check" size={12} /> {unavailable ? 'UNAVAILABLE' : capability?.status ?? 'UNAVAILABLE'}</span></div><div className="capability-grid"><div><span>Scope root</span><strong>{capability?.scopeRoot ?? '—'}</strong></div><div><span>Total spend</span><strong>{capability ? `$${capability.spent.toFixed(2)} / $${capability.spendCap.toFixed(2)}` : '—'}</strong></div><div><span>Calls used</span><strong>{capability ? `${capability.callsUsed} / ${capability.callCap}` : '—'}</strong></div><div><span>Valid until</span><strong>{capability?.expiresAt ?? '—'}</strong></div></div><div className="boundary-note"><Icon name="shield" size={14} /> {unavailable ? 'No chain decision available.' : 'Every action is revalidated against current release status.'}</div></div>}
    {activeNav === 'Action log' && <div className="panel full-table"><div className="panel-header"><div><div className="panel-kicker">CHAIN-BOUND EVENTS</div><h2>All enforcement decisions</h2></div><span className="live-pill"><span className="status-dot" /> {unavailable ? 'unavailable' : 'indexed'}</span></div><div className="expanded-table">{displayActivity.map((row) => <div className="expanded-row" key={`${row.action}-${row.age}`}><span className="row-time">{row.age}</span><div><strong>{row.action}</strong><small>{row.target}</small></div><span>{typeof row.amount === 'number' ? `$${row.amount.toFixed(2)}` : row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b><Icon name="external" size={15} /></div>)}</div></div>}
    {activeNav === 'Runbook' && <div className="panel runbook-panel"><div className="panel-header"><div><div className="panel-kicker">CONTROL PLANE WORKFLOW</div><h2>Terminal actions, surfaced safely</h2><p className="panel-description">Read-only checks run from the server. Write steps stay disabled until the server explicitly enables them.</p></div><span className={`runbook-mode ${runbook?.writesEnabled ? 'enabled' : ''}`}><span className="status-dot" /> {runbook?.writesEnabled ? 'writes enabled' : 'writes disabled'}</span></div>{runbookMessage && <pre className="runbook-output">{runbookMessage}</pre>}<div className="runbook-list">{runbook?.steps.map((step) => <div className="runbook-row" key={step.id}><div className="runbook-status"><span className={`runbook-dot ${step.status.toLowerCase()}`} /></div><div className="runbook-copy"><strong>{step.label}</strong><span>{step.status.toLowerCase()} · {step.kind}</span><code>{step.command}</code></div><button className={step.requiresWrite ? 'secondary-button' : 'primary-button'} disabled={!step.canRun || runbookRunning !== ''} onClick={() => onRunbookStep(step)}>{runbookRunning === step.id ? 'Running…' : step.status === 'COMPLETE' ? 'Run again' : 'Run'}</button></div>) ?? <div className="runbook-empty">Runbook unavailable. Start the server and refresh the demo.</div>}</div></div>}
  </div>
}

function LandingPage({ onEnterDemo }: { onEnterDemo: () => void }) {
  const [digestChanged, setDigestChanged] = useState(false)
  const releaseDigest = digestChanged ? '0x29f4f4ad…fddecf' : '0x29f4f4ad…fddecc'

  return <div className="product-landing">
    <header className="product-nav">
      <a className="product-brand" href="#product" aria-label="AIRLOCK home"><span className="brand-mark"><span /></span><span><strong>AIRLOCK</strong><small>release firewall</small></span></a>
      <nav className="product-nav-links" aria-label="Product navigation">
        <a href="#product">Product</a><a href="#lifecycle">How it works</a><a href="#security">Security</a><a href="#use-cases">Use cases</a><a href="#enterprise">Enterprise</a><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/README.md" target="_blank" rel="noreferrer">Documentation</a>
      </nav>
      <div className="product-nav-actions"><a href="#access" className="product-signin">Sign in</a><a href="#access" className="product-nav-cta">Protect a release</a><button className="product-demo-link" onClick={onEnterDemo}>Open demo <Icon name="arrow" size={14} /></button></div>
    </header>

    <main>
      <section className="product-hero product-container" id="product">
        <div className="product-hero-copy"><p className="product-kicker">RELEASE AUTHORITY FOR AUTONOMOUS AGENTS</p><h1>Give your AI agent authority only when its <em>release has earned it.</em></h1><p className="product-hero-lede">AIRLOCK is a release firewall for autonomous agents. It binds authority to a specific artifact, a verified evaluation, governance approval, active status, and a bounded runtime capability.</p><div className="product-hero-actions"><a className="product-button product-button-primary" href="#access">Protect your first release <Icon name="arrow" size={15} /></a><a className="product-button product-button-secondary" href="#lifecycle">See how it works <Icon name="arrow" size={15} /></a></div><div className="product-hero-note"><Icon name="lock" size={14} /> Runtime keys stay behind the enforcement boundary.</div></div>
        <div className="hero-release-card"><div className="hero-card-top"><span>AUTHORITY GATE</span><span className="hero-card-status"><i /> gated</span></div><div className="hero-card-title">A capability is earned, not assumed.</div><div className="hero-gate-list"><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Release identity</span><b>matched</b></div><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Evaluation evidence</span><b>verified</b></div><div><span className="gate-check"><Icon name="check" size={11} /></span><span>Approval and status</span><b>current</b></div><div><span className="gate-check gate-check-open"><Icon name="lock" size={11} /></span><span>Runtime capability</span><b>bounded</b></div></div><div className="hero-card-footer"><code>releaseDigest</code><strong>{releaseDigest}</strong></div></div>
      </section>

      <section className="proof-strip product-container" aria-label="AIRLOCK proof properties"><div className="proof-strip-label">BUILT AROUND PROOF</div><div className="proof-strip-items"><span>Four evidence classes</span><span>One shared <code>releaseDigest</code></span><span>Short-lived capabilities</span><span>Scope and budget enforcement</span><span>Attestcoin verification</span><span>Revocation-aware execution</span></div></section>

      <section className="product-section product-container problem-section" id="problem"><div className="section-intro"><p className="product-kicker">THE PRODUCTION PROBLEM</p><h2>Agent authority outlives the thing you meant to approve.</h2><p>Model weights, prompts, tools, containers, and policies change independently. A wallet address or API key sees none of that context.</p></div><div className="problem-grid"><div className="problem-card"><span>01</span><h3>Keys authorize addresses</h3><p>Normal wallets and multisigs authorize a signer. They do not know which release produced the next action.</p></div><div className="problem-card"><span>02</span><h3>Workers are not truth</h3><p>A relayer signature can prove that a worker spoke. It cannot prove the exact source-chain event, receipt, emitter, and decoded fields.</p></div><div className="problem-card"><span>03</span><h3>Revocation has to reach execution</h3><p>A compromised or outdated release can retain authority unless every later action checks current evidence and status.</p></div></div><div className="section-callout"><Icon name="shield" size={18} /><span>Multisig protects approval. AIRLOCK connects approval to the exact release that is allowed to act.</span></div></section>

      <section className="product-section product-container" id="outcomes"><div className="section-intro section-intro-wide"><p className="product-kicker">WHAT AIRLOCK GIVES TEAMS</p><h2>Release-level authority with an explicit boundary.</h2></div><div className="outcome-grid"><div className="outcome-card"><span className="outcome-number">01</span><h3>Release-level authority</h3><p>Attach authority to one exact release commitment, not merely an agent address.</p><a href="#release-identity">See release identity <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">02</span><h3>Bounded autonomy</h3><p>Set targets, functions, recipients, spend, call counts, expiry, and freshness before the agent acts.</p><a href="#policy">Open policy studio <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">03</span><h3>Cross-chain evidence</h3><p>Verify source-chain facts on Creditcoin through Attestcoin proofs instead of trusting a centralized worker.</p><a href="#attestcoin">Trace the proof path <Icon name="arrow" size={13} /></a></div><div className="outcome-card"><span className="outcome-number">04</span><h3>Fast containment</h3><p>Proven revocation and local guardian pauses stop later actions even when a runtime still signs.</p><a href="#revocation">See containment <Icon name="arrow" size={13} /></a></div></div></section>

      <section className="product-section product-container release-identity-section" id="release-identity"><div className="section-intro"><p className="product-kicker">RELEASE IDENTITY</p><h2>One byte changes the authority you can issue.</h2><p>The canonical manifest commits the model and the system around it: weights or adapters, tokenizer, prompts, tools, container, lockfile, SBOM, provenance, source revision, and evaluation suite.</p></div><div className="release-identity-grid"><div className="manifest-card"><div className="manifest-card-header"><span>CANONICAL MANIFEST</span><span>{digestChanged ? 'MUTATED' : 'VERIFIED'}</span></div><div className="manifest-rows">{['Model weights / adapters', 'Tokenizer and prompts', 'Tool definitions', 'Container and lockfile', 'SBOM and build provenance', 'Source revision and evaluation'].map((row) => <div key={row}><span className="manifest-check"><Icon name="check" size={11} /></span><span>{row}</span><code>committed</code></div>)}</div><button className="digest-toggle" onClick={() => setDigestChanged(!digestChanged)}><span className="digest-toggle-dot" /> {digestChanged ? 'Restore approved byte' : 'Change one byte'} <Icon name="arrow" size={13} /></button></div><div className="digest-visual"><div className="digest-visual-label">{digestChanged ? 'NEW RELEASE DIGEST' : 'APPROVED RELEASE DIGEST'}</div><code className={digestChanged ? 'digest-mutated' : ''}>{releaseDigest}</code><div className="digest-delta"><span>{digestChanged ? 'mutation detected' : 'all manifest fields match'}</span><b>{digestChanged ? 'authority withheld' : 'authority eligible'}</b></div><div className="digest-visual-footer"><span>releaseDigest</span><span>deterministic commitment</span></div></div></div></section>

      <section className="product-section product-container lifecycle-section" id="lifecycle"><div className="section-intro section-intro-wide"><p className="product-kicker">HOW A RELEASE BECOMES AUTHORITY</p><h2>From manifest to bounded capability.</h2><p>Each stage creates evidence that the next stage can verify. The product does not skip from “model exists” to “wallet can spend.”</p></div><div className="lifecycle-grid">{[['01','Publish','Build the artifact manifest and publish the release commitment.'],['02','Evaluate','Certify the exact release with an approved evaluation suite.'],['03','Approve','Register deployment parameters and governance approval.'],['04','Activate','Mark the release active with a current validity window.'],['05','Prove','Verify source events through Attestcoin on Creditcoin.'],['06','Issue','Issue a bounded capability bound to the runtime key.'],['07','Act','Submit typed intents through the enforcement router.'],['08','Contain','Revoke or pause when the release or runtime is unsafe.']].map(([number,title,copy]) => <a className="lifecycle-step" href={number === '05' ? '#attestcoin' : number === '08' ? '#revocation' : number === '07' ? '#execution' : '#evidence'} key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div><Icon name="arrow" size={15} /></a>)}</div></section>

      <section className="product-section product-container evidence-section" id="evidence"><div className="section-intro"><p className="product-kicker">EVIDENCE GRAPH</p><h2>Four independent events become one deterministic authorization decision.</h2><p>Every record must agree on the organization, agent, release, policy, nonce, and validity window before the conjunction can issue authority.</p></div><div className="evidence-graph-card"><div className="evidence-graph-line"><div><span className="evidence-graph-node"><Icon name="box" size={18} /></span><strong>Artifact publication</strong><small>manifest and artifact root</small></div><i /><div><span className="evidence-graph-node"><Icon name="activity" size={18} /></span><strong>Evaluation certification</strong><small>suite, score, evaluator set</small></div><i /><div><span className="evidence-graph-node"><Icon name="fingerprint" size={18} /></span><strong>Deployment approval</strong><small>runtime key and policy</small></div><i /><div><span className="evidence-graph-node"><Icon name="shield" size={18} /></span><strong>Active status</strong><small>current or revoked</small></div></div><div className="evidence-graph-footer"><code>orgId · agentId · releaseDigest · policyHash · nonce · validity</code><a href="https://airlock-console.vercel.app/demo" target="_blank" rel="noreferrer">Inspect an evidence graph <Icon name="arrow" size={13} /></a></div></div></section>

      <section className="product-section product-container attestcoin-section" id="attestcoin"><div className="section-intro section-intro-wide"><p className="product-kicker">ATTESTCOIN VERIFICATION LAYER</p><h2>Source-chain facts, verified where authority is enforced.</h2><p>For the current supported path, events originate on Ethereum Sepolia, Attestcoin proves inclusion and continuity, and Creditcoin verifies the receipt semantics before AIRLOCK records evidence.</p></div><ArchitectureDiagram /><div className="attestcoin-notes"><div><strong>Receipt truth</strong><span>Status, emitter, topic, log index, schema, and decoded fields are checked on Creditcoin.</span></div><div><strong>Worker liveness</strong><span>The proof worker discovers and submits proofs. It does not decide what is true.</span></div><div><strong>No trusted bridge signer</strong><span>Authority comes from verifier-checked proof data, not a centralized relay signature.</span></div></div><div className="architecture-caption"><code>Ethereum Sepolia → Attestcoin → Creditcoin CC3 testnet</code><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/docs/attestcoin-integration.md" target="_blank" rel="noreferrer">Read the integration notes <Icon name="external" size={13} /></a></div></section>

      <section className="product-section product-container policy-section" id="policy"><div className="section-intro"><p className="product-kicker">POLICY STUDIO</p><h2>Turn governance into a machine-checkable boundary.</h2><p>Teams configure what evidence is acceptable and what the runtime may do after the conjunction succeeds.</p></div><div className="policy-studio"><div className="policy-sidebar"><span>POLICY / PAYMENTS-01</span><b>Approval policy</b><a className="active" href="#policy">Evidence requirements</a><a href="#capability">Capability limits</a><a href="#execution">Execution boundary</a><a href="#revocation">Guardian response</a></div><div className="policy-form"><div className="policy-form-header"><div><span>ACTIVE DRAFT</span><h3>Agent payment policy</h3></div><span className="policy-status"><i /> ready for review</span></div><div className="policy-fields"><label><span>Approved evaluator set</span><strong>evaluator-set / v3</strong></label><label><span>Minimum evaluation score</span><strong>90.00%</strong></label><label><span>Capability TTL</span><strong>15 minutes</strong></label><label><span>Status freshness</span><strong>60 minutes</strong></label><label><span>Total spend cap</span><strong>0.11 ETH</strong></label><label><span>Per-call ceiling</span><strong>0.10 ETH</strong></label></div><div className="policy-tags"><span>vendor.pay</span><span>protocol.deposit</span><span>recipient allowlist</span><span>nonce required</span><span>TEE optional</span></div></div></div><a className="section-link" href="#access">Create a policy <Icon name="arrow" size={14} /></a></section>

      <section className="product-section product-container capability-section" id="capability"><div className="section-intro"><p className="product-kicker">CAPABILITY CENTER</p><h2>Authority is visible, bounded, and easy to kill.</h2><p>Once evidence agrees, AIRLOCK issues a non-transferable capability bound to the runtime key. It cannot widen itself and every action is revalidated.</p></div><div className="capability-card"><div className="capability-card-top"><div><span className="capability-live"><i /> ACTIVE CAPABILITY</span><h3>runtime authority / release 01</h3></div><span className="capability-shield"><Icon name="lock" size={18} /></span></div><div className="capability-card-digest"><span>releaseDigest</span><code>0x29f4f4ad…fddecc</code></div><div className="capability-metrics"><div><span>Runtime key</span><strong>0x28FD…bED974</strong></div><div><span>Scope root</span><strong>0x40f7…54ce0</strong></div><div><span>Spend remaining</span><strong>0.11 ETH</strong></div><div><span>Calls remaining</span><strong>2 / 2</strong></div><div><span>Expiry</span><strong>15 min TTL</strong></div><div><span>Policy hash</span><strong>0x460c…67b21</strong></div></div><div className="capability-card-footer"><span><Icon name="check" size={13} /> non-transferable</span><span><Icon name="check" size={13} /> revalidated per action</span><span><Icon name="shield" size={13} /> revocation-aware</span></div></div></section>

      <section className="product-section product-container execution-section" id="execution"><div className="section-intro"><p className="product-kicker">AGENT EXECUTION BOUNDARY</p><h2>The model proposes. AIRLOCK decides.</h2><p>The model never holds the vault key and never gets a raw transaction forwarding path. Intent is typed, checked, and constrained before value moves.</p></div><div className="execution-flow">{[['01','LLM proposes intent','tool + arguments'],['02','Typed EIP-712 intent','signable action'],['03','Scope and policy checks','target + recipient'],['04','Calldata validator','exact function data'],['05','Budget and nonce','value + replay'],['06','AgentVault execution','router only']].map(([number,title,copy], index) => <div className="execution-step" key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small>{index < 5 && <Icon name="arrow" size={15} />}</div>)}</div><div className="execution-outcomes"><div className="allowed-action"><span><Icon name="check" size={14} /></span><div><strong>Allowed</strong><code>vendor.pay(recipient, 0.01 ETH)</code><small>allowlisted target · within cap · fresh nonce</small></div></div><div className="rejected-actions"><span><Icon name="shield" size={14} /></span><div><strong>Rejected at the boundary</strong><div><code>vault.withdraw()</code><code>unknown recipient</code><code>replayed nonce</code><code>expired capability</code></div></div></div></div></section>

      <section className="product-section product-container revocation-section" id="revocation"><div className="revocation-copy"><p className="product-kicker">REVOCATION AND INCIDENT RESPONSE</p><h2>When a release becomes unsafe, authority closes around it.</h2><p>A source-chain revocation is published, proven through Attestcoin, imported to Creditcoin, and checked on the next action. The capability becomes unusable even if the runtime still signs.</p><div className="revocation-list"><div><span>01</span><strong>Publish revocation</strong><small>Governance marks the release unsafe.</small></div><div><span>02</span><strong>Prove and import</strong><small>Receipt semantics are verified cross-chain.</small></div><div><span>03</span><strong>Reject future calls</strong><small>AIRLOCK denies the next execution.</small></div></div></div><div className="incident-card"><div className="incident-header"><span>INCIDENT RESPONSE</span><span className="incident-closed"><i /> closed</span></div><div className="incident-release"><strong>release status</strong><b>REVOKED</b><code>reasonHash / 0xf24f…d065c</code></div><div className="incident-checks"><span><Icon name="check" size={12} /> source event proven</span><span><Icon name="check" size={12} /> capability unusable</span><span><Icon name="check" size={12} /> later intent rejected</span></div><p>Cross-chain revocation is not instantaneous. Short TTLs, freshness windows, watchers, and local guardian pauses narrow the gap.</p><a href="https://airlock-console.vercel.app/demo" target="_blank" rel="noreferrer">See revocation protection <Icon name="arrow" size={13} /></a></div></section>

      <section className="product-section product-container surfaces-section" id="surfaces"><div className="section-intro section-intro-wide"><p className="product-kicker">PRODUCT SURFACES</p><h2>One authority system, five places your team works.</h2></div><div className="surface-grid"><div><span>01 / registry</span><h3>Release registry</h3><p>Manage versions, digests, artifacts, and deployment states.</p></div><div><span>02 / explorer</span><h3>Evidence explorer</h3><p>Inspect source transactions, proofs, decoded receipts, and Creditcoin imports.</p></div><div><span>03 / policy</span><h3>Policy studio</h3><p>Define evidence, scope, budget, freshness, and guardian requirements.</p></div><div><span>04 / authority</span><h3>Capability registry</h3><p>View active, expired, paused, and revoked capabilities.</p></div><div><span>05 / enforcement</span><h3>Enforcement log</h3><p>Review allowed, rejected, replayed, expired, and revoked actions.</p></div><div id="enterprise"><span>06 / organization</span><h3>Organization settings</h3><p>Manage publishers, evaluators, approvers, guardians, runtime keys, and workers.</p></div></div></section>

      <section className="product-section product-container modes-section" id="modes"><div className="section-intro"><p className="product-kicker">DEPLOYMENT MODES</p><h2>Choose the claim your runtime can support.</h2><p>AIRLOCK is explicit about what each mode proves.</p></div><div className="mode-grid"><div className="mode-card"><div className="mode-card-top"><span>BASE MODE</span><Icon name="lock" size={18} /></div><h3>Release-bound authority</h3><p>Binds a release digest to a runtime signing key and enforces what that key can do.</p><ul><li>Exact release commitment</li><li>Evidence conjunction</li><li>Bounded capability and router checks</li><li>Does not attest which weights a running process loaded</li></ul></div><div className="mode-card mode-card-featured"><div className="mode-card-top"><span>TEE-REQUIRED MODE</span><Icon name="shield" size={18} /></div><h3>Runtime-bound authority</h3><p>Adds verifier-attested measurement, container binding, artifact binding, and validity windows.</p><ul><li>Runtime measurement registration</li><li>Container and artifact binding</li><li>Verifier-attested quote hash</li><li>Independent runtime validity window</li></ul></div></div></section>

      <section className="product-section product-container use-cases-section" id="use-cases"><div className="section-intro section-intro-wide"><p className="product-kicker">USE CASES</p><h2>For teams that let agents touch real value.</h2></div><div className="use-case-grid"><div><Icon name="wallet" size={19} /><h3>DAO and treasury agents</h3><p>Limit payouts to approved recipients, functions, budgets, and release versions.</p></div><div><Icon name="activity" size={19} /><h3>Stablecoin and payment agents</h3><p>Keep payment authority current while every call remains bounded and replay-safe.</p></div><div><Icon name="box" size={19} /><h3>Agent-wallet and MCP infrastructure</h3><p>Give tools explicit capabilities instead of handing models unrestricted wallet access.</p></div><div><Icon name="shield" size={19} /><h3>On-chain funds and custodians</h3><p>Connect governance evidence to the exact software release operating capital.</p></div><div><Icon name="grid" size={19} /><h3>DePIN operators</h3><p>Constrain automated protocol operations as deployments and policies evolve.</p></div><div><Icon name="lock" size={19} /><h3>Enterprise agents</h3><p>Make approved payments and protocol actions auditable, bounded, and containable.</p></div></div></section>


      <section className="product-section product-container security-section" id="security"><div className="section-intro section-intro-wide"><p className="product-kicker">SECURITY MODEL</p><h2>Every check closes a different escape route.</h2></div><div className="security-grid"><div><Icon name="check" size={17} /><strong>Receipt validation</strong><p>Status, emitter, event schema, and decoded fields are checked.</p></div><div><Icon name="fingerprint" size={17} /><strong>Exact digest matching</strong><p>Artifact, evaluation, approval, and status must share the release identity.</p></div><div><Icon name="lock" size={17} /><strong>Replay protection</strong><p>Nonces, deadlines, and monotonic state prevent reuse.</p></div><div><Icon name="grid" size={17} /><strong>Scope intersection</strong><p>Policy and capability limits can only narrow the action.</p></div><div><Icon name="wallet" size={17} /><strong>Calldata validation</strong><p>Exact targets, functions, recipients, and values are enforced.</p></div><div><Icon name="shield" size={17} /><strong>Direct-vault protection</strong><p>The vault is callable only through the router boundary.</p></div><div><Icon name="pause" size={17} /><strong>Monotonic revocation</strong><p>Revoked status cannot be silently replaced by stale evidence.</p></div><div><Icon name="terminal" size={17} /><strong>Least-privilege workers</strong><p>Proof workers provide liveness without authority to issue capabilities.</p></div></div><div className="security-links"><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/docs/threat-model.md" target="_blank" rel="noreferrer">Read the threat model <Icon name="external" size={13} /></a><a href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/contracts/contracts/Airlock.sol" target="_blank" rel="noreferrer">Review the contracts <Icon name="external" size={13} /></a></div></section>


      <section className="product-section product-container operations-section"><div className="section-intro"><p className="product-kicker">RELIABILITY AND OPERATIONS</p><h2>Proof infrastructure stays replaceable. The decision stays verifiable.</h2><p>Cursor-based discovery, retries, monitoring, freshness alerts, deployment checks, and guardian controls keep the system operating without making a worker the source of truth.</p></div><div className="operations-grid"><div><span>liveness</span><strong>Proof-worker retries</strong><p>Workers discover events, retry failed submissions, and expose their cursor.</p></div><div><span>availability</span><strong>Permissionless submission</strong><p>Anyone with a valid proof can submit it; the worker is not a privileged oracle.</p></div><div><span>containment</span><strong>Guardian emergency controls</strong><p>Local pauses narrow the cross-chain freshness window during an incident.</p></div><div><span>auditability</span><strong>Deployment verification</strong><p>Release, evidence, capability, and enforcement activity remain inspectable.</p></div></div></section>

      <section className="product-section product-container faq-section"><div className="section-intro section-intro-wide"><p className="product-kicker">FAQ</p><h2>Direct answers for security and platform teams.</h2></div><div className="faq-list"><details><summary>Is AIRLOCK a bridge?</summary><p>No. Attestcoin proofs carry source-chain facts to Creditcoin for verification. AIRLOCK uses the verified result to decide whether authority exists.</p></details><details><summary>What exactly does Attestcoin prove?</summary><p>Transaction inclusion and continuity, which AIRLOCK combines with receipt status, approved emitter, topic, log index, schema, and decoded-field checks.</p></details><details><summary>Can an agent bypass the router?</summary><p>The model does not hold the vault key, raw transaction forwarding is rejected, and the AgentVault is callable only through the router.</p></details><details><summary>Can a capability be transferred?</summary><p>No. Capabilities are bound to a runtime key, a release digest, an explicit scope, budgets, and an expiry window.</p></details><details><summary>What happens when a release is revoked?</summary><p>After the revocation is proven and imported, future AIRLOCK actions fail even if the old runtime continues to sign.</p></details><details><summary>How long does cross-chain verification take?</summary><p>It depends on source finality, proof generation, submission, and polling. Freshness limits and short capability TTLs prevent stale authority from lasting indefinitely.</p></details><details><summary>Does AIRLOCK prove that the model is intelligent?</summary><p>No. AIRLOCK controls release authority and execution boundaries. Evaluation quality and model behavior remain responsibilities of the organization.</p></details><details><summary>Can organizations self-host the proof worker?</summary><p>Yes. The worker is designed as a replaceable liveness component; the verifier and on-chain contracts remain the authority boundary.</p></details></div></section>
    </main>

    <footer className="product-footer product-container" id="access"><div><p className="product-kicker">READY WHEN YOUR AGENT TOUCHES REAL VALUE</p><h2>Protect the next release your agent ships.</h2><p>Run AIRLOCK in your own environment, inspect the architecture, or start with the live proof surface.</p></div><div className="product-footer-actions"><a className="product-button product-button-primary" href="#policy">Protect a release <Icon name="arrow" size={15} /></a><a className="product-button product-button-secondary" href="https://github.com/Shaurya2k06/AIRLOCK/blob/main/docs/architecture.md" target="_blank" rel="noreferrer">Read the architecture <Icon name="external" size={14} /></a><button className="product-button product-button-ghost" onClick={onEnterDemo}>Explore the demo <Icon name="arrow" size={14} /></button></div></footer>
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
