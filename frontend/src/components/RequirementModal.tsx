import React from 'react';
import '../styles/RequirementModal.css';

interface RequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  currentCount: number;
  requiredCount: number;
  type: 'heroes' | 'level';
}

const RequirementModal: React.FC<RequirementModalProps> = ({
  isOpen,
  onClose,
  message,
  currentCount,
  requiredCount,
  type
}) => {
  if (!isOpen) return null;

  const label = type === 'heroes' ? 'Heroes' : 'Level';

  return (
    <div className="requirement-modal-overlay" onClick={onClose}>
      <div className="requirement-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="requirement-modal-header">
          <span className="requirement-warning-icon">⚠️</span>
          <h3 className="requirement-title">{type === 'heroes' ? '21 Heroes Required' : 'Level 3 Required'}</h3>
        </div>
        
        <div className="requirement-modal-content">
          <p className="requirement-message">{message}</p>
          <div className="requirement-display">
            <div className="requirement-row">
              <span className="requirement-label">Current {label}:</span>
              <span className="requirement-value">
                <span className="current-count">{currentCount}</span>/{requiredCount}
              </span>
            </div>
          </div>
          <p className="requirement-hint">Visit the Shop to purchase more heroes!</p>
        </div>
        
        <button className="requirement-modal-button" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
};

export default RequirementModal;
