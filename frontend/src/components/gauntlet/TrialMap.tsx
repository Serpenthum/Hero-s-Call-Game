import React from 'react';

// 13 trials in five brackets. Players only meet others in their own bracket.
const BRACKETS = [
  { name: 'A', trials: [1] },
  { name: 'B', trials: [2, 3, 4] },
  { name: 'C', trials: [5, 6, 7] },
  { name: 'D', trials: [8, 9, 10] },
  { name: 'E', trials: [11, 12, 13] },
];

export function bracketOf(trial: number): string {
  return BRACKETS.find(b => b.trials.includes(trial))?.name ?? 'A';
}

interface TrialMapProps {
  currentTrial: number;
  trialsWon: number;
}

const TrialMap: React.FC<TrialMapProps> = ({ currentTrial, trialsWon }) => (
  <section className="gt-map" aria-label="Trials">
    <h2 className="gt-heading">The trials</h2>
    <ol className="gt-brackets">
      {BRACKETS.map(bracket => (
        <li key={bracket.name} className={`gt-bracket${bracket.trials.includes(currentTrial) ? ' is-current' : ''}`}>
          <span className="gt-bracket-name">Bracket {bracket.name}</span>
          <span className="gt-stops">
            {bracket.trials.map(trial => {
              const state = trial < currentTrial ? 'passed' : trial === currentTrial ? 'current' : 'ahead';
              return (
                <span key={trial} className={`gt-stop is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                  {trial}
                </span>
              );
            })}
          </span>
        </li>
      ))}
    </ol>
    <p className="gt-map-foot">{trialsWon} of 13 won</p>
  </section>
);

export default TrialMap;
