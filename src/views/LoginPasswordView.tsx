import React, { useState, useRef } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';
import { makeEnterToNext } from '../lib/mobileFormNav';

const REMEMBER_LOGIN_KEY = 'mayvox-login-remember';
const REMEMBER_IDENTIFIER_KEY = 'mayvox-login-identifier';

interface LoginPasswordViewProps {
  handleLogin: (nick: string, password: string) => Promise<void>;
  onForgotPassword: () => void;
  onGoToRegister: () => void;
}

export default function LoginPasswordView({ handleLogin, onForgotPassword, onGoToRegister }: LoginPasswordViewProps) {
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_LOGIN_KEY) === 'true');
  const [nick, setNick] = useState(() => (
    localStorage.getItem(REMEMBER_LOGIN_KEY) === 'true'
      ? localStorage.getItem(REMEMBER_IDENTIFIER_KEY) || ''
      : ''
  ));
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const nickInputRef = useRef<HTMLInputElement>(null);
  const pwdInputRef = useRef<HTMLInputElement>(null);

  const onSubmit = async () => {
    if (submitting) return;
    setPressing(true);
    setSubmitting(true);
    setError(null);
    try {
      await handleLogin(nick, password);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, 'true');
        localStorage.setItem(REMEMBER_IDENTIFIER_KEY, nick.trim());
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş yapılamadı.');
      setSubmitting(false);
      setTimeout(() => setPressing(false), 150);
    }
  };

  const triggerSubmit = () => {
    onSubmit();
  };

  const handleRememberChange = (checked: boolean) => {
    setRememberMe(checked);
    if (!checked) {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
      localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
      return;
    }
    localStorage.setItem(REMEMBER_LOGIN_KEY, 'true');
    if (nick.trim()) localStorage.setItem(REMEMBER_IDENTIFIER_KEY, nick.trim());
  };

  const onEnterNext = makeEnterToNext([nickInputRef, pwdInputRef], triggerSubmit);
  const authInputClass = 'auth-input w-full h-11 sm:h-12 [@media(max-height:700px)]:h-10 rounded-xl pl-11 pr-4 text-[13px] sm:text-[14px] [@media(max-height:700px)]:text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/55 outline-none transition-all border border-[var(--theme-input-border,var(--theme-border))] bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] focus:border-[var(--theme-accent)]/60 focus:bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.86))]';

  return (
    <div className="auth-screen flex h-[calc(100vh-var(--titlebar-height,0px))] min-h-0 flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden" style={{ background: 'transparent' }}>
      {/* Ambient glows */}
      <div className="auth-ambient absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.45), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-glow-secondary-rgb),0.42), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card w-full max-w-[420px] max-h-[calc(100%-52px)] relative z-10 rounded-2xl sm:rounded-3xl overflow-hidden [@media(max-height:520px)]:overflow-y-auto"
        style={{
          background: 'transparent',
          border: '0',
          boxShadow: 'none',
        }}
      >
        <div className="auth-card-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="px-5 py-5 sm:px-10 sm:pt-8 sm:pb-7 [@media(max-height:700px)]:px-6 [@media(max-height:700px)]:py-4">
          {/* Logo */}
          <div className="flex justify-center mb-5 sm:mb-7 max-[700px]:mb-4 [@media(max-height:700px)]:mb-3">
            <div className="relative">
              <div className="auth-logo-glow absolute inset-[-18px] rounded-full opacity-20 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.32)' }} />
              <div className="relative w-24 h-24 sm:w-36 sm:h-36 max-[700px]:w-20 max-[700px]:h-20 [@media(max-height:700px)]:w-20 [@media(max-height:700px)]:h-20 [@media(max-height:600px)]:w-16 [@media(max-height:600px)]:h-16 overflow-hidden rounded-[22%]">
                <img src={appLogo} alt="MAYVOX" className="auth-logo w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-5 sm:mb-7 max-[700px]:mb-4 [@media(max-height:700px)]:mb-3">
            <h1 className="text-[var(--theme-text)] text-[21px] sm:text-[25px] [@media(max-height:700px)]:text-[20px] font-medium leading-tight"><span className="font-semibold">MV</span> ile sesini duyur..</h1>
            <p className="text-[var(--theme-secondary-text)] mt-2 [@media(max-height:700px)]:mt-1 text-[12px] sm:text-[13px] [@media(max-height:700px)]:text-[11px] max-w-[86%] mx-auto leading-relaxed">Topluluğumuza katıl, sesli sohbete dahil ol!</p>
          </div>

          <div className="space-y-4 max-[700px]:space-y-3 [@media(max-height:700px)]:space-y-3">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            {/* Kullanıcı adı */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">Kullanıcı Adı</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
                <input
                  ref={nickInputRef}
                  type="text"
                  placeholder="Kullanıcı adını gir"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  onKeyDown={onEnterNext(0)}
                  enterKeyHint="next"
                  autoComplete="username"
                  className={authInputClass}
                />
              </div>
            </div>

            {/* Parola */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">Parola</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
                <input
                  ref={pwdInputRef}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Parolanı gir"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onEnterNext(1)}
                  enterKeyHint="done"
                  autoComplete="current-password"
                  className={`${authInputClass} pr-12`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="-mt-1 flex w-fit cursor-pointer select-none items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-[rgba(var(--glass-tint),0.035)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => handleRememberChange(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                  rememberMe
                    ? 'border-[rgba(var(--theme-accent-rgb),0.58)] bg-[rgba(var(--theme-accent-rgb),0.18)] text-[var(--theme-accent)]'
                    : 'border-[rgba(var(--glass-tint),0.18)] bg-[rgba(var(--glass-tint),0.035)] text-transparent'
                }`}
                aria-hidden="true"
              >
                <Check size={11} strokeWidth={2.4} />
              </span>
              <span className="text-[11px] font-semibold leading-none text-[var(--theme-secondary-text)]/72">Beni hatırla</span>
            </label>

            {/* Giriş butonu */}
            <button
              ref={submitBtnRef}
              onClick={triggerSubmit}
              disabled={submitting}
              className={`auth-submit w-full h-11 sm:h-12 [@media(max-height:700px)]:h-10 btn-primary text-[14px] sm:text-[15px] flex items-center justify-center disabled:cursor-wait ${pressing ? 'is-pressing' : ''}`}
            >
              {submitting ? <span className="auth-loading-dots" aria-label="Giriş yapılıyor"><span /><span /><span /></span> : 'Giriş Yap'}
            </button>

            {/* Alt linkler */}
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={onForgotPassword}
                className="auth-muted-link rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white/35 transition-colors hover:bg-white/[0.03] hover:text-white/65"
              >
                Şifremi Unuttum
              </button>
              <span className="auth-separator text-white/15">|</span>
              <button
                type="button"
                onClick={onGoToRegister}
                className="auth-muted-link text-[12px] text-white/40 hover:text-white/70 transition-colors"
              >
                Bize Katıl
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
