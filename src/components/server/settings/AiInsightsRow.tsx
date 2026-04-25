import React, { memo } from 'react';
import { Sparkles, Lightbulb, AlertTriangle } from 'lucide-react';
import type { InsightNarrative } from '../../../lib/serverService';

/**
 * AI İçgörüler satırı — backend'den gelen rule-based narrative kartları.
 * Horizontal scroll row; 0 kart varsa hiç render edilmez (boş alan bırakmaz).
 */

const ICONS = {
  highlight: Sparkles,
  insight: Lightbulb,
  warning: AlertTriangle,
} as const;

interface Props {
  narratives: InsightNarrative[] | undefined;
}

function AiInsightsRowInner({ narratives }: Props) {
  if (!narratives || narratives.length === 0) return null;

  return (
    <div className="flex items-stretch gap-2.5 w-full">
      {narratives.map(n => (
        <InsightCard key={n.id} narrative={n} />
      ))}
    </div>
  );
}

export default memo(AiInsightsRowInner);

// ── InsightCard ──
const InsightCard = memo(function InsightCard({ narrative }: { narrative: InsightNarrative }) {
  const Icon = ICONS[narrative.type] ?? Lightbulb;

  return (
    <div
      className="relative flex-1 min-w-0 flex items-start gap-2.5 rounded-[14px] p-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.06), rgba(var(--glass-tint), 0.03))',
        border: '1px solid rgba(var(--theme-accent-rgb), 0.14)',
        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.03), 0 2px 12px rgba(var(--theme-accent-rgb), 0.05)',
        transition: 'transform 180ms ease-out, box-shadow 180ms ease-out',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint),0.04), 0 6px 18px rgba(var(--theme-accent-rgb), 0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint),0.03), 0 2px 12px rgba(var(--theme-accent-rgb), 0.05)';
      }}
    >
      <span
        className="inline-flex items-center justify-center shrink-0 rounded-lg"
        style={{
          width: 28,
          height: 28,
          background: 'rgba(var(--theme-accent-rgb), 0.14)',
          color: 'rgba(var(--theme-accent-rgb), 1)',
        }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--theme-secondary-text)]/55 mb-0.5">
          {narrative.title}
        </div>
        <div className="text-[11.5px] font-medium text-[var(--theme-text)]/90 leading-snug"
          style={{
            whiteSpace: 'pre-line',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {narrative.text}
        </div>
      </div>
    </div>
  );
});
