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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1a0a12 0%, #0d0b1a 50%, #0a0e1a 100%)' }}>
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] relative z-10 rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Top edge highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="px-10 pt-10 pb-8">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <div className="relative">
              <div className="absolute inset-[-20px] rounded-full opacity-20 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.3)' }} />
              <div className="relative w-44 h-44 overflow-hidden rounded-[22%]">
                <img src={appLogo} alt="MAYVOX" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-[#F5F5F5] text-[26px] font-medium tracking-[-0.01em] leading-tight"><span className="font-semibold">MV</span> ile sesini duyur..</h1>
            <p className="text-white/50 mt-3 text-[14px] max-w-[80%] mx-auto leading-relaxed">Topluluğumuza katıl, sesli sohbete dahil ol!</p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={onGoToCode}
              className="w-full h-[52px] rounded-2xl font-semibold text-[15px] flex items-center px-5 group transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.15), rgba(139,92,246,0.1))',
                border: '1px solid rgba(var(--theme-accent-rgb), 0.15)',
                color: 'var(--theme-accent)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <Key size={18} className="mr-3 opacity-70" />
              <span>Kod ile Giriş Yap</span>
              <ArrowRight size={16} className="ml-auto opacity-50 group-hover:opacity-80 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={onGoToPassword}
              className="w-full h-[52px] rounded-2xl font-semibold text-[15px] flex items-center px-5 group transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <UserIcon size={18} className="mr-3 opacity-60" />
              <span>Kullanıcı Adı ve Parola</span>
              <ArrowRight size={16} className="ml-auto opacity-40 group-hover:opacity-70 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="mt-8 flex items-center gap-6 text-[11px] text-white/30 font-medium relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
          Sunucu Aktif
        </div>
        {appVersion && <div className="opacity-50">v{appVersion}</div>}
      </div>
    </div>
  );
}
