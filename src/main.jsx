import { Component } from 'react'; import { createRoot } from 'react-dom/client'; import './index.css'; import App from './App';
import { ThemeProvider } from './context/ThemeContext.jsx';

class AppErrorBoundary extends Component {
  state = { hasError: false };

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleWindowError = event => {
    console.error('The app encountered an uncaught browser error:', event.error || event.message);
    this.setState({ hasError: true });
  };

  handleUnhandledRejection = event => {
    console.error('The app encountered an unhandled asynchronous error:', event.reason);
    this.setState({ hasError: true });
  };

  componentDidCatch(error, info) {
    console.error('The app encountered an unexpected rendering error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, background: '#0b1020', color: '#fff', textAlign: 'center' }}>
        <h1>Metufy needs to reload</h1>
        <p>An unexpected app error occurred. Your saved login is unchanged.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload app</button>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>
); // no StrictMode: avoids double getUserMedia/WebSocket in dev
