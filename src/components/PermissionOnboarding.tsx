import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Bell, CheckCircle2, XCircle, Shield, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';
import IncomingCall from '../lib/incomingCall';

interface Props {
  onComplete: () => void;
}

type PermState = 'pending' | 'granted' | 'denied';

export default function PermissionOnboarding({ onComplete }: Props) {
  const [micStatus, setMicStatus] = useState<PermState>('pending');
  const [notifStatus, setNotifStatus] = useState<PermState>('pending');
  const [requesting, setRequesting] = useState(false);
  const [step, setStep] = useState<'intro' | 'result'>('intro');

  // ── Settings'ten dönünce izinleri tekrar kontrol et ──
  const recheckPermissions = useCallback(async () => {
    if (!IncomingCall) return;
    console.log('[PermissionOnboarding] settings_return_detected');
    try {
      const [mic, notif] = await Promise.all([
        IncomingCall.checkMicrophonePermission(),
        IncomingCall.checkPermissions(),
      ]);
      const newMic: PermState = mic.microphone === 'granted' ? 'granted' : 'denied';
      const newNotif: PermState = notif.notifications === 'granted' ? 'granted' : 'denied';
      console.log('[PermissionOnboarding] refresh_after_settings: mic=' + newMic + ' notif=' + newNotif);
      setMicStatus(newMic);
      setNotifStatus(newNotif);

      // Her ikisi de verilmişse otomatik tamamla
      if (newMic === 'granted') {
        console.log('[PermissionOnboarding] all_granted_after_settings → auto_complete');
        setTimeout(onComplete, 800);
      }
    } catch (err) {
      console.error('[PermissionOnboarding] refresh_error:', err);
    }
  }, [onComplete]);

  // Settings'ten dönüş algılama — debounce ile korunmuş, duplicate/loop yok
  useEffect(() => {
    if (step !== 'result') return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isChecking = false;

    const debouncedRecheck = () => {
      if (isChecking) return; // zaten kontrol ediyor — skip
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        isChecking = true;
        await recheckPermissions();
        isChecking = false;
      }, 300);
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') debouncedRecheck(); };
    const onResume = () => debouncedRecheck();
    const onFocus = () => debouncedRecheck();

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onResume);     // Capacitor WebView resume
    window.addEventListener('focus', onFocus);          // Window focus (settings dönüşü)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('focus', onFocus);
    };
  }, [step, recheckPermissions]);

  const requestPermissions = async () => {
    console.log('[PermissionOnboarding] grant_permissions_clicked');
    setRequesting(true);
    let mic: PermState = 'pending';
    let notif: PermState = 'pending';

    // ── 1) Mikrofon — native runtime permission ──
    if (IncomingCall) {
      try {
        const check = await IncomingCall.checkMicrophonePermission();
        console.log('[PermissionOnboarding] mic_check_before:', check.microphone);

        if (check.microphone === 'granted') {
          mic = 'granted';
        } else {
          // Her zaman request dene — ilk kez veya reddedilmiş olabilir
          console.log('[PermissionOnboarding] requesting_microphone');
          const result = await IncomingCall.requestMicrophonePermission();
          console.log('[PermissionOnboarding] microphone_result:', result.microphone);
          mic = result.microphone === 'granted' ? 'granted' : 'denied';
        }
      } catch (err) {
        console.error('[PermissionOnboarding] mic_error:', err);
        mic = 'denied';
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        mic = 'granted';
      } catch {
        mic = 'denied';
      }
    }

    // ── 2) Bildirim ──
    if (IncomingCall) {
      try {
        console.log('[PermissionOnboarding] requesting_notifications');
        const result = await IncomingCall.requestPermissions();
        console.log('[PermissionOnboarding] notifications_result:', result.notifications);
        notif = result.notifications === 'granted' ? 'granted' : 'denied';
      } catch {
        notif = 'granted'; // Eski Android — izin gerekmiyor
      }
    } else {
      notif = 'granted';
    }

    console.log('[PermissionOnboarding] final_state: mic=' + mic + ' notif=' + notif);
    setMicStatus(mic);
    setNotifStatus(notif);
    setRequesting(false);
    setStep('result');

    if (mic === 'granted') {
      console.log('[PermissionOnboarding] auto_complete_onboarding');
      setTimeout(onComplete, 1500);
    }
  };

  const openAppSettings = async () => {
    console.log('[PermissionOnboarding] open_app_settings_clicked');
    if (IncomingCall) {
      try { await IncomingCall.openAppSettings(); } catch {}
    }
  };

  const micOk = micStatus === 'granted';
  const notifOk = notifStatus === 'granted';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 overflow-hidden rounded-2xl shadow-lg shadow-black/30 ring-1 ring-[var(--theme-border)]/30">
            <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
          </div>
        </div>

        {step === 'intro' ? (
          <>
            <h1 className="text-xl font-bold text-[var(--theme-text)] text-center mb-2">Her Şey Hazır Olsun</h1>
            <p className="text-sm text-[var(--theme-secondary-text)] text-center mb-8 leading-relaxed">
              Gelen davetleri zamanında gösterebilmek ve sesli sohbeti sorunsuz kullanabilmek için birkaç izne ihtiyacımız var. İstersen daha sonra ayarlardan da düzenleyebilirsin.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0"><Mic size={20} className="text-[var(--theme-accent)]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">Sesli sohbet ve bas-konuş için gerekli</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0"><Bell size={20} className="text-amber-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">Ekran kilitliyken gelen davetleri gösterebilmek için gerekli</p>
                </div>
              </div>
            </div>

            <button onClick={requestPermissions} disabled={requesting}
              className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--theme-accent)' }}>
              {requesting ? (
                <div className="flex items-center justify-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  İzinler İsteniyor...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2"><Shield size={18} /> İzinleri Ver</div>
              )}
            </button>
            <button onClick={onComplete} className="w-full py-3 mt-3 text-[12px] font-medium text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-secondary-text)] transition-colors">Daha Sonra</button>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/30 text-center mt-4 leading-relaxed">Verileriniz cihazınızda kalır. Mikrofon yalnızca bas-konuş sırasında kullanılır.</p>
          </>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${micOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${micOk ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  {micOk ? <CheckCircle2 size={20} className="text-emerald-400" /> : <XCircle size={20} className="text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${micOk ? 'text-emerald-400' : 'text-red-400'}`}>{micOk ? 'İzin verildi' : 'İzin verilmedi'}</p>
                </div>
              </div>
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${notifOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notifOk ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                  {notifOk ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Bell size={20} className="text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${notifOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {notifOk ? 'İzin verildi' : 'İzin verilmedi — davet bildirimleri çalışmayabilir'}
                  </p>
                </div>
              </div>
            </div>

            {micOk ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-sm text-emerald-400 font-semibold mb-1">Hazırsın!</p>
                <p className="text-[11px] text-[var(--theme-secondary-text)]">Uygulama açılıyor...</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--theme-secondary-text)] text-center leading-relaxed">
                  Mikrofon izni kapalı olduğu için sesli sohbet özellikleri kullanılamıyor. İstersen tekrar deneyebilir veya uygulama ayarlarından izni açabilirsin.
                </p>
                <button onClick={requestPermissions} className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all" style={{ backgroundColor: 'var(--theme-accent)' }}>Tekrar Dene</button>
                <button onClick={openAppSettings} className="w-full py-3 rounded-xl font-bold text-sm text-[var(--theme-secondary-text)] bg-[var(--theme-sidebar)]/50 border border-[var(--theme-border)]/30 transition-all flex items-center justify-center gap-2">
                  <ExternalLink size={14} /> Uygulama Ayarlarını Aç
                </button>
                <button onClick={onComplete} className="w-full py-2 text-[11px] text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-secondary-text)] transition-colors">Şimdilik geç</button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
