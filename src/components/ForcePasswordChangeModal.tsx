import React, { useState, useRef } from 'react';
import { KeyRound, Eye, EyeOff, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { updateUserPassword, supabase } from '../lib/supabase';

const SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'https://api.cylksohbet.org';

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

      // must_change_password flagını server üzerinden temizle (service role — RLS'ye bağlı değil)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch(`${SERVER_URL}/api/clear-must-change-password`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
      }

      onDone();
    } catch {
      setError('Bir hata oluştu, tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1001] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--theme-border)] text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 flex items-center justify-center">
              <KeyRound size={22} className="text-[var(--theme-accent)]" />
            </div>
          </div>
          <h2 className="text-base font-bold text-[var(--theme-text)]">Yeni Parola Belirleme</h2>
          <p className="text-xs text-[var(--theme-secondary-text)] mt-1">
            Hesabınıza geçici parola ile giriş yaptınız. Devam etmek için yeni bir parola belirlemeniz gerekiyor.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-2.5 rounded-xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Yeni Parola</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={16} />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-3 pl-9 pr-10 text-sm text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">Yeni Parola Tekrar</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={16} />
              <input
                type={showRepeat ? 'text' : 'password'}
                value={repeatPwd}
                onChange={e => setRepeatPwd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && triggerSubmit()}
                placeholder="Parolayı tekrar girin"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-3 pl-9 pr-10 text-sm text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowRepeat(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]">
                {showRepeat ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-3 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 active:scale-[0.98] ${pressing ? 'opacity-90 scale-[0.98]' : 'hover:opacity-90'}`}
          >
            {loading ? 'Kaydediliyor...' : 'Parolayı Kaydet'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
