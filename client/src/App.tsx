import { useEffect, useMemo, useState } from 'react'
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

const evidence = [
  { label: 'Artifact', detail: 'Atlas-7b / v1.4.2', time: '08:21:04', status: 'FIXTURE', icon: 'box' as IconName },
  { label: 'Evaluation', detail: 'Safety suite · 92.4%', time: '08:23:19', status: 'FIXTURE', icon: 'activity' as IconName },
  { label: 'Approval', detail: 'Runtime key · scoped', time: '08:26:51', status: 'FIXTURE', icon: 'fingerprint' as IconName },
  { label: 'Active status', detail: 'Checkpoint #184', time: '08:31:07', status: 'FIXTURE', icon: 'shield' as IconName },
]

const activity = [
  { action: 'vendor.pay', target: '0x4E…91c2', amount: '$24.00', state: 'Allowed', age: '2m ago' },
  { action: 'protocol.deposit', target: '0xA1…0b72', amount: '$10.00', state: 'Allowed', age: '18m ago' },
  { action: 'vendor.pay', target: '0x91…dead', amount: '$240.00', state: 'Blocked', age: '1h ago' },
]

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
type Runbook = { mode: string; writesEnabled: boolean; steps: RunbookStep[] }
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

function DemoPage({ onHome }: { onHome: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [paused, setPaused] = useState(false)
  const [simulation, setSimulation] = useState<'idle' | 'allowed' | 'blocked'>('idle')
  const [simulationReason, setSimulationReason] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [runbook, setRunbook] = useState<Runbook | null>(null)
  const [runbookRunning, setRunbookRunning] = useState('')
  const [runbookMessage, setRunbookMessage] = useState('')
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
  const displayOverview = chainUnavailable ? null : overview
  const displayEvidence: DisplayEvidence[] = chainUnavailable
    ? evidence.map((item) => ({ ...item, detail: 'chain data unavailable', status: 'UNAVAILABLE', time: '—' }))
    : displayOverview?.evidence.map((item, index) => ({ label: item.kind, detail: item.detail, status: item.status, time: 'chain', icon: evidence[index]?.icon ?? 'box', txHash: item.txHash, creditcoinTxHash: item.creditcoinTxHash, sourceChainKey: item.sourceChainKey, sourceEmitter: item.sourceEmitter, sourceTopic0: item.sourceTopic0, sourceBlock: item.sourceBlock, logIndex: item.logIndex, receiptStatus: item.receiptStatus })) ?? evidence
  const displayActivity = chainUnavailable
    ? []
    : displayOverview ? displayOverview.actions.map((item) => ({ ...item, amount: `$${item.amount.toFixed(2)}`, state: item.state.includes('Allowed') ? 'Allowed' : 'Blocked' })) : activity
  const release = chainUnavailable
    ? { name: '—', version: '—', digest: '—', status: 'UNAVAILABLE', expiresAt: '—' }
    : displayOverview?.release ?? { name: 'Atlas-7b', version: '1.4.2', digest: '0x8f24c1a7…d83a71', status: 'ACTIVE', expiresAt: '08:41 UTC' }
  const displayCapability = displayOverview?.capability
  const freshness = displayOverview?.freshness
  const provenEvidence = displayEvidence.filter((item) => item.status === 'PROVEN').length
  const network = displayOverview?.network ?? { source: 'Ethereum Sepolia', destination: 'Creditcoin CC3', chainKey: 'pending' }
  const localPaused = !liveData && !chainUnavailable && paused
  const capabilityState = chainUnavailable ? 'UNAVAILABLE' : localPaused ? 'PAUSED' : displayOverview?.capability.status ?? 'ACTIVE'
  const releaseStatus = chainUnavailable ? 'UNAVAILABLE' : release.status
  const simulationCopy = useMemo(() => {
    if (simulation === 'allowed') return { title: 'Intent authorized', body: simulationReason || 'Scope, validator, nonce, and budget checks passed.', tone: 'success' }
    if (simulation === 'blocked') return { title: 'Intent blocked', body: simulationReason || 'Recipient is outside the approved capability scope.', tone: 'danger' }
    return null
  }, [simulation, simulationReason])

  const simulate = async (blocked: boolean) => {
    const recipient = blocked ? '0x0000000000000000000000000000000000000001' : displayOverview?.policy.recipient ?? '0x4E…91c2'
    const amount = blocked ? 24 : Math.min(24, displayOverview?.policy.maxPayment ?? 250)
    try {
      const response = await fetch(`${API_URL}/api/actions/simulate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient, amount }),
      })
      if (!response.ok) throw new Error('control plane unavailable; no chain decision available')
      const result = await response.json()
      setSimulation(result.allowed ? 'allowed' : 'blocked')
      setSimulationReason(result.reason)
    } catch {
      setSimulation('blocked')
      setSimulationReason('control plane unavailable; no chain decision available')
    }
  }

  const executeRunbook = async (step: RunbookStep) => {
    if (step.requiresWrite && !window.confirm(`Run ${step.label}? This may send a real testnet transaction.`)) return
    setRunbookRunning(step.id)
    setRunbookMessage('')
    try {
      const response = await fetch(`${API_URL}/api/runbook/execute`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: step.id }),
      })
      const result = await response.json() as { ok?: boolean; output?: string; error?: string; runbook?: Runbook }
      if (result.runbook) setRunbook(result.runbook)
      setRunbookMessage(result.output || result.error || (result.ok ? 'step complete' : 'step failed'))
      if (result.ok) {
        const refreshed = await fetch(`${API_URL}/api/overview`)
        if (refreshed.ok) setOverview(await refreshed.json() as Overview)
      }
    } catch {
      setRunbookMessage('control plane unavailable; no terminal action was started')
    } finally {
      setRunbookRunning('')
    }
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
          <div className="user-row"><div className="avatar">NS</div><div><strong>Northstar Labs</strong><span>Policy admin</span></div><Icon name="chevron" size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Northstar Labs</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="live-indicator"><span className="status-dot" /> {chainUnavailable ? 'chain unavailable' : liveData ? 'chain data' : 'local fixture'}</div><button className="icon-button" aria-label="Open proof inspector"><Icon name="terminal" size={17} /></button><button className="wallet-chip"><span className="wallet-avatar"><Icon name="wallet" size={14} /></span><span>{displayOverview?.capability.runtimeKey ?? (chainUnavailable ? '—' : '0x8B…6A14')}</span><Icon name="chevron" size={14} /></button></div></header>

        {activeNav === 'Overview' && <div className="page-body">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CONTROL PLANE / RELEASE 01</div><h1>Release firewall</h1><p>Cryptographic evidence decides what your agent can do.</p></div><div className="heading-actions"><button className="secondary-button"><Icon name="external" size={15} /> View on Blockscout</button><button className="primary-button" disabled={liveData || chainUnavailable} title={liveData ? 'Use the guardian runbook for live emergency controls' : chainUnavailable ? 'Control plane unavailable' : undefined} onClick={() => { if (!liveData && !chainUnavailable) setPaused(!paused) }}><Icon name={liveData ? 'shield' : paused ? 'play' : 'pause'} size={15} /> {chainUnavailable ? 'Control plane unavailable' : liveData ? 'Guardian control in runbook' : paused ? 'Resume local fixture' : 'Pause local fixture'}</button></div></section>
          <section className="metric-grid" aria-label="Release metrics"><div className="metric-card metric-highlight"><div className="metric-top"><span>Release state</span><Icon name="shield" size={18} /></div><div className="metric-value status-value"><span className={`large-dot ${localPaused ? 'paused' : ''}`} /> {capabilityState}</div><div className="metric-foot">{chainUnavailable ? 'Control plane unavailable' : liveData ? 'Read from Creditcoin' : 'Local fixture only'}</div></div><div className="metric-card"><div className="metric-top"><span>Evidence</span><span className="metric-accent">{chainUnavailable ? '— / 04' : `${provenEvidence.toString().padStart(2, '0')} / 04`}</span></div><div className="metric-value">{chainUnavailable ? 'UNAVAILABLE' : liveData ? (provenEvidence === 4 ? 'VERIFIED' : 'PENDING') : 'FIXTURE'}</div><div className="metric-foot">One digest across all proofs</div></div><div className="metric-card"><div className="metric-top"><span>Spend remaining</span><span className="metric-accent">{chainUnavailable ? '—' : displayOverview ? `${Math.max(0, Math.round(((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100))}%` : '63%'}</span></div><div className="metric-value">{chainUnavailable ? '—' : displayOverview ? `$${Math.max(0, displayOverview.capability.spendCap - displayOverview.capability.spent).toFixed(2)}` : '$220.00'}</div><div className="meter"><span style={{ width: `${chainUnavailable ? 0 : displayOverview ? Math.max(0, Math.min(100, ((displayOverview.capability.spendCap - displayOverview.capability.spent) / Math.max(displayOverview.capability.spendCap, 1)) * 100)) : 63}%` }} /></div><div className="metric-foot">{chainUnavailable ? 'No chain decision' : `of $${displayOverview?.capability.spendCap.toFixed(2) ?? '350.00'} total cap`}</div></div><div className="metric-card"><div className="metric-top"><span>Status freshness</span><Icon name="clock" size={17} /></div><div className="metric-value">{chainUnavailable ? '—' : liveData ? releaseStatus === 'REVOKED' ? 'closed' : freshness ? `${Math.ceil(freshness.remainingSeconds / 60)}m` : '—' : '08:42'}</div><div className="metric-foot">{chainUnavailable ? 'No chain decision' : liveData ? `max age ${Math.ceil((freshness?.maxAgeSeconds ?? 0) / 60)}m · source status` : 'Maximum detection window'}</div></div></section>

          <section className="release-layout"><div className="panel release-panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZED RELEASE</div><h2>{release.name} <span>/</span> v{release.version}</h2></div><div className="verified-badge"><Icon name="check" size={13} /> {chainUnavailable ? 'UNAVAILABLE' : liveData ? release.status : 'FIXTURE'}</div></div><div className="digest-row"><span className="digest-label">releaseDigest</span><code>{release.digest}</code><button className="copy-button" aria-label="Copy release digest"><Icon name="copy" size={14} /></button></div><div className="release-divider" /><div className="release-details"><div><span>Runtime key</span><strong><span className="key-dot" /> {displayOverview?.capability.runtimeKey ?? (chainUnavailable ? '—' : '0x8B31…6A14')}</strong></div><div><span>Policy</span><strong>{chainUnavailable ? '—' : liveData ? 'on-chain policy' : 'northstar-agent-v1'}</strong></div><div><span>Status issued</span><strong>{liveData ? freshness?.statusIssuedAt ?? '—' : chainUnavailable ? '—' : 'Today, 08:31 UTC'}</strong></div><div><span>Expires</span><strong>{displayOverview?.capability.expiresAt ?? release.expiresAt}</strong></div></div><div className="source-chain"><span className="chain-icon eth">◆</span><span>{network.source}</span><Icon name="arrow" size={16} /><span className="chain-icon cc">C</span><span>{network.destination}</span><span className="chain-confirm"><Icon name="check" size={12} /> {chainUnavailable ? 'unavailable' : liveData ? 'proof verified' : 'fixture data'}</span></div></div>
            <div className="panel boundary-panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>What the agent can do</h2></div><span className="live-pill"><span className="status-dot" /> {chainUnavailable ? 'unavailable' : liveData ? 'chain' : 'fixture'}</span></div><div className="boundary-list"><div className="boundary-row"><div className="boundary-icon green"><Icon name="wallet" size={16} /></div><div><strong>Vendor payment</strong><span>1 registered recipient</span></div><b>≤ {chainUnavailable ? '—' : displayOverview?.policy.maxPayment ?? 250}</b></div><div className="boundary-row"><div className="boundary-icon amber"><Icon name="box" size={16} /></div><div><strong>Protocol deposit</strong><span>Bounded service call</span></div><b>≤ {chainUnavailable ? '—' : `$${displayOverview?.policy.depositMax ?? 100}`}</b></div><div className="boundary-row"><div className="boundary-icon purple"><Icon name="activity" size={16} /></div><div><strong>Call budget</strong><span>Nonces are single-use</span></div><b>{chainUnavailable ? '—' : displayOverview?.capability.callCap ?? 2} {chainUnavailable ? '' : 'calls'}</b></div></div><div className="boundary-note"><Icon name="lock" size={14} /> No raw transaction access · no vault withdrawal</div></div></section>

          <section className="panel evidence-panel"><div className="panel-header evidence-heading"><div><div className="panel-kicker">EVIDENCE GRAPH</div><h2>Four independent proofs. One release.</h2></div><button className="text-button" onClick={() => setActiveNav('Evidence graph')}>Open inspector <Icon name="arrow" size={14} /></button></div><div className="evidence-track">{displayEvidence.map((item, index) => <div className="evidence-item" key={item.label}><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><div className="evidence-copy"><strong>{item.label}</strong><span>{item.detail}</span><small>{item.time ?? 'chain' } · <b>{item.status}</b></small></div>{index < displayEvidence.length - 1 && <div className="evidence-connector"><span /></div>}</div>)}</div><div className="evidence-footer"><span><span className="status-dot" /> {chainUnavailable ? 'Chain data unavailable for ' : liveData ? 'All proofs read from Creditcoin for ' : 'Fixture digest '}<code>{release.digest}</code></span><span>{liveData ? 'source chain key ' : 'Attestation latency '}<b>{liveData ? network.chainKey : chainUnavailable ? '—' : '2m 11s'}</b></span></div></section>

          <section className="bottom-grid"><div className="panel action-panel"><div className="panel-header"><div><div className="panel-kicker">ACTION GATE</div><h2>Test the boundary</h2></div><span className="action-state"><span className="status-dot" /> {chainUnavailable ? 'unavailable' : 'signer ready'}</span></div><p className="panel-description">The model proposes. AIRLOCK validates the exact intent before the vault can move value.</p><div className="intent-preview"><div className="intent-line"><span>tool</span><code>vendor.pay</code><span className="intent-allow">ALLOWLISTED</span></div><div className="intent-line"><span>recipient</span><code>{displayOverview?.policy.recipient ?? (chainUnavailable ? '—' : '0x4E9b…91c2')}</code><span>{chainUnavailable ? '—' : liveData ? `≤ $${displayOverview?.policy.maxPayment.toFixed(2) ?? '—'}` : '$24.00'}</span></div><div className="intent-line"><span>nonce</span><code>01</code><span>deadline 60s</span></div></div><div className="action-buttons"><button className="primary-button" onClick={() => simulate(false)}><Icon name="play" size={15} /> Simulate allowed call</button><button className="danger-button" onClick={() => simulate(true)}><Icon name="shield" size={15} /> Test blocked call</button></div>{simulationCopy && <div className={`simulation-result ${simulationCopy.tone}`}><span className="result-icon"><Icon name={simulationCopy.tone === 'success' ? 'check' : 'shield'} size={15} /></span><div><strong>{simulationCopy.title}</strong><span>{simulationCopy.body}</span></div><button onClick={() => { setSimulation('idle'); setSimulationReason('') }} aria-label="Dismiss result">×</button></div>}</div>
            <div className="panel activity-panel"><div className="panel-header"><div><div className="panel-kicker">RECENT ACTIVITY</div><h2>Enforcement log</h2></div><button className="text-button" onClick={() => setActiveNav('Action log')}>View all <Icon name="arrow" size={14} /></button></div><div className="activity-table"><div className="table-head"><span>Action</span><span>Value</span><span>Result</span></div>{displayActivity.map((row) => <div className="table-row" key={`${row.action}-${row.age}`}><div><strong>{row.action}</strong><small>{row.target} · {row.age}</small></div><span>{row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b></div>)}</div></div></section>
        </div>}

        {activeNav !== 'Overview' && <DetailView activeNav={activeNav} onBack={() => setActiveNav('Overview')} evidenceItems={displayEvidence} capability={displayCapability} activity={displayActivity} fixtureMode={!liveData && !chainUnavailable} unavailable={chainUnavailable} runbook={runbook} runbookRunning={runbookRunning} runbookMessage={runbookMessage} onRunbookStep={executeRunbook} />}
      </main>
    </div>
  )
}

function DetailView({ activeNav, onBack, evidenceItems, capability, activity: displayActivity, fixtureMode, unavailable, runbook, runbookRunning, runbookMessage, onRunbookStep }: { activeNav: string; onBack: () => void; evidenceItems: DisplayEvidence[]; capability?: Overview['capability']; activity: Array<{ action: string; target: string; amount: number | string; state: string; age: string }>; fixtureMode: boolean; unavailable: boolean; runbook: Runbook | null; runbookRunning: string; runbookMessage: string; onRunbookStep: (step: RunbookStep) => void }) {
  const titles: Record<string, string> = { 'Evidence graph': 'Evidence inspector', Capabilities: 'Capability registry', 'Action log': 'Action log', Runbook: 'Terminal runbook' }
  return <div className="detail-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / INSPECTOR</div><h1>{titles[activeNav]}</h1><p>Verified state from the current release firewall.</p></div><button className="secondary-button" onClick={onBack}><Icon name="arrow" size={15} /> Back to overview</button></div>
    {activeNav === 'Evidence graph' && <div className="detail-grid">{evidenceItems.map((item) => <div className="panel detail-card" key={item.label}><div className="detail-card-top"><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><span className="verified-badge"><Icon name="check" size={12} /> {item.status}</span></div><h2>{item.label}</h2><p>{item.detail}</p><code>{item.txHash ? `${item.txHash.slice(0, 10)}…${item.txHash.slice(-8)} · log ${item.logIndex ?? '—'}` : item.time ?? 'chain data'}</code><div className="detail-meta"><span>{item.sourceChainKey ? `chain key ${item.sourceChainKey}` : 'Ethereum Sepolia'} · block {item.sourceBlock ?? '—'}</span><span>{item.receiptStatus === 1 ? 'receipt status 1' : item.status === 'PROVEN' ? 'receipt metadata pending' : 'not verified'}</span></div>{item.sourceEmitter && <small>Emitter: {item.sourceEmitter.slice(0, 10)}…{item.sourceEmitter.slice(-8)} · event: {item.label}</small>}{item.creditcoinTxHash && <small>Creditcoin import: {item.creditcoinTxHash.slice(0, 10)}…{item.creditcoinTxHash.slice(-8)}</small>}</div>)}</div>}
    {activeNav === 'Capabilities' && <div className="panel capability-detail"><div className="capability-summary"><div className="capability-lock"><Icon name="lock" size={24} /></div><div><div className="panel-kicker">CAPABILITY ID</div><h2>chain capability</h2><p>Non-transferable authority bound to <code>{capability?.runtimeKey ?? (fixtureMode ? '0x8B31…6A14' : '—')}</code></p></div><span className="verified-badge"><Icon name="check" size={12} /> {unavailable ? 'UNAVAILABLE' : capability?.status ?? 'FIXTURE'}</span></div><div className="capability-grid"><div><span>Scope root</span><strong>{unavailable ? '—' : capability?.scopeRoot ?? 'fixture'}</strong></div><div><span>Total spend</span><strong>{unavailable ? '—' : `$${capability?.spent.toFixed(2) ?? '130.00'} / $${capability?.spendCap.toFixed(2) ?? '350.00'}`}</strong></div><div><span>Calls used</span><strong>{unavailable ? '—' : `${capability?.callsUsed ?? 2} / ${capability?.callCap ?? 4}`}</strong></div><div><span>Valid until</span><strong>{unavailable ? '—' : capability?.expiresAt ?? 'status evidence'}</strong></div></div><div className="boundary-note"><Icon name="shield" size={14} /> {unavailable ? 'No chain decision available.' : 'Every action is revalidated against current release status.'}</div></div>}
    {activeNav === 'Action log' && <div className="panel full-table"><div className="panel-header"><div><div className="panel-kicker">CHAIN-BOUND EVENTS</div><h2>All enforcement decisions</h2></div><span className="live-pill"><span className="status-dot" /> {fixtureMode ? 'fixture' : 'indexed'}</span></div><div className="expanded-table">{(fixtureMode ? displayActivity.concat([{ action: 'vault.withdraw', target: 'direct call', amount: '—', state: 'Blocked', age: '2h ago' }]) : displayActivity).map((row) => <div className="expanded-row" key={`${row.action}-${row.age}`}><span className="row-time">{row.age}</span><div><strong>{row.action}</strong><small>{row.target}</small></div><span>{typeof row.amount === 'number' ? `$${row.amount.toFixed(2)}` : row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b><Icon name="external" size={15} /></div>)}</div></div>}
    {activeNav === 'Runbook' && <div className="panel runbook-panel"><div className="panel-header"><div><div className="panel-kicker">CONTROL PLANE WORKFLOW</div><h2>Terminal actions, surfaced safely</h2><p className="panel-description">Read-only checks run from the server. Write steps stay disabled until the server explicitly enables them.</p></div><span className={`runbook-mode ${runbook?.writesEnabled ? 'enabled' : ''}`}><span className="status-dot" /> {runbook?.writesEnabled ? 'writes enabled' : 'writes disabled'}</span></div>{runbookMessage && <pre className="runbook-output">{runbookMessage}</pre>}<div className="runbook-list">{runbook?.steps.map((step) => <div className="runbook-row" key={step.id}><div className="runbook-status"><span className={`runbook-dot ${step.status.toLowerCase()}`} /></div><div className="runbook-copy"><strong>{step.label}</strong><span>{step.status.toLowerCase()} · {step.kind}</span><code>{step.command}</code></div><button className={step.requiresWrite ? 'secondary-button' : 'primary-button'} disabled={!step.canRun || runbookRunning !== ''} onClick={() => onRunbookStep(step)}>{runbookRunning === step.id ? 'Running…' : step.status === 'COMPLETE' ? 'Run again' : 'Run'}</button></div>) ?? <div className="runbook-empty">Runbook unavailable. Start the server and refresh the demo.</div>}</div></div>}
  </div>
}

function LandingPage({ onEnterDemo }: { onEnterDemo: () => void }) {
  const [health, setHealth] = useState<'checking' | 'ready' | 'offline'>('checking')

  useEffect(() => {
    fetch(`${API_URL}/health`).then((response) => setHealth(response.ok ? 'ready' : 'offline')).catch(() => setHealth('offline'))
  }, [])

  return <div className="landing-page"><header className="landing-nav"><button className="brand brand-link" aria-label="AIRLOCK home"><div className="brand-mark"><span /></div><div><div className="brand-name">AIRLOCK</div><div className="brand-subtitle">release firewall</div></div></button><div className="landing-nav-actions"><span className="landing-health"><span className={`status-dot ${health === 'offline' ? 'offline' : ''}`} /> {health === 'ready' ? 'control plane online' : health === 'offline' ? 'start control plane' : 'checking control plane'}</span><button className="secondary-button" onClick={onEnterDemo}>Open demo <Icon name="arrow" size={15} /></button></div></header><main className="landing-main"><section className="landing-hero"><div className="eyebrow"><span className="eyebrow-line" /> CROSS-CHAIN RELEASE FIREWALL</div><h1>Give an agent a capability.<br /><em>Make the release prove it.</em></h1><p className="landing-lede">AIRLOCK binds what an autonomous agent can do to one verified release digest—across source evidence, Creditcoin proofs, policy, and revocation.</p><div className="landing-actions"><button className="primary-button" onClick={onEnterDemo}>Open live demo <Icon name="arrow" size={15} /></button><span><Icon name="lock" size={14} /> No private keys in the browser</span></div></section><section className="landing-proof"><div className="landing-proof-head"><span>THE CONTROL LOOP</span><code>SEPOLIA → ATTESTCOIN → CREDITCOIN</code></div><div className="landing-proof-grid"><div><span className="landing-proof-index">01</span><strong>Prove the release</strong><p>Artifact, evaluation, approval, and status are anchored to one digest.</p></div><div><span className="landing-proof-index">02</span><strong>Issue bounded authority</strong><p>Capabilities carry scope, value ceilings, call budgets, and expiry.</p></div><div><span className="landing-proof-index">03</span><strong>Revalidate every call</strong><p>Allowed actions pass the boundary. Revoked releases stop the next one.</p></div></div></section><section className="landing-footer-card"><div><div className="panel-kicker">BUILT FOR THE DEMO</div><h2>Watch the evidence become enforcement.</h2></div><button className="text-button" onClick={onEnterDemo}>Enter the control plane <Icon name="arrow" size={14} /></button></section></main></div>
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
