import React from 'react';
import { createPortal } from 'react-dom';
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
  const isSet = passwordModal.type === 'set';

  const handleSubmit = () => {
    if (isSet) {
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
    setter(val.replace(/\D/g, '').slice(0, 4));
    setPasswordError(false);
  };

  const stopNative = (e: React.MouseEvent) => { e.nativeEvent.stopImmediatePropagation(); e.stopPropagation(); };

  const errorMessage = isSet
    ? (passwordInput.length === 4 && passwordRepeatInput.length === 4 && passwordInput !== passwordRepeatInput
        ? 'Şifreler eşleşmiyor!'
        : 'Lütfen 4 haneli bir sayı giriniz!')
    : 'Hatalı şifre!';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[260px] rounded-xl p-3.5"
        style={{
          background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
        onClick={stopNative}
        onMouseDown={stopNative}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <Lock size={14} className="text-[var(--theme-accent)] shrink-0" />
          <span className="text-[11px] font-bold text-[var(--theme-text)]">
            {isSet ? 'Oda Şifrele' : 'Oda Şifreli'}
          </span>
        </div>

        <p className="text-[9px] text-[var(--theme-secondary-text)] mb-3 leading-relaxed">
          {isSet
            ? '4 haneli sayısal bir şifre belirleyin.'
            : 'Bu odaya girmek için şifreyi girin.'}
        </p>

        {/* Inputs */}
        <div className={`space-y-2 ${isSet ? 'mb-2' : 'mb-2'}`}>
          {isSet && (
            <label className="block text-[8px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.1em]">Şifre</label>
          )}
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="• • • •"
            className={`w-full bg-[var(--theme-sidebar)] border ${
              passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
            } rounded-lg px-3 py-2 text-center text-base tracking-[0.5em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
            value={passwordInput}
            onChange={(e) => handleInputChange(e.target.value, setPasswordInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
          />

          {isSet && (
            <>
              <label className="block text-[8px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.1em] mt-1">Tekrar</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="• • • •"
                className={`w-full bg-[var(--theme-sidebar)] border ${
                  passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
                } rounded-lg px-3 py-2 text-center text-base tracking-[0.5em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
                value={passwordRepeatInput}
                onChange={(e) => handleInputChange(e.target.value, setPasswordRepeatInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') onClose();
                }}
              />
            </>
          )}
        </div>

        {/* Error */}
        {passwordError && <p className="text-[9px] text-red-400 font-medium mb-2">{errorMessage}</p>}

        {/* Buttons */}
        <div className="flex gap-1.5">
          <button
            onClick={onClose}
            className="flex-1 px-2 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSet ? passwordInput.length !== 4 || passwordRepeatInput.length !== 4 : passwordInput.length !== 4}
            className="flex-1 px-2 py-1.5 text-[10px] font-bold text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            {isSet ? 'Şifrele' : 'Giriş Yap'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
