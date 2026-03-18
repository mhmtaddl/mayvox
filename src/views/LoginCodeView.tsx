import React, { useState } from 'react';
import { Mic, Key, User as UserIcon, Lock, Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginCodeViewProps {
  handleRegister: (code: string, nick: string, password: string, repeatPwd: string) => void;
  handleLogout: () => Promise<void>;
}

export default function LoginCodeView({ handleRegister, handleLogout }: LoginCodeViewProps) {
  const [code, setCode] = useState('');
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showRepeatPwd, setShowRepeatPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    setError(null);
    try {
      handleRegister(code, nick, password, repeatPwd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt tamamlanamadı.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[420px] bg-[var(--theme-sidebar)]/50 p-10 rounded-2xl border border-[var(--theme-border)] shadow-2xl backdrop-blur-sm relative"
      >
        <button
          onClick={handleLogout}
          aria-label="Geri dön"
          className="absolute left-6 top-6 text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={16} />
          Geri
        </button>

        <div className="flex justify-center mb-8">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 text-[var(--theme-accent)]">
            <Mic size={48} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-[var(--theme-text)] text-3xl font-bold tracking-tight">Caylaklar ile Sohbete Doğru</h1>
          <p className="text-[var(--theme-secondary-text)] mt-2 text-sm">Sadece Caylaklar Burada Sohbet Edebilir!</p>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">DAVET KODU</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="text"
                placeholder="Admin'den aldığınız kodu girin"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                aria-label="Davet kodu"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all tracking-widest font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">E-POSTA</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="email"
                placeholder="E-posta adresinizi giriniz"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                aria-label="E-posta"
                autoComplete="email"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">PAROLA OLUŞTUR</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Parolanızı oluşturun"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                aria-label="Parola"
                autoComplete="new-password"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-12 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Parolayı gizle' : 'Parolayı göster'} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors">
                {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">PAROLAYI TEKRAR GİRİN</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type={showRepeatPwd ? 'text' : 'password'}
                placeholder="Parolanızı tekrar girin"
                value={repeatPwd}
                onChange={(e) => setRepeatPwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                aria-label="Parolayı tekrar gir"
                autoComplete="new-password"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-12 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button type="button" onClick={() => setShowRepeatPwd(!showRepeatPwd)} aria-label={showRepeatPwd ? 'Parolayı gizle' : 'Parolayı göster'} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors">
                {showRepeatPwd ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            onClick={onSubmit}
            className="w-full h-14 bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] border border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-white rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center group"
          >
            <span>Devam Et</span>
            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
