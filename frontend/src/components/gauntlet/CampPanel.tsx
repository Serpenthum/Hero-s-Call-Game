import React from 'react';
import Icon from '../ui/Icon';
import type { GauntletRunState } from '../../types';
import type { CampPick } from './RosterSheet';

interface CampPanelProps {
  runState: GauntletRunState;
  pick: CampPick;
  busy: boolean;
  onChoose: (choice: 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial') => void;
  onCancelPick: () => void;
}

const CampPanel: React.FC<CampPanelProps> = ({ runState, pick, busy, onChoose, onCancelPick }) => {
  const open = runState.shop_actions_remaining > 0 && !busy;
  const hasHurt = runState.roster.some(r => r.alive && r.current_hp < r.max_hp);
  const hasFallen = runState.roster.some(r => !r.alive && !r.temporary_resurrection_active);
  const canSkip = runState.current_trial < 10;

  const choices = [
    { key: 'heal' as const, icon: 'heart' as const, title: 'Heal a hero', text: 'Back to full health.', disabled: !hasHurt, why: 'Nobody is wounded.' },
    { key: 'temp_res' as const, icon: 'rotate' as const, title: 'Revive a fallen hero', text: 'Returns for one battle.', disabled: !hasFallen, why: 'Nobody has fallen.' },
    { key: 'buy_pack' as const, icon: 'userPlus' as const, title: 'Hire a hero', text: 'Pick one of two new heroes.', disabled: false, why: '' },
    { key: 'skip_trial' as const, icon: 'forward' as const, title: 'Skip this trial', text: canSkip ? 'Move on without fighting.' : 'Closed from trial 10.', disabled: !canSkip, why: 'Closed from trial 10.' },
  ];

  return (
    <section className="gt-camp" aria-label="Camp">
      <h2 className="gt-heading">Camp</h2>
      <p className="gt-camp-state">{runState.shop_actions_remaining > 0 ? 'Choose one before the next trial.' : 'You have used this trial’s camp action.'}</p>

      {pick ? (
        <div className="ui-notice ui-notice--info gt-pick-hint" role="status">
          <span>{pick === 'heal' ? 'Choose a wounded hero to heal.' : 'Choose a fallen hero to revive.'}</span>
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onCancelPick}>Cancel</button>
        </div>
      ) : (
        <ul className="gt-choices">
          {choices.map(choice => (
            <li key={choice.key}>
              <button
                type="button"
                className="gt-choice"
                disabled={!open || choice.disabled}
                title={choice.disabled ? choice.why : undefined}
                onClick={() => onChoose(choice.key)}
              >
                <Icon name={choice.icon} size={22} className="gt-choice-icon" />
                <span className="gt-choice-title">{choice.title}</span>
                <span className="gt-choice-text">{choice.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="gt-rerolls">{runState.rerolls_remaining} {runState.rerolls_remaining === 1 ? 'reroll' : 'rerolls'} left this run</p>
    </section>
  );
};

export default CampPanel;
