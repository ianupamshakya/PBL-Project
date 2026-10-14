import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, Compass, Heart, Home, LockKeyhole,
  LogOut, Menu, MessageCircle, MoreHorizontal, Plus, Search, Send, ShieldCheck,
  UserRound, UsersRound, X,
} from 'lucide-react'
import { api } from './api'

const SUGGESTED_TAGS = [
  'slow mornings', 'books', 'quiet walks', 'music', 'art', 'gaming',
  'deep talks', 'coffee', 'nature', 'movies', 'journaling', 'pets',
  'cooking', 'photography', 'stargazing', 'learning', 'plants', 'poetry',
]

const NAV = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'requests', label: 'Requests', icon: Heart },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'profile', label: 'Profile', icon: UserRound },
]

function Logo() {
  return <span className="logo"><span className="logo-icon"><UsersRound size={19} strokeWidth={2.2} /></span><span>kinship</span></span>
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}

function Tag({ children, selected = false, onClick }) {
  const className = `tag ${selected ? 'tag-selected' : ''}`
  return onClick ? <button type="button" className={className} onClick={onClick}>#{children}</button> : <span className={className}>#{children}</span>
}

function Notice({ text, onClose }) {
  useEffect(() => {
    if (!text) return undefined
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [text, onClose])
  return text && <div className="notice" role="status"><span>{text}</span><button onClick={onClose} aria-label="Dismiss"><X size={17} /></button></div>
}

function TagPicker({ tags, onChange }) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  function toggle(tag) {
    onChange(tags.includes(tag) ? tags.filter(item => item !== tag) : tags.length < 8 ? [...tags, tag] : tags)
  }
  function addCustom() {
    const value = custom.toLowerCase().replace(/^#/, '').trim().replace(/\s+/g, ' ')
    if (value.length < 2 || value.length > 30 || !/^[\p{L}\p{N}][\p{L}\p{N} &'’-]*$/u.test(value)) {
      setError('Use 2–30 letters or numbers for a hashtag.')
      return
    }
    if (!tags.includes(value) && tags.length < 8) onChange([...tags, value])
    setCustom('')
    setError('')
  }
  return <div className="tag-picker-wrap">
    <div className="tag-picker">{SUGGESTED_TAGS.map(tag => <Tag key={tag} selected={tags.includes(tag)} onClick={() => toggle(tag)}>{tag}</Tag>)}{tags.filter(tag => !SUGGESTED_TAGS.includes(tag)).map(tag => <Tag key={tag} selected onClick={() => toggle(tag)}>{tag}</Tag>)}</div>
    <div className="custom-tag"><input value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }} placeholder="Add your own hashtag" aria-label="Custom hashtag" /><button type="button" onClick={addCustom} aria-label="Add hashtag"><Plus size={18} /></button></div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
}

function AuthModal({ mode, setMode, onClose, onSuccess }) {
  const isRegister = mode === 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tags, setTags] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api(isRegister ? '/auth/register' : '/auth/login', { method: 'POST', body: { email, password, tags } })
      onSuccess(result.user)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="modal-heading"><Logo /><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <h2 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
      <p className="modal-subtitle">{isRegister ? 'Start with a few interests. Your email stays private.' : 'Sign in to see your connections and conversations.'}</p>
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="auth-email">Email address</label>
        <input className="input" id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required />
        <label className="field-label" htmlFor="auth-password">Password</label>
        <input className="input" id="auth-password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'At least 8 characters' : 'Your password'} minLength={isRegister ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} required />
        {isRegister && <div className="auth-tags"><div className="field-heading"><div><strong>Choose your interests</strong><p>Pick 3 to 8 hashtags. You can change these later.</p></div><span>{tags.length}/8</span></div><TagPicker tags={tags} onChange={setTags} /></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button className="full-width auth-submit" type="submit" disabled={busy || (isRegister && tags.length < 3)}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={18} /></Button>
      </form>
      <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to Kinship?'} <button onClick={() => { setMode(isRegister ? 'login' : 'register'); setError('') }}>{isRegister ? 'Sign in' : 'Create an account'}</button></p>
    </div>
  </div>
}

function LandingHeader({ openAuth }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <header className="landing-header"><div className="landing-container header-inner"><Logo /><nav className={menuOpen ? 'landing-nav open' : 'landing-nav'} aria-label="Main navigation"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a><button className="nav-signin" onClick={() => { setMenuOpen(false); openAuth('login') }}>Sign in</button><Button onClick={() => { setMenuOpen(false); openAuth('register') }}>Get started</Button></nav><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div></header>
}

function ProductPreview() {
  return <div className="product-preview" aria-label="Example of hashtag-only discovery cards"><div className="preview-top"><Logo /><span>Preview of discovery</span></div><div className="preview-content"><div className="preview-title"><span>Discover</span><span className="preview-view">Hashtags only <LockKeyhole size={14} /></span></div><div className="preview-person"><div className="preview-person-top"><div className="preview-avatar"><UserRound size={23} /></div><span>Member</span></div><div className="preview-person-tags"><Tag>books</Tag><Tag>quiet walks</Tag><Tag>coffee</Tag><Tag>music</Tag></div><div className="preview-person-bottom"><span>2 shared interests</span><span className="preview-button">Interested <ArrowRight size={15} /></span></div></div><div className="preview-person second"><div className="preview-person-top"><div className="preview-avatar"><UserRound size={23} /></div><span>Member</span></div><div className="preview-person-tags"><Tag>nature</Tag><Tag>movies</Tag><Tag>deep talks</Tag></div></div></div></div>
}

function Landing({ openAuth }) {
  return <div className="landing"><LandingHeader openAuth={openAuth} /><main><section className="landing-hero landing-container"><div className="hero-copy"><div className="section-kicker">A more comfortable way to connect</div><h1>Meet people through what you have in common.</h1><p>Share a few interests, discover people at your own pace, and start a conversation when you both want to.</p><div className="hero-actions"><Button onClick={() => openAuth('register')}>Create a free account <ArrowRight size={18} /></Button><a href="#how-it-works">See how it works</a></div><div className="hero-assurance"><ShieldCheck size={18} /><span>Your name and email are not shown in discovery.</span></div></div><ProductPreview /></section>
    <section className="how-section" id="how-it-works"><div className="landing-container"><div className="section-head"><span className="section-kicker">How it works</span><h2>Simple steps. No pressure.</h2><p>Make a connection in a way that feels comfortable to you.</p></div><div className="how-grid"><div className="how-item"><span className="step-count">1</span><h3>Choose your interests</h3><p>Pick hashtags that describe what you enjoy. There is no public bio or photo to set up.</p></div><div className="how-item"><span className="step-count">2</span><h3>Discover people</h3><p>See shared interests and mutual connections, without seeing anyone’s private details.</p></div><div className="how-item"><span className="step-count">3</span><h3>Connect together</h3><p>Send interest. If they accept, you can start a private conversation.</p></div></div></div></section>
    <section className="privacy-section landing-container" id="privacy"><div className="privacy-content"><span className="section-kicker">Built around your boundaries</span><h2>You decide when to connect.</h2><p>Finding someone to talk to should feel manageable. Kinship keeps discovery focused on interests and puts the next step in your hands.</p><div className="privacy-list"><div><span><Check size={17} /></span><p>Discovery shows hashtags only.</p></div><div><span><Check size={17} /></span><p>Messages open after a request is accepted.</p></div><div><span><Check size={17} /></span><p>You can block or report a member at any time.</p></div></div></div><div className="privacy-panel"><div className="privacy-panel-icon"><LockKeyhole size={27} /></div><h3>Your details stay yours</h3><p>Your email is used to sign in. Other members never see it. A generated alias appears only after you both connect.</p><div className="privacy-panel-note"><ShieldCheck size={19} /> Private by default</div></div></section>
    <section className="landing-cta"><div className="landing-container cta-inner"><div><h2>Start with what you like.</h2><p>It only takes a few hashtags to get started.</p></div><Button variant="light" onClick={() => openAuth('register')}>Get started <ArrowRight size={18} /></Button></div></section></main><footer className="landing-footer landing-container"><Logo /><span>© {new Date().getFullYear()} Kinship</span></footer></div>
}

function AppShell({ user, active, setActive, connections, onLogout, children }) {
  const pending = connections.filter(item => item.status === 'pending' && item.direction === 'incoming').length
  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /><span>Find your people at your pace.</span></div><div className="sidebar-label">MENU</div><nav className="sidebar-nav" aria-label="Dashboard navigation">{NAV.map(item => <button className={active === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => setActive(item.id)}><item.icon size={20} strokeWidth={1.9} /><span>{item.label}</span>{item.id === 'requests' && pending > 0 && <b className="nav-count">{pending}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-account"><span className="member-avatar">{user.alias[0]}</span><span><strong>{user.alias}</strong><small>Private account</small></span></div><button className="sidebar-signout" onClick={onLogout}><LogOut size={18} /> Sign out</button></div></aside><div className="main-area"><header className="mobile-app-header"><Logo /><button className="icon-button" onClick={() => setActive('profile')} aria-label="Open profile"><span className="member-avatar">{user.alias[0]}</span></button></header>{children}</div><nav className="bottom-nav" aria-label="Mobile dashboard navigation">{NAV.map(item => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}><item.icon size={21} /><span>{item.label}</span>{item.id === 'requests' && pending > 0 && <b>{pending}</b>}</button>)}</nav></div>
}

function PageHeader({ eyebrow, title, subtitle, action }) {
  return <div className="page-header"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="page-header-action">{action}</div>}</div>
}

function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={27} /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}

function PersonCard({ item, onInterest, busy, compact = false }) {
  return <article className={compact ? 'person-card compact' : 'person-card'}><div className="person-top"><span className="person-avatar"><UserRound size={23} /></span><div><strong>Member</strong><span>Discover through interests</span></div></div><div className="person-match">{item.sharedTags.length > 0 ? `${item.sharedTags.length} shared ${item.sharedTags.length === 1 ? 'interest' : 'interests'}` : 'New interests to explore'}{item.mutualCount > 0 && ` · ${item.mutualCount} mutual ${item.mutualCount === 1 ? 'connection' : 'connections'}`}</div><div className="person-tags">{item.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div><div className="person-footer"><span><LockKeyhole size={15} /> Details stay private</span><Button variant="secondary" onClick={() => onInterest(item.id)} disabled={busy}>Interested <ArrowRight size={16} /></Button></div></article>
}

function Overview({ user, suggestions, connections, setActive, onInterest, busyId, setSelectedChat }) {
  const pending = connections.filter(item => item.status === 'pending' && item.direction === 'incoming')
  const accepted = connections.filter(item => item.status === 'accepted')
  return <div className="page dashboard-page"><PageHeader eyebrow="Your dashboard" title={`Welcome back, ${user.alias.split(' ')[0]}.`} subtitle="Here is what is happening in your circle." action={<Button variant="secondary" onClick={() => setActive('profile')}>Edit interests</Button>} /><div className="summary-grid"><button className="summary-card" onClick={() => setActive('discover')}><span className="summary-icon"><Compass size={21} /></span><strong>{suggestions.length}</strong><span>People to discover</span><ArrowRight size={17} /></button><button className="summary-card" onClick={() => setActive('requests')}><span className="summary-icon"><Heart size={21} /></span><strong>{pending.length}</strong><span>New requests</span><ArrowRight size={17} /></button><button className="summary-card" onClick={() => setActive('messages')}><span className="summary-icon"><MessageCircle size={21} /></span><strong>{accepted.length}</strong><span>Connections</span><ArrowRight size={17} /></button></div><div className="dashboard-grid"><section className="panel recommended-panel"><div className="panel-heading"><div><h2>Recommended for you</h2><p>Based on your interests and mutual connections.</p></div><button className="inline-link" onClick={() => setActive('discover')}>View all <ArrowRight size={16} /></button></div>{suggestions.length ? <div className="recommended-grid">{suggestions.slice(0, 2).map(item => <PersonCard key={item.id} item={item} onInterest={onInterest} busy={busyId === item.id} compact />)}</div> : <EmptyState icon={Compass} title="Your circle starts here" description="New members will appear as they join. You can update your interests anytime." action={<Button variant="secondary" onClick={() => setActive('profile')}>Edit interests</Button>} />}</section><div className="dashboard-side"><section className="panel interest-panel"><div className="panel-heading"><h2>Your interests</h2><button className="inline-link" onClick={() => setActive('profile')}>Edit</button></div><div className="interest-tags">{user.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div><p>These are the only details shown on your discovery card.</p></section><section className="panel activity-panel"><div className="panel-heading"><h2>Your connections</h2></div>{accepted.length ? <div className="activity-list">{accepted.slice(0, 3).map(item => <button key={item.id} onClick={() => { setSelectedChat(item.id); setActive('messages') }}><span className="member-avatar">{item.person.alias[0]}</span><span><strong>{item.person.alias}</strong><small>Open conversation</small></span><ArrowRight size={17} /></button>)}</div> : <p className="muted-text">Accepted connections will appear here.</p>}</section></div></div></div>
}

function Discover({ user, suggestions, loading, onInterest, busyId, setActive }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => suggestions.filter(item => item.tags.some(tag => tag.includes(search.toLowerCase().replace(/^#/, '').trim()))), [suggestions, search])
  return <div className="page"><PageHeader eyebrow="Discover" title="Find people with shared interests" subtitle="Only hashtags are visible until you both choose to connect." action={<Button variant="secondary" onClick={() => setActive('profile')}>Edit interests</Button>} /><div className="discovery-context"><ShieldCheck size={21} /><div><strong>Privacy comes first</strong><span>Other members see your hashtags here. Your email and alias stay private.</span></div></div><div className="section-toolbar"><div><h2>People to discover <span>{filtered.length}</span></h2><p>Showing matches for {user.tags.slice(0, 3).map(tag => `#${tag}`).join(', ')}{user.tags.length > 3 ? ' and more' : ''}.</p></div><label className="search-field"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search hashtags" aria-label="Search hashtags" /></label></div>{loading ? <div className="loading-state">Loading people…</div> : filtered.length ? <div className="people-grid">{filtered.map(item => <PersonCard key={item.id} item={item} onInterest={onInterest} busy={busyId === item.id} />)}</div> : <EmptyState icon={Search} title={search ? 'No matches for that hashtag' : 'No one to discover yet'} description={search ? 'Try a different hashtag.' : 'As more people join, their hashtags will show up here.'} action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : null} />}</div>
}

function Requests({ connections, onRespond, busyId, setActive }) {
  const [tab, setTab] = useState('received')
  const received = connections.filter(item => item.status === 'pending' && item.direction === 'incoming')
  const sent = connections.filter(item => item.status === 'pending' && item.direction === 'outgoing')
  const items = tab === 'received' ? received : sent
  return <div className="page"><PageHeader eyebrow="Requests" title="Connection requests" subtitle="You can accept, decline, or take more time to decide." /><div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'received'} className={tab === 'received' ? 'active' : ''} onClick={() => setTab('received')}>Received <span>{received.length}</span></button><button role="tab" aria-selected={tab === 'sent'} className={tab === 'sent' ? 'active' : ''} onClick={() => setTab('sent')}>Sent <span>{sent.length}</span></button></div>{items.length ? <div className="requests-list">{items.map(item => <article className="request-card" key={item.id}><div className="request-main"><span className="person-avatar"><UserRound size={22} /></span><div><strong>{tab === 'received' ? 'Someone is interested in connecting' : 'Your request is waiting for a response'}</strong><p>{tab === 'received' ? 'Take a look at their interests before you decide.' : 'They can choose whether to accept.'}</p><div className="request-tags">{item.person.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div></div></div>{tab === 'received' ? <div className="request-actions"><Button variant="secondary" disabled={busyId === item.id} onClick={() => onRespond(item.id, 'decline')}>Decline</Button><Button disabled={busyId === item.id} onClick={() => onRespond(item.id, 'accept')}>Accept request</Button></div> : <span className="status-badge">Pending</span>}</article>)}</div> : <EmptyState icon={Heart} title={tab === 'received' ? 'No requests right now' : 'You have not sent any requests'} description={tab === 'received' ? 'When someone wants to connect, you will see their hashtags here.' : 'Explore members and send interest when someone feels like a good match.'} action={<Button variant="secondary" onClick={() => setActive('discover')}>Explore people <ArrowRight size={16} /></Button>} />}</div>
}

function ReportDialog({ person, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try { await onSubmit(person.id, reason); onClose() } catch {} finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="modal-heading"><h2 id="report-title">Report a concern</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div><p>Tell us what happened with {person.alias}. Your report is private.</p><form onSubmit={submit}><label className="field-label" htmlFor="report-reason">Reason</label><textarea id="report-reason" className="textarea" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={5} placeholder="Describe the issue briefly" required /><div className="report-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !reason.trim()}>{busy ? 'Sending…' : 'Send report'}</Button></div></form></div></div>
}

function Messages({ connections, selected, setSelected, onBlock, onReport, notify }) {
  const accepted = connections.filter(item => item.status === 'accepted')
  const current = accepted.find(item => item.id === selected) || accepted[0]
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  useEffect(() => {
    if (!current) return undefined
    let mounted = true
    async function load() {
      try { const data = await api(`/connections/${current.id}/messages`); if (mounted) setMessages(data.messages) }
      catch (err) { if (mounted) notify(err.message) }
    }
    load()
    const timer = setInterval(load, 7000)
    return () => { mounted = false; clearInterval(timer) }
  }, [current?.id, notify])
  async function send(event) {
    event.preventDefault()
    if (!text.trim() || !current) return
    setBusy(true)
    try { const result = await api(`/connections/${current.id}/messages`, { method: 'POST', body: { text } }); setMessages(old => [...old, result.message]); setText('') }
    catch (err) { notify(err.message) } finally { setBusy(false) }
  }
  return <div className="page messages-page"><PageHeader eyebrow="Messages" title="Conversations" subtitle="Talk when you are ready. There is no need to rush." />{accepted.length ? <div className="messages-layout"><aside className="conversation-list"><div className="conversation-list-heading">Connections <span>{accepted.length}</span></div>{accepted.map(item => <button key={item.id} className={current?.id === item.id ? 'conversation-item active' : 'conversation-item'} onClick={() => { setSelected(item.id); setMenuOpen(false) }}><span className="member-avatar">{item.person.alias[0]}</span><span><strong>{item.person.alias}</strong><small>{item.person.tags.slice(0, 2).map(tag => `#${tag}`).join('  ')}</small></span></button>)}</aside><div className="conversation"><div className="conversation-header"><div className="conversation-person"><span className="member-avatar">{current.person.alias[0]}</span><span><strong>{current.person.alias}</strong><small>Connected member</small></span></div><div className="conversation-menu-wrap"><button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Conversation options"><MoreHorizontal size={21} /></button>{menuOpen && <div className="conversation-menu"><button onClick={() => { setReportOpen(true); setMenuOpen(false) }}>Report a concern</button><button onClick={() => { onBlock(current.person.id); setMenuOpen(false) }}>Block member</button></div>}</div></div><div className="message-list"><div className="conversation-start"><MessageCircle size={23} /><strong>Your conversation starts here</strong><p>Only the two of you can see these messages.</p></div>{messages.map(message => <div key={message.id} className={message.mine ? 'message mine' : 'message'}><p>{message.text}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>)}</div><form className="message-compose" onSubmit={send}><input aria-label="Message" value={text} onChange={event => setText(event.target.value)} placeholder="Write a message…" maxLength={1000} /><button aria-label="Send message" disabled={busy || !text.trim()}><Send size={19} /></button></form></div></div> : <EmptyState icon={MessageCircle} title="No conversations yet" description="Messages become available after a connection request is accepted." />}{reportOpen && current && <ReportDialog person={current.person} onClose={() => setReportOpen(false)} onSubmit={onReport} />}</div>
}

function Profile({ user, onUpdate, onLogout, notify }) {
  const [tags, setTags] = useState(user.tags)
  const [busy, setBusy] = useState(false)
  useEffect(() => setTags(user.tags), [user.tags])
  async function save() {
    setBusy(true)
    try { const result = await api('/profile', { method: 'PATCH', body: { tags } }); onUpdate(result.user); notify('Your interests have been saved.') }
    catch (err) { notify(err.message) } finally { setBusy(false) }
  }
  return <div className="page"><PageHeader eyebrow="Profile" title="Your profile" subtitle="Manage the interests people see when they discover you." /><div className="profile-grid"><section className="panel profile-panel"><div className="profile-intro"><span className="profile-avatar">{user.alias[0]}</span><div><h2>{user.alias}</h2><p>Your generated alias is shown after you connect.</p></div></div><div className="panel-divider" /><div className="field-heading"><div><strong>Your interests</strong><p>Select 3 to 8 hashtags. These are shown in discovery.</p></div><span>{tags.length}/8</span></div><TagPicker tags={tags} onChange={setTags} /><Button className="save-profile" onClick={save} disabled={busy || tags.length < 3 || JSON.stringify(tags) === JSON.stringify(user.tags)}>{busy ? 'Saving…' : 'Save changes'}</Button></section><div className="profile-side"><section className="panel account-panel"><h2>Account details</h2><div className="account-row"><span>Email</span><strong>{user.email}</strong></div><p>Your email is only used to sign in. It is never shown to other members.</p></section><section className="panel safety-panel"><span className="safety-icon"><ShieldCheck size={22} /></span><h2>Privacy and safety</h2><ul><li><Check size={17} /> Only hashtags appear in discovery</li><li><Check size={17} /> You decide who can message you</li><li><Check size={17} /> Block or report from any conversation</li></ul></section><button className="profile-signout" onClick={onLogout}><LogOut size={18} /> Sign out</button></div></div></div>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [authMode, setAuthMode] = useState(null)
  const [active, setActive] = useState('overview')
  const [suggestions, setSuggestions] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [notice, setNotice] = useState('')
  const notify = useCallback(message => setNotice(message), [])
  const closeNotice = useCallback(() => setNotice(''), [])
  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [discovery, relations] = await Promise.all([api('/discover'), api('/connections')])
      setSuggestions(discovery.suggestions)
      setConnections(relations.connections)
    } catch (err) { notify(err.message) } finally { if (showLoading) setLoading(false) }
  }, [notify])
  useEffect(() => { api('/auth/me').then(result => setUser(result.user)).catch(() => {}).finally(() => setChecking(false)) }, [])
  useEffect(() => { if (user) refresh(true) }, [user?.id, refresh])
  useEffect(() => { if (!user) return undefined; const timer = setInterval(() => refresh(), 15000); return () => clearInterval(timer) }, [user?.id, refresh])
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    setUser(null); setConnections([]); setSuggestions([]); setActive('overview')
  }
  async function interest(id) {
    setBusyId(id)
    try { await api(`/interests/${id}`, { method: 'POST' }); await refresh(); notify('Your interest was sent. They can decide whether to connect.') }
    catch (err) { notify(err.message) } finally { setBusyId(null) }
  }
  async function respond(id, action) {
    setBusyId(id)
    try {
      await api(`/connections/${id}`, { method: 'PATCH', body: { action } })
      await refresh()
      notify(action === 'accept' ? 'You are connected. You can now send a message.' : 'Request declined.')
      if (action === 'accept') { setSelectedChat(id); setActive('messages') }
    } catch (err) { notify(err.message) } finally { setBusyId(null) }
  }
  async function block(id) {
    try { await api(`/block/${id}`, { method: 'POST' }); await refresh(); setSelectedChat(null); notify('This member has been blocked.') }
    catch (err) { notify(err.message) }
  }
  async function report(id, reason) {
    try { await api(`/report/${id}`, { method: 'POST', body: { reason } }); notify('Your report has been received.') }
    catch (err) { notify(err.message); throw err }
  }
  if (checking) return <div className="loading-screen"><Logo /><span>Loading…</span></div>
  return <><Notice text={notice} onClose={closeNotice} />{user ? <AppShell user={user} active={active} setActive={setActive} connections={connections} onLogout={logout}>
    {active === 'overview' && <Overview user={user} suggestions={suggestions} connections={connections} setActive={setActive} onInterest={interest} busyId={busyId} setSelectedChat={setSelectedChat} />}
    {active === 'discover' && <Discover user={user} suggestions={suggestions} loading={loading} onInterest={interest} busyId={busyId} setActive={setActive} />}
    {active === 'requests' && <Requests connections={connections} onRespond={respond} busyId={busyId} setActive={setActive} />}
    {active === 'messages' && <Messages connections={connections} selected={selectedChat} setSelected={setSelectedChat} onBlock={block} onReport={report} notify={notify} />}
    {active === 'profile' && <Profile user={user} onUpdate={setUser} onLogout={logout} notify={notify} />}
  </AppShell> : <Landing openAuth={setAuthMode} />}{authMode && !user && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} onSuccess={next => { setUser(next); setAuthMode(null); setActive('overview') }} />}</>
}
