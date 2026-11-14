import { describe, expect, it } from 'vitest';
import { checkRendererPaints, findRawPaints } from '../scripts/check-design-tokens.mjs';

describe('renderer color ownership', () => {
  it('keeps authored interface paints in tokens.css', () => {
    expect(checkRendererPaints().violations).toEqual([]);
  });

  it('rejects hex and functional colors in declarations, including fallbacks', () => {
    const css = '#abc { color: #123; background: rgb(1 2 3 / 40%); border: 1px solid var(--edge, #abcdef); --local: hsl(20 30% 40%); }';
    expect(findRawPaints(css, 'surface.css').map((hit) => hit.value)).toEqual(['#123', 'rgb(1 2 3 / 40%)', '#abcdef', 'hsl(20 30% 40%)']);
  });

  it('accepts selectors, comments and semantic variables', () => {
    expect(findRawPaints('/* color: #123 */ #abc { color: var(--gw-text); background: transparent; }', 'surface.css')).toEqual([]);
  });

  it('finds TSX/JSX style, SVG paint attributes and embedded SVG markup', () => {
    const source = 'const view = <svg style={{ color: "#123456" }} fill="#abcd"/>; const svg = `<path stroke="rgba(1,2,3,.2)"/>`;';
    expect(findRawPaints(source, 'View.tsx').map((hit) => hit.value)).toEqual(['#123456', '#abcd', 'rgba(1,2,3,.2)']);
    expect(findRawPaints(source, 'View.jsx').map((hit) => hit.value)).toEqual(['#123456', '#abcd', 'rgba(1,2,3,.2)']);
  });

  it('does not treat validation regexes as hardcoded paint', () => {
    expect(findRawPaints('const pattern = /^#[a-f0-9]{6}$/i;', 'validate.ts')).toEqual([]);
  });
});
