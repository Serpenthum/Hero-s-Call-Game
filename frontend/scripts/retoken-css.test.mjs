import test from 'node:test';
import assert from 'node:assert/strict';
import { retokenColour, retokenDeclaration, retokenCss } from './retoken-css.mjs';

test('accent colours map to the right token families', () => {
  assert.equal(retokenColour('#007bff'), 'var(--brass)');
  assert.equal(retokenColour('#28a745'), 'var(--verdigris)');
  assert.equal(retokenColour('#dc3545'), 'var(--ember)');
  assert.equal(retokenColour('#ffd700'), 'var(--brass-hi)');
  assert.equal(retokenColour('#ff6b6b'), 'var(--ember-hi)');
});

test('neutrals map by lightness', () => {
  assert.equal(retokenColour('#ffffff'), 'var(--bone)');
  assert.equal(retokenColour('#fff'), 'var(--bone)');
  assert.equal(retokenColour('#aaa'), 'var(--bone-dim)');
  assert.equal(retokenColour('#333'), 'var(--leather)');
  assert.equal(retokenColour('#000'), 'var(--felt-deep)');
});

test('dark blue surfaces become walnut, not brass', () => {
  assert.equal(retokenColour('rgb(30, 45, 70)'), 'var(--leather)');
  assert.equal(retokenColour('rgba(20, 35, 60, 0.98)'), 'var(--walnut)');
});

test('alpha becomes color-mix', () => {
  assert.equal(retokenColour('rgba(0, 0, 0, 0.8)'), 'color-mix(in srgb, var(--felt-deep) 80%, transparent)');
  assert.equal(retokenColour('rgba(255, 255, 255, 0.1)'), 'color-mix(in srgb, var(--bone) 10%, transparent)');
});

test('shadows use the shade colour whatever the hue', () => {
  assert.equal(retokenDeclaration('box-shadow', '0 4px 15px rgba(0, 123, 255, 0.3)'), '0 4px 15px color-mix(in srgb, var(--felt-deep) 30%, transparent)');
  assert.equal(retokenDeclaration('text-shadow', '2px 2px 4px rgba(0, 0, 0, 0.5)'), '2px 2px 4px color-mix(in srgb, var(--felt-deep) 50%, transparent)');
});

test('gradients and named colours', () => {
  assert.equal(retokenDeclaration('background', 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)'), 'linear-gradient(135deg, var(--brass) 0%, var(--brass) 100%)');
  assert.equal(retokenDeclaration('color', 'white'), 'var(--bone)');
  assert.equal(retokenDeclaration('background', 'transparent'), 'transparent');
});

test('caps and fonts', () => {
  assert.equal(retokenDeclaration('text-transform', 'uppercase'), 'none');
  assert.equal(retokenDeclaration('text-transform', 'capitalize'), 'capitalize');
  assert.equal(retokenDeclaration('font-family', "'Orbitron', monospace"), 'var(--font-ui)');
  assert.equal(retokenDeclaration('font-family', '"Apple Color Emoji", sans-serif'), '"Apple Color Emoji", sans-serif');
});

test('whole stylesheet: selectors and media queries are left alone', () => {
  const css = '@media (max-width: 768px) {\n  .a:hover { color: #fff; border: 1px solid rgba(255, 0, 0, 0.5); }\n}\n.b { width: 10px; }';
  const out = retokenCss(css);
  assert.equal(out, '@media (max-width: 768px) {\n  .a:hover { color: var(--bone); border: 1px solid color-mix(in srgb, var(--ember) 50%, transparent); }\n}\n.b { width: 10px; }');
  assert.equal(retokenCss(out), out); // idempotent
});
