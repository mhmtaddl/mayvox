import React, { useState } from 'react';
import { Bell, LogOut, MessageCircle, PenLine, Settings, UserPlus } from 'lucide-react';
import MobileSettingsRow from './MobileSettingsRow';
import type { MobileUserStatus } from './MobileUserListItem';

interface MobileProfileBadge {
  id: string;
  label: string;
}

interface MobileProfileScreenProps {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  status?: MobileUserStatus;
  subtitle?: string;
  serverName?: string;
  channelName?: string;
  gameActivity?: string;
  badges?: MobileProfileBadge[];
  onOpenDm?: () => void;
  onOpenSettings?: () => void;
  onEditProfile?: () => void;
  onLogout?: () => void;
}

const STATUS_LABEL: Record<MobileUserStatus, string> = {
  online: 'Online',
  idle: 'Bosta',
  dnd: 'Rahatsiz etmeyin',
  offline: 'Cevrimdisi',
};

const STATUS_COLOR: Record<MobileUserStatus, string> = {
  online: '#22c55e',
  idle: '#f59e0b',
  dnd: '#ef4444',
  offline: 'rgba(var(--glass-tint),0.34)',
};

export default function MobileProfileScreen({
  displayName,
  username,
  avatarUrl,
  status = 'offline',
  subtitle,
  serverName,
  channelName,
  gameActivity,
  badges = [],
  onOpenDm,
  onOpenSettings,
  onEditProfile,
  onLogout,
}: MobileProfileScreenProps) {
  const name = displayName || username || 'MAYVox kullanicisi';
  const handle = username ? `@${username}` : '@mayvox';
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!avatarUrl && !avatarFailed;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-3 pt-0.5 custom-scrollbar">
      <div className="mx-auto w-full max-w-[860px]">
      <section className="mb-1.5 rounded-[16px] px-4 py-2.5 text-center" style={{ background: 'rgba(var(--glass-tint),0.026)' }}>
        <div className="mx-auto mb-1.5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-[15px] text-[20px] font-black text-[var(--theme-text)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}>
          {showAvatar ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            name.trim().charAt(0).toLocaleUpperCase('tr-TR')
          )}
        </div>
        <h2 className="truncate text-[18px] font-black text-[var(--theme-text)]">{name}</h2>
        <p className="mt-0.5 truncate text-[11.5px] font-medium text-[var(--theme-secondary-text)]/58">{handle}</p>
        {subtitle && <p className="mx-auto mt-1.5 max-w-[260px] text-[11px] leading-5 text-[var(--theme-secondary-text)]/60">{subtitle}</p>}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
          <span className="text-[10.5px] font-bold text-[var(--theme-secondary-text)]/68">{STATUS_LABEL[status]}</span>
        </div>
      </section>

      <section className="mb-1.5 grid grid-cols-4 gap-1.5">
        <ActionButton label="DM" icon={<MessageCircle size={16} />} onClick={onOpenDm} />
        <ActionButton label="Arkadas" icon={<UserPlus size={16} />} />
        <ActionButton label="Bildirim" icon={<Bell size={16} />} />
        <ActionButton label="Ayar" icon={<Settings size={16} />} onClick={onOpenSettings} />
      </section>

      <section className="mb-1.5 rounded-[16px] px-3.5 py-2.5" style={{ background: 'rgba(var(--glass-tint),0.022)' }}>
        <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/58">Profil ozeti</h3>
        <div className="space-y-1">
          <MetaRow label="Sunucu" value={serverName || 'Bagli sunucu yok'} />
          <MetaRow label="Aktif oda" value={channelName || 'Oda yok'} />
          <MetaRow label="Aktivite" value={gameActivity || 'Aktivite yok'} />
        </div>
        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badges.map(badge => (
              <span key={badge.id} className="rounded-full px-2.5 py-1 text-[10px] font-bold text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.10)' }}>
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1">
        <MobileSettingsRow title="Profili duzenle" subtitle="Avatar ve gorunen ad" icon={<PenLine size={16} />} onClick={onEditProfile} />
        <MobileSettingsRow title="Hesap ayarlari" subtitle="Guvenlik ve tercihler" icon={<Settings size={16} />} onClick={onOpenSettings} />
        <MobileSettingsRow title="Cikis" subtitle="Oturumu kapat" icon={<LogOut size={16} />} onClick={onLogout} />
      </section>
      </div>
    </div>
  );
}

function ActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[13px] text-[var(--theme-secondary-text)]/72 active:scale-[0.98]"
      style={{ background: 'rgba(var(--glass-tint),0.024)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.024)' }}
    >
      <span className="text-[var(--theme-accent)]">{icon}</span>
      <span className="text-[9.5px] font-bold">{label}</span>
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[13px] px-3 py-1.5" style={{ background: 'rgba(var(--glass-tint),0.018)' }}>
      <span className="shrink-0 text-[10.5px] font-semibold text-[var(--theme-secondary-text)]/52">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px] font-bold text-[var(--theme-text)]/82">{value}</span>
    </div>
  );
}
