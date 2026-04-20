import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, X, AlertCircle, RefreshCw, ScrollText,
  Ban, Shield, UserX, UserPlus, UserCheck, MicOff, Clock, Link2,
  Hash, Settings as SettingsIcon, AlertTriangle,
} from 'lucide-react';
import { getAuditLog, type AuditLogItem } from '../../../lib/serverService';
import { Empty } from './shared';

interface Props { serverId: string; }

// ══════════════════════════════════════════════════════════
// Taxonomy — action → verb/group/tone/icon
// ══════════════════════════════════════════════════════════

type GroupId = 'moderation' | 'role' | 'invite' | 'channel' | 'settings' | 'other';
type Tone = 'info' | 'warn' | 'danger' | 'accent' | 'purple' | 'neutral';

interface ActionMeta {
  verb: string;
  group: GroupId;
  tone: Tone;
  icon: React.ReactNode;
}

const ACTION_META: Record<string, ActionMeta> = {
  // Moderasyon
  'member.ban':       { verb: 'kullanıcıyı yasakladı',  group: 'moderation', tone: 'danger', icon: <Ban size={13} strokeWidth={1.8} /> },
  'member.unban':     { verb: 'yasağı kaldırdı',        group: 'moderation', tone: 'info',   icon: <Shield size={13} strokeWidth={1.8} /> },
  'member.kick':      { verb: 'kullanıcıyı attı',       group: 'moderation', tone: 'warn',   icon: <UserX size={13} strokeWidth={1.8} /> },
  'member.mute':      { verb: 'sesini kapattı',         group: 'moderation', tone: 'warn',   icon: <MicOff size={13} strokeWidth={1.8} /> },
  'member.unmute':    { verb: 'sesi açtı',              group: 'moderation', tone: 'info',   icon: <MicOff size={13} strokeWidth={1.8} /> },
  'member.timeout':   { verb: 'zaman aşımı verdi',      group: 'moderation', tone: 'warn',   icon: <Clock size={13} strokeWidth={1.8} /> },
  'member.room_kick': { verb: 'odadan çıkardı',         group: 'moderation', tone: 'warn',   icon: <UserX size={13} strokeWidth={1.8} /> },

  // Roller
  'role.change':        { verb: 'rolü değiştirdi', group: 'role', tone: 'accent', icon: <Shield size={13} strokeWidth={1.8} /> },
  'member.role_change': { verb: 'rolü değiştirdi', group: 'role', tone: 'accent', icon: <Shield size={13} strokeWidth={1.8} /> },

  // Davetler
  'invite.create':       { verb: 'davet oluşturdu',      group: 'invite', tone: 'purple', icon: <Link2 size={13} strokeWidth={1.8} /> },
  'invite.revoke':       { verb: 'daveti iptal etti',    group: 'invite', tone: 'purple', icon: <Link2 size={13} strokeWidth={1.8} /> },
  'invite.accept':       { verb: 'daveti kabul etti',    group: 'invite', tone: 'purple', icon: <UserPlus size={13} strokeWidth={1.8} /> },
  'join_request.submit': { verb: 'başvuru gönderdi',     group: 'invite', tone: 'purple', icon: <UserPlus size={13} strokeWidth={1.8} /> },
  'join_request.accept': { verb: 'başvuruyu kabul etti', group: 'invite', tone: 'purple', icon: <UserCheck size={13} strokeWidth={1.8} /> },
  'join_request.reject': { verb: 'başvuruyu reddetti',   group: 'invite', tone: 'purple', icon: <UserX size={13} strokeWidth={1.8} /> },

  // Kanal
  'channel.create':        { verb: 'kanal oluşturdu',           group: 'channel', tone: 'info',   icon: <Hash size={13} strokeWidth={1.8} /> },
  'channel.update':        { verb: 'kanalı güncelledi',         group: 'channel', tone: 'info',   icon: <Hash size={13} strokeWidth={1.8} /> },
  'channel.delete':        { verb: 'kanalı sildi',              group: 'channel', tone: 'danger', icon: <Hash size={13} strokeWidth={1.8} /> },
  'channel.reorder':       { verb: 'kanalları sıraladı',        group: 'channel', tone: 'info',   icon: <Hash size={13} strokeWidth={1.8} /> },
  'channel.access.grant':  { verb: 'kanal erişimi verdi',       group: 'channel', tone: 'info',   icon: <Hash size={13} strokeWidth={1.8} /> },
  'channel.access.revoke': { verb: 'kanal erişimini kaldırdı',  group: 'channel', tone: 'warn',   icon: <Hash size={13} strokeWidth={1.8} /> },

  // Sunucu ayarları
  'server.update':        { verb: 'sunucu ayarlarını değiştirdi', group: 'settings', tone: 'info', icon: <SettingsIcon size={13} strokeWidth={1.8} /> },
  'server.avatar_update': { verb: 'sunucu logosunu değiştirdi',   group: 'settings', tone: 'info', icon: <SettingsIcon size={13} strokeWidth={1.8} /> },
  'server.plan_change':   { verb: 'planı değiştirdi',             group: 'settings', tone: 'warn', icon: <SettingsIcon size={13} strokeWidth={1.8} /> },
  'plan.limit_hit':       { verb: 'plan limitine takıldı',        group: 'settings', tone: 'warn', icon: <AlertTriangle size={13} strokeWidth={1.8} /> },
};

function metaFor(action: string): ActionMeta {
  return ACTION_META[action] ?? {
    verb: action,
    group: 'other',
    tone: 'neutral',
    icon: <ScrollText size={13} strokeWidth={1.8} />,
  };
}

// ══════════════════════════════════════════════════════════
// Tone palette (ban=red, unban=green, kick=orange, role=blue, invite=purple)
// ══════════════════════════════════════════════════════════

interface ToneStyle { bg: string; border: string; color: string; dot: string; }

const TONE_STYLE: Record<Tone, ToneStyle> = {
  info:    { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.22)',  color: '#34d399', dot: 'bg-emerald-400' },
  warn:    { bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.22)',  color: '#fb923c', dot: 'bg-orange-400' },
  danger:  { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.22)',   color: '#f87171', dot: 'bg-red-500' },
  accent:  { bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.22)',  color: '#60a5fa', dot: 'bg-blue-400' },
  purple:  { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.22)', color: '#a78bfa', dot: 'bg-purple-400' },
  neutral: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', color: '#7b8ba8', dot: 'bg-[#7b8ba8]' },
};

// ══════════════════════════════════════════════════════════
// Filter chips — user'ın istediği 4 kategori
// Diğer event'ler (channel / settings) "Hepsi"de görünür
// ══════════════════════════════════════════════════════════

interface FilterChip { id: 'all' | GroupId; label: string; }

const FILTER_CHIPS: readonly FilterChip[] = [
  { id: 'all',        label: 'Hepsi' },
  { id: 'moderation', label: 'Moderasyon' },
  { id: 'role',       label: 'Roller' },
  { id: 'invite',     label: 'Davetler' },
];

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  if (s < 604800) return `${Math.floor(s / 86400)}g önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// metadata.name / targetName / username öncelikli, yoksa resource:shortId
function describeTarget(log: AuditLogItem): string | null {
  const m = log.metadata as Record<string, unknown> | null;
  if (m) {
    const candidates = ['name', 'targetName', 'targetUsername', 'username', 'channelName'];
    for (const key of candidates) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  if (log.resourceId) {
    const short = log.resourceId.slice(0, 8);
    return log.resourceType ? `${log.resourceType}:${short}` : short;
  }
  return null;
}

function extractReason(log: AuditLogItem): string | null {
  const m = log.metadata as Record<string, unknown> | null;
  if (m && typeof m.reason === 'string') {
    const r = m.reason.trim();
    return r.length > 0 ? r : null;
  }
  return null;
}

// ══════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════

export default function AuditTab({ serverId }: Props) {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterChip['id']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Tek fetch — backend'den tüm log'lar, frontend'de filter + search
  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const r = await getAuditLog(serverId, { limit: 50 });
      setItems(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Denetim kaydı yüklenemedi');
    } finally {
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => { void load(); }, [load]);

  // Frontend filter + search
  const filtered = useMemo(() => {
    if (!items) return [];
    const q = searchQuery.trim().toLowerCase();
    return items.filter(log => {
      if (filter !== 'all') {
        const meta = metaFor(log.action);
        if (meta.group !== filter) return false;
      }
      if (q) {
        const actor = (log.actorName ?? '').toLowerCase();
        const target = (describeTarget(log) ?? '').toLowerCase();
        const reason = (extractReason(log) ?? '').toLowerCase();
        if (!actor.includes(q) && !target.includes(q) && !reason.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, searchQuery]);

  return (
    <div className="space-y-4 pb-4">
      {/* ── Üst bar: arama + refresh ── */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2 h-10 rounded-xl px-3.5 transition-colors duration-200"
          style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Search size={13} className="text-[#7b8ba8]/45 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Kişi, hedef veya sebep ara..."
            className="flex-1 bg-transparent text-[12px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/40 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[#7b8ba8]/45 hover:text-[#e8ecf4] transition-colors"
              aria-label="Aramayı temizle"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[#7b8ba8]/60 hover:text-[#e8ecf4] hover:bg-[rgba(255,255,255,0.05)] active:scale-[0.94] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          title="Yenile"
          aria-label="Yenile"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Filter chips + count ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_CHIPS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 px-3 rounded-lg text-[10.5px] font-semibold transition-all duration-150 active:scale-[0.97] ${
                active
                  ? 'text-[#60a5fa]'
                  : 'text-[#7b8ba8]/55 hover:text-[#e8ecf4] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
              style={active ? {
                background: 'rgba(59,130,246,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(59,130,246,0.08)',
              } : undefined}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10.5px] text-[#7b8ba8]/50 font-medium tabular-nums">
          {items == null
            ? ''
            : filtered.length === items.length
              ? `${items.length} kayıt`
              : `${filtered.length} / ${items.length} kayıt`}
        </span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
        >
          <AlertCircle size={12} /><span className="truncate">{error}</span>
        </div>
      )}

      {/* ── Content ── */}
      {items == null ? (
        <Loading />
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <Empty
            text="Henüz işlem yok"
            sub="Bu sunucuda yapılan moderasyon, rol ve davet işlemleri burada listelenir"
          />
        ) : (
          <Empty
            text="Filtreyle eşleşen kayıt yok"
            sub={searchQuery ? `"${searchQuery}" için sonuç yok` : 'Başka bir filtre dene'}
          />
        )
      ) : (
        <ul
          className="flex flex-col rounded-xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {filtered.map((log, idx) => (
            <AuditLogRow
              key={log.id}
              log={log}
              isLast={idx === filtered.length - 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// AuditLogRow — kompakt satır: [icon] [actor] [verb] [target?] [reason?] [time]
// ══════════════════════════════════════════════════════════

function AuditLogRow({
  log, isLast,
}: { log: AuditLogItem; isLast: boolean; key?: React.Key }) {
  const meta = metaFor(log.action);
  const style = TONE_STYLE[meta.tone];
  const target = describeTarget(log);
  const reason = extractReason(log);

  return (
    <li
      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.035)]"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Tone-colored icon chip */}
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
        style={{
          background: style.bg,
          border: `1px solid ${style.border}`,
          color: style.color,
        }}
      >
        {meta.icon}
      </div>

      {/* Event body — single line, truncating */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11.5px] leading-tight min-w-0 flex-wrap">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />

          <span
            className="font-semibold text-[#e8ecf4] truncate max-w-[180px]"
            title={log.actorName}
          >
            {log.actorName || 'Bilinmiyor'}
          </span>

          <span className="text-[#7b8ba8]/85">{meta.verb}</span>

          {target && (
            <span
              className="inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded truncate max-w-[180px]"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e8ecf4',
              }}
              title={target}
            >
              {target}
            </span>
          )}

          {reason && (
            <span
              className="text-[10.5px] text-[#7b8ba8]/75 italic truncate max-w-[220px]"
              title={reason}
            >
              · "{reason}"
            </span>
          )}
        </div>
      </div>

      {/* Time ago — right aligned */}
      <span
        className="text-[10px] text-[#7b8ba8]/50 shrink-0 tabular-nums whitespace-nowrap"
        title={new Date(log.createdAt).toLocaleString('tr-TR')}
      >
        {timeAgo(log.createdAt)}
      </span>
    </li>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-5 h-5 border-2 border-[#60a5fa]/20 border-t-[#60a5fa] rounded-full animate-spin" />
    </div>
  );
}
