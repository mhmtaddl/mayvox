import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Check, X, Inbox, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Avatar from '../ui/Avatar';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { UserInvite } from '../../lib/serverService';

interface Props {
  open: boolean;
  onClose: () => void;
  invites: UserInvite[];
  loading: boolean;
  error: string;
  onAccept: (inviteId: string) => Promise<void>;
  onDecline: (inviteId: string) => Promise<void>;
  /** Kabul sonrası sunucu listesini tazelemek için */
  onAccepted?: (invite: UserInvite) => void;
  /** Red sonrası opsiyonel feedback (toast vb.) */
  onDeclined?: (invite: UserInvite) => void;
}

type PendingAction = 'accept' | 'decline';

function formatRelativeTr(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'az önce';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dakika önce`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} saat önce`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} gün önce`;
  return new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

export default function IncomingInvitesModal({
  open, onClose, invites, loading, error, onAccept, onDecline, onAccepted, onDeclined,
}: Props) {
  const [pending, setPending] = useState<Record<string, PendingAction | undefined>>({});
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});
  // Ref: React state async olduğu için çok hızlı çift tıklamada guard olarak.
  const pendingRef = useRef<Record<string, PendingAction | undefined>>({});

  useEscapeKey(onClose, open);

  // Relative time ("az önce" / "N dakika önce") taze kalsın — modal açıkken 60 s'de bir tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setTick(t => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const setRowPending = useCallback((id: string, action: PendingAction | undefined) => {
    if (action) pendingRef.current[id] = action;
    else delete pendingRef.current[id];
    setPending(prev => {
      const next = { ...prev };
      if (action) next[id] = action; else delete next[id];
      return next;
    });
  }, []);

  const handleAccept = useCallback(async (invite: UserInvite) => {
    const id = invite.id;
    if (pendingRef.current[id]) return;
    setRowError(prev => ({ ...prev, [id]: undefined }));
    setRowPending(id, 'accept');
    try {
      await onAccept(id);
      onAccepted?.(invite);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Davet kabul edilemedi';
      setRowError(prev => ({ ...prev, [id]: msg }));
    } finally {
      setRowPending(id, undefined);
    }
  }, [onAccept, onAccepted, setRowPending]);

  const handleDecline = useCallback(async (invite: UserInvite) => {
    const id = invite.id;
    if (pendingRef.current[id]) return;
    setRowError(prev => ({ ...prev, [id]: undefined }));
    setRowPending(id, 'decline');
    try {
      await onDecline(id);
      onDeclined?.(invite);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Davet reddedilemedi';
      setRowError(prev => ({ ...prev, [id]: msg }));
    } finally {
      setRowPending(id, undefined);
    }
  }, [onDecline, onDeclined, setRowPending]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        className="w-[440px] max-w-[92vw] rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{
          maxHeight: 'min(80vh, 640px)',
          background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center gap-4 shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))',
              boxShadow: '0 0 16px rgba(var(--theme-accent-rgb), 0.08) inset',
            }}
          >
            <Mail size={19} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)]">Sunucu Davetleri</h3>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-50 mt-0.5">
              {loading
                ? 'Davetler yükleniyor...'
                : invites.length === 0
                  ? 'Bekleyen davetin yok'
                  : invites.length === 1
                    ? 'Bekleyen 1 davet var'
                    : `Bekleyen ${invites.length} davet var`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors shrink-0"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-3 pb-3 overflow-y-auto">
          {loading ? (
            <LoadingState />
          ) : error && invites.length === 0 ? (
            <ErrorState message={error} />
          ) : invites.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-1.5 px-1">
              <AnimatePresence initial={false}>
                {invites.map(inv => (
                  <motion.li
                    key={inv.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                  >
                    <InviteRow
                      invite={inv}
                      pending={pending[inv.id]}
                      rowError={rowError[inv.id]}
                      onAccept={() => handleAccept(inv)}
                      onDecline={() => handleDecline(inv)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ── Alt bileşenler ──────────────────────────────────────────────

function InviteRow({
  invite, pending, rowError, onAccept, onDecline,
}: {
  invite: UserInvite;
  pending: PendingAction | undefined;
  rowError: string | undefined;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const busy = !!pending;
  const accepting = pending === 'accept';
  const declining = pending === 'decline';
  const relative = formatRelativeTr(invite.createdAt);

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl transition-colors"
      style={{
        background: 'rgba(var(--glass-tint), 0.04)',
        border: '1px solid rgba(var(--glass-tint), 0.07)',
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar src={invite.serverAvatar} fallback={invite.serverName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{invite.serverName}</div>
          <div className="text-[10.5px] text-[var(--theme-secondary-text)]/55 truncate mt-0.5">
            {invite.invitedByName ? `${invite.invitedByName} davet etti` : 'Bir üye davet etti'}
            {relative && <span className="text-[var(--theme-secondary-text)]/30"> · {relative}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onDecline}
            disabled={busy}
            title="Reddet"
            className="h-8 px-3 rounded-lg text-[11px] font-semibold text-[var(--theme-secondary-text)]/75 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 disabled:cursor-wait transition-colors flex items-center gap-1.5"
          >
            {declining ? (
              <>
                <Spinner />
                <span>Reddediliyor</span>
              </>
            ) : (
              <>
                <X size={12} strokeWidth={2.2} />
                <span>Reddet</span>
              </>
            )}
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            title="Kabul et"
            className="h-8 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-wait transition-all hover:brightness-110 active:scale-[0.97]"
            style={{
              background: 'var(--theme-accent)',
              color: 'var(--theme-text-on-accent, #000)',
              boxShadow: '0 2px 10px rgba(var(--theme-accent-rgb), 0.18)',
            }}
          >
            {accepting ? (
              <>
                <Spinner />
                <span>Katılıyor</span>
              </>
            ) : (
              <>
                <Check size={12} strokeWidth={2.5} />
                <span>Kabul et</span>
              </>
            )}
          </button>
        </div>
      </div>

      {rowError && (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10.5px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
        >
          <AlertCircle size={12} className="shrink-0" />
          <span className="truncate">{rowError}</span>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
        style={{ background: 'rgba(var(--glass-tint), 0.05)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}
      >
        <Inbox size={20} className="text-[var(--theme-secondary-text)]/40" />
      </div>
      <div className="text-[12.5px] font-semibold text-[var(--theme-text)]/70">Bekleyen davet yok</div>
      <div className="text-[10.5px] text-[var(--theme-secondary-text)]/40 mt-1 max-w-[260px] leading-relaxed">
        Sana yeni bir sunucu daveti geldiğinde burada görünecek.
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-1.5 px-1 py-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.05)' }}
        >
          <div className="w-9 h-9 rounded-[10px] bg-[rgba(var(--glass-tint),0.06)] animate-pulse" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-2.5 w-2/5 rounded bg-[rgba(var(--glass-tint),0.07)] animate-pulse" />
            <div className="h-2 w-3/5 rounded bg-[rgba(var(--glass-tint),0.05)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
      >
        <AlertCircle size={18} className="text-red-400/75" />
      </div>
      <div className="text-[12px] font-semibold text-red-400/85">Davetler yüklenemedi</div>
      <div className="text-[10.5px] text-[var(--theme-secondary-text)]/45 mt-1 max-w-[280px] leading-relaxed">
        {message}
      </div>
    </div>
  );
}
