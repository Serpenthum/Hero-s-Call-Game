import React from 'react';
import Icon from './Icon';
import Coin from '../Coin';
import CloseButton from '../CloseButton';

const UiKit: React.FC = () => (
  <div style={{ padding: 'var(--space-7)', display: 'grid', gap: 'var(--space-6)', maxWidth: '44rem', margin: '0 auto' }}>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0, color: 'var(--bone)' }}>UI kit</h1>
    <div className="ui-panel" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="ui-btn ui-btn--primary">Primary</button>
        <button className="ui-btn">Secondary</button>
        <button className="ui-btn ui-btn--danger">Danger</button>
        <button className="ui-btn ui-btn--quiet">Quiet</button>
        <button className="ui-btn" disabled>Disabled</button>
        <button className="ui-btn ui-btn--sm">Small</button>
        <CloseButton onClick={() => undefined} />
      </div>
      <div className="ui-field">
        <label className="ui-label" htmlFor="kit-name">Hero name</label>
        <input id="kit-name" className="ui-input" placeholder="Enter a name" />
        <span className="ui-hint">3 to 12 characters.</span>
      </div>
      <label className="ui-check"><input type="checkbox" defaultChecked /> Keep me signed in</label>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="ui-badge">Level 12</span>
        <span className="ui-pill"><Coin /> 340</span>
        <span className="ui-btn ui-btn--quiet ui-btn--sm"><span className="ui-spinner" /> Loading</span>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <button role="tab" aria-selected="true" className="ui-tab">Heroes</button>
        <button role="tab" aria-selected="false" className="ui-tab">Packs</button>
      </div>
      <div className="ui-hpbar"><div className="ui-hpbar__fill" style={{ width: '70%' }} /></div>
      <div className="ui-hpbar ui-hpbar--foe"><div className="ui-hpbar__fill" style={{ width: '35%' }} /></div>
      <div className="ui-notice ui-notice--error"><Icon name="warning" />Wrong username or password. Check both and try again.</div>
      <div className="ui-notice ui-notice--success"><Icon name="check" />Account created. You can sign in now.</div>
      <div className="ui-notice ui-notice--info"><Icon name="info" />Login information loaded from saved data.</div>
    </div>
    <div className="ui-modal" style={{ position: 'static' }}>Modal shell: walnut panel, brass frame.</div>
  </div>
);

export default UiKit;
