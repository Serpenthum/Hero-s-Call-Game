import React, { useState, useEffect } from 'react';
import '../styles/auth.css';
import Icon from './ui/Icon';
import config from '../config';
import { setAuthToken } from '../authSession';

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
  favorite_heroes: string[];
  xp: number;
  level: number;
  best_gauntlet_trial: number;
}

interface LoginPageProps {
  onLogin: (user: User) => void;
  onShowRegister: () => void;
  onStartCardTest: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onShowRegister, onStartCardTest }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Load saved credentials on component mount
  useEffect(() => {
    const savedCredentials = localStorage.getItem('heroCallRememberMe');
    if (savedCredentials) {
      try {
        const { username: savedUsername, password: savedPassword, expiry } = JSON.parse(savedCredentials);
        
        // Check if credentials have expired (30 days)
        if (expiry && Date.now() > expiry) {
          localStorage.removeItem('heroCallRememberMe');
          return;
        }
        
        setUsername(savedUsername);
        setPassword(savedPassword);
        setRememberMe(true);
        setAutoFilled(true);
      } catch (error) {
        console.error('Error loading saved credentials:', error);
        localStorage.removeItem('heroCallRememberMe');
      }
    }
  }, []);

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    // If unchecked, immediately clear saved credentials
    if (!checked) {
      localStorage.removeItem('heroCallRememberMe');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      setError('Enter your username and password.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        // Handle remember me functionality
        if (rememberMe) {
          // Set expiry to 30 days from now
          const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000);
          localStorage.setItem('heroCallRememberMe', JSON.stringify({ username, password, expiry }));
        } else {
          localStorage.removeItem('heroCallRememberMe');
        }
        
        // Store level-up data if present
        if (data.levelUpData) {
          localStorage.setItem('pendingLevelUpData', JSON.stringify(data.levelUpData));
        }
        
        // The server's proof that this client owns the account; sent with account actions and the socket
        setAuthToken(data.token);
        onLogin(data.user);
      } else {
        // Handle specific error cases
        if (response.status === 409) {
          setError('This account is already signed in on another session. Close that session, or use a different account.');
        } else {
          setError(data.message || 'Sign in failed. Check your username and password.');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Call new endpoint that handles finding next available admin
      const response = await fetch(`${config.API_BASE_URL}/api/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      console.log('Admin login response data:', JSON.stringify({
        success: data.success,
        username: data.user?.username,
        level: data.user?.level,
        xp: data.user?.xp,
        victory_points: data.user?.victory_points,
        player_id: data.user?.player_id,
        levelUpData: data.levelUpData
      }, null, 2));

      if (data.success) {
        // Store level-up data if present
        if (data.levelUpData) {
          localStorage.setItem('pendingLevelUpData', JSON.stringify(data.levelUpData));
        }
        
        setAuthToken(data.token);
        onLogin(data.user);
      } else {
        setError(data.message || 'Could not sign in as admin.');
      }
    } catch (error) {
      console.error('Admin login error:', error);
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--login">
      <div className="auth-backdrop" aria-hidden="true"></div>

      <main className="auth-book">
        <h1 className="auth-title">Hero's Call</h1>
        <p className="auth-lede">Sign in to continue your run.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="ui-field">
            <label className="ui-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Your username"
              className="ui-input"
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Your password"
              className="ui-input"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <div className="ui-field">
            <label className="ui-check" htmlFor="remember-me">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                disabled={isLoading}
              />
              Remember my login on this device
            </label>
            {autoFilled && (
              <div className="ui-notice ui-notice--info" role="status">
                <Icon name="check" />
                Login information loaded from saved data.
              </div>
            )}
          </div>

          {error && (
            <div className="ui-notice ui-notice--error" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--block" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="ui-spinner" aria-hidden="true"></span>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>

            <div className="auth-switch">
              <span>New here?</span>
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onShowRegister} disabled={isLoading}>
                Create account
              </button>
            </div>
          </div>
        </form>

        <div className="auth-devtools">
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={handleAdminLogin} disabled={isLoading}>
            <Icon name="key" />
            Quick admin login
          </button>
          <span className="ui-hint">Uses the next free admin account.</span>
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onStartCardTest}>
            Open card layout test
          </button>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
