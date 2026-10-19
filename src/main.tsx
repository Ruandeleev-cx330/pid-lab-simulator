import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');

// Intentionally no <React.StrictMode>: its development double-mount would create
// and destroy a second simulation session (two headless challenge validations per
// entry). All modules are side-effect free, so the checks it offers are covered by
// the automated test suite instead.
createRoot(container).render(<App />);
