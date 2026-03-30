import React from 'react';
import { Link as LinkIcon, Copy, Timer, Mail, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AccordionSection, SLabel, cardCls } from '../shared';
import { useAppState } from '../../../contexts/AppStateContext';
import InviteRequestPanel from '../../InviteRequestPanel';
import UpdatePolicyPanel from '../../UpdatePolicyPanel';

// ── Davet Kodu ──
export function InviteCodeSection() {
  const { handleGenerateCode, handleCopyCode, generatedCode, timeLeft, formatTime } = useAppState();

  return (
    <AccordionSection icon={<LinkIcon size={12} />} title="Davet Kodu">
      <div className={cardCls}>
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--theme-text)]">Davet Kodu Oluştur</p>
            <p className="text-xs text-[var(--theme-secondary-text)]/80 mt-0.5">Yeni kullanıcılar için süreli giriş kodu.</p>
          </div>
          <button
            onClick={handleGenerateCode}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-accent)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md shadow-[var(--theme-accent)]/20 shrink-0"
          >
            <LinkIcon size={14} />
            Oluştur
          </button>
        </div>

        {/* Generated Code */}
        <AnimatePresence>
          {generatedCode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 py-5 bg-[var(--theme-accent)]/5 border-t border-[var(--theme-border)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-widest mb-1 block">Aktif Davet Kodu</label>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-mono font-black tracking-[0.2em] text-[var(--theme-text)]">{generatedCode}</span>
                      <button
                        onClick={handleCopyCode}
                        className="p-1.5 rounded-lg bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] transition-colors"
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1 text-orange-500 font-bold mb-1">
                      <Timer size={12} className="animate-pulse" />
                      <span className="text-[10px] uppercase">Süre Azalıyor</span>
                    </div>
                    <div className="text-xl font-black text-[var(--theme-text)] tabular-nums">{formatTime(timeLeft)}</div>
                  </div>
                </div>
                <div className="mt-3 w-full h-1 bg-[var(--theme-sidebar)] rounded-full overflow-hidden">
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
      </div>
    </AccordionSection>
  );
}

// ── Davet Talepleri ──
export function InviteRequestsSection() {
  const { inviteRequests, handleSendInviteCode, handleRejectInvite } = useAppState();

  return (
    <AccordionSection
      icon={<Mail size={12} />}
      title="Davet Talepleri"
      badge={inviteRequests.length > 0 ? (
        <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
          {inviteRequests.length}
        </span>
      ) : undefined}
    >
      {inviteRequests.length > 0 ? (
        <div className={`${cardCls} overflow-hidden`}>
          <InviteRequestPanel requests={inviteRequests} onSendCode={handleSendInviteCode} onReject={handleRejectInvite} />
        </div>
      ) : (
        <p className="text-xs text-[var(--theme-secondary-text)] italic">Bekleyen davet talebi yok.</p>
      )}
    </AccordionSection>
  );
}

// ── Güncelleme Yönetimi ──
export function UpdatePolicySection() {
  const { appVersion: currentAppVersion } = useAppState();

  return (
    <AccordionSection
      icon={<Zap size={12} />}
      title="Güncelleme Yönetimi"
      badge={
        <span className="text-[9px] bg-amber-500/12 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase font-bold tracking-wider">
          Policy
        </span>
      }
    >
      <div className={cardCls}>
        <div className="px-6 py-5">
          <UpdatePolicyPanel appVersion={currentAppVersion} />
        </div>
      </div>
    </AccordionSection>
  );
}
