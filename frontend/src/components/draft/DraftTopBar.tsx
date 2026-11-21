import React from 'react';
import { DraftStep, STEP_LABELS } from '../../draft/draftRules';

interface DraftTopBarProps {
  step: DraftStep;
  clock: React.ReactNode;
  connecting: boolean;
  onLeave(): void;
}

const mark = (i: number, step: DraftStep) => (i < step ? '✓' : i === 0 ? '✕' : String(i));

/** "Draft", the five steps (done ticked, current glowing, Ban red), the clock and Leave. */
const DraftTopBar: React.FC<DraftTopBarProps> = ({ step, clock, connecting, onLeave }) => (
  <header className="draft-bar">
    <h2 className="draft-title">Draft</h2>
    <ol className="draft-steps" aria-label="Draft steps">
      {STEP_LABELS.map((label, i) => {
        const classes = [
          'draft-step',
          i < step ? 'draft-step--done' : '',
          i === step ? 'draft-step--now' : '',
          i === 0 ? 'draft-step--ban' : '',
        ].filter(Boolean).join(' ');
        return (
          <li key={label} className={classes} aria-current={i === step ? 'step' : undefined} aria-label={label}>
            <i className="draft-step-mark" aria-hidden="true">{mark(i, step)}</i>
            <span className="draft-step-label" aria-hidden="true">{label}</span>
          </li>
        );
      })}
    </ol>
    {connecting && <span className="draft-connecting">Connecting…</span>}
    <div className="draft-clock-slot">{clock}</div>
    <button type="button" className="draft-leave" title="Return to lobby without rewards" onClick={onLeave}>
      Leave
    </button>
  </header>
);

export default DraftTopBar;
