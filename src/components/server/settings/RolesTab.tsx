import React, { useEffect, useState } from 'react';
import { Crown, Shield, ShieldCheck, User, AlertCircle } from 'lucide-react';
import { getServerRoles, type ServerRoleSummary } from '../../../lib/serverService';

interface Props {
  serverId: string;
}

// Capability → okunabilir etiket (UI için group sonra)
const CAP_LABEL: Record<string, string> = {
  'server.view': 'Sunucuyu gör',
  'server.join': 'Sunucuya katıl',
  'server.manage': 'Sunucu ayarları',
  'channel.create': 'Kanal oluştur',
  'channel.update': 'Kanal düzenle',
  'channel.delete': 'Kanal sil',
  'channel.reorder': 'Kanal sırala',
  'channel.view_private': 'Özel kanalları gör',
  'channel.join_private': 'Özel kanala katıl',
  'invite.create': 'Davet oluştur',
  'invite.revoke': 'Davet iptal',
  'member.move': 'Üye taşı',
  'member.kick': 'Üye at',
  'role.manage': 'Rol yönet',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  moderator: 'Moderatör',
  member: 'Üye',
};

const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <Crown size={13} className="text-amber-400" />,
  admin: <Shield size={13} className="text-blue-400" />,
  moderator: <ShieldCheck size={13} className="text-purple-400" />,
  member: <User size={13} className="text-[var(--theme-secondary-text)]/60" />,
};

const ROLE_BADGE_BG: Record<string, string> = {
  owner: 'rgba(245,158,11,0.08)',
  admin: 'rgba(59,130,246,0.08)',
  moderator: 'rgba(168,85,247,0.08)',
  member: 'rgba(var(--glass-tint), 0.04)',
};

export default function RolesTab({ serverId }: Props) {
  const [roles, setRoles] = useState<ServerRoleSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rs = await getServerRoles(serverId);
        if (!cancelled) setRoles(rs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Roller yüklenemedi');
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg text-[11px] text-red-400/85"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
      >
        <AlertCircle size={12} />
        <span>{error}</span>
      </div>
    );
  }
  if (!roles) return <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-relaxed">
        Sistem rolleri sunucu başına sabittir. Capability atama şu an sadece rol değiştirme üzerinden yapılır (üyeler sekmesinde).
      </p>
      {roles.map(r => (
        <div key={r.id} className="p-3 rounded-xl"
          style={{ background: ROLE_BADGE_BG[r.name] ?? ROLE_BADGE_BG.member, border: '1px solid rgba(var(--glass-tint), 0.07)' }}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            {ROLE_ICON[r.name] ?? <User size={13} />}
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-[var(--theme-text)]">{ROLE_LABEL[r.name] ?? r.name}</div>
              {r.isSystem && (
                <div className="text-[9px] text-[var(--theme-secondary-text)]/40 uppercase tracking-wider">Sistem rolü</div>
              )}
            </div>
            <div className="text-[10px] text-[var(--theme-secondary-text)]/55">
              {r.memberCount} üye
            </div>
          </div>
          {r.capabilities.length === 0 ? (
            <div className="text-[10px] text-[var(--theme-secondary-text)]/35">Yetki yok</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {r.capabilities.map(c => (
                <span key={c}
                  className="text-[9px] font-medium px-2 py-0.5 rounded"
                  style={{ background: 'rgba(var(--glass-tint), 0.08)', color: 'var(--theme-text)' }}
                  title={c}
                >
                  {CAP_LABEL[c] ?? c}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
