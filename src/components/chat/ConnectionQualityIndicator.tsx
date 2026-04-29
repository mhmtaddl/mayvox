import React from 'react';
import { X } from 'lucide-react';

interface ConnectionQualityIndicatorProps {
  connectionLevel: number;
  isConnecting: boolean;
  isActive: boolean;
  latencyMs?: number;
  jitterMs?: number;
}

function getBarColor(level: number) {
  if (level >= 4) return 'bg-emerald-500';
  if (level === 3) return 'bg-lime-500';
  if (level === 2) return 'bg-amber-500';
  if (level === 1) return 'bg-amber-600';
  return 'bg-red-500';
}

function getStatusLabel(isActive: boolean, isConnecting: boolean, connectionLevel: number) {
  if (isConnecting) return null;
  if (connectionLevel === 0) return { text: 'Bağlantı Yok', color: 'text-red-400' };
  if (isActive && connectionLevel === 1) return { text: 'Zayıf', color: 'text-amber-400' };
  return null;
}

function ConnectionQualityIndicatorInner({ connectionLevel, isConnecting, isActive, latencyMs, jitterMs }: ConnectionQualityIndicatorProps) {
  const statusLabel = getStatusLabel(isActive, isConnecting, connectionLevel);
  const roundedLatency = typeof latencyMs === 'number' && Number.isFinite(latencyMs)
    ? Math.round(latencyMs)
    : null;
  const roundedJitter = typeof jitterMs === 'number' && Number.isFinite(jitterMs)
    ? Math.round(jitterMs)
    : null;
  const connectionLabel = isActive ? 'Ses bağlantısı' : 'Uygulama bağlantısı';
  const tooltipLines = connectionLevel === 0
    ? ['Bağlantı yok']
    : [
      connectionLabel,
      roundedLatency == null ? null : `Gecikme: ${roundedLatency} ms`,
      roundedJitter == null ? null : `Dalgalanma: ${roundedJitter} ms`,
    ].filter((line): line is string => Boolean(line));
  const ariaLabel = tooltipLines.join(', ');

  const tooltip = (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1 scale-[0.98] whitespace-nowrap rounded-[10px] border border-white/[0.08] bg-[rgba(20,24,32,0.75)] px-2.5 py-1.5 text-[11px] leading-4 text-white/85 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-[12px] transition-[opacity,transform] duration-[120ms] ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
      role="tooltip"
    >
      {tooltipLines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );

  if (connectionLevel === 0 && !isConnecting) {
    return (
      <div className="group relative flex flex-col items-center gap-0.5" aria-label={ariaLabel}>
        {tooltip}
        <div className="flex flex-col items-center gap-0.5">
          <X size={14} className="text-red-500" />
          {statusLabel && (
            <span className={`text-[8px] font-bold ${statusLabel.color}`}>{statusLabel.text}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col items-center gap-0.5" aria-label={ariaLabel}>
      {tooltip}
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-end gap-0.5 h-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`w-1 rounded-full ${i <= connectionLevel ? getBarColor(connectionLevel) : 'bg-[var(--theme-border)]'}`}
              style={{ height: `${i * 25}%` }}
            />
          ))}
        </div>
        {statusLabel && (
          <span className={`text-[8px] font-bold leading-none ${statusLabel.color}`}>{statusLabel.text}</span>
        )}
      </div>
    </div>
  );
}

const ConnectionQualityIndicator = React.memo(ConnectionQualityIndicatorInner);
export default ConnectionQualityIndicator;
