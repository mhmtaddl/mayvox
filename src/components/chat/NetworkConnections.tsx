import React from 'react';

/** Subtle organic curve — slight perpendicular bow */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(30, dist * 0.08);
  const nx = -dy / dist;
  const ny = dx / dist;
  const cpx = (x1 + x2) / 2 + nx * bow;
  const cpy = (y1 + y2) / 2 + ny * bow;
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

interface NodePoint {
  id: string;
  x: number;
  y: number;
  isSpeaking: boolean;
}

interface Props {
  center: NodePoint | null;
  remotes: NodePoint[];
  centerSpeaking: boolean;
}

export default function NetworkConnections({ center, remotes, centerSpeaking }: Props) {
  if (!center || remotes.length === 0) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
      <defs>
        {/* Very subtle glow — not heavy, just a hint */}
        <filter id="nc-hint" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {remotes.map(node => {
        const d = curvePath(center.x, center.y, node.x, node.y);
        const pathId = `nc-p-${node.id}`;
        const active = node.isSpeaking || centerSpeaking;

        return (
          <g key={node.id}>
            {/* Hidden path for animateMotion */}
            <path id={pathId} d={d} fill="none" stroke="none" />

            {/* Base path — thin, subtle, always visible */}
            <path
              d={d}
              fill="none"
              stroke={`rgba(var(--theme-accent-rgb), ${active ? 0.25 : 0.1})`}
              strokeWidth={active ? 2 : 1.5}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.4s ease, stroke-width 0.3s ease' }}
            />

            {/* Soft glow under — only a hint, thin */}
            <path
              d={d}
              fill="none"
              stroke={`rgba(var(--theme-accent-rgb), ${active ? 0.08 : 0.03})`}
              strokeWidth={active ? 6 : 4}
              strokeLinecap="round"
              filter="url(#nc-hint)"
            />

            {/* Speaking pulse dot — small, travels along path */}
            {active && (
              <circle r={3} fill={`rgba(var(--theme-accent-rgb), 0.6)`}>
                <animateMotion
                  dur={node.isSpeaking ? '1.4s' : '1.8s'}
                  repeatCount="indefinite"
                  keyPoints={node.isSpeaking ? '1;0' : '0;1'}
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            )}

            {/* Small endpoint dot — remote side */}
            <circle
              cx={node.x} cy={node.y}
              r={active ? 3 : 2}
              fill={`rgba(var(--theme-accent-rgb), ${active ? 0.3 : 0.1})`}
            />
          </g>
        );
      })}

      {/* Center endpoint dot */}
      <circle
        cx={center.x} cy={center.y}
        r={centerSpeaking ? 3.5 : 2}
        fill={`rgba(var(--theme-accent-rgb), ${centerSpeaking ? 0.3 : 0.1})`}
      />
    </svg>
  );
}
