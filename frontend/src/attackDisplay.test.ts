import { describe, expect, test } from 'vitest';
import { combineDice, getAttackDisplay } from './attackDisplay';

describe('combineDice', () => {
  test('adds matching dice', () => expect(combineDice(['1D4', '1D4'])).toBe('2D4'));
  test('keeps different dice apart, smallest first', () => expect(combineDice(['1D8', '1D4 + 1D6', '1D4'])).toBe('2D4 + 1D6 + 1D8'));
  test('combines every die size', () => {
    expect(combineDice(['1D6', '1D6'])).toBe('2D6');
    expect(combineDice(['1D8', '1D8', '1D12', '2D6', '1D6', '1D12'])).toBe('3D6 + 2D8 + 2D12');
    expect(combineDice(['1d10', '1D10'])).toBe('2D10');
  });
  test('sums flat bonuses at the end', () => expect(combineDice(['1D8', '1', '2'])).toBe('1D8 + 3'));
});

describe('getAttackDisplay', () => {
  test("Hoarder with Angel's dice shows 2D4", () => {
    const attack = getAttackDisplay({
      BasicAttack: '1D4',
      scalingBuffs: { collectedDice: [{ dice: '1D4', from: 'Angel' }] },
    } as any);
    expect(attack.text).toBe('2D4');
    expect(attack.hasExtras).toBe(true);
    expect(attack.sources).toEqual(['+1D4 from Angel']);
  });

  test('no basic attack stays a dash', () => {
    expect(getAttackDisplay({ BasicAttack: '—' } as any).text).toBe('—');
  });
});
