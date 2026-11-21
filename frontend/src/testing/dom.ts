// Small DOM helpers for component tests that need clicks (files using them set `@vitest-environment jsdom`).
import { act, type ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom lacks matchMedia and ResizeObserver; the card grid and cards use both. */
export function stubBrowserApis(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
}

let mounted: { root: Root; container: HTMLElement }[] = [];

export function render(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  mounted.push({ root, container });
  return container;
}

export function cleanup(): void {
  mounted.forEach(({ root, container }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  document.body.innerHTML = '';
}

export function click(element: Element | null | undefined): void {
  if (!element) throw new Error('click: element not found');
  act(() => { (element as HTMLElement).click(); });
}

/** Lets pending promises (mocked fetch replies) settle and React apply their updates. */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

export function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find(b => (b.textContent || '').trim().startsWith(text)) as HTMLButtonElement | undefined;
}
