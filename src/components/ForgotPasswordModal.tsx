import React, { useState, useEffect, useRef } from 'react';
import { X, KeyRound, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onClose: () => void;
}

const SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'http://localhost:3001';

export default function ForgotPasswordModal({ onClose }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [checking, setChecking] = useState(false);
  const [foundUser, setFoundUser] = useState<{ userId: string; name: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFoundUser(null);
    setNotFound(false);
    setError(null);

    if (!identifier.trim()) return;

    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`${SERVER_URL}/api/check-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: identifier.trim() }),
        });
        const data = await res.json();
        if (data.exists) {
          setFoundUser({ userId: data.userId, name: data.name });
        } else {
          setNotFound(true);
        }
      } catch {
        // sessizce geç
      } finally {
        setChecking(false);
      }
    }, 600);
  }, [identifier]);

  const handleSubmit = async () => {
    if (!foundUser) return;
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/request-password-reset`, {
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-[var(--theme-accent)]" />
            <span className="text-sm font-bold text-[var(--theme-text)]">Şifremi Unuttum</span>
          </div>
          <button onClick={onClose} className="text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3 py-4 text-center"
              >
                <CheckCircle2 size={40} className="text-emerald-500" />
                <p className="text-sm font-bold text-[var(--theme-text)]">İstek Gönderildi!</p>
                <p className="text-xs text-[var(--theme-secondary-text)]">
                  Yöneticiler bilgilendirildi. Onay verildikten sonra e-posta adresinize yeni parola gönderilecek.
                </p>
                <button
                  onClick={onClose}
                  className="mt-2 px-6 py-2 bg-[var(--theme-accent)] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                >
                  Kapat
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" className="space-y-4">
                <p className="text-xs text-[var(--theme-secondary-text)]">
                  Kayıtlı kullanıcı adınızı veya e-posta adresinizi girin. Yönetici onayladığında yeni parolanız e-posta ile gönderilecektir.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">
                    Kullanıcı Adı veya E-posta
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={16} />
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="kullaniciadi veya mail@ornek.com"
                      className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-3 pl-9 pr-4 text-sm text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
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
                  className="w-full py-3 bg-[var(--theme-accent)] text-white rounded-xl font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
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
