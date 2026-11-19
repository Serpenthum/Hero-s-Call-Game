import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import ModeCards, { ModeCardSpec } from './ModeCards';

const noop = () => {};
const MODES: ModeCardSpec[] = [
  { mode: 'random', title: 'Random', text: 'Quick battle with random teams.', tag: 'Normal', playLabel: 'Play random', onActivate: noop },
  { mode: 'draft', title: 'Draft', text: 'Ban, then pick your team.', tag: 'Ranked', playLabel: 'Play draft', onActivate: noop },
  { mode: 'survival', title: 'Survival', text: 'Win with each hero once.', tag: 'Ranked', playLabel: 'Enter survival', onActivate: noop },
  { mode: 'gauntlet', title: 'Gauntlet', text: 'Face 13 trials with a roster of six.', tag: 'Ranked', playLabel: 'Enter gauntlet', onActivate: noop },
];

const render = (searchingMode: string | null, searchClock = '0:12') =>
  renderToStaticMarkup(<ModeCards modes={MODES} searchingMode={searchingMode} searchClock={searchClock} onLeaveQueue={noop} />);

// The markup of one card: from its opening tag up to the next card (or the end).
const card = (html: string, mode: string) => {
  const start = html.indexOf(`mode-card--${mode}`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('class="mode-card mode-card--', start + 1);
  return html.slice(html.lastIndexOf('<', start), next === -1 ? undefined : next);
};

describe('ModeCards', () => {
  it('shows the searching card with its clock and a Leave queue button', () => {
    const html = render('draft');
    const draft = card(html, 'draft');
    expect(draft).toContain('mode-card--searching');
    expect(draft).toContain('Finding an opponent · 0:12');
    expect(draft).toContain('Leave queue');
    expect(draft).not.toContain('Play draft');
  });

  it('leaves the other cards as they were while searching', () => {
    const html = render('draft');
    const random = card(html, 'random');
    expect(random).toContain('Play random');
    expect(random).not.toContain('mode-card--searching');
    expect(random).not.toContain('Leave queue');
  });

  it('shows no Leave queue button when not searching', () => {
    const html = render(null);
    expect(html).not.toContain('Leave queue');
    expect(html).not.toContain('mode-card--searching');
    expect(html).toContain('Play draft');
  });

  it('always marks Random as the main card', () => {
    expect(card(render(null), 'random')).toContain('mode-card--main');
    expect(card(render('random'), 'random')).toContain('mode-card--main');
    expect(card(render('draft'), 'draft')).not.toContain('mode-card--main');
  });

  it('gives each card its icon, tag and button', () => {
    const html = render(null);
    for (const m of ['random', 'draft', 'survival', 'gauntlet']) {
      const c = card(html, m);
      expect(c).toContain('mode-card-icon');
      expect(c).toContain('mode-card-go');
    }
    expect(card(html, 'random')).toContain('Normal');
    expect(card(html, 'gauntlet')).toContain('Ranked');
  });
});
