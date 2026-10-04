import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const usernameValue = value => `@${value.replace(/^@+/, '')}`;
const usernameForApi = value => value.replace(/^@+/, '').trim();

function BrandPanel() {
  return <section className="auth-brand">
    <a className="brand-lockup" href="#" aria-label="Metufy home">
      <span className="brand-mark">m</span>
      <span>metufy</span>
    </a>
    <div className="brand-copy">
      <span className="eyebrow"><i /> PRIVATE BY DESIGN</span>
      <h1>Chat securely<br />with anyone.</h1>
      <p>Your conversations, calls and moments — all in one calm, private space.</p>
    </div>
    <div className="chat-preview" aria-hidden="true">
      <div className="preview-top"><span className="preview-avatar">J</span><span><b>Jamie Parker</b><small><i /> Online now</small></span><span className="preview-call">⌕</span></div>
      <div className="preview-day">TODAY</div>
      <div className="preview-message">Hey! Made it home safely ✨<small>10:42 AM</small></div>
      <div className="preview-message preview-message-out">Glad to hear it. Talk soon!<small>10:43 AM&nbsp; ✓✓</small></div>
      <div className="preview-composer"><span>Write a message…</span><b>↑</b></div>
    </div>
    <div className="brand-foot"><span>🔒</span> Your conversations stay yours.</div>
  </section>;
}

function AuthLayout({ children }) {
  return <main className="auth-page">
    <div className="auth-shell">
      <BrandPanel />
      <section className="auth-form-panel">{children}</section>
    </div>
    <footer className="auth-legal">A more thoughtful way to stay close <span>·</span> Private, always</footer>
  </main>;
}

function UsernameField({ value, onChange, onKeyDown }) {
  return <label className="auth-field">
    <span>Username</span>
    <input autoComplete="username" autoCapitalize="none" spellCheck="false" autoFocus
      placeholder="@yourname" value={usernameValue(value)} onChange={e => onChange(usernameForApi(e.target.value))}
      onKeyDown={onKeyDown} />
  </label>;
}

export function Auth({ onAuth }) {
  const button = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('username');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '192116891249-ep7mleva1ubuvqmbulgdfq0h563vdbt8.apps.googleusercontent.com';

  const verifyUsername = async () => {
    const normalized = usernameForApi(username);
    if (!normalized) {
      setErr('Enter your username to continue.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const result = await api('/auth/check-username', { method: 'POST', body: { username: normalized } });
      if (!result.exists) {
        setErr('No account was found with that username.');
        return;
      }
      setStep('password');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    if (!username.trim()) {
      setErr('Enter your username to continue.');
      return;
    }
    if (!password) {
      setErr('Enter your password.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const result = await api('/auth/login', { method: 'POST', body: { username: usernameForApi(username), password } });
      onAuth(result.token, result.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!clientId) {
      setErr('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in the frontend build environment.');
      return;
    }

    let active = true;
    let script;
    const initialize = () => {
      const identity = window.google?.accounts?.id;
      if (!active || !identity || !button.current) return;
      identity.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          if (!credential) {
            setErr('Google did not return a sign-in credential.');
            return;
          }
          setBusy(true);
          setErr('');
          try {
            const result = await api('/auth/google', { method: 'POST', body: { credential } });
            onAuth(result.token, result.user);
          } catch (e) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }
      });
      identity.renderButton(button.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 360 });
    };

    const scriptUrl = 'https://accounts.google.com/gsi/client';
    const onError = () => setErr('Google sign-in could not load. Check your network connection.');
    script = document.querySelector(`script[src="${scriptUrl}"]`);
    if (window.google?.accounts?.id) {
      initialize();
    } else {
      const shouldAppend = !script;
      if (!script) {
        script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;
      }
      script.addEventListener('load', initialize);
      script.addEventListener('error', onError);
      if (shouldAppend) document.head.appendChild(script);
    }

    return () => {
      active = false;
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', onError);
    };
  }, [clientId, onAuth]);

  return <AuthLayout>
    <div className="auth-form-heading">
      <span className="auth-mobile-brand">metufy</span>
      <span className="eyebrow">WELCOME BACK</span>
      <h2>{step === 'username' ? 'Good to see you.' : 'Welcome back.'}</h2>
      <p>{step === 'username' ? 'Sign in to pick up where you left off.' : `Signing in as ${usernameValue(username)}`}</p>
    </div>
    <div className="auth-fields">
      {step === 'username'
        ? <UsernameField value={username} onChange={value => { setUsername(value); setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifyUsername(); } }} />
        : <>
          <button className="auth-back" onClick={() => { setStep('username'); setPassword(''); setErr(''); }}>← Change username</button>
          <label className="auth-field"><span>Password</span>
            <input type="password" autoComplete="current-password" autoFocus placeholder="Enter your password"
              value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && login()} />
          </label>
        </>}
      {err && <p className="auth-error" role="alert">{err}</p>}
      {step === 'username'
        ? <button className="auth-primary" disabled={busy} onClick={verifyUsername}>{busy ? 'Checking…' : 'Continue'} <span>→</span></button>
        : <button className="auth-primary" disabled={busy} onClick={login}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button>}
      <div className="auth-divider"><span /> <small>OR CONTINUE WITH</small> <span /></div>
      <div className="google-button" ref={button} aria-label="Continue with Google" />
      <p className="auth-note">Secure sign-in protected by Google</p>
    </div>
    <p className="auth-terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
  </AuthLayout>;
}

export function Setup({ user, onDone }) {
  const [f, setF] = useState({ username: '', displayName: user.displayName || '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ch = key => e => {
    const value = key === 'username' ? usernameForApi(e.target.value) : e.target.value;
    setF({ ...f, [key]: value });
    setErr('');
  };
  const save = async () => {
    if (!f.username.trim() || !f.password) {
      setErr('Choose a username and create a password to finish setting up your account.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      onDone((await api('/auth/setup', { method: 'POST', body: f })).user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout>
    <div className="auth-form-heading">
      <span className="auth-mobile-brand">metufy</span>
      <span className="eyebrow">ONE LAST STEP</span>
      <h2>Make it yours.</h2>
      <p>Choose a unique username and password for your Metufy account.</p>
    </div>
    <div className="auth-fields">
      <UsernameField value={f.username} onChange={value => setF({ ...f, username: value })} />
      <label className="auth-field"><span>Display name</span><input autoComplete="name" placeholder="How should we call you?" value={f.displayName} onChange={ch('displayName')} /></label>
      <label className="auth-field"><span>Create a password</span><input type="password" autoComplete="new-password" placeholder="At least 12 characters" value={f.password} onChange={ch('password')} /></label>
      {err && <p className="auth-error" role="alert">{err}</p>}
      <button className="auth-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Create account'} <span>→</span></button>
    </div>
    <p className="auth-terms">Your username must be unique. You can share it with people you want to reach.</p>
  </AuthLayout>;
}
