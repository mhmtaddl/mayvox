import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Bell, CheckCircle2, XCircle, Shield, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';
import { usePermissions, type PermStatus } from '../hooks/usePermissions';

interface Props {
  onComplete: () => void;
}

export default function PermissionOnboarding({ onComplete }: Props) {
  const {
    checkPermissions,
    requestMicrophone,
    requestNotifications,
    openAppSettings,
  } = usePermissions();

  const [step, setStep] = useState<'checking' | 'intro' | 'result'>('checking');
  const [requesting, setRequesting] = useState(false);
  const [micResult, setMicResult] = useState<PermStatus>('pending');
  const [notifResult, setNotifResult] = useState<PermStatus>('pending');

  // ── İlk yüklemede mevcut izinleri kontrol et ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await checkPermissions();
      if (cancelled) return;

      if (result.microphone === 'granted') {
        // Mikrofon zaten var — direkt geç
        console.log('[PermissionOnboarding] mic_already_granted → auto_complete');
        onComplete();
      } else {
        setStep('intro');
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings'ten dönünce tekrar kontrol ──
  const recheckAfterSettings = useCallback(async () => {
    const result = await checkPermissions();
    setMicResult(result.microphone);
    setNotifResult(result.notifications);
    if (result.microphone === 'granted') {
      console.log('[PermissionOnboarding] mic_granted_after_settings → auto_complete');
      setTimeout(onComplete, 800);
    }
  }, [checkPermissions, onComplete]);

  useEffect(() => {
    if (step !== 'result') return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isChecking = false;

    const debouncedRecheck = () => {
      if (isChecking) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        isChecking = true;
        await recheckAfterSettings();
        isChecking = false;
      }, 300);
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') debouncedRecheck(); };
    const onResume = () => debouncedRecheck();
    const onFocus = () => debouncedRecheck();

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onResume);
    window.addEventListener('focus', onFocus);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('focus', onFocus);
    };
  }, [step, recheckAfterSettings]);

  // ── İzin isteme akışı ──
  const handleRequestPermissions = async () => {
    console.log('[PermissionOnboarding] grant_button_clicked');
    setRequesting(true);

    // 1) Mikrofon
    const mic = await requestMicrophone();
    console.log('[PermissionOnboarding] mic_result:', mic);

    // 2) Bildirim
    const notif = await requestNotifications();
    console.log('[PermissionOnboarding] notif_result:', notif);

    setMicResult(mic);
    setNotifResult(notif);
    setRequesting(false);
    setStep('result');

    if (mic === 'granted') {
      console.log('[PermissionOnboarding] all_ok → auto_complete');
      setTimeout(onComplete, 1200);
    }
  };

  const micOk = micResult === 'granted';
  const notifOk = notifResult === 'granted';

  // ── Yükleniyor durumu ──
  if (step === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-3 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full"
        />
        <p className="text-sm text-[var(--theme-secondary-text)] mt-4">İzinler kontrol ediliyor...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 overflow-hidden rounded-2xl shadow-lg shadow-black/30 ring-1 ring-[var(--theme-border)]/30">
            <img src={appLogo} alt="MAYVOX" className="w-full h-full object-cover" />
          </div>
        </div>

        {step === 'intro' ? (
          <>
            <h1 className="text-xl font-bold text-[var(--theme-text)] text-center mb-2">
              Uygulama İzinleri
            </h1>
            <p className="text-sm text-[var(--theme-secondary-text)] text-center mb-8 leading-relaxed">
              Sesli sohbeti kullanabilmek için mikrofon iznine ihtiyacımız var.
              Bildirimleri açarsan gelen davetleri de anında görebilirsin.
            </p>

            {/* İzin kartları */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
                  <Mic size={20} className="text-[var(--theme-accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">
                    Sesli sohbet ve bas-konuş için zorunlu
                  </p>
                </div>
                <div className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] font-bold text-red-400">Zorunlu</span>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Bell size={20} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">
                    Gelen davet ve çağrıları kilit ekranında gösterir
                  </p>
                </div>
              </div>
            </div>

            {/* İzinleri ver butonu */}
            <button
              onClick={handleRequestPermissions}
              disabled={requesting}
              className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--theme-accent)' }}
            >
              {requesting ? (
                <div className="flex items-center justify-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                  İzinler İsteniyor...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Shield size={18} /> İzinleri Ver
                </div>
              )}
            </button>

            <p className="text-[10px] text-[var(--theme-secondary-text)]/30 text-center mt-4 leading-relaxed">
              Mikrofon yalnızca bas-konuş sırasında kullanılır. Verileriniz cihazınızda kalır.
            </p>
          </>
        ) : (
          /* ─── Sonuç ekranı ─── */
          <>
            <div className="space-y-3 mb-6">
              {/* Mikrofon durumu */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${
                micOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  micOk ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}>
                  {micOk
                    ? <CheckCircle2 size={20} className="text-emerald-400" />
                    : <XCircle size={20} className="text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${micOk ? 'text-emerald-400' : 'text-red-400'}`}>
                    {micOk ? 'İzin verildi' : 'İzin verilmedi — sesli sohbet kullanılamaz'}
                  </p>
                </div>
              </div>

              {/* Bildirim durumu */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${
                notifOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  notifOk ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                }`}>
                  {notifOk
                    ? <CheckCircle2 size={20} className="text-emerald-400" />
                    : <Bell size={20} className="text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${
                    notifOk ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {notifOk ? 'İzin verildi' : 'Kapalı — davet bildirimleri çalışmayabilir'}
                  </p>
                </div>
              </div>
            </div>

            {micOk ? (
              /* Mikrofon OK → uygulama açılıyor */
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-sm text-emerald-400 font-semibold mb-1">Hazırsın!</p>
                <p className="text-[11px] text-[var(--theme-secondary-text)]">Uygulama açılıyor...</p>
              </motion.div>
            ) : (
              /* Mikrofon reddedildi → zorunlu */
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-relaxed">
                    Mikrofon izni olmadan sesli sohbet özellikleri kullanılamaz.
                    Lütfen izni verin veya uygulama ayarlarından açın.
                  </p>
                </div>

                <button
                  onClick={handleRequestPermissions}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ backgroundColor: 'var(--theme-accent)' }}
                >
                  Tekrar Dene
                </button>

                <button
                  onClick={openAppSettings}
                  className="w-full py-3 rounded-xl font-bold text-sm text-[var(--theme-secondary-text)] bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30 transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} /> Uygulama Ayarlarını Aç
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
