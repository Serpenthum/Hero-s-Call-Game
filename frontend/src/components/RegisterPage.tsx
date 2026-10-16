import React, { useState } from 'react';
import '../styles/auth.css';
import Icon from './ui/Icon';
import config from '../config';

interface RegisterPageProps {
  onRegisterSuccess: () => void;
  onBackToLogin: () => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess, onBackToLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validateForm = (): string | null => {
    if (!username.trim()) {
      return 'Enter a username.';
    }
    
    if (username.length < 3) {
      return 'Username needs at least 3 characters.';
    }
    
    if (username.length > 12) {
      return 'Username can have at most 12 characters.';
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Use only letters, numbers and underscores in your username.';
    }
    
    if (!password) {
      return 'Enter a password.';
    }
    
    if (password.length < 6) {
      return 'Password needs at least 6 characters.';
    }
    
    if (password !== confirmPassword) {
      return 'The two passwords do not match.';
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Account created. You can sign in now.');
        setTimeout(() => {
          onRegisterSuccess();
        }, 2000);
      } else {
        setError(data.message || 'Could not create the account. Try a different username.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-backdrop" aria-hidden="true"></div>

      <main className="auth-book">
        <h1 className="auth-title">Hero's Call</h1>
        <p className="auth-lede">Create your account to build a roster.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="ui-field">
            <label className="ui-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Pick a username"
              className="ui-input"
              autoComplete="username"
              disabled={isLoading}
              maxLength={12}
            />
            <span className="ui-hint">3 to 12 characters: letters, numbers and underscores.</span>
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              className="ui-input"
              autoComplete="new-password"
              disabled={isLoading}
            />
            <span className="ui-hint">At least 6 characters.</span>
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="confirm-password">Confirm password</label>
            <input
              type="password"
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              className="ui-input"
              autoComplete="new-password"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="ui-notice ui-notice--error" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="ui-notice ui-notice--success" role="status">
              <Icon name="check" />
              <span>{success}</span>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" className="ui-btn ui-btn--primary ui-btn--block" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="ui-spinner" aria-hidden="true"></span>
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>

            <div className="auth-switch">
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onBackToLogin} disabled={isLoading}>
                <Icon name="back" />
                Back to sign in
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default RegisterPage;
