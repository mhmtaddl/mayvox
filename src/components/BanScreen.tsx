import React, { useState, useEffect } from 'react';
import { ShieldBan } from 'lucide-react';

interface Props {
  banExpires: number | undefined;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return d > 0 ? `${d} gün ${hms}` : hms;
}

export default function BanScreen({ banExpires }: Props) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!banExpires) return 0;
    return Math.max(0, Math.floor((banExpires - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!banExpires) return;
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor((banExpires - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [banExpires]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gradient-to-b from-black/50 via-black/60 to-black/70">
      <div className="flex flex-col items-center gap-6 text-center px-8 max-w-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
          <ShieldBan size={64} className="relative text-red-500" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-[var(--theme-btn-primary-text)] mb-2">
            Sesli Sohbet Erişiminiz Kısıtlandı
          </h1>
          <p className="text-sm text-[var(--theme-btn-primary-text)]/50">
            Bir yönetici tarafından erişiminiz engellendi.
          </p>
        </div>

        {banExpires ? (
          <div className="flex flex-col items-center gap-1.5 bg-[var(--theme-btn-ghost-bg)] border border-[var(--theme-border)]/10 rounded-2xl px-8 py-4">
            <span className="text-xs text-[var(--theme-btn-primary-text)]/40 uppercase tracking-widest">Kalan süre</span>
            <span className="text-3xl font-mono font-bold text-red-400 tabular-nums">
              {formatCountdown(timeLeft)}
            </span>
          </div>
        ) : (
          <div className="bg-[var(--theme-btn-ghost-bg)] border border-[var(--theme-border)]/10 rounded-2xl px-8 py-4">
            <span className="text-sm text-[var(--theme-btn-primary-text)]/50">Süresiz kısıtlama</span>
          </div>
        )}

        <p className="text-xs text-[var(--theme-btn-primary-text)]/30 leading-relaxed">
          Süre dolduğunda veya yönetici kısıtlamayı kaldırdığında
          erişiminiz otomatik olarak açılacak.
        </p>
      </div>
    </div>
  );
}
