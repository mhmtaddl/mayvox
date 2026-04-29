import React, { useState, useRef, useEffect } from 'react';
import {
  Key, Lock, Eye, EyeOff,
  Mail, Clock, Send, Ban, AlertCircle, Check, Loader,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { requestInvite, getInviteRequestStatus } from '../lib/supabase';
import appLogo from '../assets/app-logo.png';
import { makeEnterToNext } from '../lib/mobileFormNav';

type RequestState = 'idle' | 'requesting' | 'pending' | 'approved' | 'rejected' | 'blocked' | 'expired';

interface LoginCodeViewProps {
  handleRegister: (code: string, nick: string, password: string, repeatPwd: string) => void;
  handleLogout: () => Promise<void>;
  onGoBack?: () => void;
}

export default function LoginCodeView({ handleRegister, handleLogout, onGoBack }: LoginCodeViewProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showRepeatPwd, setShowRepeatPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const pwdInputRef = useRef<HTMLInputElement>(null);
  const repeatPwdInputRef = useRef<HTMLInputElement>(null);

  // Davet talebi state
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [permanentlyBlocked, setPermanentlyBlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [blockedSecondsLeft, setBlockedSecondsLeft] = useState(0);

  useEffect(() => {
    if (!onGoBack) return;
    const handler = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); onGoBack(); } };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [onGoBack]);

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

  // expires_at sayacı (sadece approved — pending'de süre yok)
  useEffect(() => {
    if (!expiresAt || requestState !== 'approved') {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      const s = Math.floor(remaining / 1000);
      setSecondsLeft(s);
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
    if (submitting) return;
    setPressing(true);
    setSubmitting(true);
    setError(null);
    try {
      await handleRegister(code, email, password, repeatPwd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt tamamlanamadı.');
      setSubmitting(false);
      setTimeout(() => setPressing(false), 150);
    }
  };

  const triggerSubmit = () => {
    onSubmit();
  };

  const onEnterNext = makeEnterToNext([emailInputRef, codeInputRef, pwdInputRef, repeatPwdInputRef], triggerSubmit);

  const canRequest = isValidEmail(email)
    && requestState === 'idle'
    && !permanentlyBlocked;
  const authInputClass = 'auth-input w-full h-11 sm:h-12 [@media(max-height:760px)]:h-10 rounded-xl text-[13px] sm:text-[14px] [@media(max-height:760px)]:text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/55 outline-none transition-all pl-11 sm:pl-12 pr-4 border border-[var(--theme-input-border,var(--theme-border))] bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.72))] focus:border-[var(--theme-accent)]/60 focus:bg-[var(--theme-input-bg,rgba(var(--theme-sidebar-rgb),0.86))] disabled:opacity-60';

  return (
    <div className="auth-screen flex h-[calc(100vh-var(--titlebar-height,0px))] min-h-0 flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden" style={{ background: 'transparent' }}>
      <div className="auth-ambient absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.45), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-glow-secondary-rgb),0.42), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card w-full max-w-[420px] max-h-[calc(100%-52px)] relative z-10 rounded-2xl sm:rounded-3xl overflow-hidden [@media(max-height:560px)]:overflow-y-auto"
        style={{ background: 'transparent', border: '0', boxShadow: 'none' }}
      >
        <div className="auth-card-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <button
          onClick={onGoBack || handleLogout}
          className="absolute left-5 sm:left-6 top-4 sm:top-5 z-20 text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
        >
          Geri
        </button>

        <div className="px-5 py-5 sm:px-10 sm:pt-8 sm:pb-7 [@media(max-height:760px)]:px-6 [@media(max-height:760px)]:py-4">
        <div className="flex justify-center mb-5 sm:mb-6 max-[720px]:mb-4 [@media(max-height:760px)]:mb-3">
          <div className="relative">
            <div className="auth-logo-glow absolute inset-[-16px] rounded-full opacity-15 blur-2xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.3)' }} />
            <div className="relative w-24 h-24 sm:w-36 sm:h-36 max-[700px]:w-20 max-[700px]:h-20 [@media(max-height:700px)]:w-20 [@media(max-height:700px)]:h-20 [@media(max-height:600px)]:w-16 [@media(max-height:600px)]:h-16 overflow-hidden rounded-[22%]">
              <img src={appLogo} alt="MAYVOX" className="auth-logo w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="text-center mb-5 sm:mb-6 max-[720px]:mb-4 [@media(max-height:760px)]:mb-3">
          <h1 className="text-[var(--theme-text)] text-[21px] sm:text-[24px] [@media(max-height:760px)]:text-[20px] font-medium leading-tight">Bize Katıl!</h1>
          <p className="text-[var(--theme-secondary-text)] mt-2 [@media(max-height:760px)]:mt-1 text-[12px] sm:text-[13px] [@media(max-height:760px)]:text-[11px] max-w-[86%] mx-auto">Topluluğumuza katıl, sesli sohbete dahil ol!</p>
        </div>

        <div className="space-y-4 max-[720px]:space-y-3 [@media(max-height:760px)]:space-y-2.5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          {/* E-Posta — ilk alan */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">E-POSTA</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={emailInputRef}
                type="email"
                placeholder="E-posta adresinizi giriniz"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (requestState === 'idle') setError(null);
                }}
                onKeyDown={onEnterNext(0)}
                enterKeyHint="next"
                disabled={['pending', 'approved', 'requesting'].includes(requestState)}
                aria-label="E-posta"
                autoComplete="email"
                className={authInputClass}
              />
            </div>
          </div>

          {/* Davet Kodu — ikinci alan */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">DAVET KODU</label>
              {requestState === 'approved' && expiresAt && secondsLeft > 0 && (
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
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={codeInputRef}
                type="text"
                placeholder="Admin'den aldığınız kodu girin"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={onEnterNext(1)}
                enterKeyHint="next"
                aria-label="Davet kodu"
                className={`${authInputClass} tracking-widest font-mono`}
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
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2 [@media(max-height:760px)]:py-1.5 rounded-xl text-xs font-bold border border-dashed border-[var(--theme-accent)]/40 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-all disabled:opacity-40 disabled:cursor-default"
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
                      <span className="mr-10">⏳&nbsp;&nbsp;Üyeliğiniz onay aşamasındadır. Admin onay verince kodunuz e-postanıza gönderilecek...</span>
                      <span className="mr-10">⏳&nbsp;&nbsp;Üyeliğiniz onay aşamasındadır. Admin onay verince kodunuz e-postanıza gönderilecek...</span>
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
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">PAROLA OLUŞTUR</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={pwdInputRef}
                type={showPwd ? 'text' : 'password'}
                placeholder="Parolanızı oluşturun"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onEnterNext(2)}
                enterKeyHint="next"
                aria-label="Parola"
                autoComplete="new-password"
                className={`${authInputClass} pr-12`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Parolayı gizle' : 'Parolayı göster'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">PAROLAYI TEKRAR GİRİN</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]" size={18} />
              <input
                ref={repeatPwdInputRef}
                type={showRepeatPwd ? 'text' : 'password'}
                placeholder="Parolanızı tekrar girin"
                value={repeatPwd}
                onChange={(e) => setRepeatPwd(e.target.value)}
                onKeyDown={onEnterNext(3)}
                enterKeyHint="done"
                aria-label="Parolayı tekrar gir"
                autoComplete="new-password"
                className={`${authInputClass} pr-12`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowRepeatPwd(!showRepeatPwd)}
                aria-label={showRepeatPwd ? 'Parolayı gizle' : 'Parolayı göster'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
              >
                {showRepeatPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            ref={submitBtnRef}
            onClick={triggerSubmit}
            disabled={submitting}
            className={`auth-submit w-full h-11 sm:h-12 [@media(max-height:760px)]:h-10 btn-primary text-[14px] sm:text-[15px] flex items-center justify-center disabled:cursor-wait ${pressing ? 'is-pressing' : ''}`}
          >
            {submitting ? <span className="auth-loading-dots" aria-label="Devam ediliyor"><span /><span /><span /></span> : <span>Devam Et</span>}
          </button>
        </div>
        </div>{/* end px-10 pt-10 pb-8 */}
      </motion.div>
    </div>
  );
}
