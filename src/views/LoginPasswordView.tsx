import React, { useState, useRef, useEffect } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';

interface LoginPasswordViewProps {
  handleLogin: (nick: string, password: string) => Promise<void>;
  onForgotPassword: () => void;
  onGoToRegister: () => void;
}

export default function LoginPasswordView({ handleLogin, onForgotPassword, onGoToRegister }: LoginPasswordViewProps) {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    const w = window as Window & { electronApp?: { getVersion: () => Promise<string> } };
    w.electronApp?.getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);

  const onSubmit = async () => {
    setError(null);
    try {
      await handleLogin(nick, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş yapılamadı.');
    }
  };

  const triggerSubmit = () => {
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    onSubmit();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1a0a12 0%, #0d0b1a 50%, #0a0e1a 100%)' }}>
      {/* Ambient glows */}
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
          <div className="text-center mb-8">
            <h1 className="text-[#F5F5F5] text-[26px] font-medium tracking-[-0.01em] leading-tight"><span className="font-semibold">MV</span> ile sesini duyur..</h1>
            <p className="text-white/50 mt-3 text-[14px] max-w-[80%] mx-auto leading-relaxed">Topluluğumuza katıl, sesli sohbete dahil ol!</p>
          </div>

          <div className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            {/* Kullanıcı adı */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em]">Kullanıcı Adı</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Kullanıcı adını gir"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                  autoComplete="username"
                  className="w-full h-[50px] rounded-2xl pl-11 pr-4 text-[14px] text-white placeholder:text-white/30 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
              </div>
            </div>

            {/* Parola */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em]">Parola</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Parolanı gir"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                  autoComplete="current-password"
                  className="w-full h-[50px] rounded-2xl pl-11 pr-12 text-[14px] text-white placeholder:text-white/30 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Giriş butonu */}
            <button
              ref={submitBtnRef}
              onClick={onSubmit}
              className="w-full h-[50px] btn-primary text-[15px] flex items-center justify-center"
            >
              Giriş Yap
            </button>

            {/* Alt linkler */}
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
              >
                Şifremi Unuttum
              </button>
              <span className="text-white/15">|</span>
              <button
                type="button"
                onClick={onGoToRegister}
                className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
              >
                Bize Katıl
              </button>
            </div>
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
