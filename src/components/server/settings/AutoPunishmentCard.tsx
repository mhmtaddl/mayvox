import React from 'react';
import { Gavel, Hash, Clock, Timer } from 'lucide-react';
import type { AutoPunishmentFloodConfig } from '../../../lib/serverService';

const BOUNDS = {
  threshold:       { min: 1, max: 50 },
  windowMinutes:   { min: 1, max: 60 },
  durationMinutes: { min: 1, max: 1440 },
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

interface Props {
  value: AutoPunishmentFloodConfig;
  onChange: (next: AutoPunishmentFloodConfig) => void;
}

/**
 * Oto-Mod → "Otomatik Ceza" card (parent controlled).
 * State parent'ta (dirty/save merge); component sadece UI + validation.
 */
export default function AutoPunishmentCard({ value, onChange }: Props) {
  const set = <K extends keyof AutoPunishmentFloodConfig>(k: K, v: AutoPunishmentFloodConfig[K]) =>
    onChange({ ...value, [k]: v });

  const handleInt = (k: 'threshold' | 'windowMinutes' | 'durationMinutes', raw: string) => {
    const n = parseInt(raw, 10);
    const b = BOUNDS[k];
    set(k, clamp(n, b.min, b.max));
  };

  const disabled = !value.enabled;

  return (
    <section
      className="automod-card rounded-2xl p-3.5 h-full flex flex-col"
      style={{
        background: 'rgba(var(--glass-tint), 0.04)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
      }}
    >
      {/* Header — başlık + ceza rozeti + toggle tek satır */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Gavel size={13} className="text-amber-400 shrink-0" />
          <h4 className="text-[13px] font-bold text-[var(--theme-text)] truncate">Otomatik Ceza</h4>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0"
            style={{
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.26)',
              color: 'rgb(251,191,36)',
            }}
          >
            Yazma Engeli
          </span>
        </div>
        <button
          type="button"
          onClick={() => set('enabled', !value.enabled)}
          role="switch"
          aria-checked={value.enabled}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${value.enabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: value.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className={`transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <InputRow
            icon={<Hash size={11} />}
            label="İhlal"
            unit="ihlal"
            value={value.threshold}
            min={BOUNDS.threshold.min}
            max={BOUNDS.threshold.max}
            onChange={v => handleInt('threshold', v)}
          />
          <InputRow
            icon={<Clock size={11} />}
            label="Süre"
            unit="dk"
            value={value.windowMinutes}
            min={BOUNDS.windowMinutes.min}
            max={BOUNDS.windowMinutes.max}
            onChange={v => handleInt('windowMinutes', v)}
          />
          <InputRow
            icon={<Timer size={11} />}
            label="Ceza süresi"
            unit="dk"
            value={value.durationMinutes}
            min={BOUNDS.durationMinutes.min}
            max={BOUNDS.durationMinutes.max}
            onChange={v => handleInt('durationMinutes', v)}
          />
        </div>

        {/* Preview — tek satır */}
        <div
          className="px-3 py-2 rounded-lg text-[11.5px] leading-snug"
          style={{
            background: 'rgba(var(--theme-accent-rgb),0.05)',
            border: '1px solid rgba(var(--theme-accent-rgb),0.12)',
          }}
        >
          <span className="text-[var(--theme-text)]/85">
            <AnimatedValue value={value.windowMinutes} suffix=" dk" /> içinde{' '}
            <AnimatedValue value={value.threshold} suffix=" ihlal" /> →{' '}
            <AnimatedValue value={value.durationMinutes} suffix=" dk" /> yazma engeli
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Input row ──
function InputRow({
  icon, label, unit, value, min, max, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] font-semibold text-[var(--theme-secondary-text)]/65 uppercase tracking-[0.08em] mb-1.5">
        <span className="text-[var(--theme-accent)]/70">{icon}</span>
        {label}
      </label>
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
        style={{
          background: 'rgba(var(--glass-tint),0.05)',
          border: '1px solid rgba(var(--glass-tint),0.10)',
        }}
      >
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-[14px] font-bold tabular-nums text-[var(--theme-text)] outline-none"
        />
        <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/55 shrink-0">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ── Animated value (fade in on change) ──
function AnimatedValue({ value, suffix }: { value: number; suffix: string }) {
  return (
    <span
      key={`${value}${suffix}`}
      className="statValue font-bold text-[var(--theme-accent)] tabular-nums"
    >
      {value}{suffix}
    </span>
  );
}
