import React, { useState, useRef } from 'react';
import { KeyRound, Eye, EyeOff, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { updateUserPassword } from '../lib/backendClient';

interface Props {
  onDone: () => void;
}

export default function ForcePasswordChangeModal({ onDone }: Props) {
  const [newPwd, setNewPwd] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pressing, setPressing] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const triggerSubmit = () => {
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!newPwd || !repeatPwd) { setError('Her iki alanı da doldurun.'); return; }
    if (newPwd.length < 6) { setError('Parola en az 6 karakter olmalı.'); return; }
    if (newPwd !== repeatPwd) { setError('Parolalar eşleşmiyor.'); return; }

    setError(null);
    setLoading(true);
    try {
      const { error: pwdError } = await updateUserPassword(newPwd);
      if (pwdError) { setError('Parola güncellenemedi: ' + pwdError.message); return; }

      onDone();
    } catch {
      setError('Bir hata oluştu, tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-[1001] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[330px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          background: 'rgba(var(--theme-bg-rgb),0.92)',
          borderColor: 'rgba(var(--glass-tint),0.10)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(var(--glass-tint),0.08)',
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="flex justify-center mb-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/8 border border-[var(--theme-accent)]/14 flex items-center justify-center">
              <KeyRound size={18} className="text-[var(--theme-accent)]" />
            </div>
          </div>
          <h2 className="text-[14px] font-bold text-[var(--theme-text)]">Yeni parola belirle</h2>
          <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-4 text-[var(--theme-secondary-text)]/72">
            Geçici şifreyle giriş yaptın. Devam etmek için kalıcı parolanı oluştur.
          </p>
        </div>

        <div className="px-5 pb-5 space-y-3.5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-2 rounded-lg text-[11px] font-semibold text-center">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9.5px] font-bold text-[var(--theme-secondary-text)]/72 uppercase tracking-wider">Yeni Parola</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/70" size={14} />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full bg-[rgba(var(--glass-tint),0.045)] border border-[rgba(var(--glass-tint),0.09)] rounded-xl py-2.5 pl-8 pr-9 text-[12px] text-[var(--theme-text)] focus:ring-1 focus:ring-[var(--theme-accent)]/45 focus:border-transparent outline-none transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/72 hover:text-[var(--theme-accent)]">
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9.5px] font-bold text-[var(--theme-secondary-text)]/72 uppercase tracking-wider">Yeni Parola Tekrar</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/70" size={14} />
              <input
                type={showRepeat ? 'text' : 'password'}
                value={repeatPwd}
                onChange={e => setRepeatPwd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && triggerSubmit()}
                placeholder="Tekrar yaz"
                className="w-full bg-[rgba(var(--glass-tint),0.045)] border border-[rgba(var(--glass-tint),0.09)] rounded-xl py-2.5 pl-8 pr-9 text-[12px] text-[var(--theme-text)] focus:ring-1 focus:ring-[var(--theme-accent)]/45 focus:border-transparent outline-none transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowRepeat(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/72 hover:text-[var(--theme-accent)]">
                {showRepeat ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-2.5 bg-[var(--theme-accent)] text-[var(--theme-btn-primary-text)] rounded-xl font-bold text-[12px] transition-all disabled:opacity-50 active:scale-[0.98] ${pressing ? 'opacity-90 scale-[0.98]' : 'hover:opacity-90'}`}
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
