import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ startClockSound: () => () => {} }));

import { DisconnectCaption, DisconnectNotice, DisconnectOverlay } from './DisconnectBadge';
import TurnTimerBar from './TurnTimerBar';

afterEach(() => {
  vi.useRealTimers();
});

describe('DisconnectCaption', () => {
  it('tells the opponent when they win', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const html = renderToStaticMarkup(<DisconnectCaption countdown={{ deadline: 24000, durationMs: 30000 }} name="Ana" viewerIsOpponent={true} />);
    expect(html).toContain('Disconnected');
    expect(html).toContain('You win in 24s');
  });

  it('tells spectators when the forfeit happens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const html = renderToStaticMarkup(<DisconnectCaption countdown={{ deadline: 5000, durationMs: 30000 }} name="Ana" viewerIsOpponent={false} />);
    expect(html).toContain('Forfeits in 5s');
  });
});

describe('DisconnectOverlay', () => {
  it('sizes the bar from the countdown length the server gave', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const html = renderToStaticMarkup(<DisconnectOverlay countdown={{ deadline: 5000, durationMs: 10000 }} />);
    expect(html).toContain('width:50%');
    expect(html).toContain('>5<');
  });
});

describe('DisconnectNotice', () => {
  it('shows the portrait, name and countdown for the draft and initiative screens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const html = renderToStaticMarkup(
      <DisconnectNotice countdown={{ deadline: 12000, durationMs: 30000 }} name="Ana" profileIcon="Monk" viewerIsOpponent={true} />
    );
    expect(html).toContain('http://img.test/hero-images/monk.webp');
    expect(html).toContain('Ana');
    expect(html).toContain('You win in 12s');
  });
});

describe('TurnTimerBar', () => {
  it('holds still while the clock is stopped', () => {
    const html = renderToStaticMarkup(<TurnTimerBar deadline={Date.now() + 5000} durationMs={30000} paused={true} remainingMs={5000} />);
    expect(html).toContain('turn-timer-bar--paused');
    expect(html).toContain('--burn-start:50%');
  });

  it('stays hidden when stopped with more than the last 10 seconds left', () => {
    const html = renderToStaticMarkup(<TurnTimerBar deadline={Date.now() + 20000} durationMs={30000} paused={true} remainingMs={20000} />);
    expect(html).toBe('');
  });
});
