import React, { useRef, useEffect } from 'react';
import { User as UserIcon, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';
import { normalizeNameInput, NAME_INPUT_MAX_LENGTH } from '../lib/formatName';
import { makeEnterToNext } from '../lib/mobileFormNav';

const normalizeUsernameInput = (value: string) =>
  value.toLocaleLowerCase('tr').replace(/[^a-z0-9]/g, '').slice(0, 10);

const normalizeLastNameInput = (value: string) =>
  normalizeNameInput(value.replace(/[^\p{L}]/gu, ''));

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
  const displayNameRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);

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

  const onEnterNext = makeEnterToNext([displayNameRef, firstNameRef, lastNameRef, ageRef], triggerSubmit);

  return (
    <div className="auth-screen flex flex-col items-center justify-center min-h-full h-full p-4 relative overflow-hidden" style={{ background: 'transparent' }}>
      <div className="auth-ambient absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card w-full max-w-[420px] relative z-10 rounded-3xl overflow-hidden"
        style={{ background: 'transparent', border: '0', boxShadow: 'none' }}
      >
        <div className="auth-card-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <button
          onClick={onGoBack}
          className="auth-muted-link absolute left-6 top-5 z-20 text-white/40 hover:text-white/70 transition-colors flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
        >
          Geri
        </button>

        <div className="px-10 pt-10 pb-8">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="auth-logo-glow absolute inset-[-16px] rounded-full opacity-15 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.3)' }} />
            <div className="relative w-24 h-24 sm:w-36 sm:h-36 max-[700px]:w-20 max-[700px]:h-20 [@media(max-height:700px)]:w-20 [@media(max-height:700px)]:h-20 [@media(max-height:600px)]:w-16 [@media(max-height:600px)]:h-16 overflow-hidden rounded-[22%]">
              <img src={appLogo} alt="MAYVOX" className="auth-logo w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="auth-title text-[#F5F5F5] text-[24px] font-bold tracking-[-0.01em] leading-tight">Profil Bilgileri</h1>
          <p className="auth-subtitle text-white/50 mt-2 text-[13px] max-w-[80%] mx-auto">Son adım — bilgilerini tamamla</p>
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
                ref={displayNameRef}
                type="text"
                placeholder="Görünen adınızı giriniz"
                value={displayName}
                maxLength={10}
                onChange={(e) => setDisplayName(normalizeUsernameInput(e.target.value))}
                onKeyDown={onEnterNext(0)}
                enterKeyHint="next"
                className="auth-input w-full bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">ADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                ref={firstNameRef}
                type="text"
                placeholder="Adınızı giriniz"
                value={firstName}
                maxLength={NAME_INPUT_MAX_LENGTH}
                onChange={(e) => setFirstName(normalizeNameInput(e.target.value.replace(/[^\p{L} ]/gu, '')))}
                onKeyDown={onEnterNext(1)}
                enterKeyHint="next"
                className="auth-input w-full bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">SOYADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                ref={lastNameRef}
                type="text"
                placeholder="Soyadınızı giriniz"
                value={lastName}
                maxLength={NAME_INPUT_MAX_LENGTH}
                onChange={(e) => setLastName(normalizeLastNameInput(e.target.value))}
                onKeyDown={onEnterNext(2)}
                enterKeyHint="next"
                className="auth-input w-full bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">YAŞINIZ</label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                ref={ageRef}
                type="number"
                placeholder="Yaşınızı giriniz"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                onKeyDown={onEnterNext(3)}
                enterKeyHint="done"
                className="auth-input w-full bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={handleCompleteRegistration}
            className={`w-full h-[50px] btn-primary text-[15px] flex items-center justify-center ${pressing ? 'opacity-90 scale-[0.97]' : ''}`}
          >
            <span>Kaydını Tamamla</span>
          </button>
        </div>
        </div>{/* end px-10 */}
      </motion.div>
    </div>
  );
}
