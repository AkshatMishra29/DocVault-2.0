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
      localStorage.clear();
    } catch (e) {
      console.warn('Failed clearing storage:', e);
    }
    window.location.href = '/login';
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
                  background: '#0070F2',
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
                  color: '#4B5563',
                  border: '1px solid #E5E7EB',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Home size={16} />
                <span>Clear Session & Sign In</span>
              </button>
            </div>

            {this.state.error && (
              <div style={{
                marginTop: '20px',
                textAlign: 'left',
                fontSize: '12px',
                color: '#991B1B',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                padding: '14px',
                borderRadius: '8px',
                maxHeight: '220px',
                overflowY: 'auto'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Diagnostic Trace:</div>
                <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.error?.message || String(this.state.error)}
                </div>
                {this.state.errorInfo?.componentStack && (
                  <pre style={{ marginTop: '8px', fontSize: '11px', color: '#6B7280', whiteSpace: 'pre-wrap' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

