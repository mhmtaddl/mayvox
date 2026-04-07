import React, { useState, useRef, useEffect } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[420px] bg-[var(--theme-sidebar)]/50 p-10 rounded-2xl border border-[var(--theme-border)] shadow-2xl backdrop-blur-sm"
      >
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
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Kullanıcı Adı</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="text"
                placeholder="Kullanıcı Adını Giriniz"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                aria-label="Kullanıcı adı"
                autoComplete="username"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">PAROLA GİRİNİZ</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Parolanızı giriniz"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                aria-label="Parola"
                autoComplete="current-password"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-12 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Parolayı gizle' : 'Parolayı göster'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
              >
                {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={onSubmit}
            className={`w-full h-14 border border-[var(--theme-border)] rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center group active:scale-[0.97] ${pressing ? 'bg-[var(--theme-accent)] text-[var(--theme-btn-primary-text)] scale-[0.97]' : 'bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-btn-primary-text)]'}`}
          >
            <span>Giriş Yap</span>
          </button>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors underline underline-offset-2"
            >
              Şifremi Unuttum
            </button>
            <span className="text-[var(--theme-border)]">|</span>
            <button
              type="button"
              onClick={onGoToRegister}
              className="text-xs text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors underline underline-offset-2"
            >
              Üye Ol
            </button>
          </div>
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
