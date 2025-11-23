import React, { useState, useEffect } from 'react';
import '../styles/LoginPage.css';
import config from '../config';

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
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onShowRegister }) => {
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
      setError('Please fill in all fields');
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
        
        onLogin(data.user);
      } else {
        // Handle specific error cases
        if (response.status === 409) {
          setError('⚠️ Account Already Active\n\nThis account is currently logged in from another session. You can either:\n• Close the other session and try again\n• Use a different account');
        } else {
          setError(data.message || 'Login failed');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Connection failed. Please try again.');
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
        player_id: data.user?.player_id
      }, null, 2));

      if (data.success) {
        onLogin(data.user);
      } else {
        setError(data.message || 'Failed to login as admin');
      }
    } catch (error) {
      console.error('Admin login error:', error);
      setError('Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="background-heroes">
          {/* Decorative hero silhouettes */}
          <div className="hero-silhouette hero-1"></div>
          <div className="hero-silhouette hero-2"></div>
          <div className="hero-silhouette hero-3"></div>
        </div>
      </div>
      
      <div className="login-container">
        <div className="login-header">
          <h1 className="game-title">Hero's Call</h1>
        </div>

        {/* Admin Quick Login Button */}
        <div className="admin-quick-login">
          <button 
            type="button"
            className="admin-login-btn"
            onClick={handleAdminLogin}
            disabled={isLoading}
          >
            🔑 Quick Admin Login
          </button>
          <div className="admin-login-hint">Auto-creates next available admin account</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Enter your username"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAutoFilled(false);
              }}
              placeholder="Enter your password"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div className="form-group remember-me-group">
            <label className="remember-me-label">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                className="remember-me-checkbox"
                disabled={isLoading}
              />
              <span className="checkbox-custom"></span>
              Remember my login information
            </label>
            {autoFilled && (
              <div className="auto-filled-notice">
                ✓ Login information loaded from saved data
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button 
              type="submit" 
              className="login-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>

            <div className="register-section">
              <p>Don't have an account?</p>
              <button 
                type="button" 
                className="register-link"
                onClick={onShowRegister}
                disabled={isLoading}
              >
                Create Account
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
