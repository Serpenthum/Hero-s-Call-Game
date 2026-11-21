import { describe, it, expect } from 'vitest';
import { tutorialStageOnRestore, tutorialBattleFinished } from './tutorialResume';

describe('tutorialStageOnRestore', () => {
  it('puts an account that has not done the tutorial back into the tutorial battle', () => {
    expect(tutorialStageOnRestore({ tutorial_completed: false })).toBe('battle');
  });
  it('leaves finished, skipped and older accounts (no flag) in the lobby', () => {
    expect(tutorialStageOnRestore({ tutorial_completed: true })).toBeNull();
    expect(tutorialStageOnRestore({})).toBeNull();
  });
  it('does nothing without a saved session', () => {
    expect(tutorialStageOnRestore(null)).toBeNull();
  });
});

describe('tutorialBattleFinished', () => {
  const won = { mode: 'tutorial', winner: 'p1' };
  it('is true once the tutorial battle has a winner (the server marks the tutorial done then)', () => {
    expect(tutorialBattleFinished('battle', won)).toBe(true);
  });
  it('is false while the battle is still going', () => {
    expect(tutorialBattleFinished('battle', { mode: 'tutorial', winner: null })).toBe(false);
    expect(tutorialBattleFinished('battle', null)).toBe(false);
  });
  it('ignores other games and other tutorial stages', () => {
    expect(tutorialBattleFinished('battle', { mode: 'draft', winner: 'p1' })).toBe(false);
    expect(tutorialBattleFinished(null, won)).toBe(false);
    expect(tutorialBattleFinished('lobby', won)).toBe(false);
  });
});
