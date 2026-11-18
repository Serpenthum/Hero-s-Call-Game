import { describe, expect, it } from 'vitest';
import { countdownMs, deadlinesFromState, forfeitLabel, isLiveGamePhase, secondsLeft, staleGameAfterLogin } from './reconnect';

describe('countdownMs', () => {
  it('prefers milliseconds and falls back to seconds from older servers', () => {
    expect(countdownMs({ remainingMs: 12345, remainingTime: 13 })).toBe(12345);
    expect(countdownMs({ remainingTime: 20 })).toBe(20000);
    expect(countdownMs({ remainingMs: -5 })).toBe(0);
    expect(countdownMs(null)).toBeNull();
    expect(countdownMs({})).toBeNull();
  });
});

describe('deadlinesFromState', () => {
  it('turns each disconnected player countdown into a local deadline', () => {
    const state = {
      players: [
        { id: 'a', connected: false, disconnectionTimer: { remainingMs: 20000 } },
        { id: 'b', connected: true, disconnectionTimer: null }
      ]
    };
    expect(deadlinesFromState(state, 1000)).toEqual({ a: 21000 });
  });

  it('ignores connected players and missing timers', () => {
    expect(deadlinesFromState({ players: [{ id: 'a', connected: true, disconnectionTimer: { remainingMs: 5 } }] }, 0)).toEqual({});
    expect(deadlinesFromState({ players: [{ id: 'a', connected: false }] }, 0)).toEqual({});
    expect(deadlinesFromState(null, 0)).toEqual({});
  });
});

describe('secondsLeft', () => {
  it('rounds up and stops at zero', () => {
    expect(secondsLeft(10500, 0)).toBe(11);
    expect(secondsLeft(10000, 0)).toBe(10);
    expect(secondsLeft(0, 5000)).toBe(0);
  });
});

describe('forfeitLabel', () => {
  it('tells the opponent when they win and others when the forfeit happens', () => {
    expect(forfeitLabel(24, true)).toBe('You win in 24s');
    expect(forfeitLabel(24, false)).toBe('Forfeits in 24s');
    expect(forfeitLabel(null, true)).toBe('Waiting for them to return');
  });
});

describe('staleGameAfterLogin', () => {
  const battle = { id: 'g1', phase: 'battle', mode: 'random' };

  it('drops a live game the server no longer holds', () => {
    expect(staleGameAfterLogin(battle, null, false)).toBe(true);
    expect(staleGameAfterLogin(battle, 'other', false)).toBe(true);
  });

  it('keeps the game while the server still holds the seat', () => {
    expect(staleGameAfterLogin(battle, 'g1', false)).toBe(false);
  });

  it('leaves finished games, the tutorial and spectating alone', () => {
    expect(staleGameAfterLogin({ ...battle, phase: 'ended' }, null, false)).toBe(false);
    expect(staleGameAfterLogin({ ...battle, mode: 'tutorial' }, null, false)).toBe(false);
    expect(staleGameAfterLogin(battle, null, true)).toBe(false);
    expect(staleGameAfterLogin(null, null, false)).toBe(false);
  });
});

describe('isLiveGamePhase', () => {
  it('is true from the draft through the battle', () => {
    expect(['draft', 'setup', 'initiative', 'battle'].every(isLiveGamePhase)).toBe(true);
    expect(isLiveGamePhase('waiting')).toBe(false);
    expect(isLiveGamePhase('ended')).toBe(false);
    expect(isLiveGamePhase(undefined)).toBe(false);
  });
});
