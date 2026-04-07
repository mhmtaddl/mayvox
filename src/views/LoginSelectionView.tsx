import React, { useState, useEffect } from 'react';
import { Key, User as UserIcon, ArrowRight } from 'lucide-react';
import appLogo from '../assets/app-logo.png';
import { motion } from 'motion/react';

interface LoginSelectionViewProps {
  onGoToCode: () => void;
  onGoToPassword: () => void;
}

export default function LoginSelectionView({ onGoToCode, onGoToPassword }: LoginSelectionViewProps) {
  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    const w = window as Window & { electronApp?: { getVersion: () => Promise<string> } };
    w.electronApp?.getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] bg-[var(--theme-sidebar)]/50 p-10 rounded-2xl border border-[var(--theme-border)] shadow-2xl backdrop-blur-sm"
      >
        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 overflow-hidden rounded-[20%]">
            <img src={appLogo} alt="PigeVox" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-[var(--theme-text)] text-3xl font-bold tracking-tight">Caylaklar ile Sohbete Doğru</h1>
          <p className="text-[var(--theme-secondary-text)] mt-2 text-sm">Sadece CAYLAKLAR Burada Sohbet Edebilir!</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={onGoToCode}
            className="w-full h-16 bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] border border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-btn-primary-text)] rounded-xl font-bold text-lg shadow-lg transition-all flex items-center px-6 group"
          >
            <Key className="mr-3" />
            <span>Kod Kullanarak Giriş Yap</span>
            <ArrowRight className="ml-auto group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={onGoToPassword}
            className="w-full h-16 bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] border border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-btn-primary-text)] rounded-xl font-bold text-lg shadow-lg transition-all flex items-center px-6 group"
          >
            <UserIcon className="mr-3" />
            <span>Kullanıcı Adı ve Parola</span>
            <ArrowRight className="ml-auto group-hover:translate-x-1 transition-transform" />
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
