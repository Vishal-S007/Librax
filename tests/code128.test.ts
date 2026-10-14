import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, CODE128_STOP, code128Svg, code128Values, code128Widths } from '@/lib/code128';

const sum = (p: string) => p.split('').reduce((a, c) => a + Number(c), 0);
const barSum = (p: string) => p.split('').filter((_, i) => i % 2 === 0).reduce((a, c) => a + Number(c), 0);

describe('Code 128 pattern table', () => {
  it('has 106 unique symbols plus stop, each structurally valid', () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    expect(new Set(CODE128_PATTERNS).size).toBe(106);
    for (const p of CODE128_PATTERNS) {
      expect(p).toMatch(/^[1-4]{6}$/);
      expect(sum(p)).toBe(11); // every symbol is 11 modules wide
      expect(barSum(p) % 2).toBe(0); // Code 128 parity: bar modules are even
    }
    expect(sum(CODE128_STOP)).toBe(13);
  });
});

describe('Code 128B encoding', () => {
  it('computes the standard checksum', () => {
    // Start B (104) + "A"(33)×1 + "B"(34)×2 = 205 → 205 mod 103 = 102
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });
  it('produces the right total width for a LIBRAX barcode', () => {
    const w = code128Widths('LBX-000123');
    // start + 10 chars + checksum = 12 symbols × 11 modules, plus 13-module stop
    expect(w.reduce((a, b) => a + b, 0)).toBe(12 * 11 + 13);
    expect(w.length).toBe(12 * 6 + 7);
  });
  it('renders an SVG and rejects characters it cannot encode', () => {
    const svg = code128Svg('LBX-000001');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/aria-label="Barcode LBX-000001"/);
    expect(() => code128Values('é')).toThrow(/cannot encode/);
  });
});
