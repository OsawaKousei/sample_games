import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import DebugMenu from './DebugMenu.jsx';
import { parseDebugPath } from './debug.js';
import '../../arcade.css';
import './style.css';
const entry = parseDebugPath(window.location.pathname);
createRoot(document.getElementById('root')).render(<React.StrictMode>{entry?.index ? <DebugMenu invalid={entry.invalid} /> : <App entry={entry} />}</React.StrictMode>);
