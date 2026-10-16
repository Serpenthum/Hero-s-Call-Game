() => {
  // Computed styles of the draft/battle chrome (everything except the hero cards), keyed by tag and class.
  const ROOTS = ['.game-sidebar', '.action-bar', '.battle-layout', '.draft-phase', '.setup-phase',
    '.initiative-overlay', '.game-over-overlay', '.turn-timer-bar', '.floating-surrender-button',
    '.spectator-count-button', '.spectator-list-modal'];
  const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderTopWidth',
    'borderTopStyle', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'textTransform',
    'textAlign', 'display', 'position', 'width', 'height', 'paddingTop', 'paddingLeft', 'marginTop',
    'marginLeft', 'opacity', 'zIndex', 'overflowY'];
  const out = {};
  const seen = new Set();
  for (const sel of ROOTS) {
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (seen.has(el) || el.closest('.hero-card')) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        const sig = PROPS.map(p => cs[p]).join('|');
        const cls = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
        (out[`${el.tagName.toLowerCase()}.${cls}`] ||= new Set()).add(sig);
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}
