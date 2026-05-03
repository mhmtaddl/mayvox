import React from 'react';
import { Link as LinkIcon, Copy, Timer, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CardSection } from '../shared';
import { useAppState } from '../../../contexts/AppStateContext';
import InviteRequestPanel from '../../InviteRequestPanel';

// ── Davet Kodu ──
export function InviteCodeSection() {
  const { handleGenerateCode, handleCopyCode, generatedCode, timeLeft, formatTime } = useAppState();

  return (
    <CardSection icon={<LinkIcon size={12} />} title="Davet Kodu">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[var(--theme-text)]">Davet Kodu Oluştur</p>
          <p className="text-[10px] text-[var(--theme-secondary-text)]/60 mt-0.5">Süreli giriş kodu.</p>
        </div>
        <button
          onClick={handleGenerateCode}
          className="flex items-center gap-1.5 px-3 py-1.5 btn-primary font-semibold text-[11px] shrink-0 active:scale-95"
        >
          <LinkIcon size={12} />
          Oluştur
        </button>
      </div>

      <AnimatePresence>
        {generatedCode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-[var(--theme-accent)]/5 border border-[var(--theme-border)] rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-[9px] font-bold text-[var(--theme-accent)] uppercase tracking-widest mb-1 block">Aktif Kod</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg md:text-xl font-mono font-black tracking-[0.15em] md:tracking-[0.2em] text-[var(--theme-text)]">{generatedCode}</span>
                    <button onClick={handleCopyCode} className="p-1 rounded-lg bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors">
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1 text-orange-500 font-bold mb-0.5">
                    <Timer size={10} className="animate-pulse" />
                    <span className="text-[9px] uppercase">Süre</span>
                  </div>
                  <div className="text-lg font-black text-[var(--theme-text)] tabular-nums">{formatTime(timeLeft)}</div>
                </div>
              </div>
              <div className="mt-2 w-full h-1 bg-[var(--theme-sidebar)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: `${(timeLeft / 180) * 100}%` }}
                  transition={{ duration: 1, ease: 'linear' }}
                  className="h-full bg-[var(--theme-accent)]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CardSection>
  );
}

// ── Davet Talepleri ──
export function InviteRequestsSection() {
  const { inviteRequests, handleSendInviteCode, handleRejectInvite, handleDeleteInviteRequest } = useAppState();

  return (
    <CardSection
      icon={<Mail size={12} />}
      title="Davet Talepleri"
      badge={inviteRequests.length > 0 ? (
        <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
          {inviteRequests.length}
        </span>
      ) : undefined}
    >
      {inviteRequests.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-[var(--theme-border)]">
          <InviteRequestPanel
            requests={inviteRequests}
            onSendCode={handleSendInviteCode}
            onReject={handleRejectInvite}
            onDelete={handleDeleteInviteRequest}
          />
        </div>
      ) : (
        <p className="text-[11px] text-[var(--theme-secondary-text)] italic">Bekleyen davet talebi yok.</p>
      )}
    </CardSection>
  );
}
