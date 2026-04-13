import React from 'react';
import { ShieldAlert, Lock, Users, Headphones } from 'lucide-react';

interface Props {
  serverName: string;
  isOwner?: boolean;
}

/**
 * Sunucu sistem tarafından kısıtlandığında orta panelin TAMAMINI dolduran ekran.
 * Boş-state UI'sı (Duyurular/Etkinlikler) yerine premium "restricted mode" deneyimi.
 */
export default function RestrictedServerScreen({ serverName, isOwner }: Props) {
  return (
    <div className="relative flex-1 flex items-center justify-center min-h-0 px-4 py-10 overflow-hidden">
      {/* Soft ambient glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.6) 0%, transparent 65%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[520px] mx-auto text-center">
        {/* Icon stack */}
        <div className="relative mx-auto w-20 h-20 mb-5">
          <div className="absolute inset-0 rounded-full bg-orange-500/10 animate-pulse-slow" />
          <div className="absolute inset-2 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center backdrop-blur-sm">
            <ShieldAlert size={28} className="text-orange-400" strokeWidth={1.8} />
          </div>
        </div>

        {/* Title */}
        <div className="inline-block px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/25 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-400">Kısıtlı Erişim</span>
        </div>
        <h2 className="text-[20px] md:text-[22px] font-bold text-[var(--theme-text)] tracking-tight mb-2">
          {serverName} geçici olarak kısıtlandı
        </h2>
        <p className="text-[13px] md:text-[13.5px] text-[var(--theme-secondary-text)] leading-relaxed max-w-[440px] mx-auto">
          Bu sunucu sistem yönetimi tarafından geçici olarak kısıtlandı. Sunucuyu görmeye ve mevcut üye listesini incelemeye devam edebilirsin; ancak odalara giriş ve sesli kanallar şu anda kapalı.
        </p>

        {/* Status chips */}
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <StatusChip icon={<Users size={11} />} label="Sunucu görünür" tone="ok" />
          <StatusChip icon={<Lock size={11} />} label="Oda erişimi kapalı" tone="off" />
          <StatusChip icon={<Headphones size={11} />} label="Sesli kanal kapalı" tone="off" />
        </div>

        {isOwner && (
          <p className="mt-5 text-[11px] text-[var(--theme-secondary-text)]/65 leading-snug max-w-[440px] mx-auto">
            Sunucu sahibi olduğun için detaylı bilgileri ve kısıtlama açıklamasını <span className="text-[var(--theme-text)]/85 font-semibold">Sunucu Ayarları</span> içinden de görebilirsin.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: 'ok' | 'off' }) {
  const cls = tone === 'ok'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
    : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/75 border-[rgba(var(--glass-tint),0.10)]';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-semibold border ${cls}`}>
      {icon} {label}
    </span>
  );
}
