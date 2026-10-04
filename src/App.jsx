import { useEffect, useState } from 'react'; import { api, tok } from './api';
import { Auth, Setup } from './Auth'; import Chat from './Chat';
export default function App() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [loadError, setLoadError] = useState('');
  const loadUser = () => {
    setReady(false);
    setLoadError('');
    (tok() ? api('/me').then(setUser).catch(error => {
      if (error.status === 401) {
        sessionStorage.clear();
        setUser(null);
      } else {
        setLoadError(error.message || 'Cannot connect to the chat server.');
      }
    }) : Promise.resolve()).finally(() => setReady(true));
  };
  useEffect(() => { loadUser(); }, []);
  useEffect(() => {
    const expire = () => {
      sessionStorage.clear();
      setUser(null);
    };
    const checkExpiry = () => {
      clearTimeout(timer);
      const token = tok();
      if (!token) return;
      try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
        if (typeof claims.exp !== 'number') throw new Error('Invalid session expiry');
        const remaining = claims.exp * 1000 - Date.now();
        if (remaining <= 0) {
          expire();
          return;
        }
        timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
      } catch {
        expire();
      }
    };
    let timer = setTimeout(checkExpiry, 0);
    const onAuthExpired = () => expire();
    window.addEventListener('auth-expired', onAuthExpired);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('auth-expired', onAuthExpired);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [user]);
  if (!ready) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Connecting to chat…</main>;
  if (loadError) return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-100">
    <section className="max-w-md space-y-3 text-center">
      <h1 className="text-xl font-bold">Chat server unavailable</h1>
      <p role="alert" className="text-red-300">{loadError}</p>
      <button onClick={loadUser} className="rounded-lg bg-indigo-600 px-4 py-2">Try again</button>
    </section>
  </main>;
  if (!user) return <Auth onAuth={(t, u) => { sessionStorage.setItem('t', t); setUser(u); }} />;
  if (!user.username) return <Setup user={user} onDone={setUser} />;
  return <Chat user={user} setUser={setUser} logout={() => { sessionStorage.clear(); setUser(null); }} />;
}
