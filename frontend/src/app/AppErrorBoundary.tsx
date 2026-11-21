import React from 'react';
import RotatePrompt from '../components/RotatePrompt';
import '../styles/AppError.css';

// What shows instead of a blank screen when the app fails to render (for example a screen's code that could
// not be loaded even after the automatic reload).
export const AppErrorPanel: React.FC = () => (
  <div className="app-error" role="alert">
    <div className="app-error__panel">
      <h1 className="app-error__title">Something went wrong.</h1>
      <p className="app-error__text">Reload to get back to the game.</p>
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => window.location.reload()}>Reload</button>
    </div>
  </div>
);

interface Props { children: React.ReactNode }
interface State { failed: boolean }

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('App crashed:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // The rotate screen lived inside the app that just failed, so keep it here too
    return (
      <>
        <AppErrorPanel />
        <RotatePrompt />
      </>
    );
  }
}
