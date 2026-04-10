import React from 'react';
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';

interface Props {
  passwordModal: { type: 'set' | 'enter'; channelId: string };
  passwordInput: string;
  setPasswordInput: (v: string) => void;
  passwordRepeatInput: string;
  setPasswordRepeatInput: (v: string) => void;
  passwordError: boolean;
  setPasswordError: (v: boolean) => void;
  onSetPassword: (channelId: string, password: string, repeat: string) => void;
  onVerifyPassword: () => void;
  onClose: () => void;
}

export default function ChatViewPasswordModal({
  passwordModal,
  passwordInput,
  setPasswordInput,
  passwordRepeatInput,
  setPasswordRepeatInput,
  passwordError,
  setPasswordError,
  onSetPassword,
  onVerifyPassword,
  onClose,
}: Props) {
  const handleSubmit = () => {
    if (passwordModal.type === 'set') {
      if (passwordInput.length === 4 && passwordInput === passwordRepeatInput) {
        onSetPassword(passwordModal.channelId, passwordInput, passwordRepeatInput);
      } else {
        setPasswordError(true);
      }
    } else {
      onVerifyPassword();
    }
  };

  const handleInputChange = (val: string, setter: (v: string) => void) => {
    setter(val.replace(/\D/g, ''));
    setPasswordError(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gradient-to-b from-black/10 via-black/20 to-black/30"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-sm bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-3xl p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 bg-[var(--theme-accent)]/20 rounded-2xl flex items-center justify-center">
            <Lock className="text-[var(--theme-accent)]" size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--theme-text)] mb-2">
              {passwordModal.type === 'set' ? 'Oda Şifrele' : 'Oda Şifreli'}
            </h3>
            <p className="text-[var(--theme-secondary-text)] text-sm">
              {passwordModal.type === 'set'
                ? 'Lütfen 4 haneli sayısal bir şifre belirleyin.'
                : 'Bu odaya girmek için 4 haneli şifreyi giriniz.'}
            </p>
          </div>

          <div className="w-full space-y-4">
            <div className="w-full flex flex-col gap-4">
              <input
                autoFocus
                type="password"
                maxLength={4}
                placeholder="• • • •"
                className={`w-full bg-[var(--theme-sidebar)] border ${
                  passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
                } rounded-2xl px-6 py-4 text-center text-2xl tracking-[1em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
                value={passwordInput}
                onChange={(e) => handleInputChange(e.target.value, setPasswordInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') onClose();
                }}
              />
              {passwordModal.type === 'set' && (
                <input
                  type="password"
                  maxLength={4}
                  placeholder="• • • •"
                  className={`w-full bg-[var(--theme-sidebar)] border ${
                    passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
                  } rounded-2xl px-6 py-4 text-center text-2xl tracking-[1em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
                  value={passwordRepeatInput}
                  onChange={(e) => handleInputChange(e.target.value, setPasswordRepeatInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmit();
                    if (e.key === 'Escape') onClose();
                  }}
                />
              )}
            </div>
            {passwordError && (
              <p className="text-red-500 text-xs font-medium animate-bounce">
                {passwordModal.type === 'set' ? (passwordInput !== passwordRepeatInput ? 'Şifreler eşleşmiyor!' : 'Lütfen 4 haneli bir sayı giriniz!') : 'Hatalı şifre!'}
              </p>
            )}
          </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 btn-cancel font-bold active:scale-[0.97]"
            >
              İptal
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-6 py-3 btn-primary font-bold active:scale-[0.97]"
            >
              {passwordModal.type === 'set' ? 'Şifrele' : 'Giriş Yap'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
