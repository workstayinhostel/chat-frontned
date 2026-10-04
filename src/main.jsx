import { createRoot } from 'react-dom/client'; import './index.css'; import App from './App';
createRoot(document.getElementById('root')).render(<App />); // no StrictMode: avoids double getUserMedia/WebSocket in dev
