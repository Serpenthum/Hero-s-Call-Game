import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AppErrorBoundary, { AppErrorPanel } from './AppErrorBoundary';

describe('AppErrorPanel', () => {
  it('says something went wrong and offers a Reload button instead of a blank screen', () => {
    const html = renderToStaticMarkup(<AppErrorPanel />);
    expect(html).toContain('Something went wrong.');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reload<\/button>/);
    expect(html).toContain('role="alert"');
  });
});

describe('AppErrorBoundary', () => {
  it('renders its children while nothing has failed', () => {
    const html = renderToStaticMarkup(<AppErrorBoundary><p>game</p></AppErrorBoundary>);
    expect(html).toBe('<p>game</p>');
  });
  it('switches to the panel once a child has thrown', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  });
});
