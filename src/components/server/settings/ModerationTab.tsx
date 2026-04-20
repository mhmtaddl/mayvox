import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban, MicOff, Clock, ShieldOff, UserX, Shield,
  RefreshCw, DoorOpen, History,
} from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import {
  type ServerBan, type ServerMember, type AuditLogItem,
  getBans, getMembers, unbanMember, getAuditLog,
} from '../../../lib/serverService';
import { fmtDate, memberDisplayName, Empty, Loader, timeAgo } from './shared';

interface Props {
  serverId: string;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════════════════════════
// ModerationTab — 3 section: Yasaklılar / Aktif Cezalar / Geçmiş
// ══════════════════════════════════════════════════════════
export default function ModerationTab({ serverId, showToast }: Props) {
  const [bans, setBans] = useState<ServerBan[] | null>(null);
  const [mutedMembers, setMutedMembers] = useState<ServerMember[] | null>(null);
  const [logs, setLogs] = useState<AuditLogItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unbanBusyId, setUnbanBusyId] = useState<string | null>(null);

  // 3 paralel fetch — Promise.allSettled: biri fail olursa diğerleri çalışmaya devam eder
  // (örn: mod user için getAuditLog 403 dönebilir, Yasaklılar yine yüklenir)
  const loadAll = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    try {
      const [b, m, a] = await Promise.allSettled([
        getBans(serverId),
        getMembers(serverId),
        getAuditLog(serverId, { limit: 30 }),
      ]);
      setBans(b.status === 'fulfilled' ? b.value : []);
      setMutedMembers(
        m.status === 'fulfilled'
          ? m.value.filter(x => x.isMuted)
          : []
      );
      setLogs(
        a.status === 'fulfilled'
          ? a.value.filter(isModerationAction)
          : []
      );
    } finally {
      if (isInitial) setLoading(false);
      else setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => { void loadAll(true); }, [loadAll]);

  const handleUnban = useCallback(async (userId: string) => {
    setUnbanBusyId(userId);
    try {
      await unbanMember(serverId, userId);
      showToast('Yasak kaldırıldı');
      await loadAll(false);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Yasak kaldırılamadı');
    } finally {
      setUnbanBusyId(null);
    }
  }, [serverId, showToast, loadAll]);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5 pb-4">
      <BansSection
        bans={bans ?? []}
        busyId={unbanBusyId}
        onUnban={handleUnban}
      />

      <ActivePunishmentsSection muted={mutedMembers ?? []} />

      <HistorySection
        logs={logs ?? []}
        refreshing={refreshing}
        onRefresh={() => loadAll(false)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Yardımcılar
// ══════════════════════════════════════════════════════════

function isModerationAction(log: AuditLogItem): boolean {
  const a = log.action;
  return a.startsWith('member.') || a === 'role.change';
}

interface ActionMeta {
  verb: string;
  tone: 'info' | 'warn' | 'danger';
  icon: React.ReactNode;
}

const ACTION_META: Record<string, ActionMeta> = {
  'member.ban':        { verb: 'üyeyi yasakladı',    tone: 'danger', icon: <Ban size={11} strokeWidth={2} /> },
  'member.unban':      { verb: 'yasağı kaldırdı',    tone: 'info',   icon: <Shield size={11} strokeWidth={2} /> },
  'member.kick':       { verb: 'üyeyi attı',         tone: 'warn',   icon: <UserX size={11} strokeWidth={2} /> },
  'member.mute':       { verb: 'sesini kapattı',     tone: 'warn',   icon: <MicOff size={11} strokeWidth={2} /> },
  'member.unmute':     { verb: 'sesi açtı',          tone: 'info',   icon: <MicOff size={11} strokeWidth={2} /> },
  'member.timeout':    { verb: 'zaman aşımı verdi',  tone: 'warn',   icon: <Clock size={11} strokeWidth={2} /> },
  'member.room_kick':  { verb: 'odadan çıkardı',     tone: 'warn',   icon: <DoorOpen size={11} strokeWidth={2} /> },
  'member.role_change':{ verb: 'rolü değiştirdi',    tone: 'info',   icon: <Shield size={11} strokeWidth={2} /> },
  'role.change':       { verb: 'rolü değiştirdi',    tone: 'info',   icon: <Shield size={11} strokeWidth={2} /> },
};

function metaFor(action: string): ActionMeta {
  return ACTION_META[action] ?? { verb: action, tone: 'info', icon: <History size={11} strokeWidth={2} /> };
}

function extractReason(log: AuditLogItem): string | null {
  const m = log.metadata;
  if (m && typeof (m as any).reason === 'string') {
    const r = (m as any).reason as string;
    const trimmed = r.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

// ══════════════════════════════════════════════════════════
// SectionCard — RolesTab ile tutarlı kart wrapper
// ══════════════════════════════════════════════════════════

function SectionCard({
  icon, title, count, accent = 'rgba(255,255,255,0.06)', action, children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  accent?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.05), ' +
          '0 4px 14px rgba(0,0,0,0.06)',
      }}
    >
      <header className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: accent, border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h3 className="text-[12.5px] font-bold text-[#e8ecf4] tracking-tight">{title}</h3>
          {count != null && (
            <span
              className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#7b8ba8' }}
            >
              {count}
            </span>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

// ══════════════════════════════════════════════════════════
// 1) Yasaklılar
// ══════════════════════════════════════════════════════════

function BansSection({
  bans, busyId, onUnban,
}: {
  bans: ServerBan[];
  busyId: string | null;
  onUnban: (userId: string) => void;
}) {
  return (
    <SectionCard
      icon={<Ban size={14} className="text-red-400" />}
      title="Yasaklılar"
      count={bans.length}
      accent="rgba(239,68,68,0.10)"
    >
      {bans.length === 0 ? (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)' }}
          >
            <Shield size={13} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[#e8ecf4]">Yasaklı üye yok</div>
            <div className="text-[10.5px] text-[#7b8ba8]/70 mt-0.5">Sunucu temiz</div>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {bans.map(b => (
            <BanRow
              key={b.userId}
              ban={b}
              busy={busyId === b.userId}
              onUnban={() => onUnban(b.userId)}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function BanRow({ ban, busy, onUnban }: { ban: ServerBan; busy: boolean; onUnban: () => void; key?: React.Key }) {
  const reason = ban.reason?.trim() || 'Neden belirtilmedi';
  return (
    <li
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 hover:bg-[rgba(255,255,255,0.03)]"
      style={{
        background: busy ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Ban icon */}
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{
          background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.18)',
        }}
      >
        <Ban size={14} className="text-red-400/80" strokeWidth={1.8} />
      </div>

      {/* ID + reason */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: '#e8ecf4',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            title={`Kullanıcı ID: ${ban.userId}`}
          >
            {shortId(ban.userId)}
          </span>
          <span className="text-[11.5px] text-[#e8ecf4]/85 truncate">{reason}</span>
        </div>
        <div className="text-[10px] text-[#7b8ba8]/55 mt-0.5">{fmtDate(ban.createdAt)}</div>
      </div>

      {/* Unban button */}
      <button
        type="button"
        onClick={onUnban}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold shrink-0 transition-all duration-150 active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'rgba(16,185,129,0.10)',
          color: '#34d399',
          border: '1px solid rgba(16,185,129,0.20)',
        }}
      >
        {busy
          ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <Shield size={11} strokeWidth={2} />}
        {busy ? 'Kaldırılıyor...' : 'Yasağı Kaldır'}
      </button>
    </li>
  );
}

// ══════════════════════════════════════════════════════════
// 2) Aktif Cezalar (salt-okunur)
// ══════════════════════════════════════════════════════════

function ActivePunishmentsSection({ muted }: { muted: ServerMember[] }) {
  return (
    <SectionCard
      icon={<ShieldOff size={14} className="text-orange-400" />}
      title="Aktif Cezalar"
      count={muted.length}
      accent="rgba(251,146,60,0.10)"
      action={
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.04)',
            color: '#7b8ba8',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
          title="Aktif cezalar salt-okunur gösterilir"
        >
          Salt-okunur
        </span>
      }
    >
      {muted.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {muted.map(m => <MutedMemberRow key={m.userId} member={m} />)}
        </ul>
      )}

      {/* Yakında durumları — UI hazır, backend eklenince enable */}
      <div className="space-y-1.5">
        <PendingPunishmentRow
          icon={<Clock size={13} className="text-amber-400/70" />}
          label="Zaman aşımı"
          hint="Geçici olarak sunucuya erişim kısıtlama"
        />
        <PendingPunishmentRow
          icon={<DoorOpen size={13} className="text-amber-400/70" />}
          label="Oda çıkarma"
          hint="Sesli odadan tek seferlik çıkarma"
        />
        <PendingPunishmentRow
          icon={<MicOff size={13} className="text-amber-400/70" />}
          label="Sunucu-içi susturma"
          hint="Sunucu bazlı voice mute (global yerine)"
        />
      </div>

      {muted.length === 0 && (
        <div className="text-[10.5px] text-[#7b8ba8]/50 italic mt-3 text-center">
          Şu an aktif bir ceza yok
        </div>
      )}
    </SectionCard>
  );
}

function MutedMemberRow({ member }: { member: ServerMember; key?: React.Key }) {
  const dn = memberDisplayName(member);
  return (
    <li
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{
        background: 'rgba(251,146,60,0.05)',
        border: '1px solid rgba(251,146,60,0.15)',
      }}
    >
      <div
        className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <AvatarContent
          avatar={member.avatar}
          statusText="Online"
          firstName={member.firstName}
          name={dn}
          letterClassName="text-[11px] font-bold text-[#7b8ba8]/70"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-[#e8ecf4] truncate">{dn}</span>
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(251,146,60,0.14)',
              color: '#fb923c',
              border: '1px solid rgba(251,146,60,0.25)',
            }}
          >
            <MicOff size={9} strokeWidth={2.2} /> Sesi kapalı
          </span>
        </div>
        <div className="text-[10px] text-[#7b8ba8]/60 mt-0.5">
          Sistem yönetimi tarafından · Kaldırma sistem yönetimi üzerinden
        </div>
      </div>
    </li>
  );
}

function PendingPunishmentRow({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl opacity-70"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.14)' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[#e8ecf4]/75">{label}</span>
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(251,191,36,0.12)',
              color: 'rgba(251,191,36,0.9)',
              border: '1px solid rgba(251,191,36,0.22)',
            }}
          >
            yakında
          </span>
        </div>
        <div className="text-[10px] text-[#7b8ba8]/60 mt-0.5 leading-snug">{hint}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// 3) Geçmiş İşlemler
// ══════════════════════════════════════════════════════════

function HistorySection({
  logs, refreshing, onRefresh,
}: {
  logs: AuditLogItem[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      icon={<History size={14} className="text-blue-400" />}
      title="Geçmiş İşlemler"
      count={logs.length}
      accent="rgba(59,130,246,0.10)"
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7b8ba8]/60 hover:text-[#e8ecf4] hover:bg-[rgba(255,255,255,0.05)] transition-all duration-150 active:scale-[0.94] disabled:opacity-50 disabled:cursor-not-allowed"
          title="Yenile"
          aria-label="Geçmişi yenile"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      }
    >
      {logs.length === 0 ? (
        <Empty text="Moderasyon geçmişi yok" sub="Kick/ban/rol değişikliği olduğunda burada görünür" />
      ) : (
        <ul className="flex flex-col">
          {logs.map((log, idx) => (
            <LogRow
              key={log.id}
              log={log}
              isLast={idx === logs.length - 1}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const TONE_DOT: Record<ActionMeta['tone'], string> = {
  info: 'bg-emerald-400',
  warn: 'bg-amber-400',
  danger: 'bg-red-500',
};

const TONE_ICON_BG: Record<ActionMeta['tone'], { bg: string; border: string; color: string }> = {
  info:   { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.20)',  color: '#34d399' },
  warn:   { bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.20)',  color: '#fb923c' },
  danger: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.20)',   color: '#f87171' },
};

function LogRow({ log, isLast }: { log: AuditLogItem; isLast: boolean; key?: React.Key }) {
  const meta = metaFor(log.action);
  const reason = extractReason(log);
  const iconStyle = TONE_ICON_BG[meta.tone];

  return (
    <li
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Icon chip */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: iconStyle.bg,
          border: `1px solid ${iconStyle.border}`,
          color: iconStyle.color,
        }}
      >
        {meta.icon}
      </div>

      {/* Event body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]} shrink-0`} />
          <span className="text-[11.5px] font-semibold text-[#e8ecf4] truncate">
            {log.actorName || 'Bilinmiyor'}
          </span>
          <span className="text-[11px] text-[#7b8ba8]/85">{meta.verb}</span>
          {reason && (
            <span
              className="text-[10px] text-[#7b8ba8]/75 italic truncate max-w-[200px]"
              title={reason}
            >
              · "{reason}"
            </span>
          )}
          <span className="ml-auto text-[9.5px] text-[#7b8ba8]/50 shrink-0">
            {timeAgo(log.createdAt)}
          </span>
        </div>
        {log.resourceId && (
          <div className="text-[9.5px] text-[#7b8ba8]/35 font-mono mt-0.5">
            {log.resourceType ?? 'resource'}:{shortId(log.resourceId)}
          </div>
        )}
      </div>
    </li>
  );
}
