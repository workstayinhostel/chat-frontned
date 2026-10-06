import { createRoot } from 'react-dom/client'; import './index.css'; import App from './App';
import { ThemeProvider } from './context/ThemeContext.jsx';
createRoot(document.getElementById('root')).render(<ThemeProvider><App /></ThemeProvider>); // no StrictMode: avoids double getUserMedia/WebSocket in dev
