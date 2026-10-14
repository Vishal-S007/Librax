import { useEffect, useState } from 'react';

const read = (name: string) => {
  if (typeof window === 'undefined') return '#888';
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgb(${v.split(/\s+/).join(',')})` : '#888';
};

function resolve() {
  return {
    brass: read('brass'), sage: read('sage'), rose: read('rose'), sky: read('sky'), plum: read('plum'),
    ink: read('ink'), muted: read('ink-muted'), faint: read('ink-faint'), line: read('line'), surface: read('surface-raised'),
    series: [read('brass'), read('sage'), read('sky'), read('plum'), read('rose'), read('ink-faint')],
  };
}

/** Resolves design tokens to concrete colours for SVG charts and re-reads them when the theme class changes. */
export function useChartColors() {
  const [colors, setColors] = useState(resolve);
  useEffect(() => {
    setColors(resolve());
    const obs = new MutationObserver(() => setColors(resolve()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
