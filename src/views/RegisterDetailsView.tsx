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
  publicDisplayName: string;
  setPublicDisplayName: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  loginError: string | null;
  isSubmitting?: boolean;
  handleCompleteRegistration: () => Promise<void>;
  onGoBack: () => void;
  onOpenKvkk?: () => void;
}

export default function RegisterDetailsView({
  displayName,
  setDisplayName,
  publicDisplayName,
  setPublicDisplayName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  age,
  setAge,
  loginError,
  isSubmitting = false,
  handleCompleteRegistration,
  onGoBack,
  onOpenKvkk,
}: RegisterDetailsViewProps) {
  const [pressing, setPressing] = React.useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const publicDisplayNameRef = useRef<HTMLInputElement>(null);
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
    if (isSubmitting) return;
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    void handleCompleteRegistration();
  };

  const onEnterNext = makeEnterToNext([displayNameRef, publicDisplayNameRef, firstNameRef, lastNameRef, ageRef], triggerSubmit);

  return (
    <div className="auth-screen flex h-[calc(100vh-var(--titlebar-height,0px))] min-h-0 flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden" style={{ background: 'transparent' }}>
      <div className="auth-ambient absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card w-full max-w-[420px] max-h-[calc(100%-32px)] relative z-10 rounded-2xl sm:rounded-3xl overflow-x-hidden overflow-y-auto"
        style={{ background: 'transparent', border: '0', boxShadow: 'none' }}
      >
        <div className="auth-card-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <button
          onClick={onGoBack}
          className="auth-muted-link absolute left-6 top-5 z-20 text-white/40 hover:text-white/70 transition-colors flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
        >
          Geri
        </button>

        <div className="px-6 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 [@media(max-height:760px)]:px-7 [@media(max-height:760px)]:pt-5 [@media(max-height:760px)]:pb-5 [@media(max-height:640px)]:px-5 [@media(max-height:640px)]:pt-4 [@media(max-height:640px)]:pb-4">
        <div className="flex justify-center mb-5 [@media(max-height:760px)]:mb-3">
          <div className="relative">
            <div className="auth-logo-glow absolute inset-[-16px] rounded-full opacity-15 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.3)' }} />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 max-[700px]:w-[72px] max-[700px]:h-[72px] [@media(max-height:760px)]:w-16 [@media(max-height:760px)]:h-16 [@media(max-height:620px)]:w-14 [@media(max-height:620px)]:h-14 overflow-hidden rounded-[22%]">
              <img src={appLogo} alt="MAYVOX" className="auth-logo w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="text-center mb-5 [@media(max-height:760px)]:mb-4">
          <h1 className="auth-title text-[#F5F5F5] text-[22px] [@media(max-height:760px)]:text-[20px] font-bold tracking-[-0.01em] leading-tight">Profil Bilgileri</h1>
          <p className="auth-subtitle text-white/50 mt-1.5 text-[12px] max-w-[80%] mx-auto">Son adım — bilgilerini tamamla</p>
        </div>

        <div className="space-y-3 [@media(max-height:760px)]:space-y-2.5">
          {loginError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center animate-pulse">
              {loginError}
            </div>
          )}
          <div className="space-y-1.5 [@media(max-height:760px)]:space-y-1">
            <label className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">KULLANICI ADI</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={displayNameRef}
                type="text"
                placeholder="Kullanıcı adınızı giriniz"
                value={displayName}
                maxLength={10}
                onChange={(e) => setDisplayName(normalizeUsernameInput(e.target.value))}
                onKeyDown={onEnterNext(0)}
                enterKeyHint="next"
                className="auth-input w-full h-11 [@media(max-height:760px)]:h-10 bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl pl-10 pr-4 text-[13px] sm:text-[14px] text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5 [@media(max-height:760px)]:space-y-1">
            <label className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">TAKMA AD</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={publicDisplayNameRef}
                type="text"
                placeholder="Takma adınızı giriniz"
                value={publicDisplayName}
                maxLength={24}
                onChange={(e) => setPublicDisplayName(e.target.value.replace(/[\p{C}]/gu, '').slice(0, 24))}
                onKeyDown={onEnterNext(1)}
                enterKeyHint="next"
                className="auth-input w-full h-11 [@media(max-height:760px)]:h-10 bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl pl-10 pr-4 text-[13px] sm:text-[14px] text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5 [@media(max-height:760px)]:space-y-1">
            <label className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">ADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={firstNameRef}
                type="text"
                placeholder="Adınızı giriniz"
                value={firstName}
                maxLength={NAME_INPUT_MAX_LENGTH}
                onChange={(e) => setFirstName(normalizeNameInput(e.target.value.replace(/[^\p{L} ]/gu, '')))}
                onKeyDown={onEnterNext(2)}
                enterKeyHint="next"
                className="auth-input w-full h-11 [@media(max-height:760px)]:h-10 bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl pl-10 pr-4 text-[13px] sm:text-[14px] text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5 [@media(max-height:760px)]:space-y-1">
            <label className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">SOYADINIZ</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={lastNameRef}
                type="text"
                placeholder="Soyadınızı giriniz"
                value={lastName}
                maxLength={NAME_INPUT_MAX_LENGTH}
                onChange={(e) => setLastName(normalizeLastNameInput(e.target.value))}
                onKeyDown={onEnterNext(3)}
                enterKeyHint="next"
                className="auth-input w-full h-11 [@media(max-height:760px)]:h-10 bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl pl-10 pr-4 text-[13px] sm:text-[14px] text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5 [@media(max-height:760px)]:space-y-1">
            <label className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">YAŞINIZ</label>
            <div className="relative">
              <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={ageRef}
                type="number"
                placeholder="Yaşınızı giriniz"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                onKeyDown={onEnterNext(4)}
                enterKeyHint="done"
                className="auth-input w-full h-11 [@media(max-height:760px)]:h-10 bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] border border-[var(--theme-input-border,var(--theme-border))] rounded-xl pl-10 pr-4 text-[13px] sm:text-[14px] text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={triggerSubmit}
            disabled={isSubmitting}
            className={`w-full h-11 [@media(max-height:760px)]:h-10 btn-primary text-[14px] sm:text-[15px] flex items-center justify-center disabled:cursor-wait disabled:opacity-60 ${pressing ? 'opacity-90 scale-[0.97]' : ''}`}
          >
            <span>{isSubmitting ? 'Kaydediliyor...' : 'Kaydını Tamamla'}</span>
          </button>
          <p className="px-1 text-center text-[10.5px] leading-relaxed text-[var(--theme-secondary-text)]/55">
            Kişisel verilerimin işlenmesine ilişkin{' '}
            <button
              type="button"
              onClick={onOpenKvkk}
              className="font-semibold text-[var(--theme-accent)]/85 hover:text-[var(--theme-accent)] transition-colors"
            >
              KVKK Aydınlatma Metni'ni
            </button>{' '}
            okudum.
          </p>
        </div>
        </div>{/* end px-10 */}
      </motion.div>
    </div>
  );
}
