import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { createContext, useContext } from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown,
  ArrowDown, CircleHelp, Clock3, Copy, Database, FileClock, FilePlus2, Fingerprint, GitBranch, Globe2,
  History, KeyRound, LayoutGrid, LogOut, Menu, MoreHorizontal,
  LockKeyhole, PenLine, Plus, Radio, RefreshCw, Settings2, ShieldCheck, Sparkles, Users, Wifi,
  X, Zap,
} from 'lucide-react';
import { authApi, roomApi } from './api.js';
import { createWorkspaceSocket, socketAck } from './realtime.js';

function AuthContext({ children }) {
  const [session, setSession] = useState(null);
  const signOut = useCallback(async () => {
    if (session?.token) await authApi.logout(session.token).catch(() => {});
    setSession(null);
  }, [session]);
  const value = useMemo(() => ({ session, setSession, signOut }), [session, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const SessionContext = createContext(null);
const useSession = () => useContext(SessionContext);
const userInitials = (name = 'U') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const dateLabel = (date) => date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date)) : 'Just now';
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function Brand({ compact = false }) {
  return <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="Synkro home">
    <span className="brand-mark"><span /></span><span className="brand-name">synkro<span className="brand-period">.</span></span>
  </Link>;
}

function GlassButton({ children, className = '', variant = 'glass', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

function AuthShell({ children, mode }) {
  return <main className="auth-shell">
    <div className="auth-top"><Brand /><span className="auth-context"><span className="status-dot" /> A quieter way to work together</span></div>
    <div className="auth-content">
      <section className="auth-story">
        <div className="eyebrow"><span className="eyebrow-line" /> SHARED SPACE, CLEAR THINKING</div>
        <h1>Good ideas<br />move <span>together.</span></h1>
        <p>A focused workspace for the notes, plans, and small moments that make a team click.</p>
        <div className="auth-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-card visual-card-back"><span className="mini-label">ROOM / 01</span><div className="visual-lines"><i /><i /><i /></div><span className="visual-check"><Check size={13} /></span></div>
          <div className="visual-card visual-card-front"><div className="visual-card-head"><span className="live-pill"><i /> LIVE SESSION</span><MoreHorizontal size={16} /></div><div className="visual-note-title">A little more in sync.</div><div className="visual-lines"><i /><i /><i /><i /></div><div className="visual-collaborators"><span className="avatar avatar-olive">A</span><span className="avatar avatar-lime">P</span><span className="avatar avatar-violet">T</span><small>your team is here</small></div></div>
          <div className="visual-spark visual-spark-one">✳</div><div className="visual-spark visual-spark-two">·</div>
        </div>
        <div className="auth-footnote"><Globe2 size={14} /> Made for teams that think out loud.</div>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </div>
    <footer className="auth-footer"><span>© 2026 SYNKRO WORKSPACE</span><span>BUILT FOR BETTER TOGETHER <span className="footer-star">✳</span></span></footer>
  </main>;
}

function AuthPage({ register = false }) {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = register ? await authApi.register({ name: name.trim(), email: email.trim(), password }) : await authApi.login({ email: email.trim(), password });
      setSession({ user: result.user, token: result.token, expiresAt: result.expiresAt });
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <AuthShell mode={register ? 'register' : 'login'}>
    <div className="auth-card glass-panel">
      <div className="card-kicker"><span className="kicker-icon"><Fingerprint size={15} /></span> YOUR WORKSPACE, YOUR PEOPLE</div>
      <h2>{register ? 'Make room.' : 'Welcome back.'}</h2>
      <p className="auth-card-sub">{register ? 'Start a shared space for your team.' : 'Pick up where your team left off.'}</p>
      <form onSubmit={submit} className="form-stack">
        {register && <label className="field-label">Your name<div className="input-wrap"><Users size={16} /><input autoComplete="name" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="How should we call you?" /></div></label>}
        <label className="field-label">Email address<div className="input-wrap"><span className="at-icon">@</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourteam.com" /></div></label>
        <label className="field-label">Password<div className="input-wrap"><KeyRound size={16} /><input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={register ? 'At least 12 characters' : 'Enter your password'} /></div></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <><span className="spinner" /> {register ? 'Creating your space…' : 'Signing you in…'}</> : <>{register ? 'Create your account' : 'Sign in to Synkro'} <ArrowRight size={16} /></>}</button>
      </form>
      <div className="auth-switch">{register ? 'Already have a space?' : 'New to Synkro?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'} <ArrowUpRight size={13} /></Link></div>
      <div className="auth-secure"><ShieldCheck size={14} /> Your notes belong to your team. Sign in again after a page reload.</div>
    </div>
    <div className="form-below"><span>Private rooms</span><i /><span>Live presence</span><i /><span>Revision history</span></div>
  </AuthShell>;
}

function AppFrame({ children }) {
  const { session, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const logout = async () => { await signOut(); navigate('/login', { replace: true }); };
  return <div className="app-shell">
    <header className="topbar glass-panel">
      <Brand />
      <nav className={`main-nav ${mobileOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
        <Link to="/dashboard" className="nav-link active"><LayoutGrid size={15} /> Workspace</Link>
        <span className="nav-divider" />
        <span className="nav-caption"><span className="status-dot" /> All systems calm</span>
      </nav>
      <div className="topbar-actions">
        <button className="icon-button mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation"><Menu size={19} /></button>
        <button className="help-button" title="Help"><CircleHelp size={17} /><span>Help</span></button>
        <div className="profile-wrap">
          <button className="profile-button" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            <span className="avatar avatar-profile">{userInitials(session?.user?.name)}</span><span className="profile-name">{session?.user?.name}</span><ChevronDown size={14} />
          </button>
          {menuOpen && <div className="profile-menu glass-panel"><div className="profile-menu-user"><strong>{session?.user?.name}</strong><small>{session?.user?.email}</small></div><button onClick={logout}><LogOut size={15} /> Sign out</button></div>}
        </div>
      </div>
    </header>
    <div className="app-content">{children}</div>
    <footer className="app-footer"><span>Synkro <b>·</b> A shared space for good work</span><span>BUILT TO THINK TOGETHER <span className="footer-star">✳</span></span></footer>
  </div>;
}

function Protected({ children }) {
  const { session } = useSession();
  return session ? children : <Navigate to="/login" replace />;
}

function useRooms() {
  const { session } = useSession();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    try { const data = await roomApi.list(session.token); setRooms(data.items || data.rooms || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { refresh(); }, [refresh]);
  return { rooms, setRooms, loading, error, refresh };
}

function Dashboard() {
  const { session } = useSession();
  const { rooms, setRooms, loading, error, refresh } = useRooms();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState('');
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const createRoom = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await roomApi.create(session.token, roomName.trim()); const room = result.room || result; setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]); setDialog(''); navigate(`/rooms/${room.id}`, { state: { inviteCode: result.inviteCode } }); }
    catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  };
  const joinRoom = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await roomApi.join(session.token, inviteCode.trim()); const room = result.room || result; setDialog(''); navigate(`/rooms/${room.id}`); }
    catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  };

  const greetingName = (session?.user?.name || 'there').split(' ')[0];
  return <>
    <section className="dashboard-hero">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> YOUR TEAM, IN ONE PLACE</div><h1>Make space for<br /><span>good work.</span></h1><p>Shared notes, live thinking, and a little more room to do your best work.</p></div>
      <div className="hero-side glass-panel"><div className="hero-side-icon"><Sparkles size={17} /></div><div><span className="hero-side-label">A GOOD DAY TO MAKE THINGS</span><p>Hey, {greetingName}.<br />Your team is just a thought away.</p></div><div className="hero-side-mark">✳</div></div>
      <div className="hero-orb orb-a" /><div className="hero-orb orb-b" />
    </section>

    <section className="workspace-section">
      <div className="section-heading"><div><div className="section-kicker">YOUR SPACES</div><h2>Rooms <span className="count-pill">{rooms.length.toString().padStart(2, '0')}</span></h2></div><div className="section-actions"><GlassButton onClick={() => { setMessage(''); setDialog('join'); }}><ArrowDownLeft size={15} /> Join a room</GlassButton><GlassButton variant="primary" onClick={() => { setMessage(''); setDialog('create'); }}><Plus size={16} /> New room</GlassButton></div></div>

      {error && <div className="inline-alert" role="alert"><span>{error}</span><GlassButton onClick={refresh}><RefreshCw size={14} /> Retry</GlassButton></div>}
      {loading ? <div className="room-grid">{[1, 2, 3].map((item) => <div className="room-card skeleton glass-panel" key={item}><i /><i /><i /></div>)}</div> : rooms.length ? <div className="room-grid">{rooms.map((room, index) => <RoomCard room={room} index={index} key={room.id} />)}<button className="room-create-card glass-panel" onClick={() => setDialog('create')}><span className="create-card-icon"><Plus size={19} /></span><strong>Start with a blank page</strong><small>Create a room for your next idea</small><ArrowUpRight className="create-arrow" size={17} /></button></div> : !error && <div className="empty-state glass-panel"><div className="empty-art"><div className="empty-art-ring" /><FilePlus2 size={28} /></div><span className="section-kicker">A FRESH PAGE</span><h3>Your first room is waiting.</h3><p>Create a room for a project, a study group, or simply the notes you want to share.</p><div className="empty-actions"><GlassButton variant="primary" onClick={() => setDialog('create')}><Plus size={15} /> Create your first room</GlassButton><button className="text-button" onClick={() => setDialog('join')}>I have an invite code <ArrowRight size={14} /></button></div></div>}
    </section>

    <section className="dashboard-bottom"><div className="bottom-note glass-panel"><div className="bottom-note-icon"><Zap size={16} /></div><div><strong>Small edits, all in sync.</strong><p>Updates travel with your room, so nobody has to ask for the latest copy.</p></div><span className="bottom-note-deco">✳</span></div><span className="dashboard-caption"><span className="status-dot" /> Your spaces are private to you and your team.</span></section>

    {dialog && <Modal title={dialog === 'create' ? 'Make a new room' : 'Join your team'} subtitle={dialog === 'create' ? 'Give this shared space a name. You can invite people after.' : 'Paste an invite code from someone in your team.'} onClose={() => setDialog('')}>
      <form onSubmit={dialog === 'create' ? createRoom : joinRoom} className="modal-form">
        {dialog === 'create' ? <label className="field-label">Room name<div className="input-wrap"><FilePlus2 size={16} /><input autoFocus required minLength={1} maxLength={80} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Product studio" /></div></label> : <label className="field-label">Invite code<div className="input-wrap"><KeyRound size={16} /><input autoFocus required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Paste your invite code" /></div></label>}
        {message && <div className="form-error" role="alert">{message}</div>}
        <div className="modal-actions"><GlassButton type="button" onClick={() => setDialog('')}>Cancel</GlassButton><GlassButton variant="primary" disabled={busy}>{busy ? <><span className="spinner" /> One moment…</> : <>{dialog === 'create' ? 'Create room' : 'Join room'} <ArrowRight size={15} /></>}</GlassButton></div>
      </form>
    </Modal>}
  </>;
}

function RoomCard({ room, index }) {
  const colors = ['lime', 'violet', 'blue', 'orange'];
  return <Link className={`room-card glass-panel room-tone-${colors[index % colors.length]}`} to={`/rooms/${room.id}`}>
    <div className="room-card-top"><span className="room-glyph"><FileClock size={17} /></span><span className="room-card-more"><MoreHorizontal size={18} /></span></div>
    <div className="room-card-body"><span className="room-label">SHARED ROOM</span><h3>{room.name}</h3><p>Open your team's shared notes</p></div>
    <div className="room-card-footer"><span className="room-meta"><Users size={14} /> Shared space</span><span className="room-open">Open room <ArrowUpRight size={14} /></span></div>
  </Link>;
}

function Modal({ title, subtitle, children, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button ref={closeRef} className="modal-close icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button><div className="section-kicker">A SPACE FOR YOUR TEAM</div><h2 id="modal-title">{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function RoomPage() {
  const { roomId } = useParams();
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const draftRef = useRef('');
  const noteRef = useRef(null);
  const inFlightRef = useRef(null);
  const presenceSequenceRef = useRef(0);
  const debounceRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [note, setNote] = useState(null);
  const [draft, setDraft] = useState('');
  const [presence, setPresence] = useState([]);
  const [presenceSequence, setPresenceSequence] = useState(0);
  const [connection, setConnection] = useState('connecting');
  const [saveState, setSaveState] = useState('saved');
  const [pageError, setPageError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [historyItems, setHistoryItems] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyRestore, setBusyRestore] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [drawerError, setDrawerError] = useState('');
  const [toast, setToast] = useState('');

  const canEdit = Boolean(note) && !pageError;
  const isOwner = room?.ownerId === session?.user?.id;
  const dirty = draft !== (note?.content ?? '');
  draftRef.current = draft;
  noteRef.current = note;

  const receiveCanonical = useCallback((incoming, ownCommit = false) => {
    if (!incoming || !Number.isFinite(Number(incoming.revision))) return;
    const current = noteRef.current;
    if (current && Number(incoming.revision) <= Number(current.revision)) return;
    noteRef.current = incoming;
    setNote(incoming);
    if (ownCommit) {
      setSaveState(draftRef.current === (incoming.content ?? '') ? 'saved' : 'pending');
      return;
    }
    if (draftRef.current !== (current?.content ?? '')) {
      setConflict({ note: incoming, content: draftRef.current });
      setSaveState('review');
      return;
    }
    setDraft(incoming.content ?? '');
    setSaveState('saved');
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([roomApi.get(session.token, roomId), roomApi.note(session.token, roomId)])
      .then(([roomResult, noteResult]) => {
        if (!alive) return;
        setRoom(roomResult.room || roomResult);
        const nextNote = noteResult.note || noteResult;
        noteRef.current = nextNote; setNote(nextNote); setDraft(nextNote.content || '');
      })
      .catch((error) => {
        if (!alive) return;
        if (error.status === 401) { setSession(null); navigate('/login', { replace: true }); return; }
        setPageError(error.message);
        if (error.status === 403 || error.status === 404) navigate('/dashboard', { replace: true });
      });
    return () => { alive = false; };
  }, [roomId, session.token, navigate, setSession]);

  useEffect(() => {
    if (!session?.token || !note || pageError) return undefined;
    const socket = createWorkspaceSocket(session.token);
    socketRef.current = socket;
    let joined = false;
    let retryJoinTimer;
    const joinRoom = async () => {
      if (joined || !socket.connected) return;
      joined = true; setConnection('connecting');
      try {
        const snapshot = await socketAck(socket, 'room:join', { roomId });
        if (!joined) return;
        if (snapshot.note) receiveCanonical(snapshot.note);
        setPresence(snapshot.presence || []);
        presenceSequenceRef.current = Number(snapshot.presenceSequence || 0);
        setPresenceSequence(presenceSequenceRef.current);
        setConnection('live');
      } catch (error) {
        joined = false; setConnection('reconnecting');
        retryJoinTimer = window.setTimeout(joinRoom, 2500);
      }
    };
    const onConnect = () => { setConnection('connecting'); joinRoom(); };
    const onDisconnect = () => { joined = false; setConnection('reconnecting'); setSaveState((state) => state === 'saving' || state === 'saved' ? 'paused' : state); };
    const onConnectError = () => { setConnection('reconnecting'); };
    const onUpdated = (event) => { if (event.roomId === roomId) receiveCanonical(event.note, event.operationId === inFlightRef.current?.operationId); };
    const onPresence = (event) => {
      if (event.roomId !== roomId || Number(event.presenceSequence) <= presenceSequenceRef.current) return;
      presenceSequenceRef.current = Number(event.presenceSequence);
      setPresenceSequence(presenceSequenceRef.current); setPresence(event.users || []);
    };
    const onExpired = () => { setConnection('error'); setSession(null); navigate('/login', { replace: true }); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError);
    socket.on('note:updated', onUpdated); socket.on('presence:updated', onPresence); socket.on('session:expired', onExpired);
    socket.connect();
    return () => {
      joined = false;
      window.clearTimeout(retryJoinTimer);
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError);
      socket.off('note:updated', onUpdated); socket.off('presence:updated', onPresence); socket.off('session:expired', onExpired);
      if (socket.connected) socket.emit('room:leave', { roomId });
      socket.disconnect(); socketRef.current = null;
    };
  // presenceSequence is a snapshot baseline for events; room/session are the only lifecycle keys.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, session?.token, Boolean(note), pageError, receiveCanonical, setSession, navigate]);

  const submitSnapshot = useCallback(async (content, baseRevision = Number(note?.revision || 0), operationId = id()) => {
    const socket = socketRef.current;
    if (!socket?.connected) { setSaveState('paused'); return false; }
    if (inFlightRef.current) return false;
    inFlightRef.current = { content, operationId, baseRevision };
    setSaveState('saving');
    try {
      const result = await socketAck(socket, 'note:update', { roomId, operationId, baseRevision, content });
      const canonical = result.note || result;
      inFlightRef.current = null;
      if (Number(canonical.revision) > Number(noteRef.current?.revision || 0)) receiveCanonical(canonical, true);
      else setSaveState(draftRef.current === content ? 'saved' : 'pending');
      return true;
    } catch (error) {
      setSaveState('failed');
      setToast(error.message || 'Your note could not be saved. Your draft is still here.');
      inFlightRef.current = { content, operationId, baseRevision, uncertain: true };
      return false;
    }
  }, [note?.revision, receiveCanonical, roomId]);

  useEffect(() => {
    if (!dirty || conflict || !canEdit) return undefined;
    setSaveState((state) => state === 'saved' ? 'pending' : state);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (!inFlightRef.current) submitSnapshot(draftRef.current, Number(note?.revision || 0));
    }, 500);
    return () => window.clearTimeout(debounceRef.current);
  }, [draft, note?.revision, dirty, conflict, canEdit, submitSnapshot]);

  useEffect(() => {
    if (saveState !== 'pending' || inFlightRef.current || !dirty || conflict || !socketRef.current?.connected) return;
    submitSnapshot(draftRef.current, Number(note?.revision || 0));
  }, [saveState, dirty, conflict, note?.revision, submitSnapshot]);

  const syncNow = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    try {
      const snapshot = await socketAck(socket, 'note:sync', { roomId });
      if (snapshot.note) receiveCanonical(snapshot.note);
      setPresence(snapshot.presence || []); presenceSequenceRef.current = Number(snapshot.presenceSequence || 0); setPresenceSequence(presenceSequenceRef.current);
      const inflight = inFlightRef.current;
      if (inflight?.uncertain) {
        const status = await socketAck(socket, 'note:status', { roomId, operationId: inflight.operationId });
        if (status.committed) { inFlightRef.current = null; receiveCanonical(status.note, true); }
        else setSaveState('failed');
      }
    } catch { /* transient sync errors are surfaced by the next reconnect or save */ }
  }, [receiveCanonical, roomId]);

  useEffect(() => {
    if (!note) return undefined;
    const timer = window.setInterval(syncNow, 15000);
    const onFocus = () => syncNow();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [note, syncNow]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const openHistory = async () => {
    setHistoryOpen(true); setDrawerError(''); setHistoryLoading(true); setPreview(null);
    try {
      const data = await roomApi.versions(session.token, roomId);
      setHistoryItems(data.items || []); setHistoryCursor(data.nextBeforeRevision ?? null);
    } catch (error) { setDrawerError(error.message); }
    finally { setHistoryLoading(false); }
  };
  const loadMoreHistory = async () => {
    if (historyCursor == null || historyLoading) return;
    setHistoryLoading(true); setDrawerError('');
    try { const data = await roomApi.versions(session.token, roomId, historyCursor); setHistoryItems((items) => [...items, ...(data.items || [])]); setHistoryCursor(data.nextBeforeRevision ?? null); }
    catch (error) { setDrawerError(error.message); }
    finally { setHistoryLoading(false); }
  };
  const loadPreview = async (item) => {
    try { const data = await roomApi.version(session.token, roomId, item.revision); setPreview(data.version || data); }
    catch (error) { setDrawerError(error.message); }
  };
  const restoreVersion = async () => {
    if (!preview || !isOwner) return;
    if (dirty && !window.confirm('You have unsaved changes. Restore this version and replace the shared note? Your local draft will remain available until you leave the room.')) return;
    if (!dirty && !window.confirm(`Restore version ${preview.revision} as a new shared version?`)) return;
    setBusyRestore(true); setDrawerError('');
    try {
      const result = await roomApi.restore(session.token, roomId, preview.revision, id(), Number(note?.revision || 0));
      receiveCanonical(result.note, true);
      setHistoryOpen(false); setPreview(null); setToast(`Version ${preview.revision} restored as a new revision.`);
    } catch (error) { setDrawerError(error.message); if (error.status === 409) syncNow(); }
    finally { setBusyRestore(false); }
  };
  const loadInvite = async () => {
    setInviteOpen(true); setDrawerError(''); setInviteCode('');
    try { const data = await roomApi.invite(session.token, roomId); setInviteCode(data.inviteCode); }
    catch (error) { setDrawerError(error.message); }
  };
  const rotateInvite = async () => {
    if (!window.confirm('Create a new invite code? The current code will stop admitting new people. Existing members keep access.')) return;
    setBusy(true); setDrawerError('');
    try { const data = await roomApi.rotateInvite(session.token, roomId); setInviteCode(data.inviteCode); }
    catch (error) { setDrawerError(error.message); }
    finally { setBusy(false); }
  };
  const copyInvite = async () => { try { await navigator.clipboard.writeText(inviteCode); setToast('Invite code copied.'); } catch { setToast('Copy is unavailable. Select and copy the code.'); } };
  const handleEdit = (event) => {
    const nextValue = event.target.value;
    if (new TextEncoder().encode(nextValue).length > 102400) { setToast('Notes can be up to 100 KB.'); return; }
    setDraft(nextValue);
  };
  const handleConflict = (keepLocal) => {
    const latest = conflict?.note;
    if (!latest) return;
    if (keepLocal) {
      const local = conflict.content;
      setDraft(local); draftRef.current = local; setConflict(null); setSaveState('pending');
    } else {
      setDraft(latest.content ?? ''); draftRef.current = latest.content ?? ''; setConflict(null); setSaveState('saved');
    }
  };
  const retrySave = async () => {
    const prior = inFlightRef.current;
    if (prior?.uncertain && socketRef.current?.connected) {
      try {
        const status = await socketAck(socketRef.current, 'note:status', { roomId, operationId: prior.operationId });
        if (status.committed) { inFlightRef.current = null; receiveCanonical(status.note); setToast('Your save was confirmed.'); return; }
      } catch { /* continue into explicit retry */ }
    }
    inFlightRef.current = null;
    const snapshot = draftRef.current;
    await syncNow();
    setConflict({ note: noteRef.current || note, content: snapshot, retry: true });
    setSaveState('review');
  };

  const statusText = connection === 'reconnecting' ? 'Reconnecting' : connection === 'connecting' ? 'Connecting' : connection === 'error' ? 'Offline' : saveState === 'saving' ? 'Saving' : saveState === 'failed' ? 'Save failed' : saveState === 'paused' ? 'Waiting to reconnect' : saveState === 'review' ? 'Review changes' : dirty ? 'Unsaved changes' : 'Saved';
  const statusTone = ['failed', 'error'].includes(connection) || saveState === 'failed' ? 'danger' : connection === 'live' && saveState === 'saved' && !dirty ? 'success' : 'neutral';

  if (!room && !pageError) return <div className="room-loading"><span className="spinner" /> Opening your room…</div>;

  return <div className="room-page">
    <div className="room-breadcrumb"><button className="back-link" onClick={() => navigate('/dashboard')}><ArrowLeft size={15} /> Your rooms</button><span className="crumb-divider">/</span><span>{room?.name || 'Shared room'}</span></div>
    <div className="room-header"><div className="room-title-wrap"><div className="room-title-icon"><FileClock size={19} /></div><div><div className="section-kicker">SHARED ROOM</div><h1>{room?.name || 'Shared notes'}</h1></div></div><div className="room-toolbar">
      <div className={`connection-badge tone-${statusTone}`} aria-live="polite"><span className="connection-dot" /><span>{statusText}</span>{saveState === 'failed' && <button onClick={retrySave} className="retry-link">Review</button>}</div>
      <div className="presence-stack" aria-label={`${presence.length} people online`}>{presence.slice(0, 4).map((person, index) => <span key={person.id} className={`avatar avatar-presence avatar-color-${index % 4}`} title={person.name}>{userInitials(person.name)}</span>)}{presence.length > 4 && <span className="avatar avatar-overflow">+{presence.length - 4}</span>}</div>
      <button className="toolbar-button glass-panel" onClick={openHistory}><History size={15} /><span>History</span></button>
      {isOwner && <button className="toolbar-button glass-panel" onClick={loadInvite}><Users size={15} /><span>Invite</span></button>}
    </div></div>

    {pageError && <div className="inline-alert" role="alert">{pageError}<GlassButton onClick={() => navigate('/dashboard')}>Back to rooms</GlassButton></div>}
    {conflict && <div className="conflict-banner glass-panel" role="alert"><span className="conflict-icon"><Radio size={16} /></span><div className="conflict-copy"><strong>There’s a newer shared version.</strong><p>Your draft is safe here. Choose which text you want in the room.</p></div><div className="conflict-actions"><GlassButton onClick={() => handleConflict(false)}>Use shared version</GlassButton><GlassButton variant="primary" onClick={() => handleConflict(true)}>Keep my draft</GlassButton></div></div>}

    <div className="editor-layout">
      <main className="editor-main glass-panel">
        <div className="editor-topline"><div className="editor-context"><span className="editor-live-icon"><Radio size={14} /></span><span>THE SHARED PAGE</span></div><div className="editor-version">REV. {String(note?.revision ?? 0).padStart(3, '0')}</div></div>
        <label className="sr-only" htmlFor="shared-note">Shared room notes</label>
        <textarea id="shared-note" className="note-editor" value={draft} onChange={handleEdit} disabled={!canEdit || connection === 'error'} placeholder="Start with a thought, a plan, or a question…\n\nYour team can add to this page as ideas take shape." spellCheck="true" />
        <div className="editor-bottom"><div className="editor-author"><span className="avatar avatar-me">{userInitials(session.user.name)}</span><span>Editing as <strong>{session.user.name}</strong></span></div><span className="editor-help">Plain text <i /> Autosaves as you write</span></div>
      </main>
      <aside className="room-aside">
        <section className="aside-card glass-panel"><div className="aside-card-head"><span className="aside-icon"><Users size={15} /></span><span>IN THIS ROOM</span><span className="aside-live"><i /> LIVE</span></div><div className="member-list">
          {presence.length ? presence.map((person, index) => <div className="member-row" key={person.id}><span className={`avatar avatar-color-${index % 4}`}>{userInitials(person.name)}</span><span className="member-name">{person.name}{person.id === session.user.id && <small>you</small>}</span><span className="member-dot" title="Online" /></div>) : <p className="aside-empty">You’ll see your team here when they join.</p>}
        </div><div className="aside-foot"><span>{presence.length} {presence.length === 1 ? 'person' : 'people'} online</span><span className="member-spark">✳</span></div></section>
        <section className="aside-card room-tip glass-panel"><div className="aside-card-head"><span className="aside-icon tip-icon"><Sparkles size={15} /></span><span>A LITTLE TIP</span></div><p>Write freely. Everyone in this room sees the same page update as you go.</p><div className="tip-decoration">✳</div></section>
        {isOwner && <button className="manage-invite glass-panel" onClick={loadInvite}><span className="manage-icon"><Settings2 size={15} /></span><span><strong>Room invitations</strong><small>Manage who can join this space</small></span><ArrowRight size={15} /></button>}
        <div className="room-aside-note"><ShieldCheck size={13} /><span>Only invited members can see these notes.</span></div>
      </aside>
    </div>

    {historyOpen && <div className="drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) { setHistoryOpen(false); setPreview(null); } }}><aside className="history-drawer glass-panel" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="drawer-header"><div><span className="section-kicker">ROOM ACTIVITY</span><h2 id="history-title">Version history</h2><p>Every saved thought, right where you left it.</p></div><button className="icon-button" onClick={() => { setHistoryOpen(false); setPreview(null); }} aria-label="Close history"><X size={18} /></button></div>
      {preview ? <div className="version-preview"><button className="back-link" onClick={() => setPreview(null)}><ArrowLeft size={14} /> All versions</button><div className="preview-meta"><span className="preview-rev">REV. {String(preview.revision).padStart(3, '0')}</span><span>{dateLabel(preview.createdAt)}</span></div><div className="preview-content">{preview.content || <em>This version is an empty page.</em>}</div>{isOwner && <GlassButton variant="primary" className="restore-button" onClick={restoreVersion} disabled={busyRestore}><RefreshCw size={15} /> {busyRestore ? 'Restoring…' : 'Restore this version'}</GlassButton>}</div> : <div className="history-list">{historyLoading && !historyItems.length ? <div className="history-loading"><span className="spinner" /> Gathering your versions…</div> : historyItems.length ? historyItems.map((item) => <button className="history-item" key={item.revision} onClick={() => loadPreview(item)}><span className={`history-kind kind-${item.kind || 'edit'}`}>{item.kind === 'restore' ? <RefreshCw size={14} /> : <FileClock size={14} />}</span><span className="history-item-main"><strong>Version {item.revision}{item.revision === note?.revision ? <small className="current-tag">CURRENT</small> : null}</strong><small>{item.authorName || 'A teammate'} · {dateLabel(item.createdAt)}</small></span><ArrowRight size={15} /></button>) : !drawerError ? <div className="history-empty"><Clock3 size={23} /><strong>No earlier versions yet.</strong><span>As your team writes, saved versions will show up here.</span></div> : null}{historyCursor != null && <GlassButton className="load-more" onClick={loadMoreHistory} disabled={historyLoading}>{historyLoading ? 'Loading…' : 'Load older versions'} <ArrowDownLeft size={14} /></GlassButton>}</div>}
      {drawerError && <div className="form-error drawer-error" role="alert">{drawerError}</div>}
    </aside></div>}

    {inviteOpen && <Modal title="Bring your people in" subtitle="Share this invite code with teammates you trust. Anyone with the code can join." onClose={() => setInviteOpen(false)}>
      <div className="invite-code-box"><span>{inviteCode || 'Loading invite…'}</span><button className="icon-button" onClick={copyInvite} disabled={!inviteCode} aria-label="Copy invite code"><Copy size={16} /></button></div>
      <div className="invite-note"><ShieldCheck size={14} /> Rotating a code prevents new people from using the old one.</div>
      {drawerError && <div className="form-error" role="alert">{drawerError}</div>}
      <div className="modal-actions"><GlassButton type="button" onClick={() => setInviteOpen(false)}>Done</GlassButton><GlassButton variant="primary" onClick={rotateInvite} disabled={busy || !inviteCode}><RefreshCw size={14} /> Rotate code</GlassButton></div>
    </Modal>}
    {toast && <div className="toast glass-panel" role="status"><Check size={15} /> {toast}<button className="toast-close" onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
  </div>;
}

function NotFound() { return <AppFrame><div className="not-found glass-panel"><span className="section-kicker">NOT THIS WAY</span><h1>This page got lost.</h1><p>Let’s get you back to your team's spaces.</p><Link className="button button-primary" to="/dashboard">Back to workspace <ArrowRight size={15} /></Link></div></AppFrame>; }

const REPOSITORY_URL = 'https://github.com/Sarthak-madan334/collab-workspace';

function SiteFooter() {
  return <footer className="site-footer glass-panel">
    <div className="site-footer-main"><div className="site-footer-brand"><Brand /><p>A shared space for good work.<br />Made for teams that think out loud.</p></div>
      <div className="site-footer-links"><span className="section-kicker">EXPLORE</span><Link to="/#about">About Synkro</Link><Link to="/#how-it-works">How it works</Link><Link to="/privacy">Privacy policy</Link><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Project repository <ArrowUpRight size={13} /></a></div>
      <div className="site-footer-note"><span className="footer-note-mark"><GitBranch size={16} /></span><span>Built around shared notes,<br />thoughtful teamwork, and trust.</span></div>
    </div>
    <div className="site-footer-bottom"><span>© 2026 SYNKRO WORKSPACE</span><span>TECHSPACE BUILDLAB '26 <i>·</i> A04</span><span>BUILT TO THINK TOGETHER <b>✳</b></span></div>
  </footer>;
}

function LandingPage() {
  const { session } = useSession();
  return <main className="landing-page">
    <header className="landing-nav glass-panel">
      <Brand />
      <nav className="landing-nav-links" aria-label="Main navigation"><a href="#about">About</a><a href="#how-it-works">How it works</a><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Repository <ArrowUpRight size={12} /></a></nav>
      <div className="landing-nav-actions"><Link className="button landing-signin" to={session ? '/dashboard' : '/login'}>{session ? 'Open workspace' : 'Sign in'} <ArrowUpRight size={14} /></Link><Link className="button button-primary landing-join" to={session ? '/dashboard' : '/register'}>{session ? 'Go to rooms' : 'Get started'} <ArrowRight size={14} /></Link></div>
    </header>

    <section className="landing-hero" id="about">
      <div className="landing-hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> A SHARED SPACE FOR GOOD WORK</div><h1>Your team's notes,<br /><span>all in sync.</span></h1><p>Synkro brings your people into one calm workspace. Write together, see who's around, and keep every good idea within reach.</p><div className="landing-hero-actions"><Link className="button button-primary" to={session ? '/dashboard' : '/register'}>Make a room <ArrowRight size={16} /></Link><a className="landing-learn-link" href="#how-it-works">See how it works <ArrowDown size={14} /></a></div><div className="landing-trust-line"><span className="status-dot" /> Private rooms <i /> Live presence <i /> Saved history</div></div>
      <div className="landing-hero-art" aria-label="Illustration of a shared notes workspace">
        <div className="hero-art-orbit hero-art-orbit-a" /><div className="hero-art-orbit hero-art-orbit-b" />
        <div className="hero-window hero-window-left glass-panel"><div className="hero-window-top"><span>01 / ROOM</span><span className="hero-window-dot" /></div><div className="hero-window-title">A place to start.</div><div className="hero-window-lines"><i /><i /><i /><i /></div><div className="hero-window-tag"><PenLine size={12} /> shared notes</div></div>
        <div className="hero-window hero-window-main glass-panel"><div className="hero-window-top"><span className="hero-live-label"><i /> TEAM SPACE · LIVE</span><MoreHorizontal size={16} /></div><div className="hero-note-title">Ideas in progress</div><p className="hero-note-copy">Good work gets better<br />when we make it together.</p><div className="hero-note-rule" /><div className="hero-collaborators"><div className="hero-avatar-group"><span className="avatar avatar-olive">A</span><span className="avatar avatar-lime">P</span><span className="avatar avatar-violet">T</span></div><span>3 people here</span><span className="hero-note-saved"><Check size={11} /> SAVED</span></div></div>
        <div className="hero-window hero-window-history glass-panel"><div className="hero-window-top"><span>ROOM HISTORY</span><History size={13} /></div><div className="hero-history-row"><span className="hero-history-icon"><FileClock size={12} /></span><span><b>Version 08</b><small>A little earlier · You</small></span><ArrowUpRight size={13} /></div><div className="hero-history-row muted"><span className="hero-history-icon"><FileClock size={12} /></span><span><b>Version 07</b><small>Earlier today · Alie</small></span></div></div>
        <div className="hero-art-caption"><span>ONE SHARED PAGE</span><span>ALWAYS FIND YOUR WAY BACK <i>✳</i></span></div>
      </div>
      <a className="scroll-cue" href="#how-it-works"><span>SCROLL TO EXPLORE</span><ArrowDown size={13} /></a>
    </section>

    <section className="landing-intro glass-panel" id="what-it-does"><div className="intro-index">01 <span>—</span> THE IDEA</div><div className="intro-content"><h2>Less passing files.<br /><span>More making progress.</span></h2><p>Teams often end up with notes scattered across chats and documents. Synkro gives a room one shared page, so everyone can follow the same thread, contribute as ideas arrive, and revisit earlier versions when plans change.</p></div><div className="intro-stamp"><span>MADE FOR</span><b>TEAMS<br />IN SYNC</b><i>✳</i></div></section>

    <section className="how-section" id="how-it-works"><div className="how-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> THE FLOW</div><h2>Simple by design.<br /><span>Better together.</span></h2></div><p>Everything your team needs to get into a room and keep the work moving.</p></div>
      <div className="how-grid">
        <article className="how-card glass-panel"><div className="how-card-top"><span className="how-number">01</span><span className="how-icon"><Users size={17} /></span></div><div className="how-card-art join-art"><div className="join-token"><span className="token-symbol">↗</span><span>YOUR TEAM'S ROOM</span></div><div className="join-avatars"><i>A</i><i>P</i><i>T</i><small>your people</small></div></div><h3>Make a room</h3><p>Create a private space for a project, a study session, or the next idea your team wants to work through.</p><span className="how-card-foot">CREATE OR JOIN <ArrowUpRight size={13} /></span></article>
        <article className="how-card glass-panel"><div className="how-card-top"><span className="how-number">02</span><span className="how-icon"><Wifi size={17} /></span></div><div className="how-card-art sync-art"><div className="sync-lines"><i /><i /><i /></div><div className="sync-pulse"><span /><span /><span /></div><span className="sync-status"><i /> LIVE TOGETHER</span></div><h3>Think out loud</h3><p>Write on one shared page. Updates appear for everyone in the room, with a live view of who's there.</p><span className="how-card-foot">WRITE · SEE · RESPOND <ArrowUpRight size={13} /></span></article>
        <article className="how-card glass-panel"><div className="how-card-top"><span className="how-number">03</span><span className="how-icon"><History size={17} /></span></div><div className="how-card-art history-art"><div className="history-art-row"><span>08</span><i /><b>Latest notes</b><small>NOW</small></div><div className="history-art-row"><span>07</span><i /><b>Project outline</b><small>10:42</small></div><div className="history-art-row"><span>06</span><i /><b>First ideas</b><small>09:18</small></div><span className="history-art-restore"><RefreshCw size={12} /> PICK UP ANY VERSION</span></div><h3>Find your way back</h3><p>Saved versions help your team review how a note changed and restore an earlier version when needed.</p><span className="how-card-foot">HISTORY THAT HELPS <ArrowUpRight size={13} /></span></article>
      </div>
    </section>

    <section className="landing-stack glass-panel"><div className="stack-symbol"><Database size={18} /></div><div className="stack-copy"><span className="section-kicker">THE FOUNDATION</span><h2>Built for a shared page.</h2><p>React and JavaScript on the frontend. Node.js and Socket.IO carry live updates. MongoDB Atlas keeps rooms, notes, and revision history together.</p></div><div className="stack-pills"><span>REACT</span><span>NODE.JS</span><span>SOCKET.IO</span><span>MONGODB ATLAS</span></div></section>

    <section className="landing-cta glass-panel"><div className="cta-orbit" /><span className="section-kicker">START WITH ONE ROOM</span><h2>Make room for<br /><span>what's next.</span></h2><p>Bring your team together around one shared page.</p><Link className="button button-primary" to={session ? '/dashboard' : '/register'}>{session ? 'Open your workspace' : 'Create your account'} <ArrowRight size={15} /></Link><span className="cta-spark">✳</span></section>
    <SiteFooter />
  </main>;
}

function PrivacyPage() {
  return <main className="landing-page privacy-page">
    <header className="landing-nav glass-panel"><Brand /><nav className="landing-nav-links" aria-label="Main navigation"><Link to="/#about">About</Link><Link to="/#how-it-works">How it works</Link><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Repository <ArrowUpRight size={12} /></a></nav><div className="landing-nav-actions"><Link className="button landing-signin" to="/login">Sign in <ArrowUpRight size={14} /></Link><Link className="button button-primary landing-join" to="/register">Get started <ArrowRight size={14} /></Link></div></header>
    <article className="privacy-document glass-panel"><div className="eyebrow"><span className="eyebrow-line" /> THE IMPORTANT DETAILS</div><h1>Privacy, in plain words.</h1><p className="privacy-intro">Synkro is designed to keep team notes inside the rooms where they belong. This page explains what the frontend sends and what happens in the current app.</p><div className="privacy-updated">PROJECT PRIVACY NOTICE <i /> LAST UPDATED OCTOBER 9, 2026</div>
      <section><h2><LockKeyhole size={16} /> Account information</h2><p>When you register or sign in, Synkro sends your name, email address, and password to the configured application server so it can create or check your account. Password handling and account storage are managed by that server. The frontend does not save your password.</p></section>
      <section><h2><PenLine size={16} /> Notes and rooms</h2><p>Room names, invite codes, note text, revision history, and collaboration events are sent to the application server when you use those features. The project is designed to store workspace data in MongoDB Atlas. Room access is intended for authenticated members; invite codes should be shared only with people you want to join.</p></section>
      <section><h2><KeyRound size={16} /> Sign-in session</h2><p>The current frontend keeps the session token in memory for the open page. It is not written to local storage. Reloading the page signs you out, and you need to sign in again. Sign out asks the server to revoke the active session and clears the frontend session.</p></section>
      <section><h2><Globe2 size={16} /> Network and service providers</h2><p>The browser communicates with the backend URL configured for the app over HTTP and Socket.IO; production deployments should use HTTPS and secure WebSockets. The page currently loads DM Sans, Manrope, and DM Mono fonts from Google Fonts, so opening the site makes a font request to Google. See Google's privacy information for how it handles those requests.</p><a className="privacy-external" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy information <ArrowUpRight size={13} /></a></section>
      <section><h2><Database size={16} /> Analytics and your choices</h2><p>The frontend does not include an analytics or advertising SDK. You can leave a room or sign out at any time. Ask the project maintainers through the <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">repository</a> about data access or removal. Data retention and deletion are handled by the service operator.</p></section>
      <div className="privacy-caveat"><ShieldCheck size={15} /><p>This is a project privacy notice, not legal advice. The service operator should update it if hosting, storage, analytics, or account practices change.</p></div>
      <Link className="button button-glass privacy-back" to="/"> <ArrowLeft size={14} /> Back to Synkro</Link>
    </article>
    <SiteFooter />
  </main>;
}

export default function App() {
  return <AuthContext><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/register" element={<AuthPage register />} />
    <Route path="/dashboard" element={<Protected><AppFrame><Dashboard /></AppFrame></Protected>} />
    <Route path="/rooms/:roomId" element={<Protected><AppFrame><RoomPage /></AppFrame></Protected>} />
    <Route path="*" element={<NotFound />} />
  </Routes></AuthContext>;
}
