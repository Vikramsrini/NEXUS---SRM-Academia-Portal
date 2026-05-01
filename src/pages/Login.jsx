import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { API_BASE } from '../lib/api';
import './Login.css';

const ThemeIcon = ({ theme }) => theme === 'dark' ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);

const MobileIcons = {
  install: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  share: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

export default function Login() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallSuggestion, setShowInstallSuggestion] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check for existing session on mount
    if (localStorage.getItem('academia_token')) {
      navigate('/dashboard', { replace: true });
    }

    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (mobile && !isStandalone) {
      setShowInstallSuggestion(true);
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setIsIOS(true);
      }
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [navigate]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallSuggestion(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your SRM Net ID and password');
      return;
    }

    setLoading(true);
    setError('');

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Login failed');
      }

      if (data.requiresCaptcha) {
        setError('SRM requested HIP verification (captcha). Try again after opening SRM Academia once in browser, then retry here.');
        setLoading(false);
        return;
      }

      localStorage.setItem('academia_token', data.token);
      localStorage.setItem('academia_student', JSON.stringify(data.student_data));
      localStorage.setItem('academia_login_time', new Date().toISOString());
      localStorage.setItem('academia_netid', username.trim());
      localStorage.setItem('academia_password', btoa(password)); // Simple obfuscation for local storage

      setTimeout(() => {
        navigate('/dashboard');
      }, 800);
    } catch (err) {
      const rawMessage = err.message || 'Login failed. Please check your credentials.';
      if (/hip required|captcha/i.test(rawMessage)) {
        setError('SRM requested HIP verification (captcha). Open SRM Academia once in browser and complete login there, then retry here.');
      } else {
        setError(rawMessage);
      }
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg" />

      <div className="login-card">
        <div className="login-top-actions">
          <button className="login-action-btn theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            <ThemeIcon theme={theme} />
          </button>
        </div>

        {showInstallSuggestion && (
          <div className="login-install-suggestion animate-fade-in-down">
            <div className="install-content">
              <div className="install-text">
                <h3>Install NEXUS</h3>
                <p>{isIOS ? 'Tap Share > Add to Home Screen' : 'Add to home screen for full experience'}</p>
              </div>
            </div>
            {isIOS ? (
              <div className="ios-install-steps">
                <span>{MobileIcons.share}</span>
                <span>+</span>
              </div>
            ) : deferredPrompt ? (
              <button className="install-action-btn" onClick={handleInstallClick}>Install</button>
            ) : (
              <div className="install-hint">Use browser menu</div>
            )}
            <button className="install-close-btn" onClick={() => setShowInstallSuggestion(false)} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}

        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>
          </div>
          <h1>NEXUS</h1>
          <p>SRM Institute of Science and Technology</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username">SRM Net ID</label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="netid@srmist.edu.in"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <button 
                type="button" 
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className={`login-btn ${loading ? 'is-loading' : ''}`} disabled={loading}>
            <span className="login-btn-content">
              <span className="login-btn-label">{loading ? 'Signing in...' : 'Sign In'}</span>
            </span>
          </button>
        </form>

        <div className="login-footer">
          Secure login via SRM Academia &bull; Your data stays on your device
        </div>
      </div>
    </div>
  );
}
