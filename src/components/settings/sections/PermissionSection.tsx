import React from 'react';
import { Bell, Mic, ExternalLink, CheckCircle2, XCircle, RefreshCw, Smartphone, Info } from 'lucide-react';
import { AccordionSection } from '../shared';
import { usePermissionStatus } from '../../../hooks/usePermissionStatus';
import { isCapacitor } from '../../../lib/platform';

export default function PermissionSection() {
  if (!isCapacitor()) return null;

  const { status, refresh, requestNotifications, openAppSettings, openNotificationSettings } = usePermissionStatus();

  const stateInfo = (s: string) => {
    if (s === 'granted') return { text: 'Aktif', color: 'text-emerald-400', ok: true };
    if (s === 'denied') return { text: 'Kapalı', color: 'text-red-400', ok: false };
    return { text: '...', color: 'text-[var(--theme-secondary-text)]', ok: true };
  };

  const micInfo = stateInfo(status.microphone);
  const notifInfo = stateInfo(status.notifications);
  const hasDenied = !micInfo.ok || !notifInfo.ok;

  return (
    <AccordionSection icon={<Smartphone size={12} />} title="İzinler ve Cihaz Ayarları">
      <div className="space-y-2">
        {/* Mikrofon */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/20">
          <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Mic size={16} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--theme-text)]">Mikrofon</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] leading-snug">Sesli sohbet için gerekli</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {micInfo.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
            <span className={`text-[10px] font-semibold ${micInfo.color}`}>{micInfo.text}</span>
          </div>
        </div>

        {/* Bildirimler */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/20">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Bell size={16} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--theme-text)]">Bildirimler</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] leading-snug">Gelen davetleri gösterebilmek için gerekli</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!notifInfo.ok && (
              <button
                onClick={requestNotifications}
                className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)] hover:text-white transition-all"
              >
                İzin Ver
              </button>
            )}
            {notifInfo.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
            <span className={`text-[10px] font-semibold ${notifInfo.color}`}>{notifInfo.text}</span>
          </div>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex gap-2 mt-4">
        <button onClick={refresh} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-[var(--theme-secondary-text)] bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/20 hover:bg-[var(--theme-sidebar)] transition-all">
          <RefreshCw size={12} /> Tekrar Kontrol Et
        </button>
        <button onClick={openAppSettings} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-[var(--theme-accent)] bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)] hover:text-white transition-all">
          <ExternalLink size={12} /> Uygulama Ayarları
        </button>
        {!notifInfo.ok && (
          <button onClick={openNotificationSettings} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500 hover:text-white transition-all">
            <Bell size={12} /> Bildirim Ayarları
          </button>
        )}
      </div>

      {/* Uyarı */}
      {hasDenied && (
        <p className="text-[10px] text-[var(--theme-secondary-text)]/50 mt-3 leading-relaxed">
          Bazı izinler veya cihaz ayarları eksik olduğunda uygulamanın bazı özellikleri beklenen şekilde çalışmayabilir. Gelen davetlerin zamanında görünmesi ve sesli sohbetin sorunsuz kullanılabilmesi için gerekli izinlerin tamamlanması önerilir.
        </p>
      )}

      {/* OEM notu */}
      <div className="mt-3 p-3 rounded-xl bg-[var(--theme-sidebar)]/30 border border-[var(--theme-border)]/15">
        <div className="flex items-start gap-2">
          <Info size={12} className="text-[var(--theme-secondary-text)]/40 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/40 leading-relaxed">
              Bazı telefonlarda ek ayarlar cihaz üreticisine göre değişebilir. Kilit ekranında bildirim gösterimi, arka planda çalışma, üstte göster izni ve otomatik başlatma gibi ayarlar gerekirse uygulama ayarlarından manuel olarak açılabilir.
            </p>
          </div>
        </div>
      </div>
    </AccordionSection>
  );
}
