import React, { useState } from 'react';
import { Mic, Bell, CheckCircle2, XCircle, Shield, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';

interface PermissionStatus {
  microphone: 'pending' | 'granted' | 'denied';
  notification: 'pending' | 'granted' | 'denied' | 'not-required';
}

interface Props {
  onComplete: () => void;
}

export default function PermissionOnboarding({ onComplete }: Props) {
  const [status, setStatus] = useState<PermissionStatus>({
    microphone: 'pending',
    notification: 'pending',
  });
  const [requesting, setRequesting] = useState(false);
  const [step, setStep] = useState<'intro' | 'result'>('intro');

  const requestPermissions = async () => {
    setRequesting(true);
    const newStatus: PermissionStatus = { microphone: 'pending', notification: 'pending' };

    // 1) Mikrofon izni
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      newStatus.microphone = 'granted';
    } catch (err) {
      newStatus.microphone = (err as Error).name === 'NotAllowedError' ? 'denied' : 'denied';
    }

    // 2) Bildirim izni (Android 13+ / Capacitor)
    try {
      const mod = await import('@capacitor/local-notifications');
      const result = await mod.LocalNotifications.requestPermissions();
      newStatus.notification = result.display === 'granted' ? 'granted' : 'denied';
    } catch {
      // Eski Android sürümlerinde bildirim izni gerekmez
      newStatus.notification = 'not-required';
    }

    setStatus(newStatus);
    setRequesting(false);

    // Mikrofon verilmişse devam edebilir
    if (newStatus.microphone === 'granted') {
      // Kısa gösterim sonra geç
      setStep('result');
      setTimeout(onComplete, 1200);
    } else {
      setStep('result');
    }
  };

  const openAppSettings = () => {
    // Android ayarlar sayfasını açmaya çalış
    try {
      (window as any).Capacitor?.Plugins?.App?.openUrl?.({ url: 'app-settings:' });
    } catch {
      // Fallback — kullanıcıya manuel yönlendir
    }
  };

  const micGranted = status.microphone === 'granted';
  const notifGranted = status.notification === 'granted' || status.notification === 'not-required';
  const allGranted = micGranted && notifGranted;

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
            <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
          </div>
        </div>

        {step === 'intro' ? (
          <>
            <h1 className="text-xl font-bold text-[var(--theme-text)] text-center mb-2">
              Hoş Geldin
            </h1>
            <p className="text-sm text-[var(--theme-secondary-text)] text-center mb-8 leading-relaxed">
              Sesli sohbet deneyimi için birkaç izne ihtiyacımız var.
            </p>

            {/* İzin kartları */}
            <div className="space-y-3 mb-8">
              {/* Mikrofon */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
                  <Mic size={20} className="text-[var(--theme-accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">
                    Sesli sohbet ve bas-konuş için gerekli
                  </p>
                </div>
              </div>

              {/* Bildirim */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)]/30">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Bell size={20} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className="text-[11px] text-[var(--theme-secondary-text)] leading-snug mt-0.5">
                    Davet ve çağrı bildirimlerini alabilmen için gerekli
                  </p>
                </div>
              </div>
            </div>

            {/* İzin ver butonu */}
            <button
              onClick={requestPermissions}
              disabled={requesting}
              className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <Shield size={18} />
                  İzinleri Ver
                </div>
              )}
            </button>

            <p className="text-[10px] text-[var(--theme-secondary-text)]/40 text-center mt-4 leading-relaxed">
              Verileriniz cihazınızda kalır. Mikrofon yalnızca bas-konuş sırasında kullanılır.
            </p>
          </>
        ) : (
          /* Sonuç ekranı */
          <>
            <div className="space-y-3 mb-6">
              {/* Mikrofon sonucu */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${
                micGranted
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  micGranted ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}>
                  {micGranted ? <CheckCircle2 size={20} className="text-emerald-400" /> : <XCircle size={20} className="text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Mikrofon</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${micGranted ? 'text-emerald-400' : 'text-red-400'}`}>
                    {micGranted ? 'İzin verildi' : 'İzin reddedildi'}
                  </p>
                </div>
              </div>

              {/* Bildirim sonucu */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${
                notifGranted
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-amber-500/5 border-amber-500/20'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  notifGranted ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                }`}>
                  {notifGranted ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Bell size={20} className="text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Bildirimler</p>
                  <p className={`text-[11px] font-medium mt-0.5 ${
                    notifGranted ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {status.notification === 'granted' ? 'İzin verildi' : status.notification === 'not-required' ? 'İzin gerekmiyor' : 'İzin verilmedi — davet bildirimleri çalışmayacak'}
                  </p>
                </div>
              </div>
            </div>

            {micGranted ? (
              /* Başarılı — otomatik geçecek */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center"
              >
                <p className="text-sm text-emerald-400 font-semibold">Hazırsın!</p>
              </motion.div>
            ) : (
              /* Mikrofon reddedildi — tekrar dene veya ayarlara git */
              <div className="space-y-3">
                <p className="text-xs text-red-400 text-center leading-relaxed">
                  Mikrofon izni olmadan sesli sohbeti kullanamazsın. Lütfen izin ver veya uygulama ayarlarından mikrofon iznini aç.
                </p>
                <button
                  onClick={requestPermissions}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ backgroundColor: 'var(--theme-accent)' }}
                >
                  Tekrar Dene
                </button>
                <button
                  onClick={openAppSettings}
                  className="w-full py-3 rounded-xl font-bold text-sm text-[var(--theme-secondary-text)] bg-[var(--theme-surface)] border border-[var(--theme-border)]/30 transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  Uygulama Ayarlarını Aç
                </button>
                <button
                  onClick={onComplete}
                  className="w-full py-2 text-[11px] text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-secondary-text)] transition-colors"
                >
                  İzinsiz devam et (sesli sohbet çalışmayacak)
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
