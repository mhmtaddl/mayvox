import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { getAuditLog, type AuditLogItem } from '../../../lib/serverService';

interface Props {
  serverId: string;
}

// Action → human label + kategori
const ACTION_META: Record<string, { label: string; group: string }> = {
  'channel.create': { label: 'Kanal oluşturuldu', group: 'channel' },
  'channel.update': { label: 'Kanal güncellendi', group: 'channel' },
  'channel.delete': { label: 'Kanal silindi', group: 'channel' },
  'channel.reorder': { label: 'Kanallar sıralandı', group: 'channel' },
  'channel.access.grant': { label: 'Kanala erişim verildi', group: 'channel' },
  'channel.access.revoke': { label: 'Kanal erişimi kaldırıldı', group: 'channel' },
  'invite.create': { label: 'Davet oluşturuldu', group: 'invite' },
  'invite.revoke': { label: 'Davet iptal edildi', group: 'invite' },
  'invite.accept': { label: 'Davet kabul edildi', group: 'invite' },
  'role.change': { label: 'Rol değiştirildi', group: 'role' },
  'member.kick': { label: 'Üye atıldı', group: 'member' },
  'member.ban': { label: 'Üye yasaklandı', group: 'member' },
  'member.unban': { label: 'Yasak kaldırıldı', group: 'member' },
  'plan.limit_hit': { label: 'Plan limitine takıldı', group: 'plan' },
};

const GROUP_DOT: Record<string, string> = {
  channel: 'bg-[var(--theme-accent)]/50',
  invite: 'bg-emerald-400/60',
  role: 'bg-blue-400/60',
  member: 'bg-amber-400/60',
  plan: 'bg-purple-400/60',
  other: 'bg-[var(--theme-secondary-text)]/30',
};

const FILTERS: Array<{ key: string; label: string; prefix?: string }> = [
  { key: 'all', label: 'Hepsi' },
  { key: 'channel', label: 'Kanal', prefix: 'channel.' },
  { key: 'invite', label: 'Davet', prefix: 'invite.' },
  { key: 'role', label: 'Rol', prefix: 'role.' },
  { key: 'member', label: 'Üye', prefix: 'member.' },
  { key: 'plan', label: 'Plan', prefix: 'plan.' },
];

function formatTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'az önce';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`;
  return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function describeResource(item: AuditLogItem): string {
  if (!item.resourceType) return '';
  const id = item.resourceId ? item.resourceId.slice(0, 8) : '';
  const meta = item.metadata as Record<string, unknown> | null;
  const name = meta && typeof meta.name === 'string' ? meta.name : '';
  if (name) return name;
  if (id) return `${item.resourceType}:${id}`;
  return item.resourceType;
}

export default function AuditTab({ serverId }: Props) {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const f = FILTERS.find(x => x.key === filter);
      const r = await getAuditLog(serverId, { limit: 50, action: f?.prefix });
      setItems(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Denetim kaydı yüklenemedi');
    } finally {
      setRefreshing(false);
    }
  }, [serverId, filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`h-6 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
              filter === f.key
                ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]'
                : 'text-[var(--theme-secondary-text)]/55 hover:bg-[rgba(var(--glass-tint),0.05)]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={load}
          disabled={refreshing}
          className="ml-auto w-6 h-6 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors disabled:opacity-50"
          title="Yenile"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
        >
          <AlertCircle size={12} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {!items ? (
        <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Kayıt yok</div>
      ) : (
        <ul className="flex flex-col">
          {items.map((it, idx) => {
            const meta = ACTION_META[it.action] ?? { label: it.action, group: 'other' };
            return (
              <li key={it.id}
                className={`flex items-start gap-2.5 py-2 ${idx !== items.length - 1 ? 'border-b border-[rgba(var(--glass-tint),0.06)]' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${GROUP_DOT[meta.group] ?? GROUP_DOT.other}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[var(--theme-text)]">{meta.label}</span>
                    {describeResource(it) && (
                      <span className="text-[10px] text-[var(--theme-secondary-text)]/50 truncate">{describeResource(it)}</span>
                    )}
                    <span className="ml-auto text-[9px] text-[var(--theme-secondary-text)]/35 shrink-0">{formatTime(it.createdAt)}</span>
                  </div>
                  <div className="text-[10px] text-[var(--theme-secondary-text)]/45 mt-0.5 truncate">{it.actorName}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
