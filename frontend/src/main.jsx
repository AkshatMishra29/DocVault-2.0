import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import './styles/index.css';

// Initialize theme from storage or system preference
const savedTheme = localStorage.getItem('docvault_theme') || 'dark';
const initialTheme = savedTheme === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : savedTheme;
document.documentElement.setAttribute('data-theme', initialTheme);
document.documentElement.classList.add(`theme-${initialTheme}`);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
