import React, { useState, useEffect, useRef } from 'react';
import { X, KeyRound, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onClose: () => void;
}

const PASSWORD_RESET_API_URL = String(
  import.meta.env.VITE_TOKEN_SERVER_URL || import.meta.env.VITE_SERVER_API_URL || '',
).replace(/\/$/, '');

export default function ForgotPasswordModal({ onClose }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [checking, setChecking] = useState(false);
  const [foundUser, setFoundUser] = useState<{ userId: string; name: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFoundUser(null);
    setNotFound(false);
    setError(null);

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) return;

    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`${PASSWORD_RESET_API_URL}/api/check-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: normalizedIdentifier }),
        });
        if (!res.ok) {
          setError('Şifre sıfırlama servisine ulaşılamadı.');
          return;
        }
        const data = await res.json();
        if (data.exists) {
          setFoundUser({ userId: data.userId, name: data.name });
          setNotFound(false);
        } else {
          setFoundUser(null);
          setNotFound(true);
        }
      } catch {
        setError('Sunucuya ulaşılamadı, lütfen tekrar deneyin.');
      } finally {
        setChecking(false);
      }
    }, 600);
  }, [identifier]);

  const triggerSubmit = () => {
    if (!foundUser) return;
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!foundUser) return;
    setError(null);
    try {
      const res = await fetch(`${PASSWORD_RESET_API_URL}/api/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: foundUser.userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'İstek gönderilemedi'); return; }
      setSubmitted(true);
    } catch {
      setError('Sunucuya ulaşılamadı, lütfen tekrar deneyin.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-[400px] max-h-[calc(100vh-32px)] overflow-hidden rounded-2xl border border-[rgba(var(--glass-tint),0.06)] bg-[linear-gradient(180deg,rgb(var(--theme-sidebar-rgb))_0%,rgb(var(--theme-bg-rgb))_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.62),0_1px_0_rgba(var(--glass-tint),0.04)_inset]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(var(--glass-tint),0.06)] px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(var(--theme-accent-rgb),0.10)] text-[var(--theme-accent)]">
              <KeyRound size={15} />
            </div>
            <div>
              <span className="block text-[14px] font-semibold text-[var(--theme-text)]">Şifremi Unuttum</span>
              <span className="block text-[11px] text-[var(--theme-secondary-text)]">Parola sıfırlama</span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--theme-secondary-text)] transition-colors hover:bg-white/5 hover:text-[var(--theme-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-104px)] overflow-y-auto p-5 sm:p-6">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3 py-4 text-center"
              >
                <CheckCircle2 size={40} className="text-emerald-500" />
                <p className="text-[15px] font-bold text-[var(--theme-text)]">E-posta Gönderildi!</p>
                <p className="max-w-[320px] text-[12px] leading-relaxed text-[var(--theme-secondary-text)]">
                  E-posta adresinize yeni parola gönderildi. Spam klasörünü de kontrol etmeyi unutmayınız.
                </p>
              </motion.div>
            ) : (
              <motion.div key="form" className="space-y-4">
                <p className="max-w-[330px] text-[12px] font-medium leading-relaxed text-[var(--theme-text)]/82">
                  Kayıtlı kullanıcı adınızı veya e-posta adresinizi girin. Geçici parolanız hemen e-posta ile gönderilecektir.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">
                    Kullanıcı adı/e-posta
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={16} />
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && triggerSubmit()}
                      placeholder="Kullanıcı adı/e-posta"
                      className="h-11 w-full rounded-xl border border-[rgba(var(--glass-tint),0.08)] bg-[rgb(var(--theme-bg-rgb))] py-3 pl-9 pr-4 text-sm text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/55 focus:border-[rgba(var(--theme-accent-rgb),0.52)] focus:ring-2 focus:ring-[rgba(var(--theme-accent-rgb),0.16)]"
                    />
                  </div>

                  {/* Durum göstergesi */}
                  <div className="min-h-[18px]">
                    {checking && (
                      <span className="text-[11px] text-[var(--theme-secondary-text)]">Kontrol ediliyor...</span>
                    )}
                    {!checking && foundUser && (
                      <span className="text-[11px] text-emerald-500 font-semibold">
                        ✓ {foundUser.name} bulundu
                      </span>
                    )}
                    {!checking && notFound && identifier.trim() && (
                      <span className="text-[11px] text-red-500">Kullanıcı bulunamadı</span>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-2.5 rounded-xl text-xs font-bold text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!foundUser}
                  className={`h-9 w-full rounded-lg border border-[rgba(var(--theme-accent-rgb),0.28)] bg-[rgba(var(--theme-accent-rgb),0.18)] px-4 text-[12px] font-semibold text-[var(--theme-text)] shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(var(--theme-accent-rgb),0.42)] hover:bg-[rgba(var(--theme-accent-rgb),0.24)] disabled:cursor-default disabled:border-[rgba(var(--glass-tint),0.08)] disabled:bg-[rgba(var(--glass-tint),0.05)] disabled:text-[var(--theme-secondary-text)]/55 disabled:shadow-none active:scale-[0.98] ${pressing ? 'opacity-90 scale-[0.98]' : ''}`}
                >
                  Şifremi Sıfırla
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
