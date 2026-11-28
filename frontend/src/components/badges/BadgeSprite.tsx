import React from 'react';

// Every badge drawing, as <symbol>s a BadgeToken points at with <use href="#i-...">. Render once per page.
// The geometry is copied from the approved mockup (docs/superpowers/specs/2026-11-22-badges-wording-mockup.html);
// only the colours changed, from literals to tokens. Zero-sized, not display:none, so the golem's gradient still paints.
const BadgeSprite: React.FC = () => (
  <svg className="badge-sprite" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="badge-core">
        <stop offset="0" stopColor="var(--badge-core-hot)"/>
        <stop offset=".35" stopColor="var(--badge-core)"/>
        <stop offset="1" stopColor="var(--badge-core-deep)"/>
      </radialGradient>
      <symbol id="i-paw" viewBox="0 0 32 32">
        <g fill="var(--bone)">
          <path d="M16 15.5c4 0 7.5 3.6 7.5 7.2 0 2.6-2 4-4 3.6-1.6-.3-2.3-1-3.5-1s-1.9.7-3.5 1c-2 .4-4-1-4-3.6 0-3.6 3.5-7.2 7.5-7.2z"/>
          <ellipse cx="7" cy="14.5" rx="2.5" ry="3.3" transform="rotate(-22 7 14.5)"/>
          <ellipse cx="12.3" cy="8.8" rx="2.6" ry="3.6" transform="rotate(-8 12.3 8.8)"/>
          <ellipse cx="19.7" cy="8.8" rx="2.6" ry="3.6" transform="rotate(8 19.7 8.8)"/>
          <ellipse cx="25" cy="14.5" rx="2.5" ry="3.3" transform="rotate(22 25 14.5)"/>
        </g>
      </symbol>
      <g id="badge-totem-head">
        <rect width="11" height="8.2" rx="1.6" fill="var(--brass)"/>
        <circle cx="3.3" cy="3.2" r="1.2" fill="var(--walnut)"/>
        <circle cx="7.7" cy="3.2" r="1.2" fill="var(--walnut)"/>
        <rect x="3" y="5.4" width="5" height="1.3" fill="var(--walnut)"/>
      </g>
      <symbol id="i-totem1" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.5" y="20.2"/>
        <rect x="11" y="12.1" width="10" height="7.2" rx="1.6" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.5"/>
        <rect x="11" y="3.5" width="10" height="7.2" rx="1.6" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.5"/>
        <path d="M3.5 24.8l7-2.5v4.6l-7 1.5zM28.5 24.8l-7-2.5v4.6l7 1.5z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-totem2" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.5" y="20.2"/>
        <use href="#badge-totem-head" x="10.5" y="11.6"/>
        <rect x="11" y="3.5" width="10" height="7.2" rx="1.6" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.5"/>
        <path d="M3.5 16.2l7-2.5v4.6l-7 1.5zM28.5 16.2l-7-2.5v4.6l7 1.5z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-totem3" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.5" y="20.2"/>
        <use href="#badge-totem-head" x="10.5" y="11.6"/>
        <use href="#badge-totem-head" x="10.5" y="3"/>
        <path d="M3.5 7.6l7-2.5v4.6l-7 1.5zM28.5 7.6l-7-2.5v4.6l7 1.5z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-blows" viewBox="0 0 32 32">
        <g strokeLinecap="round">
          <path d="M6 5l17 17" stroke="var(--bone)" strokeWidth="3.2"/>
          <path d="M26 5L9 22" stroke="var(--bone)" strokeWidth="3.2"/>
          <path d="M19.5 24.5l5.5-5.5M12.5 24.5L7 19" stroke="var(--brass-hi)" strokeWidth="2.6"/>
          <path d="M23 22l4.5 4.5M9 22l-4.5 4.5" stroke="var(--brass)" strokeWidth="3.4"/>
        </g>
        <path d="M16 9l1.3 3.2 3.2 1.3-3.2 1.3L16 18l-1.3-3.2-3.2-1.3 3.2-1.3z" fill="var(--ember-hi)"/>
      </symbol>
      <symbol id="i-golem" viewBox="0 0 32 32">
        <path d="M2.5 30v-6.5l4.5-3.5h18l4.5 3.5V30z" fill="var(--badge-stone-shade)"/>
        <path d="M2.5 23.5L7 20h5v10H2.5zM20 20h5l4.5 3.5V30H20z" fill="var(--badge-stone)"/>
        <path d="M2.5 26.5H12M20 26h9.5M7 23.5v3M25 23v3" stroke="var(--badge-stone-line)" strokeWidth=".8" fill="none"/>
        <rect x="7.5" y="4.5" width="17" height="16" rx="3.5" fill="var(--badge-iron)"/>
        <rect x="7.5" y="4.5" width="17" height="4.5" rx="2.2" fill="var(--badge-iron-hi)"/>
        <circle cx="16" cy="13" r="5.8" fill="var(--badge-socket)"/>
        <circle cx="16" cy="13" r="4.3" fill="url(#badge-core)"/>
        <circle cx="9.8" cy="18.5" r=".8" fill="var(--badge-rivet)"/>
        <circle cx="22.2" cy="18.5" r=".8" fill="var(--badge-rivet)"/>
        <path d="M6.5 6c1.5-3.5 4-3.8 5.5-1.5 1-2 3-2 4 0-3 1.5-6.5 2.3-9.5 1.5zM23.5 21c1-2.5 3.5-2.5 4.5 0l-2 1z" fill="var(--badge-moss)"/>
      </symbol>
      <symbol id="i-bot" viewBox="0 0 32 32">
        <rect x="15.3" y="3" width="1.4" height="4.5" fill="var(--bone)"/>
        <circle cx="16" cy="3.2" r="1.7" fill="var(--ember-hi)"/>
        <rect x="2.8" y="13" width="3.5" height="6.5" rx="1.2" fill="var(--bone-dim)"/>
        <rect x="25.7" y="13" width="3.5" height="6.5" rx="1.2" fill="var(--bone-dim)"/>
        <rect x="6" y="7" width="20" height="18.5" rx="6" fill="var(--bone)"/>
        <path d="M14 10.2h4v3.8h3.8v4H18v3.8h-4V18h-3.8v-4H14z" fill="var(--ember)"/>
        <rect x="10.5" y="25.5" width="3.8" height="3.5" rx="1" fill="var(--bone-dim)"/>
        <rect x="17.7" y="25.5" width="3.8" height="3.5" rx="1" fill="var(--bone-dim)"/>
      </symbol>
      <symbol id="i-blood" viewBox="0 0 32 32">
        <path d="M16 3c5.5 7.5 8.5 11.8 8.5 16.3a8.5 8.5 0 0 1-17 0C7.5 14.8 10.5 10.5 16 3z" fill="var(--ember)"/>
        <path d="M11.3 19.5c0 2.6 1.6 4.6 4 5.1" stroke="var(--badge-blood-shine)" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      </symbol>
      <symbol id="i-hidden" viewBox="0 0 32 32">
        <g fill="var(--bone-dim)">
          <circle cx="9.5" cy="19.5" r="6.5"/>
          <circle cx="16.5" cy="13.5" r="8.5"/>
          <circle cx="23.5" cy="20" r="6"/>
          <rect x="8" y="18" width="17" height="8" rx="3"/>
        </g>
        <path d="M10.5 14.8l4.5 1.9-4.5 1.3zM22.5 14.8L18 16.7l4.5 1.3z" fill="var(--felt-deep)"/>
      </symbol>
      <symbol id="i-ashield" viewBox="0 0 32 32">
        <path d="M16 2.5l10.5 3.8v8.7c0 6.5-4.5 11.2-10.5 14.5C10 26.2 5.5 21.5 5.5 15V6.3z" fill="var(--stat-defense)"/>
        <path d="M16 2.5v27c6-3.3 10.5-8 10.5-14.5V6.3z" fill="var(--badge-shield-shade)"/>
        <path d="M16 8l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" fill="var(--card-white)"/>
      </symbol>
      <symbol id="i-poison" viewBox="0 0 32 32">
        <path d="M16 3c5.5 7.5 8.5 11.8 8.5 16.3a8.5 8.5 0 0 1-17 0C7.5 14.8 10.5 10.5 16 3z" fill="var(--poison)"/>
        <g fill="var(--felt-deep)">
          <circle cx="12.8" cy="18" r="2.3"/>
          <circle cx="19.2" cy="18" r="2.3"/>
          <rect x="12.6" y="22.6" width="1.7" height="2.8"/>
          <rect x="15.15" y="22.6" width="1.7" height="2.8"/>
          <rect x="17.7" y="22.6" width="1.7" height="2.8"/>
        </g>
      </symbol>
      <symbol id="i-taunt" viewBox="0 0 32 32">
        <path d="M5.5 5.5L8 8.5M26.5 5.5L24 8.5M16 2v3" stroke="var(--ember-hi)" strokeWidth="2" strokeLinecap="round" fill="none"/>
        <circle cx="16" cy="18" r="10.5" fill="var(--ember-hi)"/>
        <path d="M8.8 12.8l5.7 2.6M23.2 12.8l-5.7 2.6" stroke="var(--felt-deep)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
        <circle cx="12.2" cy="17.8" r="1.4" fill="var(--felt-deep)"/>
        <circle cx="19.8" cy="17.8" r="1.4" fill="var(--felt-deep)"/>
        <rect x="11" y="21.3" width="10" height="3.8" rx="1" fill="var(--bone)"/>
        <path d="M14.3 21.3v3.8M17.7 21.3v3.8" stroke="var(--felt-deep)" strokeWidth=".9" fill="none"/>
      </symbol>
      <symbol id="i-silence" viewBox="0 0 32 32">
        <path d="M5 6h22a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H15.5L9 27.5V22H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="var(--bone)"/>
        <path d="M5.5 28L26.5 3" stroke="var(--felt-deep)" strokeWidth="6" strokeLinecap="round" fill="none"/>
        <path d="M5.5 28L26.5 3" stroke="var(--ember-hi)" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      </symbol>
      <symbol id="i-stun" viewBox="0 0 32 32">
        <g transform="rotate(42 16 16)">
          <rect x="14.2" y="23" width="3.6" height="6.5" rx="1.2" fill="var(--brass)"/>
          <rect x="9.5" y="20.8" width="13" height="2.8" rx="1.2" fill="var(--brass-hi)"/>
          <path d="M13.3 20.8v-7.3l2.2-1.8 1.3 2.3 1.9-1.7v8.5z" fill="var(--bone)"/>
          <path d="M13.3 9.3l2.2-2 1.3 2.5 1.9-1.8V4.5L16 1 13.3 4.5z" fill="var(--bone)" transform="translate(3.5 -.5) rotate(14 16 6)"/>
        </g>
      </symbol>
      <symbol id="i-bribe" viewBox="0 0 32 32">
        <path d="M11 9.5c-4 4-6.5 8-6.5 12 0 4.5 4.5 7 11.5 7s11.5-2.5 11.5-7c0-4-2.5-8-6.5-12z" fill="var(--brass)"/>
        <path d="M11.3 4.3l2.7 1.7 2-2 2 2 2.7-1.7L21 9.5H11z" fill="var(--brass-hi)"/>
        <rect x="10.3" y="8.5" width="11.4" height="2.3" rx="1.15" fill="var(--brass-dim)"/>
        <circle cx="16" cy="19.8" r="4.8" fill="var(--fav-gold)"/>
        <circle cx="16" cy="19.8" r="2.7" fill="none" stroke="var(--brass)" strokeWidth="1.2"/>
      </symbol>
      <symbol id="i-exposed" viewBox="0 0 32 32">
        <circle cx="15" cy="17.5" r="11.5" fill="var(--bone)"/>
        <circle cx="15" cy="17.5" r="8" fill="var(--ember)"/>
        <circle cx="15" cy="17.5" r="4.5" fill="var(--bone)"/>
        <circle cx="15" cy="17.5" r="1.8" fill="var(--ember)"/>
        <path d="M29 2l-8 8.5 3.3.7-8.3 7" stroke="var(--felt-deep)" strokeWidth="4.2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        <path d="M29 2l-8 8.5 3.3.7-8.3 7" stroke="var(--fav-gold)" strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      </symbol>
      <symbol id="i-shoe" viewBox="0 0 32 32">
        <path d="M4.5 28V15a11.5 11.5 0 0 1 23 0v13h-5V15a6.5 6.5 0 0 0-13 0v13z" fill="var(--bone-dim)"/>
        <g fill="var(--felt-deep)">
          <circle cx="7" cy="23.5" r="1.1"/>
          <circle cx="7" cy="16" r="1.1"/>
          <circle cx="10.5" cy="9.3" r="1.1"/>
          <circle cx="21.5" cy="9.3" r="1.1"/>
          <circle cx="25" cy="16" r="1.1"/>
          <circle cx="25" cy="23.5" r="1.1"/>
        </g>
      </symbol>
      <symbol id="i-link" viewBox="0 0 32 32">
        <path d="M9.5 4.5C6 4.5 3.5 7.2 3.5 10.5c0 5 5 8.5 9.5 12.5 4.5-4 9.5-7.5 9.5-12.5 0-3.3-2.5-6-6-6-1.5 0-2.7.6-3.5 1.7-.8-1.1-2-1.7-3.5-1.7z" fill="var(--ember-hi)"/>
        <g fill="none" stroke="var(--bone)" strokeWidth="2.3">
          <ellipse cx="19.5" cy="21" rx="4.8" ry="3" transform="rotate(40 19.5 21)"/>
          <ellipse cx="25" cy="25.8" rx="4.3" ry="2.8" transform="rotate(40 25 25.8)"/>
        </g>
      </symbol>
      <symbol id="i-defdown" viewBox="0 0 32 32">
        <path d="M16 2.5l10.5 3.8v8.7c0 6.5-4.5 11.2-10.5 14.5C10 26.2 5.5 21.5 5.5 15V6.3z" fill="var(--stat-defense)"/>
        <path d="M16 8.5v10M11 15l5 5.5 5-5.5" stroke="var(--felt-deep)" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </symbol>
      <symbol id="i-wind" viewBox="0 0 32 32">
        <g fill="none" stroke="var(--badge-wind)" strokeWidth="2.6" strokeLinecap="round">
          <path d="M3.5 11H18a3.6 3.6 0 1 0-3.6-3.6"/>
          <path d="M3.5 16.5h20.5a3.6 3.6 0 1 1-3.6 3.6"/>
          <path d="M3.5 22h9a3.2 3.2 0 1 1-3.2 3.2"/>
        </g>
      </symbol>
      <symbol id="i-flame" viewBox="0 0 32 32">
        <path d="M16 2c1 5.5 8 8.5 8 16.5a8 8 0 0 1-16 0c0-3.2 1.5-5.3 3.2-7 .3 2.2 1 3.2 2.1 3.8C13 11 14 6 16 2z" fill="var(--ember-hi)"/>
        <path d="M16.3 15c.5 2.7 3.7 3.8 3.7 7.5a3.8 3.8 0 0 1-7.6 0c0-1.6.8-2.7 1.6-3.5.3 1 .8 1.5 1.3 1.7-.2-2.1.2-4.1 1-5.7z" fill="var(--fav-gold)"/>
      </symbol>
      <symbol id="i-mark" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--badge-mark)" strokeWidth="2.4"/>
        <path d="M16 2.5v7M16 22.5v7M2.5 16h7M22.5 16h7" stroke="var(--badge-mark)" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
        <circle cx="16" cy="16" r="2.6" fill="var(--card-white)"/>
      </symbol>
    </defs>
  </svg>
);

export default BadgeSprite;
