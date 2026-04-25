import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link as LinkIcon, Copy, Mail, ChevronDown, Plus, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppState } from '../../../contexts/AppStateContext';
import { useUI } from '../../../contexts/UIContext';
import InviteRequestPanel from '../../InviteRequestPanel';
import { listAdminInviteCodes, invalidateInviteCode, type AdminInviteCodeRow } from '../../../lib/supabase';

const PAGE_SIZE = 5;

// ── Admin Action Bar — davet kodu listesi + davet talepleri ──
// Kodlar collapsible panelde listelenir; yeni kod üretildikçe listeye eklenir.
// Kullanılan kodlar strikethrough + "kim kullandı" info'su ile gösterilir.
export default function AdminActionBar() {
  const {
    handleGenerateCode, generatedCode,
    inviteRequests, handleSendInviteCode, handleRejectInvite,
  } = useAppState();
  const { setToastMsg, settingsTarget, setSettingsTarget } = useUI();

  const [codesOpen, setCodesOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [flashRequests, setFlashRequests] = useState(false);
  const requestsAnchorRef = useRef<HTMLDivElement>(null);
  const [codes, setCodes] = useState<AdminInviteCodeRow[]>([]);
  const [codesTotal, setCodesTotal] = useState(0);
  const [codesPage, setCodesPage] = useState(0);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Countdown tick — saniyede bir re-render tetikler (sadece panel açıkken)
  const [, setTick] = useState(0);

  const requestCount = inviteRequests.length;
  const codesTotalPages = Math.max(1, Math.ceil(codesTotal / PAGE_SIZE));
  const activeCount = codes.filter(c => !c.used && c.expires_at > Date.now()).length;

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const r = await listAdminInviteCodes(PAGE_SIZE, codesPage * PAGE_SIZE);
      setCodes(r.items);
      setCodesTotal(r.total);
    } catch (e) {
      console.error('[AdminActionBar] listAdminInviteCodes error:', e);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Davet kodları yüklenemedi';
      setToastMsg(msg);
    } finally {
      setCodesLoading(false);
    }
  }, [codesPage, setToastMsg]);

  useEffect(() => {
    if (codesOpen) void loadCodes();
  }, [codesOpen, loadCodes]);

  // Yeni kod üretildiğinde listeyi 1. sayfadan yenile
  useEffect(() => {
    if (!codesOpen || !generatedCode) return;
    if (codesPage === 0) void loadCodes();
    else setCodesPage(0);
  }, [generatedCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saniye tick (sadece panel açık ve sayfa değişebiliyor)
  useEffect(() => {
    if (!codesOpen) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [codesOpen]);

  // Deep-link consume — bildirim tıklamasından geldiyse Davet Talepleri'ni aç,
  // scroll et, kısa süre flash halkasıyla vurgula, sonra intent'i temizle
  useEffect(() => {
    if (settingsTarget !== 'invite_requests') return;
    setRequestsOpen(true);
    const scrollT = setTimeout(() => {
      requestsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setFlashRequests(true);
    }, 60);
    const flashT = setTimeout(() => setFlashRequests(false), 1400);
    setSettingsTarget(null);
    return () => { clearTimeout(scrollT); clearTimeout(flashT); };
  }, [settingsTarget, setSettingsTarget]);

  const onGenerateClick = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await handleGenerateCode();
      // reload effect will fire via generatedCode change
    } finally {
      setTimeout(() => setGenerating(false), 400);
    }
  };

  const onCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setToastMsg(`${code} panoya kopyalandı`);
  };

  const onInvalidate = async (code: string) => {
    try {
      const ok = await invalidateInviteCode(code);
      if (ok) {
        setToastMsg(`${code} silindi`);
        void loadCodes();
      } else {
        setToastMsg('Kod silinemedi (zaten kullanılmış olabilir)');
      }
    } catch (e) {
      console.error('[AdminActionBar] invalidate error:', e);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'İşlem başarısız';
      setToastMsg(msg);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Aksiyon satırı ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Davet Kodu */}
        <button
          onClick={() => setCodesOpen(v => !v)}
          className="group flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all hover:border-[var(--theme-accent)]/40 hover:bg-[rgba(var(--theme-accent-rgb),0.04)] active:scale-[0.995]"
          style={{
            background: 'var(--theme-surface-card)',
            borderColor: activeCount > 0
              ? 'rgba(var(--theme-accent-rgb), 0.28)'
              : 'var(--theme-surface-card-border)',
          }}
        >
          <div className="relative w-9 h-9 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <LinkIcon size={14} className="text-[var(--theme-accent)]" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-[var(--theme-accent)] text-white rounded-full text-[9px] font-bold flex items-center justify-center leading-none">
                {activeCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Davet Kodu</p>
            <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
              {activeCount > 0 ? `${activeCount} aktif kod` : 'Yeni kod üret veya geçmişi gör'}
            </p>
          </div>
          <ChevronDown
            size={13}
            className={`text-[var(--theme-secondary-text)]/60 transition-transform shrink-0 ${codesOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Davet Talepleri */}
        <button
          onClick={() => setRequestsOpen(v => !v)}
          className="group flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all hover:border-[var(--theme-accent)]/40 hover:bg-[rgba(var(--theme-accent-rgb),0.04)] active:scale-[0.995]"
          style={{
            background: 'var(--theme-surface-card)',
            borderColor: requestCount > 0 ? 'rgba(245,158,11,0.35)' : 'var(--theme-surface-card-border)',
          }}
        >
          <div className="relative w-9 h-9 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Mail size={14} className="text-[var(--theme-accent)]" />
            {requestCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-amber-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center leading-none">
                {requestCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Davet Talepleri</p>
            <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
              {requestCount > 0 ? `${requestCount} bekleyen talep` : 'Bekleyen talep yok'}
            </p>
          </div>
          <ChevronDown
            size={13}
            className={`text-[var(--theme-secondary-text)]/60 transition-transform shrink-0 ${requestsOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* ── Davet Kodu paneli ── */}
      <AnimatePresence initial={false}>
        {codesOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-xl p-3 space-y-3"
              style={{
                background: 'var(--theme-surface-card)',
                border: '1px solid var(--theme-surface-card-border)',
              }}
            >
              {/* Üret butonu */}
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-[var(--theme-secondary-text)]/70">
                  Tek kullanımlık · 24 saat geçerli
                </p>
                <button
                  onClick={onGenerateClick}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 btn-primary font-semibold text-[11px] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={12} />
                  Yeni Kod Üret
                </button>
              </div>

              {/* Liste */}
              {codesLoading && codes.length === 0 ? (
                <div className="py-6 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
                </div>
              ) : codes.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-[var(--theme-secondary-text)]/60">
                  Henüz üretilmiş kod yok. Yukarıdaki butonla ilkini oluştur.
                </p>
              ) : (
                <div className="divide-y divide-[var(--theme-border)]/50 rounded-lg overflow-hidden border border-[var(--theme-border)]/40">
                  {codes.map(c => (
                    <React.Fragment key={c.code}>
                      <CodeRow row={c} onCopy={onCopy} onInvalidate={onInvalidate} />
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {codesTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10.5px] text-[var(--theme-secondary-text)]/70 tabular-nums">
                    Sayfa {codesPage + 1} / {codesTotalPages} · toplam {codesTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCodesPage(p => Math.max(0, p - 1))}
                      disabled={codesPage === 0 || codesLoading}
                      className="p-1.5 rounded-lg bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      onClick={() => setCodesPage(p => Math.min(codesTotalPages - 1, p + 1))}
                      disabled={codesPage >= codesTotalPages - 1 || codesLoading}
                      className="p-1.5 rounded-lg bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Davet Talepleri paneli ── */}
      <div ref={requestsAnchorRef} style={{ scrollMarginTop: 80 }} />
      <AnimatePresence initial={false}>
        {requestsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {requestCount > 0 ? (
              <div
                className={`rounded-xl overflow-hidden border transition-all duration-300 ${
                  flashRequests
                    ? 'border-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)]/40 shadow-[0_0_0_4px_rgba(var(--theme-accent-rgb),0.12)]'
                    : 'border-[var(--theme-border)]'
                }`}
              >
                <InviteRequestPanel requests={inviteRequests} onSendCode={handleSendInviteCode} onReject={handleRejectInvite} />
              </div>
            ) : (
              <p className="text-[11px] text-[var(--theme-secondary-text)]/70 italic px-1 py-2">Bekleyen davet talebi yok.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tek bir kod satırı ──
function CodeRow({ row, onCopy, onInvalidate }: { row: AdminInviteCodeRow; onCopy: (code: string) => void; onInvalidate: (code: string) => void | Promise<void> }) {
  const now = Date.now();
  const isUsed = row.used;
  const isExpired = !isUsed && row.expires_at <= now;
  const isActive = !isUsed && !isExpired;
  const timeLeftSec = Math.max(0, Math.floor((row.expires_at - now) / 1000));

  const formatCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}s ${m.toString().padStart(2, '0')}d kaldı`;
    if (m > 0) return `${m}d ${sec.toString().padStart(2, '0')}s kaldı`;
    return `${sec}s kaldı`;
  };

  const usedAtTxt = row.used_at
    ? new Date(row.used_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5"
      style={{ background: 'var(--theme-bg)' }}
    >
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          isActive ? 'bg-emerald-500' : isUsed ? 'bg-[var(--theme-secondary-text)]/40' : 'bg-[var(--theme-secondary-text)]/25'
        }`}
      />

      {/* Code + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono font-black text-[13px] tracking-[0.15em] ${
              isActive ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/60 line-through'
            }`}
          >
            {row.code}
          </span>
          {isActive && (
            <button
              onClick={() => onCopy(row.code)}
              className="p-1 rounded text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-panel-hover)] transition-colors"
              title="Kopyala"
            >
              <Copy size={11} />
            </button>
          )}
          {!isUsed && (
            <button
              onClick={() => onInvalidate(row.code)}
              className="p-1 rounded text-[var(--theme-secondary-text)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={isActive ? 'Kodu sil' : 'Süresi dolmuş kodu sil'}
            >
              <Ban size={11} />
            </button>
          )}
        </div>
        <p className="text-[10.5px] mt-0.5 leading-snug">
          {isActive && (
            <span className="text-emerald-500/90 font-semibold tabular-nums">{formatCountdown(timeLeftSec)}</span>
          )}
          {isUsed && (
            <span className="inline-flex items-center gap-1 text-[var(--theme-secondary-text)]/70">
              <CheckCircle2 size={10} className="text-emerald-500/70" />
              <span>
                <span className="font-semibold text-[var(--theme-text)]/80">{row.used_by_email ?? 'Bir kullanıcı'}</span>
                {' tarafından kullanıldı'}
                {usedAtTxt && ` · ${usedAtTxt}`}
              </span>
            </span>
          )}
          {isExpired && (
            <span className="inline-flex items-center gap-1 text-[var(--theme-secondary-text)]/60">
              <XCircle size={10} />
              Süresi doldu
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
