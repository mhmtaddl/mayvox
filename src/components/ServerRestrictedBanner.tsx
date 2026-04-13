import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  serverName: string;
  reason?: string | null;
}

/**
 * Sunucu "restricted mode" bildirimi — üyeler sunucuyu görmeye devam eder,
 * ancak odalara/sesli kanallara giriş bloklanmıştır.
 */
export default function ServerRestrictedBanner({ serverName, reason }: Props) {
  return (
    <div className="mx-3 my-2 md:mx-4 md:my-3 rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent backdrop-blur-sm px-3 py-2.5 md:px-4 md:py-3 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
      <div className="flex items-start gap-2.5 md:gap-3">
        <div className="shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
          <ShieldAlert size={15} className="text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] md:text-[12px] font-bold text-orange-400 uppercase tracking-[0.14em]">Kısıtlı Erişim</span>
          </div>
          <p className="text-[11.5px] md:text-[12.5px] text-[var(--theme-text)]/90 mt-1 leading-relaxed">
            <span className="font-semibold">{serverName}</span> sistem yönetimi tarafından geçici olarak kısıtlandı.
            Sunucuyu görmeye devam edebilirsin ancak odalara ve sesli kanallara giriş şu anda kapalı.
          </p>
          {reason && (
            <p className="text-[10.5px] md:text-[11px] text-[var(--theme-secondary-text)]/80 mt-1 italic">
              Açıklama: {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
