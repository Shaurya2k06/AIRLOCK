import { useMemo, useState } from 'react'
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
  { label: 'Artifact', detail: 'Atlas-7b / v1.4.2', time: '08:21:04', icon: 'box' as IconName },
  { label: 'Evaluation', detail: 'Safety suite · 92.4%', time: '08:23:19', icon: 'activity' as IconName },
  { label: 'Approval', detail: 'Runtime key · scoped', time: '08:26:51', icon: 'fingerprint' as IconName },
  { label: 'Active status', detail: 'Checkpoint #184', time: '08:31:07', icon: 'shield' as IconName },
]

const activity = [
  { action: 'vendor.pay', target: '0x4E…91c2', amount: '$24.00', state: 'Allowed', age: '2m ago' },
  { action: 'protocol.deposit', target: '0xA1…0b72', amount: '$10.00', state: 'Allowed', age: '18m ago' },
  { action: 'vendor.pay', target: '0x91…dead', amount: '$240.00', state: 'Blocked', age: '1h ago' },
]

function App() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [paused, setPaused] = useState(false)
  const [simulation, setSimulation] = useState<'idle' | 'allowed' | 'blocked'>('idle')

  const capabilityState = paused ? 'PAUSED' : 'ACTIVE'
  const simulationCopy = useMemo(() => {
    if (simulation === 'allowed') return { title: 'Intent authorized', body: 'Scope, validator, nonce, and budget checks passed.', tone: 'success' }
    if (simulation === 'blocked') return { title: 'Intent blocked', body: 'Recipient is outside the approved capability scope.', tone: 'danger' }
    return null
  }, [simulation])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <div><div className="brand-name">AIRLOCK</div><div className="brand-subtitle">release firewall</div></div>
        </div>
        <div className="network-status"><span className="status-dot" /> CC3 TESTNET <span className="network-chevron">⌄</span></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {[
            ['Overview', 'grid'],
            ['Evidence graph', 'shield'],
            ['Capabilities', 'lock'],
            ['Action log', 'activity'],
          ].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => setActiveNav(label)}>
              <Icon name={icon as IconName} size={17} /><span>{label}</span>{label === 'Evidence graph' && <span className="nav-count">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Current release</div>
          <div className="release-mini"><div className="release-mini-icon"><Icon name="box" size={16} /></div><div className="release-mini-copy"><strong>Atlas-7b</strong><span>v1.4.2 · verified</span></div><span className="mini-check"><Icon name="check" size={12} /></span></div>
          <button className="settings-button"><Icon name="terminal" size={16} /><span>Runbook & settings</span></button>
          <div className="user-row"><div className="avatar">NS</div><div><strong>Northstar Labs</strong><span>Policy admin</span></div><Icon name="chevron" size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Northstar Labs</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="live-indicator"><span className="status-dot" /> live data</div><button className="icon-button" aria-label="Open proof inspector"><Icon name="terminal" size={17} /></button><button className="wallet-chip"><span className="wallet-avatar"><Icon name="wallet" size={14} /></span><span>0x8B…6A14</span><Icon name="chevron" size={14} /></button></div></header>

        {activeNav === 'Overview' && <div className="page-body">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CONTROL PLANE / RELEASE 01</div><h1>Release firewall</h1><p>Cryptographic evidence decides what your agent can do.</p></div><div className="heading-actions"><button className="secondary-button"><Icon name="external" size={15} /> View on Blockscout</button><button className="primary-button" onClick={() => setPaused(!paused)}><Icon name={paused ? 'play' : 'pause'} size={15} /> {paused ? 'Resume capability' : 'Pause capability'}</button></div></section>
          <section className="metric-grid" aria-label="Release metrics"><div className="metric-card metric-highlight"><div className="metric-top"><span>Release state</span><Icon name="shield" size={18} /></div><div className="metric-value status-value"><span className={`large-dot ${paused ? 'paused' : ''}`} /> {capabilityState}</div><div className="metric-foot">Status checkpoint is fresh</div></div><div className="metric-card"><div className="metric-top"><span>Evidence</span><span className="metric-accent">04 / 04</span></div><div className="metric-value">VERIFIED</div><div className="metric-foot">One digest across all proofs</div></div><div className="metric-card"><div className="metric-top"><span>Spend remaining</span><span className="metric-accent">63%</span></div><div className="metric-value">$220.00</div><div className="meter"><span style={{ width: '63%' }} /></div><div className="metric-foot">of $350.00 total cap</div></div><div className="metric-card"><div className="metric-top"><span>Revocation gap</span><Icon name="clock" size={17} /></div><div className="metric-value">08:42</div><div className="metric-foot">Maximum detection window</div></div></section>

          <section className="release-layout"><div className="panel release-panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZED RELEASE</div><h2>Atlas-7b <span>/</span> v1.4.2</h2></div><div className="verified-badge"><Icon name="check" size={13} /> VERIFIED</div></div><div className="digest-row"><span className="digest-label">releaseDigest</span><code>0x8f24c1a7…d83a71</code><button className="copy-button" aria-label="Copy release digest"><Icon name="copy" size={14} /></button></div><div className="release-divider" /><div className="release-details"><div><span>Runtime key</span><strong><span className="key-dot" /> 0x8B31…6A14</strong></div><div><span>Policy</span><strong>northstar-agent-v1</strong></div><div><span>Issued</span><strong>Today, 08:31 UTC</strong></div><div><span>Expires</span><strong>Today, 08:41 UTC</strong></div></div><div className="source-chain"><span className="chain-icon eth">◆</span><span>Ethereum Sepolia</span><Icon name="arrow" size={16} /><span className="chain-icon cc">C</span><span>Creditcoin CC3</span><span className="chain-confirm"><Icon name="check" size={12} /> proof verified</span></div></div>
            <div className="panel boundary-panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>What the agent can do</h2></div><span className="live-pill"><span className="status-dot" /> live</span></div><div className="boundary-list"><div className="boundary-row"><div className="boundary-icon green"><Icon name="wallet" size={16} /></div><div><strong>Vendor payment</strong><span>1 registered recipient</span></div><b>≤ $250</b></div><div className="boundary-row"><div className="boundary-icon amber"><Icon name="box" size={16} /></div><div><strong>Protocol deposit</strong><span>Bounded service call</span></div><b>≤ $100</b></div><div className="boundary-row"><div className="boundary-icon purple"><Icon name="activity" size={16} /></div><div><strong>Call budget</strong><span>Nonces are single-use</span></div><b>02 calls</b></div></div><div className="boundary-note"><Icon name="lock" size={14} /> No raw transaction access · no vault withdrawal</div></div></section>

          <section className="panel evidence-panel"><div className="panel-header evidence-heading"><div><div className="panel-kicker">EVIDENCE GRAPH</div><h2>Four independent proofs. One release.</h2></div><button className="text-button" onClick={() => setActiveNav('Evidence graph')}>Open inspector <Icon name="arrow" size={14} /></button></div><div className="evidence-track">{evidence.map((item, index) => <div className="evidence-item" key={item.label}><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><div className="evidence-copy"><strong>{item.label}</strong><span>{item.detail}</span><small>{item.time} · <b>PROVEN</b></small></div>{index < evidence.length - 1 && <div className="evidence-connector"><span /></div>}</div>)}</div><div className="evidence-footer"><span><span className="status-dot" /> All proofs agree on <code>0x8f24c1a7…d83a71</code></span><span>Attestation latency <b>2m 11s</b></span></div></section>

          <section className="bottom-grid"><div className="panel action-panel"><div className="panel-header"><div><div className="panel-kicker">ACTION GATE</div><h2>Test the boundary</h2></div><span className="action-state"><span className="status-dot" /> signer ready</span></div><p className="panel-description">The model proposes. AIRLOCK validates the exact intent before the vault can move value.</p><div className="intent-preview"><div className="intent-line"><span>tool</span><code>vendor.pay</code><span className="intent-allow">ALLOWLISTED</span></div><div className="intent-line"><span>recipient</span><code>0x4E9b…91c2</code><span>$24.00</span></div><div className="intent-line"><span>nonce</span><code>01</code><span>deadline 60s</span></div></div><div className="action-buttons"><button className="primary-button" onClick={() => setSimulation('allowed')}><Icon name="play" size={15} /> Simulate allowed call</button><button className="danger-button" onClick={() => setSimulation('blocked')}><Icon name="shield" size={15} /> Test blocked call</button></div>{simulationCopy && <div className={`simulation-result ${simulationCopy.tone}`}><span className="result-icon"><Icon name={simulationCopy.tone === 'success' ? 'check' : 'shield'} size={15} /></span><div><strong>{simulationCopy.title}</strong><span>{simulationCopy.body}</span></div><button onClick={() => setSimulation('idle')} aria-label="Dismiss result">×</button></div>}</div>
            <div className="panel activity-panel"><div className="panel-header"><div><div className="panel-kicker">RECENT ACTIVITY</div><h2>Enforcement log</h2></div><button className="text-button" onClick={() => setActiveNav('Action log')}>View all <Icon name="arrow" size={14} /></button></div><div className="activity-table"><div className="table-head"><span>Action</span><span>Value</span><span>Result</span></div>{activity.map((row) => <div className="table-row" key={`${row.action}-${row.age}`}><div><strong>{row.action}</strong><small>{row.target} · {row.age}</small></div><span>{row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b></div>)}</div></div></section>
        </div>}

        {activeNav !== 'Overview' && <DetailView activeNav={activeNav} onBack={() => setActiveNav('Overview')} />}
      </main>
    </div>
  )
}

function DetailView({ activeNav, onBack }: { activeNav: string; onBack: () => void }) {
  const titles: Record<string, string> = { 'Evidence graph': 'Evidence inspector', Capabilities: 'Capability registry', 'Action log': 'Action log' }
  return <div className="detail-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AIRLOCK / INSPECTOR</div><h1>{titles[activeNav]}</h1><p>Verified state from the current release firewall.</p></div><button className="secondary-button" onClick={onBack}><Icon name="arrow" size={15} /> Back to overview</button></div>
    {activeNav === 'Evidence graph' && <div className="detail-grid">{evidence.map((item) => <div className="panel detail-card" key={item.label}><div className="detail-card-top"><div className="evidence-node"><Icon name={item.icon} size={18} /><span className="node-check"><Icon name="check" size={10} /></span></div><span className="verified-badge"><Icon name="check" size={12} /> PROVEN</span></div><h2>{item.label}</h2><p>{item.detail}</p><code>tx 0x3a71…{item.time.replaceAll(':', '')}</code><div className="detail-meta"><span>Ethereum Sepolia</span><span>receipt status 1</span></div></div>)}</div>}
    {activeNav === 'Capabilities' && <div className="panel capability-detail"><div className="capability-summary"><div className="capability-lock"><Icon name="lock" size={24} /></div><div><div className="panel-kicker">CAPABILITY ID</div><h2>cap_0x91fd…e7a2</h2><p>Non-transferable authority bound to <code>0x8B31…6A14</code></p></div><span className="verified-badge"><Icon name="check" size={12} /> ACTIVE</span></div><div className="capability-grid"><div><span>Scope root</span><strong>0x71ac…44bd</strong></div><div><span>Total spend</span><strong>$130 / $350</strong></div><div><span>Calls used</span><strong>02 / 04</strong></div><div><span>Valid until</span><strong>08:41 UTC</strong></div></div><div className="boundary-note"><Icon name="shield" size={14} /> Every action is revalidated against current release status.</div></div>}
    {activeNav === 'Action log' && <div className="panel full-table"><div className="panel-header"><div><div className="panel-kicker">CHAIN-BOUND EVENTS</div><h2>All enforcement decisions</h2></div><span className="live-pill"><span className="status-dot" /> indexed</span></div><div className="expanded-table">{activity.concat([{ action: 'vault.withdraw', target: 'direct call', amount: '—', state: 'Blocked', age: '2h ago' }]).map((row) => <div className="expanded-row" key={`${row.action}-${row.age}`}><span className="row-time">{row.age}</span><div><strong>{row.action}</strong><small>{row.target}</small></div><span>{row.amount}</span><b className={row.state === 'Allowed' ? 'allowed' : 'blocked'}><span />{row.state}</b><Icon name="external" size={15} /></div>)}</div></div>}
  </div>
}

export default App
