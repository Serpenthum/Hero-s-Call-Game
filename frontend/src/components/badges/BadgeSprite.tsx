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
          <path d="M16 15.500c4 0 7.500 3.600 7.500 7.200 0 2.600-2 4-4 3.600-1.600-.3-2.300-1-3.500-1s-1.900.7-3.500 1c-2 .4-4-1-4-3.600 0-3.600 3.500-7.200 7.500-7.200z"/>
          <ellipse cx="7" cy="14.500" rx="2.500" ry="3.300" transform="rotate(-22 7 14.500)"/>
          <ellipse cx="12.300" cy="8.800" rx="2.600" ry="3.600" transform="rotate(-8 12.300 8.800)"/>
          <ellipse cx="19.700" cy="8.800" rx="2.600" ry="3.600" transform="rotate(8 19.700 8.800)"/>
          <ellipse cx="25" cy="14.500" rx="2.500" ry="3.300" transform="rotate(22 25 14.500)"/>
        </g>
      </symbol>
      <g id="badge-totem-head">
        <rect width="11" height="8.200" rx="1.600" fill="var(--brass)"/>
        <circle cx="3.300" cy="3.200" r="1.200" fill="var(--walnut)"/>
        <circle cx="7.700" cy="3.200" r="1.200" fill="var(--walnut)"/>
        <rect x="3" y="5.400" width="5" height="1.300" fill="var(--walnut)"/>
      </g>
      <symbol id="i-totem1" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.500" y="20.2"/>
        <rect x="11" y="12.1" width="10" height="7.200" rx="1.600" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.500"/>
        <rect x="11" y="3.5" width="10" height="7.200" rx="1.600" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.500"/>
        <path d="M3.500 24.799999999999997l7-2.500v4.600l-7 1.500zM28.500 24.799999999999997l-7-2.500v4.600l7 1.500z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-totem2" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.500" y="20.2"/>
        <use href="#badge-totem-head" x="10.500" y="11.6"/>
        <rect x="11" y="3.5" width="10" height="7.200" rx="1.600" fill="none" stroke="var(--brass-dim)" strokeWidth="1" strokeDasharray="2 1.500"/>
        <path d="M3.500 16.2l7-2.500v4.600l-7 1.500zM28.500 16.2l-7-2.500v4.600l7 1.500z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-totem3" viewBox="0 0 32 32">
        <use href="#badge-totem-head" x="10.500" y="20.2"/>
        <use href="#badge-totem-head" x="10.500" y="11.6"/>
        <use href="#badge-totem-head" x="10.500" y="3"/>
        <path d="M3.500 7.6l7-2.500v4.600l-7 1.500zM28.500 7.6l-7-2.500v4.600l7 1.500z" fill="var(--brass-hi)"/>
      </symbol>
      <symbol id="i-blows" viewBox="0 0 32 32">
        <g strokeLinecap="round">
          <path d="M6 5l17 17" stroke="var(--bone)" strokeWidth="3.200"/>
          <path d="M26 5L9 22" stroke="var(--bone)" strokeWidth="3.200"/>
          <path d="M19.500 24.500l5.500-5.500M12.500 24.500L7 19" stroke="var(--brass-hi)" strokeWidth="2.600"/>
          <path d="M23 22l4.500 4.500M9 22l-4.500 4.500" stroke="var(--brass)" strokeWidth="3.400"/>
        </g>
        <path d="M16 9l1.300 3.200 3.200 1.300-3.200 1.300L16 18l-1.300-3.200-3.200-1.300 3.200-1.300z" fill="var(--ember-hi)"/>
      </symbol>
      <symbol id="i-golem" viewBox="0 0 32 32">
        <path d="M2.500 30v-6.500l4.500-3.500h18l4.500 3.500V30z" fill="var(--badge-stone-shade)"/>
        <path d="M2.500 23.500L7 20h5v10H2.500zM20 20h5l4.500 3.500V30H20z" fill="var(--badge-stone)"/>
        <path d="M2.500 26.500H12M20 26h9.500M7 23.500v3M25 23v3" stroke="var(--badge-stone-line)" strokeWidth=".8" fill="none"/>
        <rect x="7.500" y="4.500" width="17" height="16" rx="3.500" fill="var(--badge-iron)"/>
        <rect x="7.500" y="4.500" width="17" height="4.500" rx="2.200" fill="var(--badge-iron-hi)"/>
        <circle cx="16" cy="13" r="5.800" fill="var(--badge-socket)"/>
        <circle cx="16" cy="13" r="4.300" fill="url(#badge-core)"/>
        <circle cx="9.800" cy="18.500" r=".8" fill="var(--badge-rivet)"/>
        <circle cx="22.200" cy="18.500" r=".8" fill="var(--badge-rivet)"/>
        <path d="M6.500 6c1.500-3.500 4-3.800 5.500-1.500 1-2 3-2 4 0-3 1.500-6.500 2.300-9.500 1.500zM23.500 21c1-2.500 3.500-2.500 4.500 0l-2 1z" fill="var(--badge-moss)"/>
      </symbol>
      <symbol id="i-bot" viewBox="0 0 32 32">
        <rect x="15.300" y="3" width="1.400" height="4.500" fill="var(--bone)"/>
        <circle cx="16" cy="3.200" r="1.700" fill="var(--ember-hi)"/>
        <rect x="2.800" y="13" width="3.500" height="6.500" rx="1.200" fill="var(--bone-dim)"/>
        <rect x="25.700" y="13" width="3.500" height="6.500" rx="1.200" fill="var(--bone-dim)"/>
        <rect x="6" y="7" width="20" height="18.500" rx="6" fill="var(--bone)"/>
        <path d="M14 10.200h4v3.800h3.800v4H18v3.800h-4V18h-3.800v-4H14z" fill="var(--ember)"/>
        <rect x="10.500" y="25.500" width="3.800" height="3.500" rx="1" fill="var(--bone-dim)"/>
        <rect x="17.700" y="25.500" width="3.800" height="3.500" rx="1" fill="var(--bone-dim)"/>
      </symbol>
      <symbol id="i-blood" viewBox="0 0 32 32">
        <path d="M16 3c5.500 7.500 8.500 11.800 8.500 16.300a8.500 8.500 0 0 1-17 0C7.500 14.800 10.500 10.500 16 3z" fill="var(--ember)"/>
        <path d="M11.300 19.500c0 2.600 1.600 4.600 4 5.100" stroke="var(--badge-blood-shine)" strokeWidth="1.700" fill="none" strokeLinecap="round"/>
      </symbol>
      <symbol id="i-hidden" viewBox="0 0 32 32">
        <g fill="var(--bone-dim)">
          <circle cx="9.500" cy="19.500" r="6.500"/>
          <circle cx="16.500" cy="13.500" r="8.500"/>
          <circle cx="23.500" cy="20" r="6"/>
          <rect x="8" y="18" width="17" height="8" rx="3"/>
        </g>
        <path d="M10.500 14.800l4.500 1.900-4.500 1.300zM22.500 14.800L18 16.700l4.500 1.300z" fill="var(--felt-deep)"/>
      </symbol>
      <symbol id="i-ashield" viewBox="0 0 32 32">
        <path d="M16 2.500l10.500 3.800v8.700c0 6.500-4.500 11.200-10.500 14.500C10 26.200 5.500 21.500 5.500 15V6.300z" fill="var(--stat-defense)"/>
        <path d="M16 2.500v27c6-3.300 10.500-8 10.500-14.500V6.300z" fill="var(--badge-shield-shade)"/>
        <path d="M16 8l1.900 5 5 1.900-5 1.900-1.900 5-1.900-5-5-1.900 5-1.900z" fill="var(--card-white)"/>
      </symbol>
      <symbol id="i-poison" viewBox="0 0 32 32">
        <path d="M16 3c5.500 7.500 8.500 11.800 8.500 16.300a8.500 8.500 0 0 1-17 0C7.500 14.800 10.500 10.500 16 3z" fill="var(--poison)"/>
        <g fill="var(--felt-deep)">
          <circle cx="12.800" cy="18" r="2.300"/>
          <circle cx="19.200" cy="18" r="2.300"/>
          <rect x="12.600" y="22.600" width="1.700" height="2.800"/>
          <rect x="15.150" y="22.600" width="1.700" height="2.800"/>
          <rect x="17.700" y="22.600" width="1.700" height="2.800"/>
        </g>
      </symbol>
      <symbol id="i-taunt" viewBox="0 0 32 32">
        <path d="M5.500 5.500L8 8.500M26.500 5.500L24 8.500M16 2v3" stroke="var(--ember-hi)" strokeWidth="2" strokeLinecap="round" fill="none"/>
        <circle cx="16" cy="18" r="10.500" fill="var(--ember-hi)"/>
        <path d="M8.800 12.800l5.700 2.600M23.200 12.800l-5.700 2.600" stroke="var(--felt-deep)" strokeWidth="2.200" strokeLinecap="round" fill="none"/>
        <circle cx="12.200" cy="17.800" r="1.400" fill="var(--felt-deep)"/>
        <circle cx="19.800" cy="17.800" r="1.400" fill="var(--felt-deep)"/>
        <rect x="11" y="21.300" width="10" height="3.800" rx="1" fill="var(--bone)"/>
        <path d="M14.300 21.300v3.800M17.700 21.300v3.800" stroke="var(--felt-deep)" strokeWidth=".9" fill="none"/>
      </symbol>
      <symbol id="i-silence" viewBox="0 0 32 32">
        <path d="M5 6h22a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H15.500L9 27.500V22H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="var(--bone)"/>
        <path d="M5.500 28L26.500 3" stroke="var(--felt-deep)" strokeWidth="6" strokeLinecap="round" fill="none"/>
        <path d="M5.500 28L26.500 3" stroke="var(--ember-hi)" strokeWidth="3.200" strokeLinecap="round" fill="none"/>
      </symbol>
      <symbol id="i-stun" viewBox="0 0 32 32">
        <g transform="rotate(42 16 16)">
          <rect x="14.200" y="23" width="3.600" height="6.500" rx="1.200" fill="var(--brass)"/>
          <rect x="9.500" y="20.800" width="13" height="2.800" rx="1.200" fill="var(--brass-hi)"/>
          <path d="M13.300 20.800v-7.300l2.200-1.800 1.300 2.300 1.900-1.700v8.500z" fill="var(--bone)"/>
          <path d="M13.300 9.300l2.200-2 1.300 2.500 1.900-1.800V4.500L16 1 13.300 4.500z" fill="var(--bone)" transform="translate(3.500 -.5) rotate(14 16 6)"/>
        </g>
      </symbol>
      <symbol id="i-bribe" viewBox="0 0 32 32">
        <path d="M11 9.500c-4 4-6.500 8-6.500 12 0 4.500 4.500 7 11.500 7s11.500-2.500 11.500-7c0-4-2.500-8-6.500-12z" fill="var(--brass)"/>
        <path d="M11.300 4.300l2.700 1.700 2-2 2 2 2.700-1.700L21 9.500H11z" fill="var(--brass-hi)"/>
        <rect x="10.300" y="8.500" width="11.400" height="2.300" rx="1.150" fill="var(--brass-dim)"/>
        <circle cx="16" cy="19.800" r="4.800" fill="var(--fav-gold)"/>
        <circle cx="16" cy="19.800" r="2.700" fill="none" stroke="var(--brass)" strokeWidth="1.200"/>
      </symbol>
      <symbol id="i-exposed" viewBox="0 0 32 32">
        <circle cx="15" cy="17.500" r="11.500" fill="var(--bone)"/>
        <circle cx="15" cy="17.500" r="8" fill="var(--ember)"/>
        <circle cx="15" cy="17.500" r="4.500" fill="var(--bone)"/>
        <circle cx="15" cy="17.500" r="1.800" fill="var(--ember)"/>
        <path d="M29 2l-8 8.500 3.300.7-8.300 7" stroke="var(--felt-deep)" strokeWidth="4.200" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        <path d="M29 2l-8 8.500 3.300.7-8.300 7" stroke="var(--fav-gold)" strokeWidth="2.200" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      </symbol>
      <symbol id="i-shoe" viewBox="0 0 32 32">
        <path d="M4.500 28V15a11.500 11.500 0 0 1 23 0v13h-5V15a6.500 6.500 0 0 0-13 0v13z" fill="var(--bone-dim)"/>
        <g fill="var(--felt-deep)">
          <circle cx="7" cy="23.500" r="1.100"/>
          <circle cx="7" cy="16" r="1.100"/>
          <circle cx="10.500" cy="9.300" r="1.100"/>
          <circle cx="21.500" cy="9.300" r="1.100"/>
          <circle cx="25" cy="16" r="1.100"/>
          <circle cx="25" cy="23.500" r="1.100"/>
        </g>
      </symbol>
      <symbol id="i-link" viewBox="0 0 32 32">
        <path d="M9.500 4.500C6 4.500 3.500 7.200 3.500 10.500c0 5 5 8.500 9.500 12.500 4.500-4 9.500-7.500 9.500-12.500 0-3.300-2.500-6-6-6-1.500 0-2.700.6-3.500 1.700-.8-1.100-2-1.700-3.500-1.700z" fill="var(--ember-hi)"/>
        <g fill="none" stroke="var(--bone)" strokeWidth="2.300">
          <ellipse cx="19.500" cy="21" rx="4.800" ry="3" transform="rotate(40 19.500 21)"/>
          <ellipse cx="25" cy="25.800" rx="4.300" ry="2.800" transform="rotate(40 25 25.800)"/>
        </g>
      </symbol>
      <symbol id="i-defdown" viewBox="0 0 32 32">
        <path d="M16 2.500l10.500 3.800v8.700c0 6.500-4.500 11.200-10.500 14.500C10 26.200 5.500 21.500 5.500 15V6.300z" fill="var(--stat-defense)"/>
        <path d="M16 8.500v10M11 15l5 5.500 5-5.500" stroke="var(--felt-deep)" strokeWidth="2.800" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </symbol>
      <symbol id="i-wind" viewBox="0 0 32 32">
        <g fill="none" stroke="var(--badge-wind)" strokeWidth="2.600" strokeLinecap="round">
          <path d="M3.500 11H18a3.600 3.600 0 1 0-3.600-3.600"/>
          <path d="M3.500 16.500h20.500a3.600 3.600 0 1 1-3.600 3.600"/>
          <path d="M3.500 22h9a3.200 3.200 0 1 1-3.200 3.200"/>
        </g>
      </symbol>
      <symbol id="i-flame" viewBox="0 0 32 32">
        <path d="M16 2c1 5.500 8 8.500 8 16.500a8 8 0 0 1-16 0c0-3.200 1.500-5.300 3.200-7 .3 2.200 1 3.200 2.100 3.800C13 11 14 6 16 2z" fill="var(--ember-hi)"/>
        <path d="M16.300 15c.5 2.700 3.700 3.800 3.700 7.500a3.800 3.800 0 0 1-7.600 0c0-1.600.8-2.700 1.600-3.500.3 1 .8 1.500 1.300 1.700-.2-2.100.2-4.100 1-5.700z" fill="var(--fav-gold)"/>
      </symbol>
      <symbol id="i-mark" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="8.500" fill="none" stroke="var(--badge-mark)" strokeWidth="2.400"/>
        <path d="M16 2.500v7M16 22.500v7M2.500 16h7M22.500 16h7" stroke="var(--badge-mark)" strokeWidth="2.400" strokeLinecap="round" fill="none"/>
        <circle cx="16" cy="16" r="2.600" fill="var(--card-white)"/>
      </symbol>
    </defs>
  </svg>
);

export default BadgeSprite;
