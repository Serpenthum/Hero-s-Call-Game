import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SidebarBattleInfo from './SidebarBattleInfo';

type Props = Parameters<typeof SidebarBattleInfo>[0];

const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    <SidebarBattleInfo
      phase="battle"
      isMyTurn={true}
      isSpectating={false}
      activePlayerName="Ana"
      hasPlayers={true}
      {...props}
    >
      <div className="log-placeholder">Battle actions will appear here</div>
    </SidebarBattleInfo>
  );

describe('SidebarBattleInfo', () => {
  it('shows the battle panel during the starting roll, with a starting-roll turn line', () => {
    const html = render({ phase: 'initiative' });
    expect(html).toContain('battle-combined-info');
    expect(html).toContain('id="battle-details-slot"');
    expect(html).toContain('<h3>Battle</h3>');
    expect(html).toContain('Starting roll');
    expect(html).toContain('Battle actions will appear here');
    expect(html).not.toContain('Your turn');
    expect(html).not.toContain('Opponent');
  });

  it('says starting roll to spectators too during initiative', () => {
    const html = render({ phase: 'initiative', isSpectating: true });
    expect(html).toContain('Starting roll');
    expect(html).not.toContain('Watching');
  });

  it('shows whose turn it is in battle', () => {
    expect(render({ phase: 'battle', isMyTurn: true })).toContain('Your turn');
    expect(render({ phase: 'battle', isMyTurn: false })).toContain('Opponent&#x27;s turn');
    expect(render({ phase: 'battle', isSpectating: true })).toMatch(/Watching: (<!-- -->)?Ana(<!-- -->)?&#x27;s turn/);
  });

  it('renders nothing outside initiative and battle', () => {
    expect(render({ phase: 'setup' })).not.toContain('battle-combined-info');
    expect(render({ phase: 'draft' })).toBe('');
    expect(render({ phase: 'ended' })).toBe('');
  });

  it('keeps the heading but drops the turn line and log without players', () => {
    const html = render({ hasPlayers: false });
    expect(html).toContain('battle-combined-info');
    expect(html).not.toContain('turn-info');
    expect(html).not.toContain('Battle actions will appear here');
  });
});
