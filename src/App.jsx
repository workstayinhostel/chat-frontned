import { useEffect, useState } from 'react'; import { api, tok } from './api';
import { Auth, Setup } from './Auth'; import Chat from './Chat';
export default function App() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState(() => window.location.hash === '#/chat' ? 'chat' : 'login');
  const navigate = nextRoute => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${nextRoute}`);
    setRoute(nextRoute);
  };
  const loadUser = () => {
    setReady(false);
    setLoadError('');
    api('/me').then(profile => {
      setUser(profile);
      navigate(profile.username ? 'chat' : 'setup');
    }).catch(error => {
      if (error.status === 401) {
        sessionStorage.clear();
        setUser(null);
        navigate('login');
      } else {
        setLoadError(error.message || 'Cannot connect to the chat server.');
      }
    }).finally(() => setReady(true));
  };
  useEffect(() => { loadUser(); }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const updateViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height || window.innerHeight;
        const top = viewport?.offsetTop || 0;
        const keyboardOpen = window.innerHeight - height > 120;
        document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
        document.documentElement.style.setProperty('--app-viewport-top', `${top}px`);
        document.documentElement.style.setProperty(
          '--app-composer-bottom-inset',
          keyboardOpen ? '0px' : 'env(safe-area-inset-bottom)'
        );
      });
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      document.documentElement.style.removeProperty('--app-viewport-height');
      document.documentElement.style.removeProperty('--app-viewport-top');
      document.documentElement.style.removeProperty('--app-composer-bottom-inset');
    };
  }, []);
  useEffect(() => {
    const expire = () => {
      sessionStorage.clear();
      setUser(null);
      navigate('login');
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
  if (!user || route === 'login') return <Auth onAuth={(t, u) => {
    sessionStorage.setItem('t', t);
    setUser(u);
    navigate(u.username ? 'chat' : 'setup');
  }} />;
  if (!user.username || route === 'setup') return <Setup user={user} onDone={profile => {
    setUser(profile);
    navigate('chat');
  }} />;
  return <Chat user={user} setUser={setUser} logout={() => {
    sessionStorage.clear();
    setUser(null);
    navigate('login');
  }} />;
}
