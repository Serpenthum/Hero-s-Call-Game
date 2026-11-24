// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import PackOpening from './PackOpening';
import { CardReaderProvider } from '../../cards/CardReader';
import type { PackCard, PackCardKind, PackResult } from './packTypes';
import type { Hero } from '../../types';
import { buttonByText, cleanup, click, render, stubBrowserApis } from '../../testing/dom';

const hero = (name: string): Hero => ({ name, HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] });
const card = (name: string, kind: PackCardKind): PackCard => ({ name, kind, hero: hero(name) });

const threeCards: PackResult = {
  cards: [card('Ninja', 'new'), card('Monk', 'repeat'), card('Pirate', 'new')],
  coinsBack: 2,
  shardsGained: 0,
  newVP: 30,
};
const fourCards: PackResult = {
  cards: [card('Ninja', 'new'), card('Monk', 'repeat'), card('Pirate', 'new'), card('Samurai', 'holo')],
  coinsBack: 2,
  shardsGained: 0,
  newVP: 30,
};

const noop = () => undefined;

function open(result: PackResult, props: Partial<React.ComponentProps<typeof PackOpening>> = {}) {
  const root = render(
    <CardReaderProvider>
      <PackOpening result={result} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} {...props} />
    </CardReaderProvider>
  );
  return root;
}

const opening = (root: ParentNode) => root.querySelector('[data-stage]') as HTMLElement;
const cards = (root: ParentNode) => Array.from(root.querySelectorAll('[data-kind]')) as HTMLElement[];
const tapPack = (root: ParentNode) => click(root.querySelector('.pack-opening__pack'));

describe('PackOpening', () => {
  beforeEach(() => {
    stubBrowserApis();
    localStorage.setItem('heroscall.animSpeed', 'off');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('tapping the pack opens it and lays out three face-down cards', () => {
    const root = open(threeCards);
    expect(opening(root).dataset.stage).toBe('pack');
    expect(root.textContent).toContain('Tap the pack to open it');
    expect(cards(root)).toHaveLength(0);

    tapPack(root);

    expect(opening(root).dataset.stage).toBe('cards');
    expect(cards(root)).toHaveLength(3);
    expect(cards(root).map(c => c.dataset.turned)).toEqual(['false', 'false', 'false']);
    expect(root.textContent).toContain('Your heroes');
    expect(root.textContent).not.toContain('Ninja');
  });

  it('a pack with a bonus shows four cards and the bonus heading', () => {
    const root = open(fourCards);
    tapPack(root);
    expect(cards(root)).toHaveLength(4);
    expect(root.textContent).toContain('A bonus fourth card!');
    expect(root.textContent).not.toContain('Your heroes');
  });

  describe('tapping a card turns it and shows its label', () => {
    const labels: [PackCardKind, string][] = [
      ['new', 'New hero'],
      ['repeat', 'Already owned · +2'],
      ['holo', 'Holographic!'],
      ['holo_upgrade', 'Upgraded to holographic!'],
    ];
    labels.forEach(([kind, label]) => {
      it(kind, () => {
        const root = open({ cards: [card('Ninja', kind), card('Monk', 'new'), card('Pirate', 'new')], coinsBack: 0, newVP: 5, shardsGained: 0 });
        tapPack(root);
        const first = cards(root)[0];
        expect(first.dataset.kind).toBe(kind);
        expect(first.textContent).not.toContain(label);

        click(first);

        expect(first.dataset.turned).toBe('true');
        expect(cards(root)[1].dataset.turned).toBe('false');
        expect(first.querySelector('.pack-opening__label')?.textContent).toBe(label);
        expect(first.textContent).toContain('Ninja');
        if (kind === 'repeat') expect(first.querySelector('.pack-opening__label .coin-icon')).not.toBeNull();
      });
    });
  });

  it('turn all over turns every card, holographic last', () => {
    const turns: string[] = [];
    const result: PackResult = {
      cards: [card('Ninja', 'new'), card('Samurai', 'holo_upgrade'), card('Monk', 'repeat'), card('Pirate', 'new')],
      coinsBack: 2,
      shardsGained: 0,
      newVP: 30,
    };
    const root = open(result, { onTurn: name => turns.push(name) });
    tapPack(root);
    click(cards(root)[2]);
    expect(turns).toEqual(['Monk']);

    click(buttonByText(root, 'Turn all over'));

    expect(cards(root).map(c => c.dataset.turned)).toEqual(['true', 'true', 'true', 'true']);
    expect(turns).toEqual(['Monk', 'Ninja', 'Pirate', 'Samurai']);
  });

  it('tapping a turned card opens the large view', () => {
    const root = open(threeCards);
    tapPack(root);
    const first = cards(root)[0];
    click(first);
    expect(document.querySelector('.card-reader')).toBeNull();

    click(first);

    const reader = document.querySelector('.card-reader');
    expect(reader).not.toBeNull();
    expect(reader?.getAttribute('aria-label')).toBe('Ninja');
  });

  it('buy another is disabled when canBuyAnother is false, and calls onBuyAnother once per click', () => {
    const onBuyAnother = vi.fn();
    const disabledRoot = open(threeCards, { canBuyAnother: false, onBuyAnother });
    tapPack(disabledRoot);
    const disabled = buttonByText(disabledRoot, 'Buy another');
    expect(disabled?.disabled).toBe(true);
    expect(disabled?.textContent).toBe('Buy another12');
    expect(disabled?.querySelector('.coin-icon')).not.toBeNull();
    click(disabled);
    expect(onBuyAnother).not.toHaveBeenCalled();
    cleanup();

    const root = open(threeCards, { canBuyAnother: true, onBuyAnother });
    tapPack(root);
    const enabled = buttonByText(root, 'Buy another');
    expect(enabled?.disabled).toBe(false);
    click(enabled);
    expect(onBuyAnother).toHaveBeenCalledTimes(1);
    click(enabled);
    expect(onBuyAnother).toHaveBeenCalledTimes(2);
  });

  it('done calls onDone', () => {
    const onDone = vi.fn();
    const root = open(threeCards, { onDone });
    tapPack(root);
    click(buttonByText(root, 'Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
