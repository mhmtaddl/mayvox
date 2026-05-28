import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Flag, Globe2, Image as ImageIcon, Link2, Lock, Pin, Shield, UserRound, UserX, X } from 'lucide-react';
import EmptyState from '../EmptyState';
import { openExternalUrl } from '../../lib/openExternalUrl';
import type { DmConversation, DmMessage } from '../../lib/dmService';
import type { User } from '../../types';
import { extractLinksFromMessages, extractMediaFromMessages } from './dmDetailsUtils';

type Relationship = 'friend' | 'incoming' | 'outgoing' | null;
const SHARED_SCAN_LIMIT = 320;

interface Props {
  open: boolean;
  recipient: User;
  relationship: Relationship;
  isBlocked: boolean;
  isRequest: boolean;
  requestStatus?: DmConversation['requestStatus'] | DmMessage['requestStatus'];
  messages: DmMessage[];
  onClose: () => void;
  onBlockUser: () => void;
  onUnblockUser: () => void;
  onReportUser: () => void;
  onJumpToMessage?: (messageId: string) => void;
  solidSurface?: boolean;
}

export default function DMDetailsPanel({
  open,
  recipient,
  relationship,
  isBlocked,
  isRequest,
  requestStatus,
  messages,
  onClose,
  onBlockUser,
  onUnblockUser,
  onReportUser,
  onJumpToMessage,
  solidSurface = false,
}: Props) {
  const [tab, setTab] = useState<'pins' | 'links' | 'media'>('pins');
  const [sharedReady, setSharedReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setSharedReady(false);
      setTab('pins');
      return;
    }
    const timer = window.setTimeout(() => setSharedReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [open]);
  const links = useMemo(() => (sharedReady ? extractLinksFromMessages(messages, undefined, SHARED_SCAN_LIMIT) : []), [messages, sharedReady]);
  const media = useMemo(() => (sharedReady ? extractMediaFromMessages(messages, undefined, SHARED_SCAN_LIMIT) : []), [messages, sharedReady]);
  const pinnedMessages = useMemo(() => {
    if (!sharedReady) return [];
    const pinned: DmMessage[] = [];
    for (let i = messages.length - 1; i >= 0 && pinned.length < 12; i -= 1) {
      if (messages[i].pinnedAt) pinned.push(messages[i]);
    }
    return pinned.sort((a, b) => Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0));
  }, [messages, sharedReady]);
  const relationshipLabel = getRelationshipLabel(relationship);
  const showRequestChip = isRequest || requestStatus === 'pending';

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="dm-details"
          onMouseDown={(event) => event.stopPropagation()}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 18 }}
          transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
          className={`absolute inset-y-0 right-0 z-30 flex w-[272px] max-w-[86%] flex-col overflow-hidden border-l border-[rgba(var(--glass-tint),0.10)] ${solidSurface ? 'dm-mobile-solid-panel dm-mobile-side-panel' : ''}`}
          style={{
            background:
              'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.024)), rgba(var(--theme-bg-rgb),0.995)',
            boxShadow: '-18px 0 34px -24px rgba(var(--shadow-base),0.72), inset 1px 0 0 rgba(255,255,255,0.035)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
        >
          <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 px-3.5" style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.08)' }}>
            <div className="min-w-0">
              <div className="mv-font-title truncate text-[13px] font-bold text-[var(--theme-text)]">Sohbet detayları</div>
              <div className="mv-font-caption truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/55">DM profili ve paylaşımlar</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/60 transition-colors hover:bg-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)]"
              title="Detayları kapat"
              aria-label="Detayları kapat"
            >
              <X size={14} />
            </button>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-3.5 py-3">
            <section className="space-y-2">
              <SectionTitle>Durum</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {relationshipLabel && <StatusChip icon={<UserRound size={11} />} label={relationshipLabel} />}
                {showRequestChip && <StatusChip icon={<Shield size={11} />} label="Mesaj isteği" tone="accent" />}
                {isBlocked && <StatusChip icon={<Lock size={11} />} label="Engellendi" tone="danger" />}
                {!relationshipLabel && !showRequestChip && !isBlocked && <StatusChip icon={<UserRound size={11} />} label="DM acik" />}
              </div>
            </section>

            <section className="mt-3 space-y-2">
              <SectionTitle>Paylaşımlar</SectionTitle>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.025)] p-1">
                <ShareTab active={tab === 'pins'} icon={<Pin size={11} />} label="Sabit" count={pinnedMessages.length} onClick={() => setTab('pins')} />
                <ShareTab active={tab === 'links'} icon={<Link2 size={11} />} label="Link" count={links.length} onClick={() => setTab('links')} />
                <ShareTab active={tab === 'media'} icon={<ImageIcon size={11} />} label="Medya" count={media.length} onClick={() => setTab('media')} />
              </div>

              {tab === 'pins' && (
                !sharedReady ? (
                  <DetailsMiniLoading icon={<Pin size={15} />} title="Sabitler hazırlanıyor" />
                ) : pinnedMessages.length > 0 ? (
                  <div className="space-y-1.5">
                    {pinnedMessages.map(message => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => onJumpToMessage?.(message.id)}
                        className="group/link flex w-full items-start gap-2 rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--glass-tint),0.035)] px-2.5 py-2 text-left transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.20)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)]"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--theme-accent-rgb),0.09)] text-[var(--theme-accent)]/80">
                          <Pin size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mv-font-body line-clamp-2 text-[11.5px] font-semibold leading-snug text-[var(--theme-text)]/88">{message.text}</span>
                          <span className="mv-font-caption mt-1 block text-[10px] font-medium text-[var(--theme-secondary-text)]/55">
                            {formatCompactDate(message.pinnedAt || message.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    size="xs"
                    icon={<Pin size={15} />}
                    title="Sabitlenen mesaj yok"
                    description="Önemli mesajları sabitleyince burada görünür."
                    className="min-h-[92px] rounded-xl border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] px-3"
                  />
                )
              )}

              {tab === 'links' && (
                !sharedReady ? (
                  <DetailsMiniLoading icon={<Globe2 size={15} />} title="Linkler hazırlanıyor" />
                ) : links.length > 0 ? (
                  <div className="space-y-1.5">
                    {links.map(link => (
                      <button
                        key={link.url}
                        type="button"
                        onClick={() => openExternalUrl(link.url)}
                        className="group/link flex w-full items-center gap-2 rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--glass-tint),0.035)] px-2.5 py-2 text-left transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.20)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-accent)]/75">
                          <Globe2 size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mv-font-body block truncate text-[11.5px] font-semibold text-[var(--theme-text)]/88">{link.title}</span>
                          <span className="mv-font-caption block truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/55">{link.domain}</span>
                        </span>
                        <ExternalLink size={12} className="shrink-0 text-[var(--theme-secondary-text)]/35 transition-colors group-hover/link:text-[var(--theme-accent)]/75" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    size="xs"
                    icon={<Globe2 size={15} />}
                    title="Paylaşılan link yok"
                    description="Bu sohbette paylaşılan bağlantılar burada görünür."
                    className="min-h-[92px] rounded-xl border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] px-3"
                  />
                )
              )}

              {tab === 'media' && (
                !sharedReady ? (
                  <DetailsMiniLoading icon={<ImageIcon size={15} />} title="Medya hazırlanıyor" />
                ) : media.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {media.map(item => (
                      <button
                        key={item.url}
                        type="button"
                        onClick={() => openExternalUrl(item.url)}
                        className="group/link min-w-0 rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--glass-tint),0.035)] p-2 text-left transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.20)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)]"
                      >
                        <span className="mb-1.5 flex h-14 items-center justify-center rounded-lg bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-accent)]/75">
                          <ImageIcon size={17} />
                        </span>
                        <span className="mv-font-body block truncate text-[10.5px] font-semibold text-[var(--theme-text)]/86">{item.title}</span>
                        <span className="mv-font-caption block truncate text-[9.5px] font-medium text-[var(--theme-secondary-text)]/55">{item.kind}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    size="xs"
                    icon={<ImageIcon size={15} />}
                    title="Medya yok"
                    description="Görsel ve video linkleri burada toplanır."
                    className="min-h-[92px] rounded-xl border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] px-3"
                  />
                )
              )}
            </section>

            <section className="mt-3.5 space-y-2">
              <SectionTitle>Güvenlik</SectionTitle>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onReportUser}
                  className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10.5px] font-semibold text-amber-300/88 transition-colors hover:bg-amber-500/10"
                >
                  <Flag size={13} className="shrink-0" />
                  <span className="truncate">Rapor et</span>
                </button>
                <button
                  type="button"
                  onClick={isBlocked ? onUnblockUser : onBlockUser}
                  className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10.5px] font-semibold transition-colors ${
                    isBlocked
                      ? 'text-emerald-300/88 hover:bg-emerald-500/10'
                      : 'text-red-300/88 hover:bg-red-500/10'
                  }`}
                >
                  <UserX size={13} className="shrink-0" />
                  <span className="truncate">{isBlocked ? 'Engeli kaldır' : 'Engelle'}</span>
                </button>
              </div>
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function DetailsMiniLoading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-[92px] items-center justify-center gap-2 rounded-xl border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] px-3 text-[11px] font-semibold text-[var(--theme-secondary-text)]/55">
      <span className="text-[var(--theme-accent)]/65">{icon}</span>
      {title}
    </div>
  );
}

function StatusChip({ icon, label, tone = 'neutral' }: { icon: React.ReactNode; label: string; tone?: 'neutral' | 'accent' | 'danger' }) {
  const toneClass =
    tone === 'accent'
      ? 'bg-[rgba(var(--theme-accent-rgb),0.10)] text-[var(--theme-accent)] border-[rgba(var(--theme-accent-rgb),0.16)]'
      : tone === 'danger'
        ? 'bg-red-500/10 text-red-300 border-red-400/15'
        : 'bg-[rgba(var(--glass-tint),0.045)] text-[var(--theme-secondary-text)]/82 border-[rgba(var(--glass-tint),0.07)]';

  return (
    <span className={`mv-font-caption inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold ${toneClass}`}>
      {icon}
      {label}
    </span>
  );
}

function ShareTab({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg text-[10px] font-bold transition-colors ${
        active
          ? 'bg-[rgba(var(--theme-accent-rgb),0.12)] text-[var(--theme-accent)]'
          : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)]'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="rounded-full bg-[rgba(var(--glass-tint),0.07)] px-1 text-[9px] text-current/70">{count}</span>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mv-font-caption text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">
      {children}
    </h3>
  );
}

function formatCompactDate(value: number): string {
  const date = new Date(value);
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRelationshipLabel(relationship: Relationship): string | null {
  if (relationship === 'friend') return 'Arkadaş';
  if (relationship === 'incoming') return 'İstek geldi';
  if (relationship === 'outgoing') return 'İstek gönderildi';
  return null;
}
