import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Search, X, ScrollText,
  Ban, Shield, UserX, UserPlus, UserCheck, MicOff, Clock, Link2,
  Hash, Settings as SettingsIcon, AlertTriangle, Zap, Filter, MessageSquareWarning, Gavel,
  DoorOpen, MessageSquareOff,
} from 'lucide-react';
import { getAuditLog, type AuditLogItem } from '../../../lib/serverService';
import { timeAgo } from './shared';

interface Props { serverId: string; }

// ═══════════════════════════════════════════
// Human-readable action map — kategori bazlı
// ═══════════════════════════════════════════
type Category = 'flood' | 'profanity' | 'spam' | 'auto' | 'manual' | 'role' | 'invite' | 'channel' | 'settings' | 'other';

interface ActionDef {
  verb: string;        // "Otomatik yazma engeli uygulandı"
  category: Category;
  icon: React.ReactNode;
}

const ACTION_MAP: Record<string, ActionDef> = {
  // Moderasyon — manuel (mod/admin tarafından)
  'member.ban':       { verb: 'kullanıcıyı yasakladı',      category: 'manual', icon: <Ban size={11} /> },
  'member.unban':     { verb: 'yasağı kaldırdı',            category: 'manual', icon: <Shield size={11} /> },
  'member.kick':      { verb: 'sunucudan attı',             category: 'manual', icon: <UserX size={11} /> },
  'member.mute':      { verb: 'sesini kapattı',             category: 'manual', icon: <MicOff size={11} /> },
  'member.unmute':    { verb: 'sesi açtı',                  category: 'manual', icon: <MicOff size={11} /> },
  'member.timeout':   { verb: 'zaman aşımı verdi',          category: 'manual', icon: <Clock size={11} /> },
  'member.timeout_clear': { verb: 'zaman aşımını kaldırdı', category: 'manual', icon: <Clock size={11} /> },
  'member.room_kick': { verb: 'sesli odadan çıkardı',       category: 'manual', icon: <DoorOpen size={11} /> },
  'member.chat_ban':  { verb: 'yazma engeli uyguladı',      category: 'manual', icon: <MessageSquareOff size={11} /> },
  'member.chat_unban':{ verb: 'yazma engelini kaldırdı',    category: 'manual', icon: <MessageSquareOff size={11} /> },
  // Otomatik moderasyon (system:auto-mod actor)
  'member.chat_ban.auto': { verb: 'Otomatik yazma engeli uygulandı', category: 'auto', icon: <Gavel size={11} /> },
  // Roller
  'role.change':        { verb: 'rolü değiştirdi', category: 'role', icon: <Shield size={11} /> },
  'member.role_change': { verb: 'rolü değiştirdi', category: 'role', icon: <Shield size={11} /> },
  // Davetler
  'invite.create':       { verb: 'davet oluşturdu',      category: 'invite', icon: <Link2 size={11} /> },
  'invite.revoke':       { verb: 'daveti iptal etti',    category: 'invite', icon: <Link2 size={11} /> },
  'invite.accept':       { verb: 'daveti kabul etti',    category: 'invite', icon: <UserPlus size={11} /> },
  'join_request.submit': { verb: 'başvuru gönderdi',     category: 'invite', icon: <UserPlus size={11} /> },
  'join_request.accept': { verb: 'başvuruyu kabul etti', category: 'invite', icon: <UserCheck size={11} /> },
  'join_request.reject': { verb: 'başvuruyu reddetti',   category: 'invite', icon: <UserX size={11} /> },
  // Kanal
  'channel.create':        { verb: 'kanal oluşturdu',      category: 'channel', icon: <Hash size={11} /> },
  'channel.update':        { verb: 'kanalı güncelledi',    category: 'channel', icon: <Hash size={11} /> },
  'channel.delete':        { verb: 'kanalı sildi',         category: 'channel', icon: <Hash size={11} /> },
  'channel.reorder':       { verb: 'kanalları sıraladı',   category: 'channel', icon: <Hash size={11} /> },
  'channel.access.grant':  { verb: 'kanal erişimi verdi',  category: 'channel', icon: <Hash size={11} /> },
  'channel.access.revoke': { verb: 'kanal erişimini aldı', category: 'channel', icon: <Hash size={11} /> },
  // Sunucu
  'server.update':        { verb: 'sunucu ayarlarını değiştirdi', category: 'settings', icon: <SettingsIcon size={11} /> },
  'server.avatar_update': { verb: 'sunucu logosunu değiştirdi',   category: 'settings', icon: <SettingsIcon size={11} /> },
  'server.plan_change':   { verb: 'planı değiştirdi',             category: 'settings', icon: <SettingsIcon size={11} /> },
  'plan.limit_hit':       { verb: 'plan limitine takıldı',        category: 'settings', icon: <AlertTriangle size={11} /> },
  'moderation_history.reset': { verb: 'ceza geçmişini sıfırladı',  category: 'manual',  icon: <RefreshCw size={11} /> },
};

function resolveAction(log: AuditLogItem): ActionDef {
  return ACTION_MAP[log.action] ?? { verb: log.action, category: 'other', icon: <ScrollText size={11} /> };
}

// Kategori renk haritası — Flood cyan, Küfür red, Spam purple, Auto amber, Manual blue
const CATEGORY_COLOR: Record<Category, { color: string; rgb: string; label: string }> = {
  flood:     { color: '#22d3ee', rgb: '34,211,238',  label: 'Flood' },
  profanity: { color: '#f87171', rgb: '248,113,113', label: 'Küfür' },
  spam:      { color: '#a78bfa', rgb: '167,139,250', label: 'Spam' },
  auto:      { color: '#fbbf24', rgb: '251,191,36',  label: 'Auto' },
  manual:    { color: '#60a5fa', rgb: '96,165,250',  label: 'Manuel' },
  role:      { color: '#60a5fa', rgb: '96,165,250',  label: 'Rol' },
  invite:    { color: '#a78bfa', rgb: '167,139,250', label: 'Davet' },
  channel:   { color: '#34d399', rgb: '52,211,153',  label: 'Kanal' },
  settings:  { color: '#fb923c', rgb: '251,146,60',  label: 'Ayar' },
  other:     { color: '#94a3b8', rgb: '148,163,184', label: 'Diğer' },
};

// ═══════════════════════════════════════════
// Filter chips
// ═══════════════════════════════════════════
type FilterKey = 'all' | 'flood' | 'profanity' | 'spam' | 'auto' | 'manual';
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all',       label: 'Tümü' },
  { key: 'flood',     label: 'Flood' },
  { key: 'profanity', label: 'Küfür' },
  { key: 'spam',      label: 'Spam' },
  { key: 'auto',      label: 'Auto' },
  { key: 'manual',    label: 'Manuel' },
];

// ═══════════════════════════════════════════
// Helpers — target/reason extraction, categorization refinement
// ═══════════════════════════════════════════
function describeTarget(log: AuditLogItem): string | null {
  const m = log.metadata as Record<string, unknown> | null;
  if (m) {
    for (const k of ['targetName', 'targetUsername', 'username', 'name', 'channelName']) {
      const v = m[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

function extractReason(log: AuditLogItem): string | null {
  const m = log.metadata as Record<string, unknown> | null;
  if (!m) return null;
  const r = m.reason;
  if (typeof r !== 'string') return null;
  const s = r.trim();
  if (!s) return null;
  // flood_threshold → "Flood (eşik aşıldı)"
  if (s === 'flood_threshold')     return 'Flood nedeniyle (eşik aşıldı)';
  if (s === 'profanity_threshold') return 'Küfür filtresi ihlali';
  if (s === 'spam_threshold')      return 'Spam ihlali';
  return s;
}

/** Auto-mod logları için refined category: metadata.reason'dan flood/profanity/spam detect. */
function refineCategory(log: AuditLogItem, def: ActionDef): Category {
  if (def.category !== 'auto') return def.category;
  const m = log.metadata as Record<string, unknown> | null;
  const reason = typeof m?.reason === 'string' ? m!.reason : '';
  if (reason.startsWith('flood'))     return 'flood';
  if (reason.startsWith('profanity')) return 'profanity';
  if (reason.startsWith('spam'))      return 'spam';
  return 'auto';
}

function matchesFilter(cat: Category, refinedCat: Category, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'flood')     return refinedCat === 'flood';
  if (f === 'profanity') return refinedCat === 'profanity';
  if (f === 'spam')      return refinedCat === 'spam';
  if (f === 'auto')      return cat === 'auto' || refinedCat === 'flood' || refinedCat === 'profanity' || refinedCat === 'spam';
  if (f === 'manual')    return cat === 'manual';
  return false;
}

// ═══════════════════════════════════════════
// Time grouping — Bugün / Dün / Daha eski
// ═══════════════════════════════════════════
type Bucket = 'today' | 'yesterday' | 'older';
const BUCKET_LABEL: Record<Bucket, string> = {
  today:     'Bugün',
  yesterday: 'Dün',
  older:     'Daha eski',
};

function bucketOf(iso: string, nowMs: number): Bucket {
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 'older';
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (t >= startOfToday)     return 'today';
  if (t >= startOfYesterday) return 'yesterday';
  return 'older';
}

// ═══════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════
export default function AuditLogPanel({ serverId }: Props) {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const r = await getAuditLog(serverId, { limit: 200 });
      setItems(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Denetim kaydı yüklenemedi');
    } finally {
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return items.filter(log => {
      const def = resolveAction(log);
      const refined = refineCategory(log, def);
      if (!matchesFilter(def.category, refined, filter)) return false;
      if (q) {
        const actor = (log.actorName ?? '').toLocaleLowerCase('tr-TR');
        const target = (describeTarget(log) ?? '').toLocaleLowerCase('tr-TR');
        const reason = (extractReason(log) ?? '').toLocaleLowerCase('tr-TR');
        if (!actor.includes(q) && !target.includes(q) && !reason.includes(q) && !def.verb.toLocaleLowerCase('tr-TR').includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  // Grupla
  const groups = useMemo(() => {
    const nowMs = Date.now();
    const m = new Map<Bucket, AuditLogItem[]>();
    m.set('today', []); m.set('yesterday', []); m.set('older', []);
    for (const log of filtered) {
      const b = bucketOf(log.createdAt, nowMs);
      m.get(b)!.push(log);
    }
    return (['today', 'yesterday', 'older'] as Bucket[])
      .map(b => ({ bucket: b, items: m.get(b)! }))
      .filter(g => g.items.length > 0);
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* ── Toolbar — search + filter chips + refresh ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex-1 min-w-[200px] flex items-center gap-2 h-8 rounded-lg px-2.5"
          style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
        >
          <Search size={12} className="text-[var(--theme-secondary-text)]/45 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Kişi, hedef veya sebep ara…"
            className="flex-1 bg-transparent text-[11.5px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[var(--theme-secondary-text)]/45 hover:text-[var(--theme-text)] transition-colors"
              aria-label="Aramayı temizle"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div
          className="inline-flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
        >
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="px-2 h-7 rounded-md text-[10.5px] font-bold transition-all"
                style={active ? {
                  background: 'rgba(var(--theme-accent-rgb),0.14)',
                  color: 'var(--theme-accent)',
                } : {
                  color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.65)',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          title="Yenile"
          aria-label="Yenile"
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--theme-secondary-text)]/75 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 transition-colors"
          style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="flex items-center gap-2 p-2 rounded-lg text-[11px] text-red-400/85"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
        >
          <AlertTriangle size={12} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* ── Content ── */}
      {items === null ? (
        <LogSkeleton />
      ) : groups.length === 0 ? (
        <EmptyLog hasAny={items.length > 0} hasQuery={!!query.trim() || filter !== 'all'} />
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <TimeGroup key={g.bucket} bucket={g.bucket} items={g.items} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Time group — sticky header + dense list
// ═══════════════════════════════════════════
const TimeGroup: React.FC<{ bucket: Bucket; items: AuditLogItem[] }> = ({ bucket, items }) => {
  return (
    <section>
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-1 py-1 backdrop-blur-sm"
        style={{ background: 'rgba(var(--theme-bg-rgb, 10, 14, 26), 0.78)' }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/70">
          {BUCKET_LABEL[bucket]}
        </span>
        <span
          className="h-px flex-1 ml-1"
          style={{ background: 'linear-gradient(90deg, rgba(var(--glass-tint),0.12), transparent)' }}
        />
        <span className="text-[10px] tabular-nums text-[var(--theme-secondary-text)]/40">
          {items.length}
        </span>
      </div>
      <ul className="mt-1">
        {items.map(log => (
          <AuditLogRow key={log.id} log={log} />
        ))}
      </ul>
    </section>
  );
};

// ═══════════════════════════════════════════
// Single row — dot + actor → verb + (target) + reason meta + time
// ═══════════════════════════════════════════
const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  flood:     <Zap size={9} />,
  profanity: <Filter size={9} />,
  spam:      <MessageSquareWarning size={9} />,
  auto:      <Gavel size={9} />,
  manual:    <Shield size={9} />,
  role:      <Shield size={9} />,
  invite:    <Link2 size={9} />,
  channel:   <Hash size={9} />,
  settings:  <SettingsIcon size={9} />,
  other:     <ScrollText size={9} />,
};

const AuditLogRow: React.FC<{ log: AuditLogItem }> = ({ log }) => {
  const def = resolveAction(log);
  const refined = refineCategory(log, def);
  const palette = CATEGORY_COLOR[refined];
  const actor = log.actorId === 'system:auto-mod' ? 'Sistem' : (log.actorName || 'Kullanıcı');
  const target = describeTarget(log);
  const reason = extractReason(log);
  const time = timeAgo(log.createdAt, { withDateFallback: true });

  // Badge sadece flood/profanity/spam/auto için — diğer kategorilerde dot yeter (visual noise azalt)
  const showBadge = refined === 'flood' || refined === 'profanity' || refined === 'spam' || refined === 'auto';

  return (
    <li
      className="auditrow flex items-start gap-2.5 px-2 py-1.5 rounded-md transition-colors"
      style={{ cursor: 'default' }}
    >
      {/* Dot */}
      <span
        className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
        style={{ background: palette.color, boxShadow: `0 0 4px ${palette.color}88` }}
      />
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-semibold text-[var(--theme-text)]">
            {actor}
          </span>
          <span className="text-[var(--theme-secondary-text)]/40 text-[11px]">→</span>
          <span className="text-[12.5px] text-[var(--theme-text)]/85">
            {def.verb}
          </span>
          {target && (
            <span className="text-[11.5px] text-[var(--theme-secondary-text)]/70">
              <span className="text-[var(--theme-secondary-text)]/35">·</span>{' '}
              <strong className="text-[var(--theme-text)]/80 font-semibold">{target}</strong>
            </span>
          )}
          {showBadge && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide shrink-0"
              style={{
                color: palette.color,
                background: `rgba(${palette.rgb}, 0.10)`,
                border: `1px solid rgba(${palette.rgb}, 0.22)`,
              }}
            >
              {CATEGORY_ICON[refined]}
              {palette.label}
            </span>
          )}
        </div>
        {reason && (
          <div className="mt-0.5 text-[11px] text-[var(--theme-secondary-text)]/55 leading-snug truncate">
            {reason}
          </div>
        )}
      </div>
      {/* Time */}
      <span
        className="shrink-0 mt-0.5 text-[10.5px] tabular-nums text-[var(--theme-secondary-text)]/45"
        title={new Date(log.createdAt).toLocaleString('tr-TR')}
      >
        {time}
      </span>

      <style>{`
        .auditrow:hover {
          background: rgba(var(--glass-tint), 0.04);
        }
      `}</style>
    </li>
  );
};

// ═══════════════════════════════════════════
// Skeleton + empty states
// ═══════════════════════════════════════════
function LogSkeleton() {
  return (
    <div className="space-y-1.5 pt-2">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-8 rounded-md animate-pulse"
          style={{ background: 'rgba(var(--glass-tint),0.04)' }}
        />
      ))}
    </div>
  );
}

function EmptyLog({ hasAny, hasQuery }: { hasAny: boolean; hasQuery: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-xl"
      style={{ background: 'rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint),0.06)' }}
    >
      <div
        className="w-10 h-10 rounded-full inline-flex items-center justify-center mb-2.5"
        style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
      >
        <ScrollText size={15} className="text-[var(--theme-secondary-text)]/45" />
      </div>
      <div className="text-[12.5px] font-semibold text-[var(--theme-text)]/80">
        {hasAny && hasQuery ? 'Sonuç bulunamadı' : 'Henüz moderasyon olayı yok'}
      </div>
      <div className="text-[10.5px] text-[var(--theme-secondary-text)]/45 mt-1 max-w-[340px] leading-relaxed">
        {hasAny && hasQuery
          ? 'Bu filtreyle eşleşen kayıt yok. Filtreyi sıfırla veya farklı bir arama terimi dene.'
          : 'Sistem aktif, ihlal veya aksiyon bekleniyor.'}
      </div>
    </div>
  );
}
