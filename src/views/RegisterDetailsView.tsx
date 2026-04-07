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

  const triggerSubmit = () => {
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    handleCompleteRegistration();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[420px] bg-[var(--theme-sidebar)]/50 p-10 rounded-2xl border border-[var(--theme-border)] shadow-2xl backdrop-blur-sm relative"
      >
        <button
          onClick={onGoBack}
          className="absolute left-6 top-6 text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={16} />
          Geri
        </button>

        <div className="flex justify-center mb-8">
          <div className="w-44 h-44 overflow-hidden rounded-[20%]">
            <img src={appLogo} alt="PigeVox" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-[var(--theme-text)] text-3xl font-bold tracking-tight">PigeVox ile Sesini Duyur</h1>
          <p className="text-[var(--theme-secondary-text)] mt-2 text-sm">Topluluğumuza katıl, sesli sohbete dahil ol!</p>
        </div>

        <div className="space-y-6">
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
            className={`w-full h-14 bg-[var(--theme-accent)] text-[var(--theme-btn-primary-text)] rounded-xl font-bold text-lg shadow-lg shadow-black/20 transition-all flex items-center justify-center group active:scale-[0.97] ${pressing ? 'opacity-90 scale-[0.97]' : 'hover:opacity-90'}`}
          >
            <span>CAYLAK Kaydını Tamamla</span>
            <ArrowRight className={`ml-2 transition-transform ${pressing ? 'translate-x-1' : 'group-hover:translate-x-1'}`} />
          </button>
        </div>
      </motion.div>

      <div className="mt-8 flex items-center gap-6 text-xs text-[var(--theme-secondary-text)] font-medium">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          Sunucu Durumu: Aktif
        </div>
        {appVersion && <div>v{appVersion}</div>}
      </div>
    </div>
  );
}
