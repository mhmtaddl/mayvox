import React, { useRef, useState, useEffect } from 'react';
import { User as UserIcon, Clock, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';

interface RegisterDetailsViewProps {
  displayName: string;
  setDisplayName: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  loginError: string | null;
  handleCompleteRegistration: () => Promise<void>;
  onGoBack: () => void;
}

export default function RegisterDetailsView({
  displayName,
  setDisplayName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  age,
  setAge,
  loginError,
  handleCompleteRegistration,
  onGoBack,
}: RegisterDetailsViewProps) {
  const [pressing, setPressing] = React.useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    const w = window as Window & { electronApp?: { getVersion: () => Promise<string> } };
    w.electronApp?.getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);

  // Mouse geri tuşu (button 3) ile geri dön
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); onGoBack(); } };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [onGoBack]);

  const triggerSubmit = () => {
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    handleCompleteRegistration();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1a0a12 0%, #0d0b1a 50%, #0a0e1a 100%)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] relative z-10 rounded-3xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset' }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <button
          onClick={onGoBack}
          className="absolute left-6 top-5 z-20 text-white/40 hover:text-white/70 transition-colors flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
        >
          <ArrowLeft size={14} />
          Geri
        </button>

        <div className="px-10 pt-10 pb-8">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-[-16px] rounded-full opacity-15 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.3)' }} />
            <div className="relative w-28 h-28 overflow-hidden rounded-[22%]">
              <img src={appLogo} alt="PigeVox" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-[#F5F5F5] text-[24px] font-bold tracking-[-0.01em] leading-tight">Profil Bilgileri</h1>
          <p className="text-white/50 mt-2 text-[13px] max-w-[80%] mx-auto">Son adım — bilgilerini tamamla</p>
        </div>

        <div className="space-y-5">
          {loginError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center animate-pulse">
              {loginError}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">KULLANICI ADI</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="text"
                placeholder="Görünen adınızı giriniz"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">ADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="text"
                placeholder="Adınızı giriniz"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">SOYADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="text"
                placeholder="Soyadınızı giriniz"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">YAŞINIZ</label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="number"
                placeholder="Yaşınızı giriniz"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={handleCompleteRegistration}
            className={`w-full h-[50px] btn-primary text-[15px] flex items-center justify-center ${pressing ? 'opacity-90 scale-[0.97]' : ''}`}
          >
            <span>Kaydını Tamamla</span>
            <ArrowRight className={`ml-2 transition-transform ${pressing ? 'translate-x-1' : 'group-hover:translate-x-1'}`} />
          </button>
        </div>
        </div>{/* end px-10 */}
      </motion.div>

      <div className="mt-8 flex items-center gap-6 text-[11px] text-white/30 font-medium relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"></div>
          Sunucu Aktif
        </div>
        {appVersion && <div className="opacity-50">v{appVersion}</div>}
      </div>
    </div>
  );
}
