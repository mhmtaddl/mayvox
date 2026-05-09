import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Flag, Gamepad2, Globe2, Lock, Monitor, Shield, Smartphone, UserRound, UserX, X } from 'lucide-react';
import AvatarContent from '../AvatarContent';
import EmptyState from '../EmptyState';
import { getPublicDisplayName } from '../../lib/formatName';
import { openExternalUrl } from '../../lib/openExternalUrl';
import type { DmConversation, DmMessage } from '../../lib/dmService';
import type { User } from '../../types';
import { extractLinksFromMessages } from './dmDetailsUtils';

type Relationship = 'friend' | 'incoming' | 'outgoing' | null;

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
}: Props) {
  const links = useMemo(() => extractLinksFromMessages(messages), [messages]);
  const name = getPublicDisplayName(recipient);
  const statusText = getStatusText(recipient);
  const statusTone = getStatusTone(statusText, recipient.status);
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
          className="absolute inset-y-0 right-0 z-30 flex w-[272px] max-w-[82%] flex-col overflow-hidden border-l border-[rgba(var(--glass-tint),0.10)]"
          style={{
            background:
              'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.025)), var(--surface-floating-bg, var(--surface-elevated, var(--theme-popover-bg)))',
            boxShadow: '-18px 0 34px -24px rgba(var(--shadow-base),0.72), inset 1px 0 0 rgba(255,255,255,0.035)',
            backdropFilter: 'blur(16px) saturate(125%)',
            WebkitBackdropFilter: 'blur(16px) saturate(125%)',
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
            <section className="flex flex-col items-center text-center">
              <div
                className="mb-2 flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22), rgba(var(--theme-accent-rgb),0.07))',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.10)',
                }}
              >
                <AvatarContent
                  avatar={recipient.avatar}
                  statusText={recipient.statusText}
                  firstName={recipient.displayName || recipient.firstName}
                  name={name}
                  letterClassName="text-[20px] font-bold text-[var(--theme-accent)]/85"
                />
              </div>
              <div className="mv-font-title max-w-full truncate text-[14.5px] font-bold text-[var(--theme-text)]">{name}</div>
              <div className={`mv-font-meta mt-1 rounded-full px-2 py-[3px] text-[10.5px] font-semibold ${statusTone}`}>
                {statusText}
              </div>
              {(recipient.gameActivity || recipient.platform) && (
                <div className="mt-2 flex max-w-full flex-wrap justify-center gap-1.5">
                  {recipient.gameActivity && (
                    <InfoChip icon={<Gamepad2 size={11} />} label={recipient.gameActivity} />
                  )}
                  {recipient.platform && (
                    <InfoChip
                      icon={recipient.platform === 'mobile' ? <Smartphone size={11} /> : <Monitor size={11} />}
                      label={recipient.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
                    />
                  )}
                </div>
              )}
            </section>

            <section className="mt-3.5 space-y-2">
              <SectionTitle>Durum</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {relationshipLabel && <StatusChip icon={<UserRound size={11} />} label={relationshipLabel} />}
                {showRequestChip && <StatusChip icon={<Shield size={11} />} label="Mesaj isteği" tone="accent" />}
                {isBlocked && <StatusChip icon={<Lock size={11} />} label="Engellendi" tone="danger" />}
                {!relationshipLabel && !showRequestChip && !isBlocked && <StatusChip icon={<UserRound size={11} />} label="DM acik" />}
              </div>
            </section>

            <section className="mt-3.5 space-y-2">
              <SectionTitle>Paylaşılan linkler</SectionTitle>
              {links.length > 0 ? (
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
              )}
            </section>

            <section className="mt-3.5 space-y-2">
              <SectionTitle>Güvenlik</SectionTitle>
              <button
                type="button"
                onClick={onReportUser}
                className="flex h-9 w-full items-center gap-2 rounded-xl px-2.5 text-[11px] font-semibold text-amber-300/88 transition-colors hover:bg-amber-500/10"
              >
                <Flag size={13} />
                Kullanıcıyı rapor et
              </button>
              <button
                type="button"
                onClick={isBlocked ? onUnblockUser : onBlockUser}
                className={`flex h-9 w-full items-center gap-2 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
                  isBlocked
                    ? 'text-emerald-300/88 hover:bg-emerald-500/10'
                    : 'text-red-300/88 hover:bg-red-500/10'
                }`}
              >
                <UserX size={13} />
                {isBlocked ? 'Engeli kaldır' : 'Engelle'}
              </button>
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function InfoChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="mv-font-caption inline-flex max-w-full items-center gap-1 rounded-full bg-[rgba(var(--glass-tint),0.055)] px-2 py-[3px] text-[10px] font-semibold text-[var(--theme-secondary-text)]/80">
      <span className="shrink-0 text-[var(--theme-accent)]/65">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mv-font-caption text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">
      {children}
    </h3>
  );
}

function getRelationshipLabel(relationship: Relationship): string | null {
  if (relationship === 'friend') return 'Arkadaş';
  if (relationship === 'incoming') return 'İstek geldi';
  if (relationship === 'outgoing') return 'İstek gönderildi';
  return null;
}

function getStatusText(user: User): string {
  if (user.status !== 'online') return 'Çevrimdışı';
  const raw = user.statusText || 'Online';
  return raw === 'Aktif' ? 'Online' : raw;
}

function getStatusTone(statusText: string, status: User['status']): string {
  if (status !== 'online' || statusText === 'Çevrimdışı') return 'bg-[rgba(var(--glass-tint),0.055)] text-[var(--theme-secondary-text)]/70';
  if (statusText === 'Online') return 'bg-emerald-500/10 text-emerald-300';
  if (statusText === 'Pasif') return 'bg-yellow-500/10 text-yellow-300';
  if (statusText === 'AFK') return 'bg-violet-500/10 text-violet-300';
  if (statusText === 'Duymuyor' || statusText === 'Rahatsız Etmeyin') return 'bg-red-500/10 text-red-300';
  return 'bg-orange-500/10 text-orange-300';
}
