import { Component } from 'react'; import { createRoot } from 'react-dom/client'; import './index.css'; import App from './App';
import { ThemeProvider } from './context/ThemeContext.jsx';

class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error?.message || 'Unknown rendering error.' };
  }

  componentDidCatch(error, info) {
    console.error('The app encountered an unexpected rendering error:', error, info);
  }

  render() {
    if (this.state.error) {
      return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, background: '#0b1020', color: '#fff', textAlign: 'center' }}>
        <h1>Metufy needs to reload</h1>
        <p>The interface encountered a rendering error. Your saved login is unchanged.</p>
        <code style={{ maxWidth: 600, overflowWrap: 'anywhere', color: '#ffb5b5' }}>{this.state.error}</code>
        <button type="button" onClick={() => window.location.reload()}>Reload app</button>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>
); // no StrictMode: avoids double getUserMedia/WebSocket in dev
