import React from 'react';
import { motion } from 'motion/react';

interface Props {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
}

export default function UpdateProgressRing({
  progress,
  size = 28,
  stroke = 2.5,
  color = 'var(--theme-accent)',
  trackColor = 'rgba(var(--theme-accent-rgb), 0.12)',
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        strokeWidth={stroke}
        stroke={trackColor}
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        strokeWidth={stroke} strokeLinecap="round"
        stroke={color}
        strokeDasharray={c}
        animate={{ strokeDashoffset: c - (progress / 100) * c }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      />
    </svg>
  );
}
