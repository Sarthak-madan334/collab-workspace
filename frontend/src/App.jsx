import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createContext, useContext } from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown,
  Activity, ArrowDown, CircleHelp, Clock3, Copy, Database, FileClock, FilePlus2, FileText, Fingerprint, GitBranch, Globe2,
  Eye, EyeOff, History, KeyRound, LayoutGrid, LogOut, Menu, MoreHorizontal,
  LockKeyhole, MessageCircle, MessageSquare, Monitor, NotebookTabs, PenLine, Plus, Play, Pause, Presentation, Radio, RefreshCw, RotateCcw, Settings2, ShieldCheck, Sparkles, Table2, Users, Wifi, Code2,
  Palette, X, Zap,
} from 'lucide-react';
import { authApi, fileApi, roomApi } from './api.js';
import { validateAuthFields } from './auth-validation.js';
import { consumeGitHubCallback, createGitHubAuthorizationUrl } from './github-oauth.js';
import { createWorkspaceSocket, socketAck } from './realtime.js';
import { DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD, DEMO_TOKEN } from './demo.js';
import { buildWhatsAppShareUrl, getInviteDestination } from './invite-links.js';
import { IS_ANDROID, persistNativeSession, restoreNativeSession } from './native-session.js';
import { DEFAULT_WORKSPACE_THEME, persistWorkspaceTheme, readWorkspaceTheme, WORKSPACE_THEMES } from './workspace-theme.js';
import FlowStage from './FlowStage.jsx';
import { StudioHome, FileEditor } from './WorkspaceFiles.jsx';
import WorkspaceAssistant from './WorkspaceAssistant.jsx';
import { ButtonLoader, ConnectionStatus, InlineLoader, PageLoader, SkeletonLoader } from './Loading.jsx';

const NativeBridge = lazy(() => import('./NativeBridge.jsx'));

function AuthContext({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!IS_ANDROID);
  useEffect(() => {
    if (!IS_ANDROID) return undefined;
    let active = true;
    restoreNativeSession().then((saved) => {
      if (!active) return;
      setSession(saved);
      setReady(true);
      if (saved) authApi.me(saved.token).then((data) => {
        if (active) setSession((current) => current?.token === saved.token ? { ...current, user: data.user, expiresAt: data.expiresAt || current.expiresAt } : current);
      }).catch((error) => {
        if (active && error.status === 401) setSession((current) => current?.token === saved.token ? null : current);
      });
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready && IS_ANDROID) persistNativeSession(session).catch(() => {});
  }, [ready, session]);
  useEffect(() => {
    if (!IS_ANDROID || !session?.token) return undefined;
    let active = true;
    const validate = async () => {
      if (Date.parse(session.expiresAt) <= Date.now()) { setSession(null); return; }
      try { await authApi.me(session.token); }
      catch (error) { if (active && error.status === 401) setSession((current) => current?.token === session.token ? null : current); }
    };
    window.addEventListener('synkro:resumed', validate);
    window.addEventListener('synkro:connectivity-restored', validate);
    return () => {
      active = false;
      window.removeEventListener('synkro:resumed', validate);
      window.removeEventListener('synkro:connectivity-restored', validate);
    };
  }, [session?.token, session?.expiresAt]);
  const signOut = useCallback(async () => {
    if (session?.token) await authApi.logout(session.token).catch(() => {});
    if (IS_ANDROID) await persistNativeSession(null).catch(() => {});
    setSession(null);
  }, [session]);
  const value = useMemo(() => ({ session, setSession, signOut }), [session, signOut]);
  return <SessionContext.Provider value={value}>{ready ? children : <div className="native-startup" role="status">Opening Synkro…</div>}</SessionContext.Provider>;
}

const SessionContext = createContext(null);
const useSession = () => useContext(SessionContext);
const ThemeContext = createContext(null);
const useWorkspaceTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }) {
  const [theme, setCurrentTheme] = useState(() => readWorkspaceTheme());
  const [storageError, setStorageError] = useState('');
  const setTheme = useCallback((nextTheme) => {
    setCurrentTheme(nextTheme);
    try {
      persistWorkspaceTheme(nextTheme);
      setStorageError('');
      return true;
    } catch {
      setStorageError('Theme changed for this visit, but could not be saved in this browser.');
      return false;
    }
  }, []);
  const value = useMemo(() => ({ theme, setTheme, storageError }), [theme, setTheme, storageError]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const userInitials = (name = 'U') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const dateLabel = (date) => date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date)) : 'Just now';
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function Brand({ compact = false }) {
  return <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="Synkro home">
    <span className="brand-mark"><span /></span><span className="brand-name">synkro<span className="brand-period">.</span></span>
  </Link>;
}

const GlassButton = forwardRef(function GlassButton({ children, className = '', variant = 'glass', ...props }, ref) {
  return <button ref={ref} className={`button button-${variant} ${className}`} {...props}>{children}</button>;
});

function AuthShell({ children }) {
  return <main className="auth-shell">
    <div className="auth-top"><Brand /><span className="auth-context"><span className="status-dot" /> A quieter way to work together</span></div>
    <div className="auth-content">
      <section className="auth-story">
        <div className="eyebrow"><span className="eyebrow-line" /> SHARED SPACE, CLEAR THINKING</div>
        <h1>Good ideas<br />move <span>together.</span></h1>
        <p>A focused workspace for the notes, plans, and small moments that make a team click.</p>
        <div className="auth-highlights">
          <div className="auth-highlight"><span className="highlight-icon"><Users size={14} /></span><span><strong>Shared spaces for real work</strong><small>Bring your team into one calm workspace.</small></span></div>
          <div className="auth-highlight"><span className="highlight-icon"><FileClock size={14} /></span><span><strong>Less noise, more progress</strong><small>Keep plans and decisions easy to find.</small></span></div>
          <div className="auth-highlight"><span className="highlight-icon"><Zap size={14} /></span><span><strong>Built for teams that think out loud</strong><small>Turn good conversations into clear next steps.</small></span></div>
          <div className="auth-highlight"><span className="highlight-icon"><LockKeyhole size={14} /></span><span><strong>Your ideas stay yours</strong><small>Private rooms for the people you invite.</small></span></div>
        </div>
        <div className="auth-visual" aria-hidden="true">
          <div className="visual-card visual-card-back"><span className="mini-label">ROOM / 01</span><div className="visual-lines"><i /><i /><i /></div><span className="visual-check"><Check size={13} /></span></div>
          <div className="visual-card visual-card-front"><div className="visual-card-head"><span className="live-pill"><i /> LIVE SESSION</span><MoreHorizontal size={16} /></div><div className="visual-note-title">A little more in sync.</div><div className="visual-lines"><i /><i /><i /><i /></div><div className="visual-collaborators"><span className="avatar avatar-olive">A</span><span className="avatar avatar-lime">P</span><span className="avatar avatar-violet">T</span><small>your team is here</small></div></div>
        </div>
        <div className="auth-features" aria-label="Workspace features"><span><LockKeyhole size={14} />Private rooms</span><span><Radio size={14} />Live presence</span><span><History size={14} />Revision history</span></div>
        <div className="auth-footnote"><Globe2 size={14} /> Made for teams that think out loud.</div>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </div>
    <footer className="auth-footer"><span>© 2026 SYNKRO WORKSPACE</span><span>BUILT FOR BETTER TOGETHER <span className="footer-star">✳</span></span></footer>
  </main>;
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const githubClientId = import.meta.env.VITE_GITHUB_CLIENT_ID?.trim();
let googleScriptPromise;

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => window.google?.accounts?.id
        ? resolve(window.google)
        : reject(new Error('Google sign-in could not start. Please try again.'));
      script.onerror = () => {
        script.remove();
        reject(new Error('Google sign-in could not load. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      googleScriptPromise = undefined;
      throw error;
    });
  }
  return googleScriptPromise;
}

function GoogleButton({ onCredential, onError, busy }) {
  const hostRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const errorRef = useRef(onError);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  callbackRef.current = onCredential;
  errorRef.current = onError;

  useEffect(() => {
    if (!googleClientId) return undefined;
    let active = true;
    let observer;
    loadGoogleIdentity().then((google) => {
      if (!active || !hostRef.current) return;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => {
          if (active && credential) callbackRef.current(credential);
        },
      });
      const render = () => {
        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren();
        google.accounts.id.renderButton(host, {
          type: 'standard', theme: 'outline_dark', size: 'large',
          shape: 'pill', text: 'continue_with',
          width: Math.max(120, Math.min(400, Math.floor(host.clientWidth))),
        });
      };
      render();
      setLoaded(true);
      let previousWidth = hostRef.current.clientWidth;
      observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        if (width > 0 && width !== previousWidth) {
          previousWidth = width;
          render();
        }
      });
      observer.observe(hostRef.current);
    }).catch((error) => {
      if (active) {
        setLoadError(error.message);
        errorRef.current(error.message);
      }
    });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [attempt]);

  if (!googleClientId) return <button className="provider-button" type="button" disabled title="Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in"><span className="provider-google-mark" aria-hidden="true">G</span><span>Google</span><small>Not configured</small></button>;
  if (loadError) return <button className="provider-button provider-button-error" type="button" onClick={() => { onError(''); setLoaded(false); setLoadError(''); setAttempt((value) => value + 1); }}><span className="provider-google-mark" aria-hidden="true">G</span><span>Retry Google</span></button>;
  return <div className={`provider-google-slot${busy ? ' provider-google-busy' : ''}`} aria-busy={busy}><div className="provider-google-host" ref={hostRef} />{!loaded && <span className="provider-google-loading" role="status">Loading Google…</span>}</div>;
}

function ProviderButtons({ onGoogleCredential, onGoogleError, onGitHubStart, busy }) {
  return <div className="auth-providers" role="group" aria-label="Other sign-in options">
    <GoogleButton onCredential={onGoogleCredential} onError={onGoogleError} busy={busy} />
    <button className={`provider-button${githubClientId && !IS_ANDROID ? ' provider-button-active' : ''}`} type="button" disabled={busy || !githubClientId || IS_ANDROID} onClick={onGitHubStart} title={!githubClientId ? 'Set VITE_GITHUB_CLIENT_ID to enable GitHub sign-in' : IS_ANDROID ? 'GitHub sign-in is available on the website' : undefined}>
      <svg className="provider-github-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.15c-3.09.67-3.74-1.31-3.74-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.84 2.1 3.2 1.49.1-.72.39-1.21.71-1.49-2.47-.28-5.07-1.24-5.07-5.54 0-1.22.44-2.22 1.15-3-.11-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.14a10.7 10.7 0 0 1 5.6 0c2.14-1.44 3.08-1.14 3.08-1.14.61 1.54.22 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.31-2.6 5.25-5.08 5.53.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" /></svg><span>GitHub</span>{(!githubClientId || IS_ANDROID) && <small>{IS_ANDROID ? 'Web only' : 'Not configured'}</small>}
    </button>
  </div>;
}

function AuthPage({ register = false }) {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const submitLock = useRef(false);
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  if (session) return <Navigate to={location.state?.from || '/dashboard'} replace />;

  const signInWithGoogle = async (credential) => {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await authApi.google(credential);
      setSession({ user: result.user, token: result.token, expiresAt: result.expiresAt });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const signInWithGitHub = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const url = await createGitHubAuthorizationUrl(githubClientId, window.location.origin, window.sessionStorage);
      window.location.assign(url);
    } catch (err) {
      submitLock.current = false;
      setBusy(false);
      setError(err instanceof Error ? err.message : 'GitHub sign-in could not start. Please try again.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitLock.current) return;
    const validationErrors = validateAuthFields({ register, name, email, password });
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) {
      setError('');
      const firstInvalid = Object.keys(validationErrors)[0];
      ({ name: nameRef, email: emailRef, password: passwordRef }[firstInvalid]).current?.focus();
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = register ? await authApi.register({ name: name.trim(), email: email.trim(), password }) : await authApi.login({ email: email.trim(), password });
      setSession({ user: result.user, token: result.token, expiresAt: result.expiresAt });
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not complete your request. Please try again.');
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const updateField = (field, setValue) => (event) => {
    setValue(event.target.value);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  };
  return <AuthShell>
    <div className="auth-card glass-panel">
      <div className="card-kicker"><span className="kicker-icon"><Fingerprint size={15} /></span> YOUR WORKSPACE, YOUR PEOPLE</div>
      <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
      <p className="auth-card-sub">{register ? 'Make a little room for your team’s next good idea.' : 'Sign in to pick up where your team left off.'}</p>
      <ProviderButtons onGoogleCredential={signInWithGoogle} onGoogleError={setError} onGitHubStart={signInWithGitHub} busy={busy} />
      <div className="auth-divider"><span>Or continue with email</span></div>
      <form onSubmit={submit} className="form-stack" noValidate aria-busy={busy}>
        {register && <div className="field-label"><label htmlFor="register-name">Full name</label><div className={`input-wrap${fieldErrors.name ? ' input-wrap-invalid' : ''}`}><Users size={16} aria-hidden="true" /><input ref={nameRef} id="register-name" autoComplete="name" required maxLength={50} value={name} onChange={updateField('name', setName)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'register-name-error' : undefined} placeholder="How should we call you?" /></div>{fieldErrors.name && <span className="field-error" id="register-name-error">{fieldErrors.name}</span>}</div>}
        <div className="field-label"><label htmlFor={register ? 'register-email' : 'login-email'}>Email address</label><div className={`input-wrap${fieldErrors.email ? ' input-wrap-invalid' : ''}`}><span className="at-icon" aria-hidden="true">@</span><input ref={emailRef} id={register ? 'register-email' : 'login-email'} type="email" autoComplete="email" required value={email} onChange={updateField('email', setEmail)} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? `${register ? 'register' : 'login'}-email-error` : undefined} placeholder="you@yourteam.com" /></div>{fieldErrors.email && <span className="field-error" id={`${register ? 'register' : 'login'}-email-error`}>{fieldErrors.email}</span>}</div>
        <div className="field-label"><label htmlFor={register ? 'register-password' : 'login-password'}>Password</label><div className={`input-wrap${fieldErrors.password ? ' input-wrap-invalid' : ''}`}><KeyRound size={16} aria-hidden="true" /><input ref={passwordRef} id={register ? 'register-password' : 'login-password'} type={passwordVisible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined} maxLength={128} value={password} onChange={updateField('password', setPassword)} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? `${register ? 'register' : 'login'}-password-error` : undefined} placeholder={register ? 'At least 12 characters' : 'Enter your password'} /><button className="password-toggle" type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{fieldErrors.password && <span className="field-error" id={`${register ? 'register' : 'login'}-password-error`}>{fieldErrors.password}</span>}</div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <ButtonLoader label={register ? 'Creating your account…' : 'Signing you in…'} /> : <>{register ? 'Create your account' : 'Sign In'} <ArrowRight size={16} /></>}</button>
      </form>
      {!register && DEMO_MODE && <div className="demo-access"><div><span className="demo-access-tag">LOCAL DEMO</span><span>Preview without a backend</span></div><div className="demo-credentials"><code>{DEMO_EMAIL}</code><code>{DEMO_PASSWORD}</code></div><button type="button" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setFieldErrors({}); setError(''); }}>Fill demo sign-in <ArrowDown size={13} /></button><small>Demo data stays in this browser. No server connection is used.</small></div>}
      <div className="auth-switch">{register ? 'Already have an account?' : "Don't have an account?"} <Link to={register ? '/login' : '/register'} state={{ from: location.state?.from }}>{register ? 'Sign in' : 'Sign up'} <ArrowUpRight size={13} /></Link></div>
      <div className="auth-secure"><ShieldCheck size={14} /> Your notes belong to your team. Sign in again after a page reload.</div>
    </div>
  </AuthShell>;
}

function GitHubCallbackPage() {
  const { setSession } = useSession();
  const navigate = useNavigate();
  const exchangeRef = useRef(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!exchangeRef.current) {
      const search = window.location.search;
      window.history.replaceState(null, '', window.location.pathname);
      exchangeRef.current = Promise.resolve().then(() => {
        const pending = consumeGitHubCallback(search, window.sessionStorage);
        return authApi.github({ ...pending, redirectUri: `${window.location.origin}/auth/github/callback` });
      });
    }
    let active = true;
    exchangeRef.current.then((result) => {
      if (!active) return;
      setSession({ user: result.user, token: result.token, expiresAt: result.expiresAt });
      navigate('/dashboard', { replace: true });
    }).catch((error) => {
      if (active) setFailure(error instanceof Error ? error.message : 'GitHub sign-in failed. Please try again.');
    });
    return () => { active = false; };
  }, [navigate, setSession]);

  return <AuthShell><div className="auth-card glass-panel" role="status">
    <h2>{failure ? 'Could not sign in' : 'Connecting GitHub…'}</h2>
    <p className="auth-card-sub">{failure || 'Checking your GitHub account and opening your workspace.'}</p>
    {failure && <Link className="button button-primary auth-submit" to="/login">Back to sign in <ArrowRight size={16} /></Link>}
  </div></AuthShell>;
}

function ThemePicker() {
  const { theme, setTheme, storageError } = useWorkspaceTheme();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const activeTheme = WORKSPACE_THEMES.find((option) => option.id === theme) || WORKSPACE_THEMES[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnOutside = (event) => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
    };
  }, [open]);

  return <div className="theme-picker" ref={pickerRef}>
    <button
      type="button"
      ref={triggerRef}
      className="theme-picker-trigger"
      aria-haspopup="true"
      aria-expanded={open}
      aria-controls={open ? 'workspace-theme-options' : undefined}
      aria-label={`Appearance: ${activeTheme.name}`}
      onClick={() => setOpen((value) => !value)}
    >
      <Palette size={15} /><span>Appearance</span><ChevronDown size={13} />
    </button>
    {open && <div className="theme-picker-panel glass-panel" id="workspace-theme-options">
      <div className="theme-picker-heading"><strong>Workspace theme</strong><span>Choose a look for your space</span></div>
      <div className="theme-picker-options" role="group" aria-label="Workspace themes">
        {WORKSPACE_THEMES.map((option) => <button
          type="button"
          key={option.id}
          className="theme-option"
          aria-pressed={theme === option.id}
          onClick={() => {
            if (setTheme(option.id)) {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <span className={`theme-swatch theme-swatch-${option.id}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="theme-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
          {theme === option.id && <Check className="theme-option-check" size={16} aria-hidden="true" />}
        </button>)}
      </div>
      {storageError && <p className="theme-storage-error" role="status">{storageError}</p>}
    </div>}
  </div>;
}

function AppFrame({ children }) {
  const { session, signOut } = useSession();
  const { theme } = useWorkspaceTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shellRef = useRef(null);
  const topbarRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const logout = async () => { await signOut(); navigate('/login', { replace: true }); };

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    const surfaceSelector = '.glass-panel, .button, .guide-replay-button';
    let activeSurface = null;
    const resetReflection = (surface) => {
      surface.style.setProperty('--glass-pointer-x', '50%');
      surface.style.setProperty('--glass-pointer-y', '35%');
    };
    const trackPointer = (event) => {
      if (event.pointerType !== 'mouse') return;
      const surface = event.target.closest?.(surfaceSelector);
      if (!surface || !shell.contains(surface)) {
        if (activeSurface) resetReflection(activeSurface);
        activeSurface = null;
        return;
      }
      if (activeSurface && activeSurface !== surface) resetReflection(activeSurface);
      const bounds = surface.getBoundingClientRect();
      surface.style.setProperty('--glass-pointer-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      surface.style.setProperty('--glass-pointer-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
      activeSurface = surface;
    };
    const resetOnLeave = (event) => {
      const surface = event.target.closest?.(surfaceSelector);
      if (!surface || surface.contains(event.relatedTarget)) return;
      resetReflection(surface);
      if (activeSurface === surface) activeSurface = null;
    };

    shell.addEventListener('pointermove', trackPointer);
    shell.addEventListener('pointerout', resetOnLeave);
    return () => {
      shell.removeEventListener('pointermove', trackPointer);
      shell.removeEventListener('pointerout', resetOnLeave);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileOpen(false); };
    const closeOnOutside = (event) => { if (!topbarRef.current?.contains(event.target)) setMobileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
    };
  }, [mobileOpen]);

  return <div ref={shellRef} className="app-shell" data-theme={theme || DEFAULT_WORKSPACE_THEME}>
    <header ref={topbarRef} className="topbar glass-panel">
      <Brand />
      <nav id="workspace-navigation" className={`main-nav ${mobileOpen ? 'nav-open glass-panel' : ''}`} aria-label="Main navigation">
        <Link to="/dashboard" className={`nav-link${location.pathname === '/dashboard' || location.pathname.startsWith('/rooms/') ? ' active' : ''}`} onClick={() => setMobileOpen(false)}><LayoutGrid size={15} /> Rooms</Link>
        <span className="nav-divider" />
        <ThemePicker />
        <span className="nav-divider theme-nav-divider" />
        <span className="nav-caption"><span className="status-dot" /> {DEMO_MODE ? 'Local demo · saved in this browser' : 'All systems calm'}</span>
      </nav>
      <div className="topbar-actions">
        <button className="icon-button mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? 'Close workspace navigation' : 'Open workspace navigation'} aria-expanded={mobileOpen} aria-controls="workspace-navigation">{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button>
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
    setError('');
    try { const data = await roomApi.list(session.token); setRooms(data.items || data.rooms || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { refresh(); }, [refresh]);
  return { rooms, setRooms, loading, error, refresh };
}

function readGuideDismissed(storageKey) {
  try { return window.localStorage.getItem(storageKey) === 'true'; }
  catch { return false; }
}

function DashboardOnboardingGuide({ targetRef, ready, initialAllowed, replayToken, onActiveChange, onComplete }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const [geometry, setGeometry] = useState(null);
  const tooltipRef = useRef(null);
  const visibleRef = useRef(false);
  const hasAutoStartedRef = useRef(false);
  const previousReplayRef = useRef(replayToken);
  const dismissRef = useRef(null);

  const complete = useCallback(() => {
    visibleRef.current = false;
    setIsVisible(false);
    setIsExiting(false);
    setGeometry(null);
    onActiveChange(false);
    onComplete();
  }, [onActiveChange, onComplete]);
  dismissRef.current = complete;

  const measure = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    const tooltipWidth = tooltipRect?.width || 320;
    const tooltipHeight = tooltipRect?.height || 110;
    if (targetRect.bottom <= 0 || targetRect.top >= viewportHeight) {
      if (visibleRef.current) dismissRef.current?.();
      return;
    }

    const left = Math.max(12, Math.min(viewportWidth - tooltipWidth - 12, targetRect.left + (targetRect.width - tooltipWidth) / 2));
    const above = targetRect.top >= tooltipHeight + 22;
    const top = above
      ? targetRect.top - tooltipHeight - 26
      : Math.max(12, Math.min(viewportHeight - tooltipHeight - 12, targetRect.bottom + 26));
    const startX = Math.max(left + 22, Math.min(left + tooltipWidth - 22, targetRect.left + targetRect.width / 2));
    const startY = above ? top + tooltipHeight : top;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = above ? targetRect.top - 5 : targetRect.bottom + 5;
    const curve = Math.max(18, Math.abs(endY - startY) * 0.48);
    const controlY = above ? startY + curve : startY - curve;

    setGeometry({
      left,
      top,
      width: viewportWidth,
      height: viewportHeight,
      placement: above ? 'above' : 'below',
      endX,
      endY,
      path: `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`,
    });
  }, [targetRef]);

  useEffect(() => {
    if (!ready || !targetRef.current) return undefined;
    const isReplay = previousReplayRef.current !== replayToken;
    previousReplayRef.current = replayToken;
    if (!isReplay && (!initialAllowed || hasAutoStartedRef.current)) return undefined;

    let startTimer;
    let exitTimer;
    let closeTimer;
    let observer;
    let cancelled = false;

    const startGuide = () => {
      if (cancelled || (visibleRef.current && !isReplay)) return;
      const currentRect = targetRef.current?.getBoundingClientRect();
      if (!currentRect || currentRect.bottom <= 0 || currentRect.top >= window.innerHeight) {
        startTimer = undefined;
        if (currentRect && 'IntersectionObserver' in window) {
          observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer?.disconnect();
              waitUntilVisible();
            }
          }, { threshold: 0.1 });
          observer.observe(targetRef.current);
        } else if (currentRect) {
          startTimer = window.setTimeout(startGuide, 300);
        }
        return;
      }
      if (!isReplay) hasAutoStartedRef.current = true;
      visibleRef.current = true;
      measure();
      setIsExiting(false);
      setAnimationKey((current) => current + 1);
      setIsVisible(true);
      onActiveChange(true);
      exitTimer = window.setTimeout(() => setIsExiting(true), 6100);
      closeTimer = window.setTimeout(complete, 6500);
    };
    const waitUntilVisible = () => {
      if (startTimer || cancelled) return;
      startTimer = window.setTimeout(startGuide, isReplay ? 0 : 950);
    };
    const rect = targetRef.current.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      waitUntilVisible();
    } else if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          waitUntilVisible();
          observer?.disconnect();
        }
      }, { threshold: 0.1 });
      observer.observe(targetRef.current);
    } else {
      waitUntilVisible();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
      observer?.disconnect();
    };
  }, [ready, initialAllowed, replayToken, targetRef, measure, onActiveChange, complete]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const resizeObserver = new ResizeObserver(measure);
    if (targetRef.current) resizeObserver.observe(targetRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    measure();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [isVisible, measure, targetRef]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const dismissOnInteraction = (event) => {
      if (event.target.closest?.('.dashboard-onboarding-tooltip, .guide-replay-button')) return;
      if (event.target.closest?.('button, a, input, textarea, select, [role="button"], .room-card')) dismissRef.current?.();
    };
    const dismissOnKey = (event) => {
      if (event.key === 'Escape') dismissRef.current?.();
    };
    const dismissOnScroll = () => dismissRef.current?.();
    document.addEventListener('pointerdown', dismissOnInteraction);
    document.addEventListener('keydown', dismissOnKey);
    window.addEventListener('wheel', dismissOnScroll, { passive: true });
    window.addEventListener('touchstart', dismissOnScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismissOnInteraction);
      document.removeEventListener('keydown', dismissOnKey);
      window.removeEventListener('wheel', dismissOnScroll);
      window.removeEventListener('touchstart', dismissOnScroll);
    };
  }, [isVisible]);

  if (!isVisible || !geometry) return null;

  return <div className={`dashboard-onboarding-guide${isExiting ? ' is-exiting' : ''}`} key={animationKey}>
    <svg className="dashboard-guide-connector" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
      <path d={geometry.path} pathLength="1" />
      <circle cx={geometry.endX} cy={geometry.endY} r="4" />
    </svg>
    <aside ref={tooltipRef} className={`dashboard-onboarding-tooltip is-${geometry.placement}`} role="status" style={{ left: geometry.left, top: geometry.top }}>
      <span className="guide-indicator" />
      <button className="guide-close" type="button" onClick={complete} aria-label="Dismiss getting started guide"><X size={13} /></button>
      <strong>Let&apos;s get started</strong>
      <p>Create your first room to bring your team together.</p>
    </aside>
  </div>;
}

function Dashboard() {
  const { session } = useSession();
  const { rooms, setRooms, loading, error, refresh } = useRooms();
  const navigate = useNavigate();
  const newRoomButtonRef = useRef(null);
  const [dialog, setDialog] = useState('');
  const [roomName, setRoomName] = useState('');
  const [createKind, setCreateKind] = useState('room');
  const [inviteCode, setInviteCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const storageKey = `synkro-dashboard-onboarding:${session?.user?.id || session?.user?.email || 'user'}`;
  const [guideSeen, setGuideSeen] = useState(() => readGuideDismissed(storageKey));
  const [guideActive, setGuideActive] = useState(false);
  const [guideReplayToken, setGuideReplayToken] = useState(0);
  const persistGuideDismissal = useCallback(() => {
    setGuideSeen(true);
    try { window.localStorage.setItem(storageKey, 'true'); }
    catch {}
  }, [storageKey]);
  const dismissGuide = useCallback(() => {
    setGuideActive(false);
    persistGuideDismissal();
  }, [persistGuideDismissal]);

  const createRoom = async (event) => {
    event.preventDefault(); setBusyAction('create'); setMessage('');
    try {
      const result = await roomApi.create(session.token, roomName.trim(), 'room');
      const room = result.room || result;
      if (createKind === 'room') {
        setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
        setDialog('');
        navigate(`/rooms/${room.id}`, { state: { inviteCode: result.inviteCode } });
      } else {
        const { file } = await fileApi.create(session.token, room.id, createKind, roomName.trim());
        setDialog('');
        navigate(`/studio/${room.id}/${file.id}`, { state: { inviteCode: result.inviteCode } });
      }
    }
    catch (err) { setMessage(err.message); }
    finally { setBusyAction(''); }
  };
  const joinRoom = async (event) => {
    event.preventDefault(); setBusyAction('join'); setMessage('');
    try { const result = await roomApi.join(session.token, inviteCode.trim()); const room = result.room || result; setDialog(''); navigate(`/rooms/${room.id}`); }
    catch (err) { setMessage(err.message); }
    finally { setBusyAction(''); }
  };

  return <>
    <section className="dashboard-hero">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> YOUR TEAM, IN ONE PLACE</div><h1>Make space for<br /><span>good work.</span></h1><p>Shared notes, live thinking, and a little more room to do your best work.</p></div>
    </section>

    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <div className="section-kicker">YOUR SPACES</div>
          <div className="section-title-line">
            <h2>Rooms <span className="count-pill">{rooms.length.toString().padStart(2, '0')}</span></h2>
            <button className="guide-replay-button" type="button" onClick={() => setGuideReplayToken((current) => current + 1)}><RotateCcw size={14} /> Show me around</button>
          </div>
        </div>
        <div className="section-actions">
          <GlassButton onClick={() => { dismissGuide(); setMessage(''); setDialog('join'); }}><ArrowDownLeft size={19} /> Join a room</GlassButton>
          <GlassButton ref={newRoomButtonRef} className={guideActive ? 'is-guide-target' : ''} variant="primary" onClick={() => { dismissGuide(); setMessage(''); setRoomName(''); setCreateKind('room'); setDialog('create'); }}><Plus size={20} /> Create new</GlassButton>
        </div>
      </div>

      <DashboardOnboardingGuide
        targetRef={newRoomButtonRef}
        ready={!loading}
        initialAllowed={!guideSeen}
        replayToken={guideReplayToken}
        onActiveChange={setGuideActive}
        onComplete={persistGuideDismissal}
      />

      {error && <div className="inline-alert" role="alert"><span>{error}</span><GlassButton onClick={refresh}><RefreshCw size={14} /> Retry</GlassButton></div>}
      {loading ? <div className="room-grid" role="status" aria-label="Loading your rooms">{[1, 2, 3].map((item) => <SkeletonLoader key={item} />)}</div> : rooms.length ? <div className="room-grid">{rooms.map((room, index) => <RoomCard room={room} index={index} key={room.id} />)}<button className="room-card room-create-card glass-panel" onClick={() => setDialog('create')}>
        <div className="room-card-top"><span className="create-card-icon"><Plus size={19} /></span><ArrowUpRight className="create-arrow" size={17} /></div>
        <div className="room-card-body"><span className="room-label">NEW ROOM</span><h3>Start with a blank page</h3><p>Create a room for your next idea</p></div>
        <div className="room-card-footer"><span className="room-meta"><Plus size={14} /> Blank page</span><span className="room-open">Create room <ArrowRight size={14} /></span></div>
      </button></div> : !error && <div className="empty-state glass-panel"><div className="empty-art"><div className="empty-art-ring" /><FilePlus2 size={28} /></div><span className="section-kicker">A FRESH PAGE</span><h3>Your first room is waiting.</h3><p>Create a room for a project, a study group, or simply the notes you want to share.</p><div className="empty-actions"><GlassButton variant="primary" onClick={() => setDialog('create')}><Plus size={15} /> Create your first room</GlassButton><button className="text-button" onClick={() => setDialog('join')}>I have an invite code <ArrowRight size={14} /></button></div></div>}
    </section>

    <section className="dashboard-bottom"><div className="bottom-note glass-panel"><div className="bottom-note-icon"><Zap size={16} /></div><div><strong>{DEMO_MODE ? 'A local preview space.' : 'Small edits, all in sync.'}</strong><p>{DEMO_MODE ? 'Demo changes are saved only in this browser.' : 'Updates travel with your room, so nobody has to ask for the latest copy.'}</p></div><span className="bottom-note-deco">✳</span></div><span className="dashboard-caption"><span className="status-dot" /> {DEMO_MODE ? 'Local sample content · not connected to a team' : 'Your spaces are private to you and your team.'}</span></section>

    {dialog && <Modal title={dialog === 'create' ? 'What would you like to create?' : 'Join your team'} subtitle={dialog === 'create' ? 'Choose a workspace type, then give it a name.' : 'Paste an invite code from someone in your team.'} onClose={() => setDialog('')}>
      <form onSubmit={dialog === 'create' ? createRoom : joinRoom} className="modal-form" aria-busy={Boolean(busyAction)}>
        {dialog === 'create' ? <>
          <div className="create-kind-grid" role="group" aria-label="Choose what to create">
            {[
              { id: 'room', label: 'Shared room', detail: 'A live space for team notes', Icon: Users },
              { id: 'document', label: 'Document', detail: 'Write together, page by page', Icon: FileText },
              { id: 'notebook', label: 'Notebook', detail: 'Organize notes into pages', Icon: NotebookTabs },
              { id: 'slides', label: 'Presentation', detail: 'Build and present a deck', Icon: Presentation },
              { id: 'sheet', label: 'Spreadsheet', detail: 'Track work in a grid', Icon: Table2 },
              { id: 'code', label: 'Code workspace', detail: 'Write and run Python or C++', Icon: Code2 },
            ].map(({ id, label, detail, Icon }) => <button key={id} type="button" className={`create-kind-option${createKind === id ? ' selected' : ''}`} aria-pressed={createKind === id} onClick={() => setCreateKind(id)}><Icon size={19} /><span><strong>{label}</strong><small>{detail}</small></span><span className="create-kind-check" aria-hidden="true">{createKind === id ? '✓' : ''}</span></button>)}
          </div>
          <label className="field-label">{createKind === 'room' ? 'Room name' : `${({ slides: 'Presentation', sheet: 'Spreadsheet', code: 'Code workspace' })[createKind] || createKind[0].toUpperCase() + createKind.slice(1)} name`}<div className="input-wrap"><FilePlus2 size={16} /><input autoFocus required minLength={1} maxLength={80} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={createKind === 'room' ? 'e.g. Product studio' : `e.g. ${({ slides: 'Product launch', sheet: 'Quarterly plan', notebook: 'Team notes', document: 'Project brief', code: 'Python practice' })[createKind] || 'Team project'}`} /></div></label>
        </> : <label className="field-label">Invite code<div className="input-wrap"><KeyRound size={16} /><input autoFocus required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Paste your invite code" /></div></label>}
        {message && <div className="form-error" role="alert">{message}</div>}
        <div className="modal-actions"><GlassButton type="button" onClick={() => setDialog('')} disabled={Boolean(busyAction)}>Cancel</GlassButton><GlassButton variant="primary" disabled={Boolean(busyAction)}>{busyAction ? <ButtonLoader label={busyAction === 'create' ? 'Creating…' : 'Joining room…'} /> : <>{dialog === 'create' ? createKind === 'room' ? 'Create room' : `Create ${({ slides: 'presentation', sheet: 'spreadsheet', notebook: 'notebook', document: 'document', code: 'code workspace' })[createKind] || createKind}` : 'Join room'} <ArrowRight size={15} /></>}</GlassButton></div>
      </form>
    </Modal>}
  </>;
}

function RoomCard({ room, index }) {
  const colors = ['lime', 'violet', 'blue', 'orange'];
  const isFileSpace = room.kind === 'file';
  return <Link className={`room-card glass-panel room-tone-${colors[index % colors.length]}`} to={`/rooms/${room.id}`}>
    <div className="room-card-top"><span className="room-glyph">{isFileSpace ? <FileText size={17} /> : <FileClock size={17} />}</span><span className="room-card-more"><MoreHorizontal size={18} /></span></div>
    <div className="room-card-body"><span className="room-label">{isFileSpace ? 'FILE SPACE' : 'SHARED ROOM'}</span><h3>{room.name}</h3><p>{isFileSpace ? 'Open shared documents and files' : 'Open your team’s shared workspace'}</p></div>
    <div className="room-card-footer"><span className="room-meta"><Users size={14} /> Shared space</span><span className="room-open">Open room <ArrowUpRight size={14} /></span></div>
  </Link>;
}

function Modal({ title, subtitle, children, onClose }) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(document.activeElement);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus?.();
    };
  }, []);
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="modal-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button><div className="section-kicker">A SPACE FOR YOUR TEAM</div><h2 id="modal-title">{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function InviteJoinRoute() {
  const { session } = useSession();
  const location = useLocation();
  return session
    ? <AppFrame><InviteJoinPage /></AppFrame>
    : <Navigate to="/login" replace state={{ from: location }} />;
}

function InviteJoinPage() {
  const { inviteCode = '' } = useParams();
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async (event) => {
    event.preventDefault();
    if (!inviteCode || busy) return;
    setBusy(true); setError('');
    try {
      const result = await roomApi.join(session.token, inviteCode);
      const room = result.room || result;
      const params = new URLSearchParams(location.search);
      const destination = getInviteDestination(room.id, params.get('roomId'), params.get('fileId'));
      navigate(destination, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <section className="invite-join-page">
    <form className="invite-join-card glass-panel" onSubmit={join}>
      <div className="section-kicker">ROOM INVITATION</div>
      <h1>Join this workspace</h1>
      <p>A teammate invited you to collaborate in Synkro. Confirm to join with this invite code.</p>
      <div className="invite-join-code"><code>{inviteCode}</code></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <GlassButton type="button" onClick={() => navigate('/dashboard')}>Not now</GlassButton>
        <GlassButton variant="primary" disabled={!inviteCode || busy} aria-busy={busy}>
          {busy ? <><span className="spinner" /> Joining…</> : <>Join workspace <ArrowRight size={15} /></>}
        </GlassButton>
      </div>
    </form>
  </section>;
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
  const [roomFiles, setRoomFiles] = useState([]);
  const [roomFilesError, setRoomFilesError] = useState('');
  const [roomFileDialog, setRoomFileDialog] = useState(false);
  const [roomFileType, setRoomFileType] = useState('document');
  const [roomFileTitle, setRoomFileTitle] = useState('');
  const [roomFileBusy, setRoomFileBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
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

  const refreshRoomFiles = useCallback(async () => {
    try {
      const result = await fileApi.list(session.token, roomId);
      setRoomFiles(result.items || []);
      setRoomFilesError('');
    } catch (error) {
      setRoomFilesError(error.message || 'Files in this room could not be loaded.');
    }
  }, [roomId, session.token]);

  useEffect(() => { refreshRoomFiles(); }, [refreshRoomFiles]);

  const createRoomFile = async (event) => {
    event.preventDefault();
    if (!roomFileTitle.trim() || roomFileBusy) return;
    setRoomFileBusy(true);
    setRoomFilesError('');
    try {
      await fileApi.create(session.token, roomId, roomFileType, roomFileTitle.trim());
      await refreshRoomFiles();
      setRoomFileDialog(false);
      setRoomFileTitle('');
      setToast('File added to this room.');
    } catch (error) {
      setRoomFilesError(error.message || 'This file could not be created.');
    } finally {
      setRoomFileBusy(false);
    }
  };

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
    const onConnectError = (error) => {
      if (error?.message === 'UNAUTHENTICATED') {
        setConnection('error'); setSession(null); navigate('/login', { replace: true });
        return;
      }
      setConnection('reconnecting');
    };
    const onUpdated = (event) => { if (event.roomId === roomId) receiveCanonical(event.note, event.operationId === inFlightRef.current?.operationId); };
    const onFileChanged = (event) => { if (event.roomId === roomId) refreshRoomFiles(); };
    const onPresence = (event) => {
      if (event.roomId !== roomId || Number(event.presenceSequence) <= presenceSequenceRef.current) return;
      presenceSequenceRef.current = Number(event.presenceSequence);
      setPresenceSequence(presenceSequenceRef.current); setPresence(event.users || []);
    };
    const onExpired = () => { setConnection('error'); setSession(null); navigate('/login', { replace: true }); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError);
    socket.on('note:updated', onUpdated); socket.on('presence:updated', onPresence); socket.on('file:created', onFileChanged); socket.on('file:updated', onFileChanged); socket.on('session:expired', onExpired);
    socket.connect();
    return () => {
      joined = false;
      window.clearTimeout(retryJoinTimer);
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError);
      socket.off('note:updated', onUpdated); socket.off('presence:updated', onPresence); socket.off('file:created', onFileChanged); socket.off('file:updated', onFileChanged); socket.off('session:expired', onExpired);
      if (socket.connected) socket.emit('room:leave', { roomId });
      socket.disconnect(); socketRef.current = null;
    };
  // presenceSequence is a snapshot baseline for events; room/session are the only lifecycle keys.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, session?.token, Boolean(note), pageError, receiveCanonical, refreshRoomFiles, setSession, navigate]);

  const submitSnapshot = useCallback(async (content, baseRevision = Number(note?.revision || 0), operationId = id()) => {
    const socket = socketRef.current;
    if (!socket?.connected) { setSaveState('paused'); return false; }
    if (inFlightRef.current) return false;
    inFlightRef.current = { content, operationId, baseRevision };
    setSaveState('saving');
    try {
      const result = await socketAck(socket, 'note:update', { roomId, operationId, baseRevision, content }, 60_000);
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
    if (!IS_ANDROID) return undefined;
    const pause = () => socketRef.current?.disconnect();
    const resume = () => {
      const socket = socketRef.current;
      if (socket && !socket.connected) socket.connect();
      else syncNow();
    };
    window.addEventListener('synkro:paused', pause);
    window.addEventListener('synkro:resumed', resume);
    window.addEventListener('synkro:connectivity-restored', resume);
    return () => {
      window.removeEventListener('synkro:paused', pause);
      window.removeEventListener('synkro:resumed', resume);
      window.removeEventListener('synkro:connectivity-restored', resume);
    };
  }, [syncNow]);

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
    setDrawerError(''); setPreviewLoading(true);
    try { const data = await roomApi.version(session.token, roomId, item.revision); setPreview(data.version || data); }
    catch (error) { setDrawerError(error.message); }
    finally { setPreviewLoading(false); }
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
    setInviteBusy(true); setDrawerError('');
    try { const data = await roomApi.rotateInvite(session.token, roomId); setInviteCode(data.inviteCode); }
    catch (error) { setDrawerError(error.message); }
    finally { setInviteBusy(false); }
  };
  const copyInvite = async () => { try { await navigator.clipboard.writeText(inviteCode); setToast('Invite code copied.'); } catch { setToast('Copy is unavailable. Select and copy the code.'); } };
  const shareViaWhatsApp = () => {
    if (!inviteCode) return;
    const whatsAppUrl = buildWhatsAppShareUrl(window.location.origin, inviteCode);
    if (typeof window.open !== 'function') { window.location.assign(whatsAppUrl); return; }
    try {
      const popup = window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
      if (!popup) window.location.assign(whatsAppUrl);
    } catch { window.location.assign(whatsAppUrl); }
  };
  const handleEdit = (event) => {
    const nextValue = event.target.value;
    if (new TextEncoder().encode(nextValue).length > 5 * 1024 * 1024) { setToast('Notes can be up to 5 MiB.'); return; }
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

  if (!room && !pageError) return <PageLoader brand={<Brand />} label="Preparing your workspace…" />;

  return <div className="room-page" data-unsaved={dirty || ['pending', 'saving', 'failed', 'review'].includes(saveState)}>
    <div className="room-breadcrumb"><button className="back-link" onClick={() => navigate('/dashboard')}><ArrowLeft size={15} /> Your rooms</button><span className="crumb-divider">/</span><span>{room?.name || 'Shared room'}</span></div>
    <div className="room-header"><div className="room-title-wrap"><div className="room-title-icon"><FileClock size={19} /></div><div><div className="section-kicker">SHARED ROOM</div><h1>{room?.name || 'Shared notes'}</h1></div></div><div className="room-toolbar">
      <ConnectionStatus connection={connection} saveState={saveState} dirty={dirty} onRetry={retrySave} />
      <div className="presence-stack" aria-label={`${presence.length} people online`}>{presence.slice(0, 4).map((person, index) => <span key={person.id} className={`avatar avatar-presence avatar-color-${index % 4}`} title={person.name}>{userInitials(person.name)}</span>)}{presence.length > 4 && <span className="avatar avatar-overflow">+{presence.length - 4}</span>}</div>
      <button className="toolbar-button glass-panel" onClick={openHistory} aria-label="Open room history"><History size={15} /><span>History</span></button>
      <WorkspaceAssistant token={session.token} roomId={roomId} disabled={session.token === DEMO_TOKEN} />
      {isOwner && <button className="toolbar-button glass-panel" onClick={loadInvite} aria-label="Manage room invitations"><Users size={15} /><span>Invite</span></button>}
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
        <section className="aside-card glass-panel"><div className="aside-card-head"><span className="aside-icon"><Users size={15} /></span><span>IN THIS ROOM</span><span className={`aside-live${connection === 'live' ? ' is-connected' : ''}`}><i /> {connection === 'live' ? 'LIVE' : connection === 'reconnecting' ? 'RECONNECTING' : connection === 'error' ? 'OFFLINE' : 'CONNECTING'}</span></div><div className="member-list">
          {presence.length ? presence.map((person, index) => <div className="member-row" key={person.id}><span className={`avatar avatar-color-${index % 4}`}>{userInitials(person.name)}</span><span className="member-name">{person.name}{person.id === session.user.id && <small>you</small>}</span><span className="member-dot" title="Online" /></div>) : <p className="aside-empty">You’ll see your team here when they join.</p>}
        </div><div className="aside-foot"><span>{presence.length} {presence.length === 1 ? 'person' : 'people'} online</span><span className="member-spark">✳</span></div></section>
        <section className="aside-card room-files-card glass-panel">
          <div className="aside-card-head"><span className="aside-icon"><FileText size={15} /></span><span>FILES IN THIS ROOM</span><span className="room-file-count">{String(roomFiles.length).padStart(2, '0')}</span></div>
          <button className="room-file-create" type="button" onClick={() => { setRoomFileDialog(true); setRoomFilesError(''); setRoomFileTitle(''); }}><Plus size={14} /> Add a file</button>
          <div className="room-file-list">
            {roomFiles.map((file) => {
              const Icon = ({ document: FileText, notebook: NotebookTabs, slides: Presentation, sheet: Table2, code: Code2 })[file.type] || FileText;
              const label = ({ document: 'Document', notebook: 'Notebook', slides: 'Presentation', sheet: 'Spreadsheet', code: 'Code workspace' })[file.type] || 'File';
              return <Link className="room-file-link" key={file.id} to={`/studio/${roomId}/${file.id}`}>
                <span className="room-file-icon"><Icon size={15} /></span>
                <span className="room-file-copy"><strong>{file.title}</strong><small>{label} · Rev. {file.revision}</small></span>
                <ArrowUpRight size={14} className="room-file-arrow" />
              </Link>;
            })}
            {!roomFiles.length && !roomFilesError && <p className="aside-empty">Files you create for this team will appear here.</p>}
            {roomFilesError && <p className="aside-empty" role="status">{roomFilesError}</p>}
          </div>
        </section>
        <section className="aside-card room-tip glass-panel"><div className="aside-card-head"><span className="aside-icon tip-icon"><Sparkles size={15} /></span><span>A LITTLE TIP</span></div><p>Write freely. Everyone in this room sees the same page update as you go.</p><div className="tip-decoration">✳</div></section>
        {isOwner && <button className="manage-invite glass-panel" onClick={loadInvite}><span className="manage-icon"><Settings2 size={15} /></span><span><strong>Room invitations</strong><small>Manage who can join this space</small></span><ArrowRight size={15} /></button>}
        <div className="room-aside-note"><ShieldCheck size={13} /><span>{DEMO_MODE ? 'Local demo data stays in this browser.' : 'Only invited members can see these notes.'}</span></div>
      </aside>
    </div>

    {roomFileDialog && <Modal title="Add a file to this room" subtitle="Choose a format and give the shared file a name." onClose={() => { if (!roomFileBusy) setRoomFileDialog(false); }}>
      <form className="modal-form" onSubmit={createRoomFile} aria-busy={roomFileBusy}>
        <div className="create-kind-grid" role="group" aria-label="Choose a file type">
          {[
            { id: 'document', label: 'Document', detail: 'Write together', Icon: FileText },
            { id: 'notebook', label: 'Notebook', detail: 'Organize notes', Icon: NotebookTabs },
            { id: 'slides', label: 'Presentation', detail: 'Build a deck', Icon: Presentation },
            { id: 'sheet', label: 'Spreadsheet', detail: 'Work with data', Icon: Table2 },
            { id: 'code', label: 'Code workspace', detail: 'Run Python or C++', Icon: Code2 },
          ].map(({ id: kind, label, detail, Icon }) => <button key={kind} type="button" className={`create-kind-option${roomFileType === kind ? ' selected' : ''}`} aria-pressed={roomFileType === kind} onClick={() => setRoomFileType(kind)}><Icon size={19} /><span><strong>{label}</strong><small>{detail}</small></span><span className="create-kind-check" aria-hidden="true">{roomFileType === kind ? '✓' : ''}</span></button>)}
        </div>
        <label className="field-label">File name<div className="input-wrap"><FilePlus2 size={16} /><input autoFocus required maxLength={80} value={roomFileTitle} onChange={(event) => setRoomFileTitle(event.target.value)} placeholder="e.g. Project brief" /></div></label>
        {roomFilesError && <div className="form-error" role="alert">{roomFilesError}</div>}
        <div className="modal-actions"><GlassButton type="button" onClick={() => setRoomFileDialog(false)} disabled={roomFileBusy}>Cancel</GlassButton><GlassButton variant="primary" disabled={roomFileBusy || !roomFileTitle.trim()}>{roomFileBusy ? <ButtonLoader label="Creating…" /> : <>Create file <ArrowRight size={15} /></>}</GlassButton></div>
      </form>
    </Modal>}

    {historyOpen && <div className="drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) { setHistoryOpen(false); setPreview(null); } }}><aside className="history-drawer glass-panel" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="drawer-header"><div><span className="section-kicker">ROOM ACTIVITY</span><h2 id="history-title">Version history</h2><p>Every saved thought, right where you left it.</p></div><button className="icon-button" onClick={() => { setHistoryOpen(false); setPreview(null); }} aria-label="Close history"><X size={18} /></button></div>
      {previewLoading ? <InlineLoader className="history-loading" label="Loading version…" /> : preview ? <div className="version-preview"><button className="back-link" onClick={() => setPreview(null)}><ArrowLeft size={14} /> All versions</button><div className="preview-meta"><span className="preview-rev">REV. {String(preview.revision).padStart(3, '0')}</span><span>{dateLabel(preview.createdAt)}</span></div><div className="preview-content">{preview.content || <em>This version is an empty page.</em>}</div>{isOwner && <GlassButton variant="primary" className="restore-button" onClick={restoreVersion} disabled={busyRestore}>{busyRestore ? <ButtonLoader label="Restoring…" /> : <><RefreshCw size={15} /> Restore this version</>}</GlassButton>}</div> : <div className="history-list">{historyLoading && !historyItems.length ? <InlineLoader className="history-loading" label="Gathering your versions…" /> : historyItems.length ? historyItems.map((item) => <button className="history-item" key={item.revision} onClick={() => loadPreview(item)}><span className={`history-kind kind-${item.kind || 'edit'}`}>{item.kind === 'restore' ? <RefreshCw size={14} /> : <FileClock size={14} />}</span><span className="history-item-main"><strong>Version {item.revision}{item.revision === note?.revision ? <small className="current-tag">CURRENT</small> : null}</strong><small>{item.authorName || 'A teammate'} · {dateLabel(item.createdAt)}</small></span><ArrowRight size={15} /></button>) : !drawerError ? <div className="history-empty"><Clock3 size={23} /><strong>No earlier versions yet.</strong><span>As your team writes, saved versions will show up here.</span></div> : null}{historyCursor != null && <GlassButton className="load-more" onClick={loadMoreHistory} disabled={historyLoading}>{historyLoading ? <ButtonLoader label="Loading…" /> : <>Load older versions <ArrowDownLeft size={14} /></>}</GlassButton>}</div>}
      {drawerError && <div className="form-error drawer-error" role="alert">{drawerError}</div>}
    </aside></div>}

    {inviteOpen && <Modal title="Bring your people in" subtitle="Share this invite code with teammates you trust. Anyone with the code can join." onClose={() => setInviteOpen(false)}>
      <div className="invite-code-box">{inviteCode ? <span>{inviteCode}</span> : <InlineLoader label="Loading invite…" />}<button className="icon-button" onClick={copyInvite} disabled={!inviteCode} aria-label="Copy invite code"><Copy size={16} /></button></div>
      <div className="invite-note"><ShieldCheck size={14} /> Rotating a code prevents new people from using the old one.</div>
      {drawerError && <div className="form-error" role="alert">{drawerError}</div>}
      <GlassButton type="button" className="whatsapp-share" onClick={shareViaWhatsApp} disabled={!inviteCode} aria-label="Share this workspace invitation via WhatsApp"><MessageCircle size={16} aria-hidden="true" /> Share via WhatsApp</GlassButton>
  <div className="modal-actions"><GlassButton type="button" onClick={() => setInviteOpen(false)}>Done</GlassButton><GlassButton variant="primary" onClick={rotateInvite} disabled={inviteBusy || !inviteCode}>{inviteBusy ? <ButtonLoader label="Rotating code…" /> : <><RefreshCw size={14} /> Rotate code</>}</GlassButton></div>
    </Modal>}
    {toast && <div className="toast glass-panel" role="status"><Check size={15} /> {toast}<button className="toast-close" onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
  </div>;
}

function NotFound() { return <AppFrame><div className="not-found glass-panel"><span className="section-kicker">NOT THIS WAY</span><h1>This page got lost.</h1><p>Let’s get you back to your team's spaces.</p><Link className="button button-primary" to="/dashboard">Back to workspace <ArrowRight size={15} /></Link></div></AppFrame>; }

function StudioHomeRoute() { const { session } = useSession(); return <StudioHome token={session.token} />; }
function FileEditorRoute() { const { session } = useSession(); return <FileEditor token={session.token} userId={session.user.id} />; }

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

function SiteNavigation({ session, privacy = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 20);
  const [activeAnchor, setActiveAnchor] = useState(privacy ? '' : 'about');

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => window.removeEventListener('scroll', updateScrollState);
  }, []);

  useEffect(() => {
    if (privacy || !('IntersectionObserver' in window)) return undefined;
    const sections = ['about', 'how-it-works'].map((sectionId) => document.getElementById(sectionId)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveAnchor(visible.target.id);
    }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.2, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [privacy]);

  const aboutHref = privacy ? '/#about' : '#about';
  const flowHref = privacy ? '/#how-it-works' : '#how-it-works';
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    const closeOnOutside = (event) => { if (!navRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
    };
  }, [menuOpen]);

  return <header ref={navRef} className={`landing-nav glass-panel${scrolled ? ' is-scrolled' : ''}${menuOpen ? ' menu-is-open' : ''}`}>
    <Brand />
    <button className="landing-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-primary-nav" onClick={() => setMenuOpen((open) => !open)}>
      {menuOpen ? <X size={18} /> : <Menu size={18} />}
    </button>
    <div className={`landing-nav-content${menuOpen ? ' nav-content-open' : ''}`}>
      <nav className="landing-nav-links" id="landing-primary-nav" aria-label="Primary">
        <a href={aboutHref} className={activeAnchor === 'about' ? 'is-active' : ''} aria-current={activeAnchor === 'about' ? 'location' : undefined} onClick={closeMenu}>About</a>
        <a href={flowHref} className={activeAnchor === 'how-it-works' ? 'is-active' : ''} aria-current={activeAnchor === 'how-it-works' ? 'location' : undefined} onClick={closeMenu}>How it works</a>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" onClick={closeMenu}>Repository <ArrowUpRight size={12} /></a>
      </nav>
      <div className="landing-nav-actions">
        <Link className="button landing-signin" to={privacy ? '/login' : (session ? '/dashboard' : '/login')} onClick={closeMenu}>{privacy || !session ? 'Sign in' : 'Open workspace'} <ArrowUpRight size={14} /></Link>
        <Link className="button button-primary landing-join" to={privacy ? '/register' : (session ? '/dashboard' : '/register')} onClick={closeMenu}>{privacy || !session ? 'Get started' : 'Go to rooms'} <ArrowRight size={14} /></Link>
      </div>
    </div>
  </header>;
}

const walkthroughScenes = [
  {
    title: 'CREATE A ROOM',
    heading: 'One room. Your whole team.',
    copy: 'Create a space and bring everyone in.',
  },
  {
    title: 'COLLABORATE LIVE',
    heading: 'Every idea, in sync.',
    copy: 'Write together and see changes appear.',
  },
  {
    title: 'REVISIT YOUR WORK',
    heading: 'Nothing gets lost.',
    copy: 'Review earlier versions when you need them.',
  },
];

function FlowWalkthrough({ onClose, exploreRoute }) {
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const elapsedRef = useRef(0);
  const closeButtonRef = useRef(null);
  const autoPausedRef = useRef(false);
  const finished = elapsed >= 7000;
  const sceneIndex = elapsed < 2000 ? 0 : elapsed < 5000 ? 1 : elapsed < 7000 ? 2 : 3;
  const scene = walkthroughScenes[sceneIndex];
  const note = 'Let’s make the next idea count.';
  const noteProgress = Math.max(0, Math.min(1, (elapsed - 2250) / 1900));
  const typedNote = note.slice(0, Math.floor(note.length * noteProgress));
  const restored = elapsed >= 6350;

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const focusable = document.querySelectorAll('.flow-walkthrough-dialog button:not(:disabled), .flow-walkthrough-dialog a[href]');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (isPaused || finished) return undefined;
    let frameId;
    let previousTime = performance.now();
    const tick = (now) => {
      const nextElapsed = Math.min(7000, elapsedRef.current + now - previousTime);
      previousTime = now;
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (nextElapsed < 7000) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPaused, finished]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && !isPaused && !finished) {
        autoPausedRef.current = true;
        setIsPaused(true);
      } else if (!document.hidden && autoPausedRef.current) {
        autoPausedRef.current = false;
        setIsPaused(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.hidden && !isPaused && !finished) {
      autoPausedRef.current = true;
      setIsPaused(true);
    }
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isPaused, finished]);

  const replay = () => {
    elapsedRef.current = 0;
    setElapsed(0);
    setIsPaused(false);
    autoPausedRef.current = false;
  };
  const togglePlayback = () => {
    autoPausedRef.current = false;
    setIsPaused((paused) => !paused);
  };
  const elapsedTenths = Math.floor(elapsed / 100) / 10;
  const progress = Math.min(100, (elapsed / 7000) * 100);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return <div className="flow-walkthrough-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`flow-walkthrough-dialog${reducedMotion ? ' reduced-motion' : ''}${isPaused ? ' is-paused' : ''}`} role="dialog" aria-modal="true" aria-labelledby="flow-walkthrough-title" aria-describedby="flow-walkthrough-copy">
      <button ref={closeButtonRef} className="flow-walkthrough-close" type="button" aria-label="Close walkthrough" onClick={onClose}><X size={18} /></button>
      <div className="flow-walkthrough-topline">
        <span className="flow-walkthrough-kicker"><i /> THE SYNKRO FLOW</span>
        <span className="flow-walkthrough-time">{finished ? 'COMPLETE' : `${elapsedTenths.toFixed(1)} / 7.0 SEC`}</span>
      </div>
      <div className="flow-progress-track" role="progressbar" aria-label="Walkthrough progress" aria-valuemin="0" aria-valuemax="7" aria-valuenow={elapsedTenths}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="flow-walkthrough-body">
        <div className="flow-demo-stage" aria-label="Animated product walkthrough">
          <div className={`flow-demo-scene scene-${sceneIndex}${finished ? ' is-finished' : ''}`} key={sceneIndex}>
            {sceneIndex === 0 && <div className="flow-demo-room">
              <div className="flow-demo-window-bar"><span>YOUR WORKSPACE</span><i /></div>
              <div className="flow-demo-room-name">Design Sprint</div>
              <div className="flow-demo-room-meta"><span>Shared room</span><span className="flow-demo-live"><i /> READY</span></div>
              <div className="flow-demo-avatars" aria-label="Three participants joining">
                <span className="mini-avatar avatar-olive">A</span><span className="mini-avatar avatar-lime">P</span><span className="mini-avatar avatar-violet">T</span>
              </div>
              <div className="flow-demo-room-footer"><Users size={12} /> Your team is here</div>
            </div>}
            {sceneIndex === 1 && <div className="flow-demo-editor">
              <div className="flow-demo-window-bar"><span>DESIGN SPRINT / NOTES</span><span className="flow-demo-sync"><i /> SYNCED</span></div>
              <div className="flow-demo-editor-title">Sprint notes</div>
              <div className="flow-demo-note"><span>{typedNote}</span><i className="flow-demo-caret" /></div>
              <div className="flow-demo-editor-bottom"><span className="mini-avatar avatar-olive">A</span><span className="flow-demo-cursor" /> <span className="mini-avatar avatar-lime">P</span><small>editing together</small></div>
            </div>}
            {sceneIndex === 2 && <div className={`flow-demo-history${restored ? ' is-restored' : ''}`}>
              <div className="flow-demo-window-bar"><span>VERSION HISTORY</span><History size={13} /></div>
              <div className="flow-demo-version"><span>08</span><b>Latest notes</b><small>NOW</small></div>
              <div className={`flow-demo-version earlier${elapsed >= 5350 ? ' is-selected' : ''}`}><span>07</span><b>Project outline</b><small>10:42</small></div>
              <div className="flow-demo-preview"><small>VERSION 07 PREVIEW</small><span>Launch with a focused first draft.</span></div>
              <div className="flow-demo-restored"><Check size={11} /> Back to Project outline</div>
            </div>}
            {finished && <div className="flow-demo-finish" aria-hidden="true"><span><Check size={20} /></span><small>ONE TEAM. ONE SHARED PAGE.</small></div>}
          </div>
        </div>

        <div className="flow-walkthrough-copy-block" aria-live="polite" aria-atomic="true">
          {finished ? <>
            <span className="flow-step-label">THE WHOLE FLOW</span>
            <h2 id="flow-walkthrough-title">That&apos;s Synkro.</h2>
            <p id="flow-walkthrough-copy">A calmer place to move good work forward.</p>
          </> : <>
            <span className="flow-step-label">0{sceneIndex + 1} <i /> {scene.title}</span>
            <h2 id="flow-walkthrough-title">{scene.heading}</h2>
            <p id="flow-walkthrough-copy">{scene.copy}</p>
          </>}
          <div className="flow-walkthrough-controls">
            {!finished && <button className="flow-control-button flow-play-button" type="button" onClick={togglePlayback} aria-label={isPaused ? 'Resume walkthrough' : 'Pause walkthrough'}>
              {isPaused ? <Play size={15} /> : <Pause size={15} />}<span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>}
            <button className="flow-control-button" type="button" onClick={replay}><RotateCcw size={15} /><span>Replay</span></button>
            {finished && <Link className="flow-explore-button" to={exploreRoute} onClick={onClose}>Explore workspace <ArrowRight size={14} /></Link>}
          </div>
          {isPaused && !finished && <span className="flow-paused-note">PAUSED</span>}
        </div>
      </div>
    </section>
  </div>;
}

const ribbonStrands = Array.from({ length: 26 }, (_, index) => index);

function LandingRibbon() {
  return <svg className="landing-signal" viewBox="0 0 1400 850" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="synkro-ribbon" x1="140" y1="760" x2="1290" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#C6F35B" stopOpacity="0" />
        <stop offset=".36" stopColor="#C6F35B" stopOpacity=".38" />
        <stop offset=".53" stopColor="#F1FFD0" stopOpacity=".95" />
        <stop offset=".74" stopColor="#B9ED71" stopOpacity=".7" />
        <stop offset="1" stopColor="#87C8B5" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="synkro-ribbon-core"><stop stopColor="#E8FFC1" stopOpacity=".75" /><stop offset=".27" stopColor="#C6F35B" stopOpacity=".32" /><stop offset="1" stopColor="#C6F35B" stopOpacity="0" /></radialGradient>
      <filter id="synkro-ribbon-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="15" /></filter>
    </defs>
    <ellipse className="landing-signal-core" cx="577" cy="476" rx="170" ry="135" fill="url(#synkro-ribbon-core)" />
    <g className="landing-signal-aura" stroke="url(#synkro-ribbon)" strokeWidth="13" filter="url(#synkro-ribbon-blur)">
      <path d="M-110 790C250 762 470 554 577 476C685 340 770 208 891 249C1030 296 1110 79 1490-110" />
      <path d="M-130 830C240 762 444 558 577 476C748 491 964 720 1500 862" />
    </g>
    <g className="landing-signal-upper" stroke="url(#synkro-ribbon)">
      {ribbonStrands.map((index) => <path key={`upper-${index}`} d={`M${-210 + index * 8} ${680 + index * 10}C${170 + index * 5} ${700 + index * 4} ${424 + index * 2} ${536 + index * 2} 577 476C${670 + index * 3} ${342 - index * 5} ${775 + index * 2} ${207 - index * 7} ${890 + index * 3} ${249 - index * 5}C${1025 + index * 3} ${298 - index * 6} ${1120 + index * 5} ${87 - index * 7} ${1430 + index * 8} ${-65 - index * 11}`} strokeWidth={index % 7 === 0 ? 1.7 : .7} opacity={index % 5 === 0 ? .95 : .5} />)}
    </g>
    <g className="landing-signal-lower" stroke="url(#synkro-ribbon)">
      {ribbonStrands.slice(0, 15).map((index) => <path key={`lower-${index}`} d={`M${-140 + index * 11} ${760 + index * 8}C${210 + index * 4} ${697 + index * 3} ${445 + index * 2} ${530 + index} 577 476C${740 + index * 7} ${466 + index * 8} ${943 + index * 8} ${713 + index * 5} ${1460 + index * 6} ${887 + index * 8}`} strokeWidth={index % 5 === 0 ? 1.5 : .7} opacity={index % 4 === 0 ? .8 : .4} />)}
    </g>
    <path className="landing-signal-trace" d="M-110 790C250 762 470 554 577 476C685 340 770 208 891 249C1030 296 1110 79 1490-110" stroke="#F1FFD0" strokeWidth="2.4" />
    <path className="landing-signal-trace landing-signal-trace-lower" d="M-130 830C240 762 444 558 577 476C748 491 964 720 1500 862" stroke="#E4FFB2" strokeWidth="1.9" />
  </svg>;
}

function DesktopFlowPreview({ paused, onTogglePause }) {
  return <div className="desktop-flow-preview" aria-label="Animated illustration of a Synkro room: one teammate writes, another comments, and the shared page updates">
    <div className="desktop-flow-top"><span><span className="desktop-flow-brand"><Radio size={13} /></span> Synkro <span className="desktop-flow-separator">/</span> Design sprint</span><span className="desktop-flow-live"><i /> ROOM LIVE</span></div>
    <div className="desktop-flow-heading"><div><span className="desktop-flow-kicker">SHARED WORKSPACE · 02 PEOPLE HERE</span><h2>Ideas in motion</h2></div><span className="desktop-flow-progress">All changes saved <Check size={13} /></span></div>
    <div className="desktop-flow-map">
      <svg viewBox="0 0 600 270" preserveAspectRatio="none" aria-hidden="true">
        <path className="desktop-flow-path" d="M128 135H208C233 135 229 76 262 76H345M208 135C234 135 230 202 262 202H345M453 76H476C500 76 489 135 522 135H546M453 202H476C500 202 489 135 522 135H546" />
        <path className="desktop-flow-pulse" d="M128 135H208C233 135 229 76 262 76H345M453 76H476C500 76 489 135 522 135H546" />
        <path className="desktop-flow-pulse desktop-flow-pulse-second" d="M128 135H208C234 135 230 202 262 202H345M453 202H476C500 202 489 135 522 135H546" />
      </svg>
      <div className="desktop-flow-node desktop-flow-room"><span className="desktop-flow-node-icon"><Users size={16} /></span><small>ROOM</small><strong>Design sprint</strong><span>Shared space opened</span></div>
      <div className="desktop-flow-node desktop-flow-writing"><span className="desktop-flow-node-icon"><PenLine size={16} /></span><small>WRITING</small><strong>Alex edits the note</strong><span>Drafting the first idea</span></div>
      <div className="desktop-flow-node desktop-flow-comment"><span className="desktop-flow-node-icon"><MessageSquare size={16} /></span><small>COMMENT</small><strong>Priya adds context</strong><span>“Let's set a milestone.”</span></div>
      <div className="desktop-flow-node desktop-flow-synced"><span className="desktop-flow-node-icon"><Check size={16} /></span><small>LIVE</small><strong>Everyone in sync</strong><span>One page, updated</span></div>
    </div>
    <div className="desktop-flow-bottom"><span><span className="desktop-flow-activity-dot" /> Changes appear for everyone in the room</span><div className="desktop-flow-avatars"><i>A</i><i>P</i><span>2 editing</span></div></div>
    <button className="desktop-flow-pause" type="button" onClick={onTogglePause} aria-label={paused ? 'Play landing animation' : 'Pause landing animation'}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>
  </div>;
}

function LandingPage() {
  const { session } = useSession();
  const [motionPaused, setMotionPaused] = useState(false);
  const [activeFlow, setActiveFlow] = useState(0);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const walkthroughTriggerRef = useRef(null);
  const closeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    requestAnimationFrame(() => walkthroughTriggerRef.current?.focus());
  }, []);

  const flowCards = [
    {
      step: '01',
      icon: <Users size={17} />,
      title: 'Bring everyone into one room',
      description: 'Create a shared space for your project, study session, or next big idea.',
      hint: 'Create or join',
      route: session ? '/dashboard' : '/register',
      kind: 'room',
    },
    {
      step: '02',
      icon: <Wifi size={17} />,
      title: 'Work together, in real time',
      description: 'Write on one shared page. Changes appear for everyone, so your ideas never fall out of sync.',
      hint: 'Open notes',
      route: session ? '/dashboard' : '/register',
      kind: 'sync',
    },
    {
      step: '03',
      icon: <History size={17} />,
      title: 'Every idea has a history',
      description: 'Review previous versions, understand what changed, and restore an earlier note whenever you need it.',
      hint: 'Review history',
      route: session ? '/dashboard' : '/register',
      kind: 'history',
    },
  ];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const page = document.querySelector('.landing-page:not(.privacy-page)');
    if (!page) return undefined;
    const items = page.querySelectorAll('.landing-hero-copy, .landing-hero-art, .landing-intro, .how-section, .how-heading, .flow-stage, .landing-manifesto, .landing-cta, .site-footer');
    // Keep the initial viewport visible while later sections still reveal on scroll.
    const belowFold = Array.from(items).filter((item) => {
      const bounds = item.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
        item.classList.add('is-visible');
        return false;
      }
      return true;
    });
    page.classList.add('has-reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    belowFold.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      page.classList.remove('has-reveal');
      items.forEach((item) => item.classList.remove('is-visible'));
    };
  }, []);

  const moveSpotlight = (event) => {
    const card = event.target.closest('.landing-intro, .how-card, .foundation-card, .landing-stack');
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
    card.style.setProperty('--my', `${event.clientY - bounds.top}px`);
  };

  return <main className="landing-page" onMouseMove={moveSpotlight}>
    <SiteNavigation session={session} />

    <section className={`landing-hero${motionPaused ? ' motion-paused' : ''}`} id="about">
      <LandingRibbon />
      <div className="landing-hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> A SHARED SPACE FOR GOOD WORK</div><h1 className="hero-mobile-title">Your team's notes,<br /><span>all in sync.</span></h1><h1 className="hero-desktop-title">Shared notes.<br /><span>In sync.</span></h1><p>Synkro brings your people into one calm workspace. <span className="hero-copy-accent">Write together</span>, see who's around, and keep every good idea within reach.</p><div className="landing-hero-actions"><Link className="button button-primary" to={session ? '/dashboard' : '/register'}>Make a room <ArrowRight size={16} /></Link><a className="landing-learn-link" href="#how-it-works">See how it works <ArrowDown size={14} /></a></div><div className="landing-trust-line"><span className="status-dot" /> Private rooms <i /> Live presence <i /> Saved history</div></div>
      <div className="landing-hero-art hero-showcase" aria-label="Animated preview of a shared Synkro workspace">
        <DesktopFlowPreview paused={motionPaused} onTogglePause={() => setMotionPaused((paused) => !paused)} />
        <div className="showcase-browser">
          <div className="showcase-topbar">
            <div className="showcase-window-controls" aria-hidden="true"><i /><i /><i /></div>
            <div className="showcase-tab"><span className="showcase-tab-mark"><PenLine size={11} /></span> Design sprint</div>
            <span className="showcase-topbar-lock"><LockKeyhole size={12} /> Private room</span>
          </div>
          <div className="showcase-content">
            <aside className="showcase-sidebar">
              <div className="showcase-workspace"><span><Users size={14} /></span> Team space <ChevronDown size={12} /></div>
              <div className="showcase-sidebar-label">YOUR ROOMS</div>
              <div className="showcase-room selected"><PenLine size={13} /> Design sprint <span>2</span></div>
              <div className="showcase-room"><PenLine size={13} /> Team notes</div>
              <div className="showcase-room"><Plus size={13} /> New room</div>
              <div className="showcase-sidebar-presence"><span className="showcase-avatar avatar-a">A</span><span className="showcase-avatar avatar-p">P</span><span>2 teammates</span></div>
            </aside>
            <div className="showcase-editor">
              <div className="showcase-editor-bar"><span className="showcase-editor-label">DESIGN SPRINT · SHARED NOTE</span><div className="showcase-editor-actions"><span className="showcase-avatar avatar-a">A</span><span className="showcase-avatar avatar-p">P</span><span className="showcase-editing-label">2 editing</span><MoreHorizontal size={15} /></div></div>
              <div className="showcase-page">
                <span className="showcase-page-label">DESIGN SPRINT <span>·</span> SHARED NOTES</span>
                <h2>Ideas, made together.</h2>
                <p className="showcase-intro">One shared page for the plan, the conversation, and every next step.</p>
                <div className="showcase-rule" />
                <h3>What should we make together?</h3>
                <p className="showcase-typed-line">Let's bring every idea into one place: <span className="showcase-typed-phrase">then shape the plan together<span className="showcase-caret" /></span><span className="showcase-inline-name">Priya</span></p>
                <p className="showcase-typed-line showcase-second-edit"><span className="showcase-selection">I'll add a first draft for us to refine.</span><span className="showcase-inline-name">Alex</span></p>
                <div className="showcase-comment"><span className="showcase-avatar avatar-p">P</span><span><b>Priya added a comment</b><small>“Let’s add the first milestone here.”</small></span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="showcase-caption"><span><Radio size={13} /> One shared page, always in sync</span><span>ROOM · NOTES · COMMENTS</span></div>
      </div>
      <a className="scroll-cue" href="#how-it-works"><span>SCROLL TO EXPLORE</span><ArrowDown size={13} /></a>
    </section>

    <section className="landing-intro glass-panel" id="what-it-does"><div className="landing-system-strip" aria-label="What stays together in a Synkro room"><span>ONE ROOM, EVERY PART OF THE CONVERSATION</span><div><span><Users size={18} /> Rooms</span><span><PenLine size={18} /> Notes</span><span><Radio size={18} /> Presence</span><span><MessageSquare size={18} /> Comments</span><span><History size={18} /> History</span></div></div><div className="intro-index">01 <span>—</span> THE IDEA</div><div className="intro-content"><h2>Less passing files.<br /><span>More making progress.</span></h2><p>Teams often end up with notes scattered across chats and documents. Synkro gives a room one shared page, so everyone can follow the same thread, contribute as ideas arrive, and revisit earlier versions when plans change.</p></div><div className="intro-stamp"><span>MADE FOR</span><b>TEAMS<br />IN SYNC</b><i>✳</i></div></section>

    <section className="how-section" id="how-it-works">
      <svg className="how-flow-ribbon" viewBox="0 0 1200 420" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M-80 375C190 390 291 225 489 202S814 105 1270-50" /><path d="M-80 399C190 411 310 250 505 222S834 136 1270-18" /><path d="M-80 350C181 362 281 207 471 179S799 77 1270-77" /></svg>
      <div className="how-heading">
        <div className="how-heading-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> THE FLOW</div>
          <div className="how-heading-title-row">
            <h2>Simple by design.<br /><span>Better together.</span></h2>
            <button ref={walkthroughTriggerRef} className="flow-launch-button" type="button" onClick={() => setWalkthroughOpen(true)}>
              <Play size={13} fill="currentColor" /> <span>See how it works</span><small>7 sec</small>
            </button>
          </div>
        </div>
        <div className="how-heading-actions">
          <p>From the first room to the final revision, your team stays in sync without getting in the way.</p>
        </div>
      </div>

      <FlowStage cards={flowCards} active={activeFlow} onSelect={setActiveFlow} LinkComponent={Link} />
      {walkthroughOpen && <FlowWalkthrough onClose={closeWalkthrough} exploreRoute={session ? '/dashboard' : '/register'} />}
    </section>

    <section className="landing-manifesto" aria-labelledby="manifesto-title"><span>THE WORK FEELS BETTER TOGETHER</span><h2 id="manifesto-title">One room for the ideas<br /><em>you make together.</em></h2><span className="landing-manifesto-mark" aria-hidden="true"><Radio size={27} /></span></section>

    <section className="landing-cta glass-panel">
      <div className="cta-orbit cta-orbit-left" aria-hidden="true" />
      <div className="cta-orbit cta-orbit-right" aria-hidden="true" />
      <span className="cta-star cta-star-1" aria-hidden="true" /><span className="cta-star cta-star-2" aria-hidden="true" /><span className="cta-star cta-star-3" aria-hidden="true" /><span className="cta-star cta-star-4" aria-hidden="true" /><span className="cta-star cta-star-5" aria-hidden="true" /><span className="cta-star cta-star-6" aria-hidden="true" /><span className="cta-star cta-star-7" aria-hidden="true" /><span className="cta-star cta-star-8" aria-hidden="true" /><span className="cta-star cta-star-9" aria-hidden="true" />
      <div className="cta-chip cta-chip-left" aria-hidden="true"><span className="cta-chip-avatar">JS</span><span>Product Brief</span><svg className="cta-cursor" viewBox="0 0 18 22"><path d="M2 1.5v15l4.1-3.8 2.4 6.1 2.5-1-2.5-5.8 5.7-.4L2 1.5Z" /></svg></div>
      <div className="cta-chip cta-chip-right" aria-hidden="true"><span className="cta-chip-avatar">MK</span><span>Notes</span><svg className="cta-cursor" viewBox="0 0 18 22"><path d="M2 1.5v15l4.1-3.8 2.4 6.1 2.5-1-2.5-5.8 5.7-.4L2 1.5Z" /></svg></div>
      <div className="cta-earth" aria-hidden="true" />
      <span className="section-kicker">START WITH ONE ROOM</span>
      <h2>Make room for<br /><span>what's next.</span></h2>
      <p>Bring your team together around one shared page.</p>
      <Link className="button button-primary" to={session ? '/dashboard' : '/register'}>{session ? 'Open your workspace' : 'Create your account'} <ArrowRight size={15} /></Link>
      <span className="cta-spark" aria-hidden="true">✳</span>
    </section>
    <SiteFooter />
  </main>;
}

function PrivacyPage() {
  return <main className="landing-page privacy-page">
    <SiteNavigation privacy />
    <article className="privacy-document glass-panel"><div className="eyebrow"><span className="eyebrow-line" /> THE IMPORTANT DETAILS</div><h1>Privacy, in plain words.</h1><p className="privacy-intro">Synkro is designed to keep team notes inside the rooms where they belong. This page explains what the frontend sends and what happens in the current app.</p><div className="privacy-updated">PROJECT PRIVACY NOTICE <i /> LAST UPDATED OCTOBER 9, 2026</div>
      <section><h2><LockKeyhole size={16} /> Account information</h2><p>When you register or sign in, Synkro sends your name, email address, and password to the configured application server so it can create or check your account. Password handling and account storage are managed by that server. The frontend does not save your password.</p></section>
      <section><h2><PenLine size={16} /> Notes and rooms</h2><p>Room names, invite codes, note text, revision history, and collaboration events are sent to the application server when you use those features. The project is designed to store workspace data in MongoDB Atlas. Room access is intended for authenticated members; invite codes should be shared only with people you want to join.</p></section>
      <section><h2><KeyRound size={16} /> Sign-in session</h2><p>The current frontend keeps the session token in memory for the open page. It is not written to local storage. Reloading the page signs you out, and you need to sign in again. Sign out asks the server to revoke the active session and clears the frontend session.</p></section>
      <section><h2><Globe2 size={16} /> Network and service providers</h2><p>The browser communicates with the backend URL configured for the app over HTTP and Socket.IO; production deployments should use HTTPS and secure WebSockets. Choosing Google or GitHub sign-in sends you to that provider, which shares verified identity information with Synkro. The page also loads DM Sans, Manrope, and DM Mono fonts from Google Fonts, so opening the site makes a font request to Google. See Google's privacy information for how it handles those requests.</p><a className="privacy-external" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy information <ArrowUpRight size={13} /></a></section>
      <section><h2><Database size={16} /> Analytics and your choices</h2><p>The frontend does not include an analytics or advertising SDK. You can leave a room or sign out at any time. Ask the project maintainers through the <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">repository</a> about data access or removal. Data retention and deletion are handled by the service operator.</p></section>
      <div className="privacy-caveat"><ShieldCheck size={15} /><p>This is a project privacy notice, not legal advice. The service operator should update it if hosting, storage, analytics, or account practices change.</p></div>
      <Link className="button button-glass privacy-back" to="/"> <ArrowLeft size={14} /> Back to Synkro</Link>
    </article>
    <SiteFooter />
  </main>;
}

export default function App() {
  return <ThemeProvider><AuthContext>{IS_ANDROID && <Suspense fallback={null}><NativeBridge /></Suspense>}<Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/register" element={<AuthPage register />} />
    <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
    <Route path="/dashboard" element={<Protected><AppFrame><Dashboard /></AppFrame></Protected>} />
    <Route path="/join/:inviteCode" element={<InviteJoinRoute />} />
    <Route path="/rooms/:roomId" element={<Protected><AppFrame><RoomPage /></AppFrame></Protected>} />
    <Route path="/studio" element={<Protected><AppFrame><StudioHomeRoute /></AppFrame></Protected>} />
    <Route path="/studio/:roomId/:fileId" element={<Protected><AppFrame><FileEditorRoute /></AppFrame></Protected>} />
    <Route path="*" element={<NotFound />} />
  </Routes></AuthContext></ThemeProvider>;
}
