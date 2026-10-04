import React from 'react';
import '../styles/CloseButton.css';

interface CloseButtonProps {
  onClick: () => void;
  label?: string;
  // For callers that only need to position the button (e.g. absolute in a header)
  className?: string;
}

// The one close/exit X used on every modal and panel.
const CloseButton: React.FC<CloseButtonProps> = ({ onClick, label = 'Close', className = '' }) => (
  <button
    type="button"
    className={`game-close-btn ${className}`.trim()}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </button>
);

export default CloseButton;
