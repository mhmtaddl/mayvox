import type { CSSProperties } from 'react';

type RangeCssVars = CSSProperties & Record<string, string | number>;

export const rangeVisualStyle = (
  value: number,
  min: number,
  max: number,
  options: { height?: string } = {},
): CSSProperties => {
  const pct = max <= min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const intensity = pct / 100;

  const style: RangeCssVars = {
    '--range-percent': `${pct}%`,
    '--range-intensity': Number(intensity.toFixed(3)),
    '--range-fill-alpha': Number((0.20 + intensity * 0.22).toFixed(3)),
    '--range-thumb-alpha': Number((0.66 + intensity * 0.18).toFixed(3)),
    '--range-thumb-glow': Number((0.015 + intensity * 0.055).toFixed(3)),
  };

  if (options.height) {
    style['--range-height'] = options.height;
  }

  return style;
};
