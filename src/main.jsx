import { Component, Fragment } from 'react'; import { createRoot } from 'react-dom/client'; import './index.css'; import App from './App';
import { ThemeProvider } from './context/ThemeContext.jsx';

class AppErrorBoundary extends Component {
  state = { error: null, resetKey: 0, recoveredAutomatically: false };

  static getDerivedStateFromError(error) {
    return { error: error?.message || 'Unknown rendering error.' };
  }

  componentDidCatch(error, info) {
    console.error('The app encountered an unexpected rendering error:', error, info);
    if (!this.state.recoveredAutomatically) {
      this.setState(state => ({
        error: null,
        resetKey: state.resetKey + 1,
        recoveredAutomatically: true
      }));
    }
  }

  retry = () => {
    this.setState(state => ({ error: null, resetKey: state.resetKey + 1 }));
  }

  render() {
    if (this.state.error) {
      return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, background: '#0b1020', color: '#fff', textAlign: 'center' }}>
        <h1>Metufy hit a temporary problem</h1>
        <p>Your saved login is unchanged. Reconnect to reload your chats without restarting the app.</p>
        <code style={{ maxWidth: 600, overflowWrap: 'anywhere', color: '#ffb5b5' }}>{this.state.error}</code>
        <button type="button" onClick={this.retry}>Reconnect</button>
      </main>;
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>
); // no StrictMode: avoids double getUserMedia/WebSocket in dev
