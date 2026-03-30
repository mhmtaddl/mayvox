import React, { useState, useRef, useEffect } from 'react';
import {
  Key, Lock, Eye, EyeOff, ArrowLeft, ArrowRight,
  Mail, Clock, Send, Ban, AlertCircle, Check, Loader,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { requestInvite, getInviteRequestStatus } from '../lib/supabase';
import appLogo from '../assets/app-logo.png';

type RequestState = 'idle' | 'requesting' | 'pending' | 'approved' | 'rejected' | 'blocked' | 'expired';

interface LoginCodeViewProps {
  handleRegister: (code: string, nick: string, password: string, repeatPwd: string) => void;
  handleLogout: () => Promise<void>;
}

export default function LoginCodeView({ handleRegister, handleLogout }: LoginCodeViewProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showRepeatPwd, setShowRepeatPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Davet talebi state
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [permanentlyBlocked, setPermanentlyBlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [blockedSecondsLeft, setBlockedSecondsLeft] = useState(0);

  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    const w = window as Window & { electronApp?: { getVersion: () => Promise<string> } };
    w.electronApp?.getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);

  const isValidEmail = (e: string) =>
    /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Bileşen ayrıldığında sessionStorage'ı temizle (çıkış/geri dönüşte eski veri kalmasın)
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('invite_request_id');
      sessionStorage.removeItem('invite_request_email');
    };
  }, []);

  // Sayfa açılınca sessionStorage'dan aktif talep varsa yükle
  useEffect(() => {
    const storedId = sessionStorage.getItem('invite_request_id');
    const storedEmail = sessionStorage.getItem('invite_request_email');
    if (!storedId || !storedEmail) return;
    setRequestId(storedId);
    setEmail(storedEmail);
    getInviteRequestStatus(storedId).then(result => {
      if (!result || result.error === 'not_found') {
        sessionStorage.removeItem('invite_request_id');
        sessionStorage.removeItem('invite_request_email');
        return;
      }
      const st = result.status as RequestState;
      if (st && ['pending', 'approved', 'rejected', 'expired'].includes(st)) {
        setRequestState(st);
      }
      if (result.expires_at) setExpiresAt(result.expires_at);
      if (result.blocked_until) setBlockedUntil(result.blocked_until ?? null);
      if (result.rejection_count) setRejectionCount(result.rejection_count);
      if (result.permanently_blocked) setPermanentlyBlocked(result.permanently_blocked ?? false);
    });
  }, []);

  // 5 saniyede bir durum kontrolü (pending/approved)
  useEffect(() => {
    if (!requestId || !['pending', 'approved'].includes(requestState)) return;
    const poll = async () => {
      const result = await getInviteRequestStatus(requestId);
      if (!result || result.error) return;
      const st = result.status as RequestState;
      // expires_at'i her zaman güncelle (F5 sonrası countdown doğru görünsün)
      if (result.expires_at) setExpiresAt(result.expires_at);
      if (st && st !== requestState) setRequestState(st);
    };
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [requestId, requestState]);

  // expires_at sayacı (pending/approved)
  useEffect(() => {
    if (!expiresAt || !['pending', 'approved'].includes(requestState)) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      const s = Math.floor(remaining / 1000);
      setSecondsLeft(s);
      if (s <= 0 && requestState === 'pending') setRequestState('expired');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, requestState]);

  // blockedUntil sayacı
  useEffect(() => {
    if (!blockedUntil || requestState !== 'blocked' || permanentlyBlocked) {
      setBlockedSecondsLeft(0);
      return;
    }
    const tick = () => {
      const s = Math.floor(Math.max(0, new Date(blockedUntil).getTime() - Date.now()) / 1000);
      setBlockedSecondsLeft(s);
      if (s <= 0) setRequestState('idle');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blockedUntil, requestState, permanentlyBlocked]);

  // Kod onaylandığında input'a fokusla
  useEffect(() => {
    if (requestState === 'approved') {
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [requestState]);

  const handleRequestCode = async () => {
    if (!isValidEmail(email)) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    setError(null);
    setRequestState('requesting');
    try {
      const result = await requestInvite(email);
      if (result.error === 'invalid_email') {
        setError('Geçersiz e-posta formatı.');
        setRequestState('idle');
      } else if (result.error === 'permanently_blocked') {
        setPermanentlyBlocked(true);
        setRejectionCount(result.rejection_count ?? 5);
        setRequestState('blocked');
      } else if (result.error === 'temporarily_blocked') {
        setBlockedUntil(result.blocked_until ?? null);
        setRejectionCount(result.rejection_count ?? 1);
        setPermanentlyBlocked(false);
        setRequestState('blocked');
      } else if (result.error === 'already_pending') {
        const st = (result.status ?? 'pending') as RequestState;
        setRequestId(result.request_id ?? null);
        setExpiresAt(result.expires_at ?? null);
        setRequestState(st);
        if (result.request_id) {
          sessionStorage.setItem('invite_request_id', result.request_id);
          sessionStorage.setItem('invite_request_email', email);
        }
      } else if (result.ok && result.request_id) {
        setRequestId(result.request_id);
        setExpiresAt(result.expires_at ?? null);
        setRequestState('pending');
        sessionStorage.setItem('invite_request_id', result.request_id);
        sessionStorage.setItem('invite_request_email', email);
      } else {
        setError(result.message ?? 'Talep gönderilemedi.');
        setRequestState('idle');
      }
    } catch {
      setError('Talep gönderilemedi. Tekrar deneyin.');
      setRequestState('idle');
    }
  };

  const clearRequest = () => {
    sessionStorage.removeItem('invite_request_id');
    sessionStorage.removeItem('invite_request_email');
    setRequestId(null);
    setExpiresAt(null);
    setRequestState('idle');
    setError(null);
  };

  // Süresi dolunca veya reddedilince direkt yeni talep gönder (1 tık)
  const retryRequest = async () => {
    sessionStorage.removeItem('invite_request_id');
    sessionStorage.removeItem('invite_request_email');
    setRequestId(null);
    setExpiresAt(null);
    setError(null);
    await handleRequestCode();
  };

  const onSubmit = async () => {
    setError(null);
    try {
      await handleRegister(code, email, password, repeatPwd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt tamamlanamadı.');
    }
  };

  const triggerSubmit = () => {
    setPressing(true);
    setTimeout(() => setPressing(false), 150);
    onSubmit();
  };

  const canRequest = isValidEmail(email)
    && requestState === 'idle'
    && !permanentlyBlocked;

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
          <div className="w-20 h-20 overflow-hidden rounded-[20%]">
            <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
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

          {/* E-Posta — ilk alan */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">E-POSTA</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type="email"
                placeholder="E-posta adresinizi giriniz"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (requestState === 'idle') setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                disabled={['pending', 'approved', 'requesting'].includes(requestState)}
                aria-label="E-posta"
                autoComplete="email"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all disabled:opacity-60"
              />
            </div>
          </div>

          {/* Davet Kodu — ikinci alan */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">DAVET KODU</label>
              {['pending', 'approved'].includes(requestState) && expiresAt && secondsLeft > 0 && (
                <motion.span
                  key={secondsLeft}
                  className={`text-xs font-black tabular-nums flex items-center gap-1 ${
                    secondsLeft < 60 ? 'text-red-500 animate-pulse' : 'text-[var(--theme-accent)]'
                  }`}
                >
                  <Clock size={12} />
                  {formatTime(secondsLeft)}
                </motion.span>
              )}
            </div>

            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                ref={codeInputRef}
                type="text"
                placeholder="Admin'den aldığınız kodu girin"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                aria-label="Davet kodu"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-4 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all tracking-widest font-mono"
              />
            </div>

            {/* Davet Kodu İste / Durum bölümü */}
            <AnimatePresence mode="wait">
              {requestState === 'idle' && (
                <motion.button
                  key="request-btn"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  type="button"
                  onClick={handleRequestCode}
                  disabled={!canRequest}
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border border-dashed border-[var(--theme-accent)]/40 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={13} />
                  Davet Kodu İste
                </motion.button>
              )}

              {requestState === 'requesting' && (
                <motion.div
                  key="requesting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 py-2.5 text-xs text-[var(--theme-secondary-text)]"
                >
                  <Loader size={13} className="animate-spin text-[var(--theme-accent)]" />
                  Talep gönderiliyor...
                </motion.div>
              )}

              {requestState === 'pending' && (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-2"
                >
                  <div className="overflow-hidden rounded-lg bg-[var(--theme-accent)]/5 border border-[var(--theme-accent)]/20 py-2 px-0">
                    <motion.div
                      animate={{ x: ['0%', '-50%'] }}
                      transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
                      className="flex whitespace-nowrap text-[11px] text-[var(--theme-accent)] font-medium px-3"
                    >
                      <span className="mr-10">⏳&nbsp;&nbsp;Admin tarafından e-postanıza kod gönderilmesi bekleniyor...</span>
                      <span className="mr-10">⏳&nbsp;&nbsp;Admin tarafından e-postanıza kod gönderilmesi bekleniyor...</span>
                    </motion.div>
                  </div>
                  <button
                    onClick={clearRequest}
                    className="mt-1 w-full text-[10px] text-[var(--theme-secondary-text)] hover:text-red-400 transition-colors py-1"
                  >
                    İptal et
                  </button>
                </motion.div>
              )}

              {requestState === 'approved' && (
                <motion.div
                  key="approved"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 py-2.5 px-3 text-[11px] text-emerald-500 font-bold flex items-center gap-2"
                >
                  <Check size={13} />
                  Kodunuz e-postanıza gönderildi! Yukarıdaki alana giriniz.
                </motion.div>
              )}

              {requestState === 'rejected' && (
                <motion.div
                  key="rejected"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 py-2.5 px-3 text-[11px] text-red-400 font-bold flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle size={13} />
                    Talebiniz reddedildi.
                  </span>
                  <button onClick={retryRequest} className="text-[10px] underline hover:text-red-300 transition-colors">
                    Tekrar Dene
                  </button>
                </motion.div>
              )}

              {requestState === 'expired' && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 py-2.5 px-3 text-[11px] text-amber-500 font-bold flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Clock size={13} />
                    Talep süresi doldu.
                  </span>
                  <button onClick={retryRequest} className="text-[10px] underline hover:text-amber-300 transition-colors">
                    Yeni Talep
                  </button>
                </motion.div>
              )}

              {requestState === 'blocked' && (
                <motion.div
                  key="blocked"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 py-2.5 px-3 text-[11px] text-red-400 font-bold space-y-1"
                >
                  {permanentlyBlocked ? (
                    <span className="flex items-center gap-2">
                      <Ban size={13} />
                      Bu e-posta adresi kalıcı olarak engellenmiştir.
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Ban size={13} />
                      {blockedSecondsLeft > 0
                        ? `${formatTime(blockedSecondsLeft)} sonra tekrar deneyebilirsiniz.`
                        : 'Bekleme süresi doldu.'}
                    </span>
                  )}
                  <p className="text-[10px] opacity-70">Ret sayısı: {rejectionCount}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Parola */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-wider">PAROLA OLUŞTUR</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={20} />
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="Parolanızı oluşturun"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                aria-label="Parola"
                autoComplete="new-password"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-12 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Parolayı gizle' : 'Parolayı göster'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
              >
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
                onKeyDown={(e) => e.key === 'Enter' && triggerSubmit()}
                aria-label="Parolayı tekrar gir"
                autoComplete="new-password"
                className="w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl py-4 pl-12 pr-12 text-[var(--theme-text)] focus:ring-2 focus:ring-[var(--theme-accent)] focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowRepeatPwd(!showRepeatPwd)}
                aria-label={showRepeatPwd ? 'Parolayı gizle' : 'Parolayı göster'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
              >
                {showRepeatPwd ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={onSubmit}
            className={`w-full h-14 border border-[var(--theme-border)] rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center group active:scale-[0.97] ${
              pressing
                ? 'bg-[var(--theme-accent)] text-white scale-[0.97]'
                : 'bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white'
            }`}
          >
            <span>Devam Et</span>
            <ArrowRight className={`ml-2 transition-transform ${pressing ? 'translate-x-1' : 'group-hover:translate-x-1'}`} />
          </button>
        </div>
      </motion.div>

      <div className="mt-8 flex items-center gap-6 text-xs text-[var(--theme-secondary-text)] font-medium">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          Sunucu Durumu: Aktif
        </div>
        {appVersion && <div>v{appVersion}</div>}
      </div>
    </div>
  );
}
