import React, { useState, useEffect, useRef } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import appLogo from '../assets/app-logo.png';

interface UpdateInfo {
  version: string;
  sizeMB: number | null;
  state: 'available' | 'downloading' | 'downloaded' | 'dismissed';
  progress: number;
}

interface Props {
  updateInfo: UpdateInfo | null;
  onDownload: () => void;
  onInstall: () => void;
}

// ── Nudge messages — progressive urgency without aggression ─────────────────

const NUDGE_STEPS = [
  { delay: 0,      text: 'Yeni sürüm hazır' },
  { delay: 120000, text: 'Daha iyi performans için güncelleyin' },
  { delay: 300000, text: 'Güncellemeniz önerilir' },
] as const;

function useNudge(state: string | undefined): string {
  const [idx, setIdx] = useState(0);
  const enteredAtRef = useRef(0);

  useEffect(() => {
    if (state !== 'available') { setIdx(0); return; }
    enteredAtRef.current = Date.now();
    setIdx(0);

    const timers = NUDGE_STEPS.slice(1).map((step, i) =>
      setTimeout(() => setIdx(i + 1), step.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [state]);

  return NUDGE_STEPS[idx].text;
}

// ── SVG progress ring — theme-aware ─────────────────────────────────────────

const ProgressRing = ({ progress, done, size = 36, stroke = 2.5 }: {
  progress: number; done?: boolean; size?: number; stroke?: number;
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90 pointer-events-none">
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        strokeWidth={stroke}
        className="stroke-[var(--theme-border)] opacity-15"
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c - (progress / 100) * c }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={done ? 'stroke-[var(--theme-accent)]' : 'stroke-[var(--theme-accent)]'}
        style={{ filter: `drop-shadow(0 0 3px rgba(var(--theme-accent-rgb), 0.3))` }}
      />
    </svg>
  );
};

// ── Logo icon — event-driven transitions ────────────────────────────────────

const LogoIcon = ({ state }: { state: string | undefined }) => {
  const [showAction, setShowAction] = useState(false);
  const prevRef = useRef(state);

  useEffect(() => {
    if (state === prevRef.current) return;
    prevRef.current = state;

    if (state === 'available') {
      setShowAction(false);
      const t1 = setTimeout(() => setShowAction(true), 800);
      const t2 = setTimeout(() => setShowAction(false), 2200);
      const t3 = setTimeout(() => setShowAction(true), 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    setShowAction(state === 'downloading' || state === 'downloaded');
  }, [state]);

  const actionContent =
    state === 'available' ? (
      <div className="w-full h-full rounded-[20%] bg-[var(--theme-accent)]/12 flex items-center justify-center">
        <Download size={15} className="text-[var(--theme-accent)]" />
      </div>
    ) : state === 'downloading' ? (
      <div className="w-full h-full rounded-[20%] bg-[var(--theme-accent)]/8 flex items-center justify-center">
        <Download size={14} className="text-[var(--theme-accent)] opacity-70" />
      </div>
    ) : state === 'downloaded' ? (
      <div className="w-full h-full rounded-[20%] bg-[var(--theme-accent)]/12 flex items-center justify-center">
        <RefreshCw size={14} className="text-[var(--theme-accent)]" />
      </div>
    ) : null;

  return (
    <div className="w-[32px] h-[32px] relative">
      <AnimatePresence mode="wait" initial={false}>
        {showAction && actionContent ? (
          <motion.div
            key="action"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {actionContent}
          </motion.div>
        ) : (
          <motion.div
            key="logo"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 rounded-[20%] overflow-hidden ring-1 ring-[var(--theme-border)]/30"
          >
            <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────

export default function BrandUpdateArea({ updateInfo, onDownload, onInstall }: Props) {
  const st = updateInfo?.state;
  const [installing, setInstalling] = useState(false);
  const nudgeText = useNudge(st);

  const isClickable = (st === 'available' || st === 'downloaded') && !installing;

  const handleClick = () => {
    if (st === 'available') onDownload();
    else if (st === 'downloaded' && !installing) {
      setInstalling(true);
      setTimeout(() => onInstall(), 300);
    }
  };

  useEffect(() => { if (st !== 'downloaded') setInstalling(false); }, [st]);

  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      className={`flex items-center gap-2.5 select-none rounded-lg px-1.5 py-1 -ml-1.5 transition-all duration-150 ${
        isClickable
          ? 'cursor-pointer group hover:bg-[var(--theme-accent)]/5 active:scale-[0.99]'
          : ''
      }`}
    >
      {/* ── Icon area ── */}
      <div className="relative w-[36px] h-[36px] flex items-center justify-center shrink-0">
        {st === 'downloading' && <ProgressRing progress={updateInfo!.progress} />}

        {st === 'downloaded' && !installing && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: '0 0 0 2.5px rgba(var(--theme-accent-rgb), 0.35)' }}
          />
        )}

        {installing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.45, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ backgroundColor: 'rgba(var(--theme-accent-rgb), 0.1)' }}
          />
        )}

        <LogoIcon state={st} />

        {st === 'available' && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: 'var(--theme-accent)' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--theme-accent)' }} />
          </span>
        )}
      </div>

      {/* ── Text area ── */}
      <div className="flex flex-col leading-none min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          {st === 'available' ? (
            <motion.div key={`available-${nudgeText}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.25 }}>
              <p className="text-[13px] font-semibold text-[var(--theme-text)] group-hover:text-[var(--theme-accent)] transition-colors">
                {nudgeText}
              </p>
              <p className="text-[9px] font-medium text-[var(--theme-secondary-text)]/45 mt-0.5">
                v{updateInfo!.version}{updateInfo!.sizeMB ? ` · ${updateInfo!.sizeMB} MB` : ''}
              </p>
            </motion.div>

          ) : st === 'downloading' ? (
            <motion.div key="downloading" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2 }}>
              <p className="text-[13px] font-semibold text-[var(--theme-text)]">
                İndiriliyor <span className="text-[var(--theme-accent)] font-bold tabular-nums">%{updateInfo!.progress}</span>
              </p>
              <p className="text-[9px] font-medium text-[var(--theme-secondary-text)]/45 mt-0.5">
                v{updateInfo!.version}
              </p>
            </motion.div>

          ) : st === 'downloaded' && !installing ? (
            <motion.div key="downloaded" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2 }}>
              <p className="text-[13px] font-semibold text-[var(--theme-accent)] group-hover:brightness-125 transition-all">
                Yüklemeye hazır
              </p>
              <p className="text-[9px] font-medium text-[var(--theme-secondary-text)]/45 mt-0.5">
                v{updateInfo!.version}
              </p>
            </motion.div>

          ) : installing ? (
            <motion.div key="installing" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}>
              <p className="text-[13px] font-semibold text-[var(--theme-accent)] opacity-70">
                Kurulum başlatılıyor…
              </p>
              <p className="text-[9px] font-medium text-[var(--theme-secondary-text)]/45 mt-0.5">
                v{updateInfo!.version}
              </p>
            </motion.div>

          ) : (
            <motion.div key="idle" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2 }}>
              <h1 className="text-[15px] tracking-[-0.01em]">
                <span className="font-extrabold text-[var(--theme-text)]">CYLK</span>
                <span className="font-semibold text-[var(--theme-accent)]">Sohbet</span>
              </h1>
              <span className="text-[8px] font-medium tracking-[0.2em] uppercase text-[var(--theme-secondary-text)]/40 mt-0.5">
                sadece caylaklar
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
