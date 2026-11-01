import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import './styles/index.css';

// Enforce signature editorial theme
document.documentElement.setAttribute('data-theme', 'light');
localStorage.removeItem('docvault_theme');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
