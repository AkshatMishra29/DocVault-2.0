import React from 'react';
import DocVaultLogo from '../DocVaultLogo/DocVaultLogo';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DocVault ErrorBoundary] Uncaught UI error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('docvault_user');
      localStorage.removeItem('docvault_token');
      localStorage.removeItem('token');
    } catch (e) {
      console.warn('Failed clearing session storage:', e);
    }
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF8F5',
          color: '#1C1310',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            padding: '36px 28px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
              <DocVaultLogo height={42} />
            </div>

            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Application Recovery
            </h2>
            <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.6, marginBottom: '24px' }}>
              DocVault encountered an unexpected display issue. Your vault data and encryption keys remain completely secure.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: '10px',
                  background: '#FD2B06',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  border: '1px solid #E5E7EB',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Home size={16} />
                <span>Reset Session & Go to Home</span>
              </button>
            </div>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <details style={{ marginTop: '20px', textAlign: 'left', fontSize: '11px', color: '#ef4444', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Error Details (Dev)</summary>
                <pre style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.toString()}
                  {'\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

