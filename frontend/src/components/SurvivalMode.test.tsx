// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../socketService', () => ({
  socketService: { getSocket: () => null, connect: () => null, getSurvivalState: vi.fn(), resetSurvivalState: vi.fn() },
}));
vi.mock('./SurvivalTeamBuilder', () => ({ default: () => null }));
vi.mock('./SurvivalProgress', () => ({ default: () => null }));
vi.mock('./SurvivalUsedHeroes', () => ({ default: () => null }));
vi.mock('./RewardsDisplay', () => ({ default: () => null }));

import SurvivalMode from './SurvivalMode';
import { buttonByText, cleanup, click, render, settle } from '../testing/dom';

const user = (wins: number) => ({
  id: 7, username: 'Sam', victory_points: 0, survival_wins: wins, survival_losses: 1,
  survival_used_heroes: [], available_heroes: [], favorite_heroes: [],
});

describe('SurvivalMode abandon prompt', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('says the run\'s coins will be paid out, without stating the win count as a coin amount', async () => {
    const root = render(<SurvivalMode onReturnToLobby={() => {}} onStartBattle={() => {}} user={user(3)} />);
    await settle();
    click(buttonByText(root, 'Abandon Run'));
    const info = root.querySelector('.survival-victory-points-info');
    expect(info?.textContent).toBe("Your run's coins will be paid out.");
    // The server pays 7 for 3 wins; the site states no amount of its own
    expect(info?.textContent).not.toMatch(/\d/);
  });

  it('with no wins there is nothing to pay out', async () => {
    const root = render(<SurvivalMode onReturnToLobby={() => {}} onStartBattle={() => {}} user={user(0)} />);
    await settle();
    click(buttonByText(root, 'Abandon Run'));
    expect(root.querySelector('.survival-victory-points-info')).toBeNull();
  });
});
