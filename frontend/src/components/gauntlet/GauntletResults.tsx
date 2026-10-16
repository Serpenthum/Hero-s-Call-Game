import React from 'react';
import Coin from '../Coin';
import { bracketOf } from './TrialMap';
import type { GauntletRewards } from '../../types';

interface GauntletResultsProps {
  trialsWon: number;
  finalTrial: number;
  rewards: GauntletRewards | null;
  bestTrial?: number;
  onDone: () => void;
}

// The run is over: a scroll of what it earned.
const GauntletResults: React.FC<GauntletResultsProps> = ({ trialsWon, finalTrial, rewards, bestTrial, onDone }) => (
  <div className="gt-results ui-panel">
    <h1 className="gt-results-title">The run is over</h1>
    <dl className="gt-results-list">
      <div><dt>Trials won</dt><dd>{trialsWon} of 13</dd></div>
      <div><dt>Reached</dt><dd>Trial {finalTrial}, bracket {bracketOf(finalTrial)}</dd></div>
      {rewards && trialsWon > 0 && (
        <>
          <div><dt>Earned</dt><dd className="gt-results-coin"><Coin /> {rewards.victoryPoints}</dd></div>
          <div><dt>Experience</dt><dd>{rewards.xp} XP</dd></div>
        </>
      )}
      {trialsWon === 0 && <div><dt>Earned</dt><dd>Nothing. Win a trial to be paid.</dd></div>}
      {bestTrial !== undefined && bestTrial > 0 && <div><dt>Your best</dt><dd>{Math.max(bestTrial, trialsWon)} {Math.max(bestTrial, trialsWon) === 1 ? 'win' : 'wins'}</dd></div>}
    </dl>
    <button type="button" className="ui-btn ui-btn--primary" onClick={onDone}>Back to the lobby</button>
  </div>
);

export default GauntletResults;
