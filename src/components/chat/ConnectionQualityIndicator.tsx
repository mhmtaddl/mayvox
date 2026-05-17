import React, { useEffect, useRef } from 'react';
import { ChartNoAxesColumnIncreasing, Clock3, Waves, X } from 'lucide-react';

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

function getQualityLabel(isConnecting: boolean, connectionLevel: number) {
  if (isConnecting) return 'Bağlanıyor';
  if (connectionLevel >= 4) return 'Mükemmel';
  if (connectionLevel === 3) return 'İyi';
  if (connectionLevel === 2) return 'Orta';
  if (connectionLevel === 1) return 'Zayıf';
  return 'Bağlantı yok';
}

function ConnectionQualityIndicatorInner({ connectionLevel, isConnecting, isActive, latencyMs, jitterMs }: ConnectionQualityIndicatorProps) {
  const level = Math.max(0, Math.min(4, Math.round(Number.isFinite(connectionLevel) ? connectionLevel : 0)));
  const statusLabel = getStatusLabel(isActive, isConnecting, level);
  const roundedLatency = typeof latencyMs === 'number' && Number.isFinite(latencyMs)
    ? Math.round(latencyMs)
    : null;
  const roundedJitter = typeof jitterMs === 'number' && Number.isFinite(jitterMs)
    ? Math.round(jitterMs)
    : null;
  const lastLatencyRef = useRef<number | null>(null);
  const lastJitterRef = useRef<number | null>(null);

  useEffect(() => {
    if (roundedLatency != null) lastLatencyRef.current = roundedLatency;
  }, [roundedLatency]);

  useEffect(() => {
    if (roundedJitter != null) lastJitterRef.current = roundedJitter;
  }, [roundedJitter]);

  const displayLatency = roundedLatency ?? lastLatencyRef.current;
  const displayJitter = roundedJitter ?? lastJitterRef.current;
  const qualityLabel = getQualityLabel(isConnecting, level);
  const tooltipLines = level === 0
    ? ['Bağlantı yok']
    : [
      `Sinyal: ${qualityLabel}`,
      `Ping: ${displayLatency == null ? '--' : displayLatency} ms`,
      `Dalgalanma: ${displayJitter == null ? '--' : displayJitter} ms`,
    ].filter((line): line is string => Boolean(line));
  const ariaLabel = tooltipLines.join(', ');
  const metricRows = [
    { key: 'quality', label: 'Sinyal', value: qualityLabel, icon: ChartNoAxesColumnIncreasing },
    { key: 'latency', label: 'Ping', value: `${displayLatency == null ? '--' : displayLatency} ms`, icon: Clock3 },
    { key: 'jitter', label: 'Dalgalanma', value: `${displayJitter == null ? '--' : displayJitter} ms`, icon: Waves },
  ];

  const tooltip = (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 min-w-[132px] -translate-x-1/2 translate-y-1 scale-[0.98] whitespace-nowrap rounded-[10px] border border-[rgba(var(--glass-tint),0.085)] bg-[var(--theme-panel)] px-2 py-1.5 text-[11px] leading-4 text-[var(--theme-text)] opacity-0 transition-[opacity,transform] duration-[120ms] ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
      style={{
        background:
          'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.022), rgba(var(--glass-tint),0.010)), var(--theme-panel)',
      }}
      role="tooltip"
    >
      {level === 0 ? (
        <div>{tooltipLines[0]}</div>
      ) : (
        <div className="space-y-1">
          {metricRows.map(({ key, label, value, icon: Icon }) => (
            <div key={key} className="grid grid-cols-[14px_68px_minmax(54px,1fr)] items-center gap-1.5">
              <Icon size={13} className="text-[var(--theme-accent)]/75" aria-hidden="true" />
              <span className="text-[var(--theme-secondary-text)]/72">{label}</span>
              <span className="text-right font-semibold text-[var(--theme-text)] tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (level === 0 && !isConnecting) {
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
      <div className="flex flex-col items-center gap-0.5 opacity-75">
        <div className="flex items-end gap-[2px] h-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`w-[3px] rounded-full ${i <= level ? getBarColor(level) : 'bg-[var(--theme-border)]'}`}
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
