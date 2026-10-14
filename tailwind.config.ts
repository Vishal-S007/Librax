import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), raised: token('surface-raised'), sunken: token('surface-sunken') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), faint: token('ink-faint') },
        brass: { DEFAULT: token('brass'), soft: token('brass-soft'), ink: token('brass-ink') },
        sage: { DEFAULT: token('sage'), soft: token('sage-soft') },
        rose: { DEFAULT: token('rose'), soft: token('rose-soft') },
        sky: { DEFAULT: token('sky'), soft: token('sky-soft') },
        plum: { DEFAULT: token('plum'), soft: token('plum-soft') },
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        sans: ['Inter', '"SF Pro Text"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { card: 'var(--radius-card)', control: 'var(--radius-control)' },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        book: 'var(--shadow-book)',
      },
      transitionDuration: { fast: '120ms', base: '200ms', slow: '320ms' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
} satisfies Config;
