import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Search, X, ScrollText, AlertTriangle, EyeOff, Eye,
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
}

const ACTION_MAP: Record<string, ActionDef> = {
  // Moderasyon — manuel (mod/admin tarafından)
  'member.ban':       { verb: 'kullanıcıyı yasakladı',      category: 'manual' },
  'member.unban':     { verb: 'yasağı kaldırdı',            category: 'manual' },
  'member.kick':      { verb: 'sunucudan attı',             category: 'manual' },
  'member.mute':      { verb: 'sesini kapattı',             category: 'manual' },
  'member.unmute':    { verb: 'sesi açtı',                  category: 'manual' },
  'member.timeout':   { verb: 'zaman aşımı verdi',          category: 'manual' },
  'member.timeout_clear': { verb: 'zaman aşımını kaldırdı', category: 'manual' },
  'member.room_kick': { verb: 'sesli odadan çıkardı',       category: 'manual' },
  'member.chat_ban':  { verb: 'yazma engeli uyguladı',      category: 'manual' },
  'member.chat_unban':{ verb: 'yazma engelini kaldırdı',    category: 'manual' },
  // Otomatik moderasyon (system:auto-mod actor)
  'member.chat_ban.auto': { verb: 'Otomatik yazma engeli uygulandı', category: 'auto' },
  // Roller
  'role.change':        { verb: 'rolü değiştirdi', category: 'role' },
  'member.role_change': { verb: 'rolü değiştirdi', category: 'role' },
  // Davetler
  'invite.create':       { verb: 'davet oluşturdu',      category: 'invite' },
  'invite.revoke':       { verb: 'daveti iptal etti',    category: 'invite' },
  'invite.accept':       { verb: 'daveti kabul etti',    category: 'invite' },
  'join_request.submit': { verb: 'başvuru gönderdi',     category: 'invite' },
  'join_request.accept': { verb: 'başvuruyu kabul etti', category: 'invite' },
  'join_request.reject': { verb: 'başvuruyu reddetti',   category: 'invite' },
  // Kanal
  'channel.create':        { verb: 'kanal oluşturdu',      category: 'channel' },
  'channel.update':        { verb: 'kanalı güncelledi',    category: 'channel' },
  'channel.delete':        { verb: 'kanalı sildi',         category: 'channel' },
  'channel.reorder':       { verb: 'kanalları sıraladı',   category: 'channel' },
  'channel.access.grant':  { verb: 'kanal erişimi verdi',  category: 'channel' },
  'channel.access.revoke': { verb: 'kanal erişimini aldı', category: 'channel' },
  // Sunucu
  'server.update':        { verb: 'sunucu ayarlarını değiştirdi', category: 'settings' },
  'server.avatar_update': { verb: 'sunucu logosunu değiştirdi',   category: 'settings' },
  'server.plan_change':   { verb: 'planı değiştirdi',             category: 'settings' },
  'plan.limit_hit':       { verb: 'plan limitine takıldı',        category: 'settings' },
  'moderation_history.reset': { verb: 'ceza geçmişini sıfırladı',  category: 'manual' },
};

function resolveAction(log: AuditLogItem): ActionDef {
  return ACTION_MAP[log.action] ?? { verb: log.action, category: 'other' };
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

// ═══════════════════════════════════════════
// Priority system — 3 level
// ═══════════════════════════════════════════
type Priority = 'high' | 'medium' | 'low';

const HIGH_ACTIONS = new Set<string>([
  'member.ban', 'member.kick', 'member.timeout', 'member.mute',
  'member.chat_ban', 'member.room_kick',
]);

function priorityOf(log: AuditLogItem, refined: Category): Priority {
  if (HIGH_ACTIONS.has(log.action)) return 'high';
  if (refined === 'flood' || refined === 'profanity' || refined === 'spam' || refined === 'auto') return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════
// Compression — aynı actor + action + ~1dk içinde ardışık event'leri tek satıra birleştir
// ═══════════════════════════════════════════
interface CompressedRow {
  id: string;           // İlk log'un id'si (key için)
  log: AuditLogItem;    // En son (en yeni) log
  count: number;        // Kaç event birleşti (1+)
  firstAt: string;      // İlk olayın zamanı
}

const COMPRESS_WINDOW_MS = 60_000; // 1 dakika

function compressLogs(logs: AuditLogItem[]): CompressedRow[] {
  // logs descending by createdAt
  const out: CompressedRow[] = [];
  for (const log of logs) {
    const prev = out[out.length - 1];
    if (prev) {
      const sameActor = prev.log.actorId === log.actorId;
      const sameAction = prev.log.action === log.action;
      // Grup penceresi: en eski + en yeni arası <= COMPRESS_WINDOW_MS
      const prevOldest = Date.parse(prev.firstAt);
      const curAt = Date.parse(log.createdAt);
      const inWindow = Number.isFinite(prevOldest) && Number.isFinite(curAt)
        && (prevOldest - curAt) <= COMPRESS_WINDOW_MS;
      if (sameActor && sameAction && inWindow) {
        prev.count++;
        prev.firstAt = log.createdAt; // eski olaya doğru kay
        continue;
      }
    }
    out.push({ id: log.id, log, count: 1, firstAt: log.createdAt });
  }
  return out;
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
  const [hideLow, setHideLow] = useState(false);

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
      if (hideLow && priorityOf(log, refined) === 'low') return false;
      if (!matchesFilter(def.category, refined, filter)) return false;
      if (q) {
        const actor = (log.actorName ?? '').toLocaleLowerCase('tr-TR');
        const target = (describeTarget(log) ?? '').toLocaleLowerCase('tr-TR');
        const reason = (extractReason(log) ?? '').toLocaleLowerCase('tr-TR');
        if (!actor.includes(q) && !target.includes(q) && !reason.includes(q) && !def.verb.toLocaleLowerCase('tr-TR').includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query, hideLow]);

  // Bucket → compress → her bucket kendi içinde sıkıştır
  const groups = useMemo(() => {
    const nowMs = Date.now();
    const m = new Map<Bucket, AuditLogItem[]>();
    m.set('today', []); m.set('yesterday', []); m.set('older', []);
    for (const log of filtered) {
      const b = bucketOf(log.createdAt, nowMs);
      m.get(b)!.push(log);
    }
    return (['today', 'yesterday', 'older'] as Bucket[])
      .map(b => ({ bucket: b, rows: compressLogs(m.get(b)!) }))
      .filter(g => g.rows.length > 0);
  }, [filtered]);

  const totalLow = useMemo(() => {
    if (!items) return 0;
    let n = 0;
    for (const log of items) {
      const def = resolveAction(log);
      const refined = refineCategory(log, def);
      if (priorityOf(log, refined) === 'low') n++;
    }
    return n;
  }, [items]);

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
          onClick={() => setHideLow(v => !v)}
          title={hideLow ? 'Düşük öncelikli logları göster' : 'Düşük öncelikli logları gizle'}
          aria-label="Düşük öncelikli toggle"
          className="flex items-center gap-1 px-2 h-8 rounded-lg text-[10.5px] font-semibold transition-colors"
          style={hideLow ? {
            background: 'rgba(var(--theme-accent-rgb),0.12)',
            color: 'var(--theme-accent)',
            border: '1px solid rgba(var(--theme-accent-rgb),0.26)',
          } : {
            background: 'rgba(var(--glass-tint),0.04)',
            color: 'var(--theme-secondary-text)',
            border: '1px solid rgba(var(--glass-tint),0.08)',
          }}
        >
          {hideLow ? <Eye size={11} /> : <EyeOff size={11} />}
          {hideLow ? 'Göster' : 'Gizle'}
          {totalLow > 0 && (
            <span className="tabular-nums opacity-70">({totalLow})</span>
          )}
        </button>
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
            <TimeGroup key={g.bucket} bucket={g.bucket} rows={g.rows} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Time group — uppercase label + vertical timeline
// ═══════════════════════════════════════════
const TimeGroup: React.FC<{ bucket: Bucket; rows: CompressedRow[] }> = ({ bucket, rows }) => {
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <section>
      <div className="flex items-center gap-2 px-1 pb-1.5 pt-1">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--theme-secondary-text)]/55">
          {BUCKET_LABEL[bucket]}
        </span>
        <span
          className="h-px flex-1"
          style={{ background: 'linear-gradient(90deg, rgba(var(--glass-tint),0.08), transparent 80%)' }}
        />
        <span className="text-[9.5px] tabular-nums text-[var(--theme-secondary-text)]/30">
          {total}
        </span>
      </div>
      <ul className="relative" style={{ paddingLeft: 18 }}>
        <div
          aria-hidden="true"
          className="absolute top-1 bottom-1 w-px"
          style={{
            left: 6,
            background: 'linear-gradient(to bottom, rgba(var(--glass-tint),0.04), rgba(var(--glass-tint),0.10) 10%, rgba(var(--glass-tint),0.10) 90%, rgba(var(--glass-tint),0.04))',
          }}
        />
        {rows.map(r => (
          <AuditLogRow key={r.id} row={r} />
        ))}
      </ul>
    </section>
  );
};

// ═══════════════════════════════════════════
// Single row — timeline dot + actor em-dash verb + target + reason subtext + time
// Priority-aware: HIGH subtle tint, MEDIUM normal, LOW faded.
// Compressed: N>1 ise ×N badge.
// ═══════════════════════════════════════════
const AuditLogRow: React.FC<{ row: CompressedRow }> = ({ row }) => {
  const { log, count } = row;
  const def = resolveAction(log);
  const refined = refineCategory(log, def);
  const palette = CATEGORY_COLOR[refined];
  const priority = priorityOf(log, refined);
  const actor = log.actorId === 'system:auto-mod' ? 'Sistem' : (log.actorName || 'Kullanıcı');
  const target = describeTarget(log);
  const reason = extractReason(log);
  const time = timeAgo(log.createdAt, { withDateFallback: true });

  const showBadge = refined === 'flood' || refined === 'profanity' || refined === 'spam' || refined === 'auto';

  // Priority → typography + dot + row tint
  const isHigh   = priority === 'high';
  const isLow    = priority === 'low';
  const verbTone = isHigh ? 'text-[var(--theme-text)]/90' : isLow ? 'text-[var(--theme-text)]/65' : 'text-[var(--theme-text)]/80';
  const actorTone = isHigh
    ? 'text-[var(--theme-text)] font-semibold'
    : isLow
      ? 'text-[var(--theme-text)]/75 font-semibold'
      : 'text-[var(--theme-text)]/90 font-semibold';
  const actorSize = isLow ? 'text-[11.5px]' : 'text-[12.5px]';
  const verbSize  = isLow ? 'text-[11.5px]' : 'text-[12.5px]';

  // Dot: high = full + warm amber tint, medium = category color, low = muted
  const dotColor = isHigh ? '#fb923c' : palette.color;
  const dotOpacity = isLow ? 0.55 : isHigh ? 1 : 0.85;

  // Row bg: HIGH subtle amber, MEDIUM clean, LOW clean faded
  const rowBg = isHigh ? 'rgba(251,146,60,0.03)' : 'transparent';
  const rowOpacity = isLow ? 0.72 : 1;

  const absTime = new Date(log.createdAt).toLocaleString('tr-TR');
  const hint = count > 1
    ? `${count} olay · ilk: ${new Date(row.firstAt).toLocaleString('tr-TR')} · son: ${absTime}`
    : absTime;

  return (
    <li
      className="auditrow relative py-1 pr-1 transition-colors"
      style={{ background: rowBg, opacity: rowOpacity }}
      title={hint}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{
          left: -17,
          background: dotColor,
          boxShadow: `0 0 0 3px var(--theme-bg), 0 0 6px ${dotColor}66`,
          opacity: dotOpacity,
        }}
      />

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className={`${actorSize} ${actorTone}`}>
              {actor}
            </span>
            <span className="text-[11px] text-[var(--theme-secondary-text)]/35">—</span>
            <span className={`${verbSize} ${verbTone}`}>
              {def.verb}
            </span>
            {target && (
              <span className={`${verbSize} text-[var(--theme-text)]/70 font-semibold truncate max-w-[240px]`}>
                {target}
              </span>
            )}
            {count > 1 && (
              <span
                className="inline-flex items-center px-1.5 py-px rounded text-[9.5px] font-bold tabular-nums shrink-0"
                style={{
                  color: 'var(--theme-accent)',
                  background: 'rgba(var(--theme-accent-rgb), 0.10)',
                  border: '1px solid rgba(var(--theme-accent-rgb), 0.22)',
                }}
              >
                ×{count}
              </span>
            )}
            {showBadge && (
              <span
                className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide shrink-0"
                style={{
                  color: palette.color,
                  background: `rgba(${palette.rgb}, 0.10)`,
                  border: `1px solid rgba(${palette.rgb}, 0.22)`,
                }}
              >
                {palette.label}
              </span>
            )}
          </div>
          {reason && (
            <div className="mt-0.5 text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-snug truncate">
              {reason}
            </div>
          )}
        </div>
        <span className="shrink-0 mt-px text-[10.5px] tabular-nums text-[var(--theme-secondary-text)]/40">
          {time}
        </span>
      </div>

      <style>{`
        .auditrow { border-radius: 6px; }
        .auditrow:hover {
          background: rgba(var(--glass-tint), 0.045) !important;
          opacity: 1 !important;
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
