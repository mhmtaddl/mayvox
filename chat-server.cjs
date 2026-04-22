/**
 * MAYVOX WebSocket Chat Server v4
 * - Supabase JWT auth
 * - Room-based messaging with persistent history
 * - DM (Direct Message) with SQLite persistence
 * - Avatar + display name from profiles
 * - 5 min empty room cleanup
 * - Reconnect-safe
 */

const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { createPresenceService, loadStore } = require('./presence');
const { createFloodControl } = require('./flood-control.cjs');
const spamGuard = require('./spam-guard.cjs');

if (!process.env.ELECTRON_IS_PACKAGED) {
  try { require('dotenv').config(); } catch {}
}

// ── Config ────────────────────────────────────────────────────────────────
const PORT = process.env.CHAT_PORT || 10001;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error('[chat-server] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY gerekli!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── SQLite for DM ────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const DM_DB_PATH = process.env.DM_DB_PATH || path.join(__dirname, 'data', 'dm.sqlite');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DM_DB_PATH), { recursive: true });

const dmDb = new Database(DM_DB_PATH);
dmDb.pragma('journal_mode = WAL');
dmDb.pragma('foreign_keys = ON');

// Create tables
dmDb.exec(`
  CREATE TABLE IF NOT EXISTS dm_conversations (
    conversation_key TEXT PRIMARY KEY,
    user_a_id TEXT NOT NULL,
    user_b_id TEXT NOT NULL,
    last_message TEXT DEFAULT '',
    last_message_at INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    conversation_key TEXT NOT NULL REFERENCES dm_conversations(conversation_key),
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    read_at INTEGER DEFAULT NULL,
    delivered_at INTEGER DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_dm_msg_conv ON dm_messages(conversation_key, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_msg_receiver ON dm_messages(receiver_id, read_at);
  CREATE INDEX IF NOT EXISTS idx_dm_conv_user_a ON dm_conversations(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_dm_conv_user_b ON dm_conversations(user_b_id);

  CREATE TABLE IF NOT EXISTS dm_conversation_hidden (
    user_id TEXT NOT NULL,
    conversation_key TEXT NOT NULL,
    hidden_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    PRIMARY KEY (user_id, conversation_key)
  );
`);

// Idempotent migration — delivered_at eski DB'lere retroaktif eklenir.
// Sıra önemli: önce kolon varlığı garanti edilir, sonra o kolonu kullanan index.
{
  const cols = dmDb.pragma('table_info(dm_messages)');
  const hasDelivered = cols.some(c => c.name === 'delivered_at');
  if (!hasDelivered) {
    dmDb.exec(`ALTER TABLE dm_messages ADD COLUMN delivered_at INTEGER DEFAULT NULL`);
    console.log('[chat-server] Migration: dm_messages.delivered_at eklendi');
  }
  // Kolon varlığı her iki path'te de (yeni DB / eski DB) garanti altında → index güvenle eklenir.
  dmDb.exec(`CREATE INDEX IF NOT EXISTS idx_dm_msg_recv_delivered ON dm_messages(receiver_id, delivered_at)`);
}

console.log('[chat-server] SQLite DM DB hazır:', DM_DB_PATH);

// Prepared statements
const dmStmt = {
  getConversations: dmDb.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM dm_messages m
       WHERE m.conversation_key = c.conversation_key
       AND m.receiver_id = ? AND m.read_at IS NULL) as unread_count
    FROM dm_conversations c
    WHERE (c.user_a_id = ? OR c.user_b_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM dm_conversation_hidden h
        WHERE h.user_id = ? AND h.conversation_key = c.conversation_key
        AND h.hidden_at >= c.last_message_at
      )
    ORDER BY c.last_message_at DESC
  `),
  getConversation: dmDb.prepare(`
    SELECT * FROM dm_conversations WHERE conversation_key = ?
  `),
  createConversation: dmDb.prepare(`
    INSERT OR IGNORE INTO dm_conversations (conversation_key, user_a_id, user_b_id, created_at)
    VALUES (?, ?, ?, ?)
  `),
  getMessages: dmDb.prepare(`
    SELECT * FROM dm_messages
    WHERE conversation_key = ?
    ORDER BY created_at ASC
    LIMIT 200
  `),
  getMessagesAfterHidden: dmDb.prepare(`
    SELECT m.* FROM dm_messages m
    WHERE m.conversation_key = ?
      AND m.created_at > COALESCE(
        (SELECT h.hidden_at FROM dm_conversation_hidden h
         WHERE h.user_id = ? AND h.conversation_key = ?),
        0
      )
    ORDER BY m.created_at ASC
    LIMIT 200
  `),
  insertMessage: dmDb.prepare(`
    INSERT INTO dm_messages (id, conversation_key, sender_id, receiver_id, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  updateLastMessage: dmDb.prepare(`
    UPDATE dm_conversations
    SET last_message = ?, last_message_at = ?
    WHERE conversation_key = ?
  `),
  // NOTE: SQLite WAL seri yazma garantisi verir — DB seviyesinde race yok.
  // Uygulama seviyesinde: aynı kullanıcı 2 tab'dan eşzamanlı markRead yaparsa,
  // her iki UPDATE başarılı olur (idempotent, read_at IS NULL koşulu korur).
  // Client-side unread sayacı geçici yanlış gösterebilir — V2'de ack ile çözülebilir.
  markRead: dmDb.prepare(`
    UPDATE dm_messages
    SET read_at = ?
    WHERE conversation_key = ? AND receiver_id = ? AND read_at IS NULL
  `),
  markDelivered: dmDb.prepare(`
    UPDATE dm_messages
    SET delivered_at = ?
    WHERE id = ? AND receiver_id = ? AND delivered_at IS NULL
  `),
  // Reconnect batch: bu kullanıcıya ait henüz delivered_at işlenmemiş tüm mesajlar.
  // SELECT sonrası idempotent UPDATE; arada gelen yeni mesaj send path'inde online yolla gider.
  getUndeliveredForReceiver: dmDb.prepare(`
    SELECT id, conversation_key, sender_id
    FROM dm_messages
    WHERE receiver_id = ? AND delivered_at IS NULL
    ORDER BY created_at ASC
  `),
  markDeliveredById: dmDb.prepare(`
    UPDATE dm_messages SET delivered_at = ?
    WHERE id = ? AND delivered_at IS NULL
  `),
  getUnreadCount: dmDb.prepare(`
    SELECT COUNT(*) as count FROM dm_messages
    WHERE receiver_id = ? AND read_at IS NULL
  `),
  getUnreadBySender: dmDb.prepare(`
    SELECT sender_id, COUNT(*) as count FROM dm_messages
    WHERE receiver_id = ? AND read_at IS NULL
    GROUP BY sender_id
  `),
  hideConversation: dmDb.prepare(`
    INSERT OR REPLACE INTO dm_conversation_hidden (user_id, conversation_key, hidden_at)
    VALUES (?, ?, ?)
  `),
  unhideConversation: dmDb.prepare(`
    DELETE FROM dm_conversation_hidden WHERE user_id = ? AND conversation_key = ?
  `),
};

function makeDmKey(a, b) {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// userId -> Set<ws> (bir kullanıcının birden fazla bağlantısı olabilir)
const userConnections = new Map();

function registerUserConnection(userId, ws) {
  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId).add(ws);
}

function unregisterUserConnection(userId, ws) {
  const conns = userConnections.get(userId);
  if (!conns) return;
  conns.delete(ws);
  if (conns.size === 0) userConnections.delete(userId);
}

function sendToUser(userId, data) {
  const conns = userConnections.get(userId);
  if (!conns) return;
  const payload = JSON.stringify(data);
  const dead = [];
  for (const c of conns) {
    if (c.readyState === WebSocket.OPEN) {
      try {
        c.send(payload);
      } catch {
        dead.push(c);
      }
    } else {
      dead.push(c);
    }
  }
  for (const d of dead) conns.delete(d);
  if (conns.size === 0) userConnections.delete(userId);
}

// ── Presence service ──────────────────────────────────────────────────────
// Hetzner Node process = global online/last_seen authority.
// userConnections'dan bağımsız — kendi in-memory session store'una yazar.
const presenceStore = loadStore();

function broadcastToAllAuthed(payload) {
  const json = JSON.stringify(payload);
  for (const [, conns] of userConnections) {
    for (const ws of conns) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(json); } catch { /* dead socket; cleanup başka yerde */ }
      }
    }
  }
}

const presence = createPresenceService({
  store: presenceStore,
  supabase,
  broadcastFn: broadcastToAllAuthed,
  log: console,
});

// Boot cleanup: prev. server instance'tan kalan orphan session'ları kapat
presence.bootCleanup().catch(err =>
  console.error('[presence] boot cleanup error:', err && err.message)
);

// Stale session watcher (memory store için sigorta)
const stopPresenceCleanup = presence.startCleanupLoop();

// Fail-closed: geçersiz/boş/self-pair → false.
// Schema verification: dönen satır beklenen pair ile eşleşmezse false
// (zehirlenmiş satır veya schema drift DM kapısını açamasın).
async function checkFriendship(userA, userB) {
  if (typeof userA !== 'string' || typeof userB !== 'string') return false;
  const a = userA.trim(), b = userB.trim();
  if (!a || !b || a === b) return false;
  const [low, high] = a < b ? [a, b] : [b, a];
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('user_low_id, user_high_id')
      .eq('user_low_id', low)
      .eq('user_high_id', high)
      .maybeSingle();
    if (error) {
      console.warn('[dm] friendship query error:', error.message);
      return false;
    }
    if (!data || typeof data !== 'object') return false;
    if (data.user_low_id !== low || data.user_high_id !== high) return false;
    return true;
  } catch (err) {
    console.warn('[dm] friendship exception:', err?.message);
    return false;
  }
}

async function getFriendIds(userId) {
  const { data } = await supabase
    .from('friendships')
    .select('user_low_id, user_high_id')
    .or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`);
  if (!data) return new Set();
  return new Set(data.map(r => r.user_low_id === userId ? r.user_high_id : r.user_low_id));
}

// ── State ─────────────────────────────────────────────────────────────────
const rooms = new Map();          // roomId -> Set<ws>
const cleanupTimers = new Map();  // roomId -> timeout

// ── Per-user rate limits ──────────────────────────────────────────────────
// Room chat + DM → flood-control modülü (sliding window + cooldown + offense).
// Join + typing → lightweight fixed-window (farklı amaç, bozmuyoruz).
const floodControl = createFloodControl();
const userJoinLimits = new Map();   // join: 5 / 15s
const userTypingLimits = new Map(); // DM typing relay: 5 / 10s (burst guard)

// Typing-only friendship cache — SADECE dm:typing relay'inde kullanılır.
// DM send/open kendi sağlam checkFriendship akışını korur (stale sonuca izin yok).
// Typing ephemeral; 8 sn stale tolerable — tipik arkadaşlık kaldırma etkisi gecikir ama
// DM send her seferinde DB'ye düştüğü için gerçek kapı kapalı kalır.
const typingFriendCache = new Map(); // canonicalKey -> { ok: boolean, expiresAt: number }
const TYPING_FRIEND_TTL_MS = 8_000;

async function checkFriendshipForTyping(userA, userB) {
  if (typeof userA !== 'string' || typeof userB !== 'string') return false;
  const a = userA.trim(), b = userB.trim();
  if (!a || !b || a === b) return false;
  const [low, high] = a < b ? [a, b] : [b, a];
  const key = `${low}|${high}`;
  const now = Date.now();
  const hit = typingFriendCache.get(key);
  if (hit && hit.expiresAt > now) return hit.ok;
  // Miss → canonical DB yolu; hata fail-closed.
  const ok = await checkFriendship(a, b);
  typingFriendCache.set(key, { ok, expiresAt: now + TYPING_FRIEND_TTL_MS });
  return ok;
}

// Duplicate-send guard: aynı kullanıcı + aynı text ~500ms içinde tekrarlanırsa yoksay.
// Çift click / tuşta takılma gibi frontend pürüzleri sunucuda sabitlenir.
const userLastDm = new Map();       // userId -> { text, at }
const DM_DUP_WINDOW_MS = 500;

function isDuplicateDm(userId, text, now) {
  const last = userLastDm.get(userId);
  if (!last) return false;
  if (last.text !== text) return false;
  return now - last.at < DM_DUP_WINDOW_MS;
}

function checkRateLimit(map, userId, maxCount, windowMs) {
  const now = Date.now();
  let entry = map.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    map.set(userId, entry);
  }
  entry.count += 1;
  return entry.count > maxCount;
}

// ── Internal notify secret (server-backend ↔ chat-server) ────────────────
const INTERNAL_NOTIFY_SECRET = process.env.INTERNAL_NOTIFY_SECRET || '';
const SERVER_BACKEND_URL = process.env.SERVER_BACKEND_URL || 'http://127.0.0.1:10002';

// ── Profile cache (name/avatar) — DM enrichment için ─────────────────────
// TTL 60 sn; batch fetch. Bellekte, Redis yok.
const profileCache = new Map(); // userId -> { name, avatar, expiresAt }
const PROFILE_TTL_MS = 60_000;

async function getProfiles(userIds) {
  const now = Date.now();
  const result = new Map();
  const miss = [];
  for (const id of userIds) {
    const hit = profileCache.get(id);
    if (hit && hit.expiresAt > now) {
      result.set(id, { name: hit.name, avatar: hit.avatar });
    } else {
      miss.push(id);
    }
  }
  if (miss.length > 0) {
    try {
      const { data } = await supabase.from('profiles').select('id, name, avatar').in('id', miss);
      if (data) {
        for (const p of data) {
          const entry = { name: p.name ?? '', avatar: p.avatar ?? null, expiresAt: now + PROFILE_TTL_MS };
          profileCache.set(p.id, entry);
          result.set(p.id, { name: entry.name, avatar: entry.avatar });
        }
      }
    } catch (err) {
      console.warn('[dm] profile enrich failed:', err?.message);
    }
  }
  return result;
}

// ── Per-channel moderation config cache (flood + profanity) ─────────────
// channelId -> { serverId, flood, profanity: { enabled, words, pattern }, expiresAt }
// TTL 30s. Server-backend /internal/channel-flood-config üzerinden çekilir.
// profanity.pattern → precompiled RegExp (cache miss'te inşa). Match O(1) regex test.
const floodConfigCache = new Map();
const FLOOD_CONFIG_TTL_MS = 30_000;

// Türkçe + Latin-diakritik normalize: lowercase + aksan strip + noktalama → boşluk.
// "Aptal!", "APTAL", "aptálsın" hepsi "aptal..." varyantı olarak match olur.
function normalizeForProfanity(text) {
  return String(text)
    .normalize('NFD')                              // á → a + ́
    .replace(/[̀-ͯ]/g, '')                // aksan karakterlerini sök
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

// Liberal bypass normalize — case-fold + diakritik + TR. Whitespace/noktalama/rakam
// KORUNUR çünkü liberal regex onları pozisyon-wildcard olarak kullanır.
function liberalNormalize(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
}

function buildProfanityPattern(words) {
  if (!Array.isArray(words) || words.length === 0) return null;
  // ≤3 harf (whitespace hariç) → whole-word match: hem başı hem sonu kelime-sınırı zorunlu
  //   Sebep: "amk" prefix olsa "amkatsu" gibi rastgele kelime FP olur; whole-word güvenli.
  // ≥4 harf → prefix match: TR eklerini (salak→salakça, aptal→aptalsın) yakalar.
  const shortSet = new Set();
  const longSet = new Set();
  for (const w of words) {
    if (typeof w !== 'string') continue;
    const n = normalizeForProfanity(w).trim();
    if (!n) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const compact = n.replace(/\s+/g, '');
    if (compact.length <= 3) shortSet.add(esc);
    else longSet.add(esc);
  }
  const parts = [];
  if (longSet.size > 0) {
    parts.push(`(?:^|[^\\p{L}\\p{N}])(?:${[...longSet].join('|')})`);
  }
  if (shortSet.size > 0) {
    parts.push(`(?:^|[^\\p{L}\\p{N}])(?:${[...shortSet].join('|')})(?=$|[^\\p{L}\\p{N}])`);
  }
  if (parts.length === 0) return null;
  try {
    return new RegExp(parts.join('|'), 'iu');
  } catch {
    return null;
  }
}

// Liberal matcher — her kelime harfinin yerine "target VEYA non-letter
// (rakam/sembol/boşluk)" kabul. Yakalananlar: `sikt*r`, `s1ktir`, `s^ktir`,
// `5!kt!r`, `s i k t i r`, `s.i.k.t.i.r`, `amc*k` vb.
//
// Tek büyük regex V8'de patlar (400KB+). İlk harfe göre bucket'a böleriz;
// her bucket ayrı ~15-20KB regex. Match sırasında input'un her kelime-başı
// pozisyonundan sadece ilgili bucket test edilir.
// Min uzunluk 5 — kısa kelimeler (amk, piç) standart whole-word pattern'de.
function buildLiberalMatcher(words) {
  if (!Array.isArray(words) || words.length === 0) return null;
  const byFirst = new Map();
  for (const w of words) {
    if (typeof w !== 'string') continue;
    const n = liberalNormalize(w).replace(/[^\p{L}]/gu, '');
    if (!n || n.length < 5) continue;
    const first = n[0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(n);
  }
  const buckets = new Map();
  for (const [first, list] of byFirst) {
    const alts = [];
    for (const w of list) {
      const parts = [];
      for (const c of w) {
        const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        parts.push(`(?:${esc}|[^\\p{L}])`);
      }
      alts.push(parts.join('[^\\p{L}]*'));
    }
    try {
      buckets.set(first, new RegExp(`^(?:${alts.join('|')})`, 'iu'));
    } catch { /* skip bucket on compile error */ }
  }
  if (buckets.size === 0) return null;
  return { buckets, all: [...buckets.values()] };
}

// Liberal matcher üzerinden input'u test et.
// Kelime başı pozisyonlarında ilgili bucket regex'ini `^`-anchor'lı slice'la test eder.
function liberalMatches(matcher, input) {
  if (!matcher) return false;
  const LETTER = /\p{L}/u;
  const s = input;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    if (i > 0 && LETTER.test(s[i - 1])) continue; // kelime başı sınırı
    const ch = s[i];
    if (LETTER.test(ch)) {
      const re = matcher.buckets.get(ch);
      if (re && re.test(s.slice(i))) return true;
    } else {
      // Non-letter ilk karakter: target position 0 non-letter'ı da kabul ediyor, tüm bucket'ları dene.
      for (const re of matcher.all) {
        if (re.test(s.slice(i))) return true;
      }
    }
  }
  return false;
}

// Sistem kara listesi — kullanıcı değiştiremez. Profanity.enabled=true ise her zaman aktif.
// Boot'ta tek sefer compile; process-wide singleton.
// Multi-language: { tr: [...], en: [...], ... } → Object.values().flat() ile tek pattern.
let SYSTEM_PROFANITY_PATTERN = null;
let SYSTEM_LIBERAL_MATCHER = null;
try {
  const data = require('./system-profanity.json');
  let words = [];
  if (Array.isArray(data)) {
    words = data;
  } else if (data && typeof data === 'object') {
    for (const arr of Object.values(data)) {
      if (Array.isArray(arr)) words = words.concat(arr);
    }
  }
  SYSTEM_PROFANITY_PATTERN = buildProfanityPattern(words);
  SYSTEM_LIBERAL_MATCHER = buildLiberalMatcher(words);
  const langs = (data && !Array.isArray(data) && typeof data === 'object') ? Object.keys(data).length : 1;
  const bucketCount = SYSTEM_LIBERAL_MATCHER?.buckets?.size ?? 0;
  console.log(`[profanity] sistem kara listesi yüklendi: ${words.length} kelime (${langs} dil) + ${bucketCount} bucket liberal matcher`);
} catch (err) {
  console.warn('[profanity] sistem kara listesi yüklenemedi:', err?.message);
}

function messageHasProfanity(text, profanity) {
  // Sistem kara listesi HER ZAMAN aktif — sunucu sahibi kapatamaz.
  // Küfür filtresi toggle'ı SADECE sunucu sahibinin eklediği kelime listesini etkiler.
  const normalized = normalizeForProfanity(text);
  if (SYSTEM_PROFANITY_PATTERN && SYSTEM_PROFANITY_PATTERN.test(normalized)) return true;
  const liberal = liberalNormalize(text);
  if (liberalMatches(SYSTEM_LIBERAL_MATCHER, liberal)) return true;
  // Sunucu özel kelimeler — sadece profanity.enabled iken
  if (profanity?.enabled) {
    if (profanity.pattern?.test(normalized)) return true;
    if (liberalMatches(profanity.liberalMatcher, liberal)) return true;
  }
  return false;
}

async function getChannelFloodConfig(channelId) {
  if (!channelId) return null;
  const now = Date.now();
  const hit = floodConfigCache.get(channelId);
  if (hit && hit.expiresAt > now) return hit;

  if (!INTERNAL_NOTIFY_SECRET) {
    // Secret yoksa server-backend ile konuşamayız → null dön (flood-control built-in).
    const entry = { serverId: null, flood: null, profanity: null, spam: null, expiresAt: now + FLOOD_CONFIG_TTL_MS };
    floodConfigCache.set(channelId, entry);
    return entry;
  }
  try {
    const url = `${SERVER_BACKEND_URL}/internal/channel-flood-config?channelId=${encodeURIComponent(channelId)}`;
    const resp = await fetch(url, {
      headers: { 'x-internal-secret': INTERNAL_NOTIFY_SECRET },
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json();
    const profanityRaw = body?.profanity && typeof body.profanity === 'object' ? body.profanity : null;
    const spamRaw = body?.spam && typeof body.spam === 'object' ? body.spam : null;
    const entry = {
      serverId: typeof body?.serverId === 'string' ? body.serverId : null,
      flood: body?.flood && typeof body.flood === 'object' ? body.flood : null,
      profanity: profanityRaw ? {
        enabled: !!profanityRaw.enabled,
        words: Array.isArray(profanityRaw.words) ? profanityRaw.words : [],
        pattern: profanityRaw.enabled ? buildProfanityPattern(profanityRaw.words) : null,
        liberalMatcher: profanityRaw.enabled ? buildLiberalMatcher(profanityRaw.words) : null,
      } : null,
      spam: spamRaw ? { enabled: !!spamRaw.enabled } : null,
      expiresAt: now + FLOOD_CONFIG_TTL_MS,
    };
    floodConfigCache.set(channelId, entry);
    return entry;
  } catch (err) {
    // Ağ/timeout hatası — kısa TTL negative cache, tekrar denemeye girer.
    console.warn('[flood-config] fetch fail channel=%s err=%s', channelId, err?.message || err);
    const entry = { serverId: null, flood: null, profanity: null, spam: null, expiresAt: now + 5_000 };
    floodConfigCache.set(channelId, entry);
    return entry;
  }
}

// ── Audit bridge: chat-server → server-backend ──
// Fire-and-forget. Audit başarısızsa DM devam eder — best-effort.
// METADATA-ONLY: mesaj gövdesi (body/text) ASLA audit'e gönderilmez.
async function auditDm({ actorId, action, resourceType, resourceId, metadata }) {
  if (!INTERNAL_NOTIFY_SECRET) return;
  if (typeof action !== 'string' || !action.startsWith('dm.')) return;
  try {
    const resp = await fetch(`${SERVER_BACKEND_URL}/internal/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_NOTIFY_SECRET,
      },
      body: JSON.stringify({ actorId, action, resourceType, resourceId, metadata }),
      // AbortSignal timeout — DM akışını bloklamasın.
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok && resp.status !== 204) {
      console.warn(`[audit] ${action} → HTTP ${resp.status}`);
    }
  } catch (err) {
    // Audit best-effort; DM işlemi geri alınmaz.
    console.warn(`[audit] ${action} bridge error:`, err?.message);
  }
}
if (!INTERNAL_NOTIFY_SECRET) {
  console.warn('[chat-server] INTERNAL_NOTIFY_SECRET tanımsız — /internal/notify-user devre dışı, invite realtime push ÇALIŞMAYACAK (frontend polling fallback ile güncellenecek).');
} else {
  console.log('[chat-server] internal notify AKTİF (secret yüklü).');
}

// /internal/* endpoint'leri sadece loopback'ten (server-backend aynı host) erişilebilir olsun.
// Defense-in-depth: nginx dış erişimi kesse bile kod seviyesinde ikinci kilit.
function isLoopbackRequest(req) {
  const addr = req.socket && req.socket.remoteAddress;
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// ── HTTP: health + internal notify ───────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const conns = [...rooms.values()].reduce((sum, set) => sum + set.size, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: conns }));
    return;
  }

  // Tüm /internal/* yolu için loopback-only guard (defense-in-depth).
  if (req.url && req.url.startsWith('/internal/')) {
    if (!isLoopbackRequest(req)) {
      const from = req.socket && req.socket.remoteAddress;
      console.warn(`[chat-server] /internal/* non-loopback erişim reddedildi, remote=${from}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
  }

  // Internal: diğer servislerden (server-backend) kullanıcıya WS push.
  // Body: { userId: string, payload: object } — sadece shared secret ile çağrılabilir.
  if (req.method === 'POST' && req.url === '/internal/notify-user') {
    if (!INTERNAL_NOTIFY_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_notify_disabled' }));
      return;
    }
    const provided = req.headers['x-internal-secret'];
    if (provided !== INTERNAL_NOTIFY_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const payload = body.payload && typeof body.payload === 'object' ? body.payload : null;
        if (!userId || !payload || typeof payload.type !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad_request' }));
          return;
        }
        const conns = userConnections.get(userId);
        const delivered = conns ? conns.size : 0;
        sendToUser(userId, payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, delivered }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId, data) {
  const clients = rooms.get(roomId);
  if (!clients) return;

  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function leaveRoom(ws, roomId) {
  const clients = rooms.get(roomId);
  if (!clients) return false;

  clients.delete(ws);

  if (clients.size === 0) {
    rooms.delete(roomId);
    return true; // oda boşaldı
  }

  return false;
}

function formatMsg(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    sender: row.sender_name,
    avatar: row.sender_avatar || '',
    text: row.text,
    time: new Date(row.created_at).getTime(),
  };
}

function getDisplayName(profile, user) {
  const firstName = String(profile?.first_name || '').trim();
  const lastName = String(profile?.last_name || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const name = String(profile?.name || '').trim();

  return fullName || name || user.email || `user-${user.id}`;
}

function cancelCleanup(roomId) {
  if (!cleanupTimers.has(roomId)) return;

  clearTimeout(cleanupTimers.get(roomId));
  cleanupTimers.delete(roomId);
  console.log(`[chat] Cleanup iptal: ${roomId} (biri geri geldi)`);
}

function scheduleCleanup(roomId) {
  const clients = rooms.get(roomId);
  if (clients && clients.size > 0) return;
  if (cleanupTimers.has(roomId)) return;

  console.log(`[chat] Cleanup timer başladı: ${roomId} (5dk)`);

  cleanupTimers.set(roomId, setTimeout(async () => {
    cleanupTimers.delete(roomId);

    const activeClients = rooms.get(roomId);
    if (activeClients && activeClients.size > 0) {
      console.log(`[chat] Cleanup iptal: ${roomId} (oda tekrar doldu)`);
      return;
    }

    try {
      await supabase
        .from('room_messages')
        .delete()
        .eq('channel_id', roomId);

      console.log(`[chat] Oda ${roomId} mesajları temizlendi (5dk boş)`);
    } catch (err) {
      console.warn('[chat] Cleanup hatası:', err?.message || err);
    }
  }, 5 * 60 * 1000));
}

// ── WebSocket ─────────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 8 * 1024,
});

wss.on('connection', (ws) => {
  let authenticated = false;
  let userId = null;
  let userName = null;
  let userAvatar = '';
  let currentRoom = null;

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, 5000);

  let msgCount = 0;
  let msgReset = Date.now();

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Geçersiz JSON' });
    }

    // Basit rate limit
    msgCount += 1;
    if (Date.now() - msgReset > 1000) {
      msgCount = 1;
      msgReset = Date.now();
    }
    if (msgCount > 20) {
      return send(ws, { type: 'error', message: 'Çok hızlı gönderiyorsun' });
    }

    // ── AUTH ──────────────────────────────────────────────────────────────
    if (msg.type === 'auth') {
      if (authenticated) return;

      try {
        const token = msg.token;
        if (!token || typeof token !== 'string') {
          throw new Error('Token eksik');
        }

        const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
        const user = authData?.user;

        if (authError || !user) {
          throw new Error(authError?.message || 'Geçersiz token');
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, name, avatar')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.warn('[chat] Profil çekme uyarısı:', profileError.message);
        }

        userId = user.id;
        userName = getDisplayName(profile, user);
        userAvatar = String(profile?.avatar || '').trim();

        authenticated = true;
        clearTimeout(authTimeout);

        console.log(
          `[chat] Auth OK: ${userName} (${userId}) avatar: ${userAvatar ? 'var' : 'yok'}`
        );

        // Register for DM delivery
        registerUserConnection(userId, ws);

        // ── Presence: session register ────────────────────────────────────
        // sessionKey = deviceId + random suffix → aynı device 2 tab açarsa
        // ayrı satır, birbirine karışmaz.
        const rawDeviceId = typeof msg.deviceId === 'string' ? msg.deviceId.trim() : '';
        const deviceId = rawDeviceId.slice(0, 64) || `legacy-${userId.slice(0, 8)}`;
        const wsSuffix = Math.random().toString(36).slice(2, 10);
        ws.presenceSessionKey = `${deviceId}:${wsSuffix}`;
        ws.presenceUserId = userId;
        const platform = (msg.platform === 'mobile' || msg.platform === 'web')
          ? msg.platform : 'desktop';
        const appVer = typeof msg.appVersion === 'string'
          ? msg.appVersion.slice(0, 32) : null;
        presence.handleConnect(userId, ws.presenceSessionKey, {
          deviceId, platform, appVersion: appVer,
        }).catch(err => console.warn('[presence] connect error:', err && err.message));

        send(ws, {
          type: 'auth_ok',
          userId,
          userName,
        });

        // Snapshot: bu client'a mevcut online kullanıcıları bildir (hydrate).
        // userConnections Map'i zaten authoritative — store'dan bağımsız bakıyoruz.
        {
          const onlineUserIds = [];
          for (const [uid] of userConnections) {
            if (uid !== userId) onlineUserIds.push(uid);
          }
          send(ws, {
            type: 'presence:snapshot',
            onlineUserIds,
            serverNow: new Date().toISOString(),
          });
        }

        // Reconnect batch delivery — bu user offline iken biriken tüm mesajları
        // delivered olarak işaretle ve ilgili gönderenlere dm:delivered eventi yolla.
        // Bu noktadan sonra gelecek mesajlar dm:send handler'ında online yoldan geçer.
        try {
          const undelivered = dmStmt.getUndeliveredForReceiver.all(userId);
          if (undelivered.length > 0) {
            const now = Date.now();
            const tx = dmDb.transaction((rows) => {
              for (const r of rows) dmStmt.markDeliveredById.run(now, r.id);
            });
            tx(undelivered);

            // sender + conversationKey başına grupla → her gönderene tek event.
            const grouped = new Map(); // `${sender}|${convKey}` -> { senderId, conversationKey, messageIds }
            for (const r of undelivered) {
              const k = `${r.sender_id}|${r.conversation_key}`;
              let entry = grouped.get(k);
              if (!entry) {
                entry = { senderId: r.sender_id, conversationKey: r.conversation_key, messageIds: [] };
                grouped.set(k, entry);
              }
              entry.messageIds.push(r.id);
            }
            for (const { senderId, conversationKey, messageIds } of grouped.values()) {
              sendToUser(senderId, {
                type: 'dm:delivered',
                conversationKey,
                messageIds,
                deliveredAt: now,
              });
            }
          }
        } catch (err) {
          console.warn('[dm] reconnect delivery flush error:', err?.message);
        }

        return;
      } catch (err) {
        console.log('[chat] Auth HATA:', err?.message || err);
        send(ws, {
          type: 'auth_error',
          message: err?.message || 'Auth failed',
        });
        ws.close(4002, 'Auth failed');
        return;
      }
    }

    if (!authenticated) {
      return send(ws, { type: 'error', message: 'Auth gerekli' });
    }

    // ── PRESENCE: heartbeat ───────────────────────────────────────────────
    if (msg.type === 'presence:ping') {
      if (!ws.presenceUserId || !ws.presenceSessionKey) return;
      presence.handleHeartbeat(ws.presenceUserId, ws.presenceSessionKey)
        .catch(err => console.warn('[presence] hb err:', err && err.message));
      return;
    }

    // ── PRESENCE: graceful bye (client logout / before-unload) ───────────
    if (msg.type === 'presence:bye') {
      if (!ws.presenceUserId || !ws.presenceSessionKey) return;
      presence.handleDisconnect(ws.presenceUserId, ws.presenceSessionKey, 'graceful')
        .catch(err => console.warn('[presence] bye err:', err && err.message));
      // bye sonrası aynı ws kapanacak; close handler'da tekrar disconnect çağrılsa
      // idempotent — DB update .is('disconnected_at', null) filtresiyle no-op olur.
      ws.presenceUserId = null;
      ws.presenceSessionKey = null;
      return;
    }

    // ── JOIN ROOM ─────────────────────────────────────────────────────────
    if (msg.type === 'join') {
      const roomId = String(msg.roomId || '').trim();
      if (!roomId) return;

      // Per-user join rate limit: 5 join / 15 saniye
      if (checkRateLimit(userJoinLimits, userId, 5, 15000)) {
        return send(ws, { type: 'error', message: 'Çok hızlı oda değiştiriyorsun, biraz bekle' });
      }

      // Aynı odaya tekrar join
      if (currentRoom === roomId) {
        try {
          const { data: messages } = await supabase
            .from('room_messages')
            .select('*')
            .eq('channel_id', roomId)
            .order('created_at', { ascending: true })
            .limit(200);

          send(ws, {
            type: 'history',
            roomId,
            messages: (messages || []).map(formatMsg),
          });
        } catch {
          send(ws, { type: 'history', roomId, messages: [] });
        }
        return;
      }

      // Eski odadan çık
      if (currentRoom) {
        const oldRoom = currentRoom;
        const becameEmpty = leaveRoom(ws, oldRoom);
        if (becameEmpty) {
          scheduleCleanup(oldRoom);
        }
      }

      // Yeni odaya giriş -> varsa cleanup iptal
      cancelCleanup(roomId);

      currentRoom = roomId;
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(ws);

      try {
        const { data: messages, error } = await supabase
          .from('room_messages')
          .select('*')
          .eq('channel_id', roomId)
          .order('created_at', { ascending: true })
          .limit(200);

        if (error) throw error;

        send(ws, {
          type: 'history',
          roomId,
          messages: (messages || []).map(formatMsg),
        });
      } catch (err) {
        console.warn('[chat] History yükleme hatası:', err?.message || err);
        send(ws, { type: 'history', roomId, messages: [] });
      }

      console.log(`[chat] ${userName} odaya girdi: ${roomId}`);
      return;
    }

    // ── SEND MESSAGE ──────────────────────────────────────────────────────
    if (msg.type === 'send') {
      if (!currentRoom) {
        return send(ws, { type: 'error', message: 'Odada değilsin' });
      }

      const text = String(msg.text || '').trim();
      if (!text || text.length > 2000) return;

      // Flood control + profanity filter: sunucu config'inden alınan override + kelime listesi.
      // Reddedilen mesaj: DB'ye yazılmaz, broadcast edilmez, kullanıcıya hata döner.
      {
        const cfg = await getChannelFloodConfig(currentRoom);
        const bucketKey = `${cfg?.serverId || 'unknown'}:${userId}`;
        const flood = floodControl.check('room_chat', bucketKey, {
          override: cfg?.flood || undefined,
        });
        if (!flood.allowed) {
          const waitSec = Math.max(1, Math.ceil(flood.retryAfterMs / 1000));
          if (flood.reason === 'flood_window') {
            console.log(`[flood] room_chat block userId=${userId} server=${cfg?.serverId || '-'} offense=${flood.offenseCount} retryMs=${flood.retryAfterMs}`);
          }
          return send(ws, {
            type: 'error',
            code: 'flood_control',
            retryAfter: flood.retryAfterMs,
            message: `Çok hızlı mesaj gönderiyorsun. Lütfen ${waitSec} saniye bekle.`,
          });
        }
        // Profanity: flood geçti, içerik kontrolü. Eşleşirse sessizce reddet (logla ama DB/broadcast yapma).
        if (messageHasProfanity(text, cfg?.profanity)) {
          console.log(`[profanity] block userId=${userId} server=${cfg?.serverId || '-'} len=${text.length}`);
          return send(ws, {
            type: 'error',
            code: 'profanity_blocked',
            message: 'Mesajında yasaklı bir ifade var.',
          });
        }
        // Spam: repeated text / all caps / emoji spam / link spam. Sadece enabled ise çalışır.
        if (cfg?.spam?.enabled) {
          const spamRes = spamGuard.checkSpam(userId, text);
          if (spamRes.spam) {
            console.log(`[spam] block userId=${userId} server=${cfg?.serverId || '-'} reason=${spamRes.reason} len=${text.length}`);
            return send(ws, {
              type: 'error',
              code: 'spam_blocked',
              message: 'Mesajın spam filtresine takıldı.',
            });
          }
        }
      }

      try {
        const { data, error } = await supabase
          .from('room_messages')
          .insert({
            channel_id: currentRoom,
            sender_id: userId,
            sender_name: userName,
            sender_avatar: userAvatar,
            text,
          })
          .select()
          .single();

        if (error) throw error;

        broadcastToRoom(currentRoom, {
          type: 'message',
          message: formatMsg(data),
        });
      } catch (err) {
        console.warn('[chat] Mesaj kayıt hatası:', err?.message || err);
        send(ws, { type: 'error', message: 'Mesaj gönderilemedi' });
      }

      return;
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (msg.type === 'delete') {
      if (!currentRoom || !msg.messageId) return;

      try {
        await supabase
          .from('room_messages')
          .delete()
          .eq('id', msg.messageId);

        broadcastToRoom(currentRoom, {
          type: 'delete',
          messageId: msg.messageId,
        });
      } catch (err) { console.error('[chat] delete error:', err); }
      return;
    }

    // ── EDIT ──────────────────────────────────────────────────────────────
    if (msg.type === 'edit') {
      if (!currentRoom || !msg.messageId) return;

      const text = String(msg.text || '').trim();
      if (!text || text.length > 2000) return;

      try {
        await supabase
          .from('room_messages')
          .update({ text })
          .eq('id', msg.messageId);

        broadcastToRoom(currentRoom, {
          type: 'edit',
          messageId: msg.messageId,
          text,
        });
      } catch (err) { console.error('[chat] edit error:', err); }
      return;
    }

    // ── CLEAR ─────────────────────────────────────────────────────────────
    if (msg.type === 'clear') {
      if (!currentRoom) return;

      try {
        await supabase
          .from('room_messages')
          .delete()
          .eq('channel_id', currentRoom);

        broadcastToRoom(currentRoom, {
          type: 'clear',
          roomId: currentRoom,
        });

        console.log(`[chat] ${userName} tüm mesajları sildi: ${currentRoom}`);
      } catch (err) { console.error('[chat] clear error:', err); }
      return;
    }

    // ── LEAVE ─────────────────────────────────────────────────────────────
    if (msg.type === 'leave') {
      if (currentRoom) {
        const oldRoom = currentRoom;
        currentRoom = null;

        const becameEmpty = leaveRoom(ws, oldRoom);
        if (becameEmpty) {
          scheduleCleanup(oldRoom);
        }
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // DM EVENTS
    // ══════════════════════════════════════════════════════════════════════

    // ── DM:CONVERSATIONS ─────────────────────────────────────────────────
    if (msg.type === 'dm:conversations') {
      try {
        const rows = dmStmt.getConversations.all(userId, userId, userId, userId);
        // Aktif arkadaş ID'lerini tek sorguda çek
        const friendIds = await getFriendIds(userId);
        // Sadece aktif arkadaşlarla olan konuşmaları döndür
        const filtered = [];
        const otherIds = [];
        for (const row of rows) {
          const otherId = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
          if (!friendIds.has(otherId)) continue;
          filtered.push({ row, otherId });
          otherIds.push(otherId);
        }
        // Server-side enrichment: name/avatar — frontend ayrıca resolve etmesin.
        const profiles = otherIds.length > 0 ? await getProfiles(otherIds) : new Map();
        const convos = filtered.map(({ row, otherId }) => {
          const p = profiles.get(otherId);
          return {
            conversationKey: row.conversation_key,
            recipientId: otherId,
            recipientName: p?.name || '',
            recipientAvatar: p?.avatar ?? null,
            lastMessage: row.last_message,
            lastMessageAt: row.last_message_at,
            unreadCount: row.unread_count,
            createdAt: row.created_at,
          };
        });
        send(ws, { type: 'dm:conversations', conversations: convos });
      } catch (err) {
        console.error('[dm] conversations error:', err?.message);
        send(ws, { type: 'dm:conversations', conversations: [] });
      }
      return;
    }

    // ── DM:OPEN ──────────────────────────────────────────────────────────
    if (msg.type === 'dm:open') {
      const recipientId = String(msg.recipientId || '').trim();
      if (!recipientId || recipientId === userId) {
        return send(ws, { type: 'dm:error', message: 'Geçersiz alıcı' });
      }

      try {
        // Arkadaşlık kontrolü
        const friends = await checkFriendship(userId, recipientId);
        if (!friends) {
          return send(ws, { type: 'dm:error', message: 'Bu kullanıcıyla arkadaş değilsin' });
        }

        const convKey = makeDmKey(userId, recipientId);
        const [userA, userB] = userId < recipientId ? [userId, recipientId] : [recipientId, userId];

        // Conversation yoksa oluştur
        const now = Date.now();
        dmStmt.createConversation.run(convKey, userA, userB, now);

        // Mesaj geçmişini yükle
        const messages = dmStmt.getMessagesAfterHidden.all(convKey, userId, convKey);

        // Okunmamış mesajları okundu işaretle
        dmStmt.markRead.run(now, convKey, userId);

        // Sender enrichment — tarihsel mesajlar için sender adı/avatarı (batch, cached).
        const senderIds = [...new Set(messages.map(m => m.sender_id))];
        const senderProfiles = senderIds.length > 0 ? await getProfiles(senderIds) : new Map();

        send(ws, {
          type: 'dm:history',
          conversationKey: convKey,
          recipientId,
          messages: messages.map(m => {
            const p = senderProfiles.get(m.sender_id);
            return {
              id: m.id,
              senderId: m.sender_id,
              senderName: p?.name || '',
              senderAvatar: p?.avatar ?? null,
              text: m.text,
              createdAt: m.created_at,
              readAt: m.read_at,
              deliveredAt: m.delivered_at,
            };
          }),
        });

        // Karşı tarafa okundu bilgisi gönder
        sendToUser(recipientId, {
          type: 'dm:read',
          conversationKey: convKey,
          readBy: userId,
          readAt: now,
        });
      } catch (err) {
        console.error('[dm] open error:', err?.message);
        send(ws, { type: 'dm:error', message: 'Konuşma açılamadı' });
      }
      return;
    }

    // ── DM:SEND ──────────────────────────────────────────────────────────
    if (msg.type === 'dm:send') {
      const recipientId = String(msg.recipientId || '').trim();
      const text = String(msg.text || '').trim();

      if (!recipientId || recipientId === userId) {
        return send(ws, { type: 'dm:error', message: 'Geçersiz alıcı' });
      }
      if (!text || text.length > 2000) {
        return send(ws, { type: 'dm:error', message: 'Geçersiz mesaj' });
      }

      // Flood control: DM sliding window.
      {
        const flood = floodControl.check('dm', userId);
        if (!flood.allowed) {
          const waitSec = Math.max(1, Math.ceil(flood.retryAfterMs / 1000));
          if (flood.reason === 'flood_window') {
            console.log(`[flood] dm block userId=${userId} offense=${flood.offenseCount} retryMs=${flood.retryAfterMs}`);
          }
          return send(ws, {
            type: 'dm:error',
            code: 'flood_control',
            retryAfter: flood.retryAfterMs,
            message: `Çok hızlı mesaj gönderiyorsun. Lütfen ${waitSec} saniye bekle.`,
          });
        }
      }

      // Duplicate-send guard — çift ENTER / rapid click sessizce yutulur.
      const nowForDup = Date.now();
      if (isDuplicateDm(userId, text, nowForDup)) {
        return; // sessiz no-op, kullanıcı hata görmez
      }
      userLastDm.set(userId, { text, at: nowForDup });

      try {
        // Arkadaşlık kontrolü
        const friends = await checkFriendship(userId, recipientId);
        if (!friends) {
          return send(ws, { type: 'dm:error', message: 'Bu kullanıcıyla arkadaş değilsin' });
        }

        const convKey = makeDmKey(userId, recipientId);
        const [userA, userB] = userId < recipientId ? [userId, recipientId] : [recipientId, userId];
        const now = Date.now();
        const msgId = generateId();

        // Conversation yoksa oluştur — created audit'i için rowCount bak.
        const createRes = dmStmt.createConversation.run(convKey, userA, userB, now);
        const conversationCreated = createRes && createRes.changes > 0;

        // Mesajı kaydet
        dmStmt.insertMessage.run(msgId, convKey, userId, recipientId, text, now);

        // Son mesajı güncelle
        const preview = text.length > 100 ? text.slice(0, 100) + '…' : text;
        dmStmt.updateLastMessage.run(preview, now, convKey);

        // Recipient online ise anında delivered_at işaretle — sender çift gri tik görür.
        // Offline ise null kalır; recipient reconnect'te auth handler'da batch flush eder.
        const recipientOnline = userConnections.has(recipientId);
        const deliveredAt = recipientOnline ? now : null;
        if (recipientOnline) {
          dmStmt.markDelivered.run(deliveredAt, msgId, recipientId);
        }

        const newMsg = {
          id: msgId,
          conversationKey: convKey,
          senderId: userId,
          senderName: userName,
          senderAvatar: userAvatar,
          recipientId,
          text,
          createdAt: now,
          deliveredAt,
          readAt: null,
        };

        // Gönderene teslim (deliveredAt payload'da — UI anında çift gri gösterir)
        sendToUser(userId, { type: 'dm:new_message', message: newMsg });

        // Alıcıya teslim
        sendToUser(recipientId, { type: 'dm:new_message', message: newMsg });

        console.log(`[dm] ${userName} → ${recipientId}: ${text.slice(0, 40)}`);

        // Audit — fire-and-forget, metadata-only, message body ASLA yazılmaz.
        if (conversationCreated) {
          void auditDm({
            actorId: userId,
            action: 'dm.conversation.create',
            resourceType: 'dm_conversation',
            resourceId: convKey,
            metadata: { recipientId, createdAt: now },
          });
        }
        void auditDm({
          actorId: userId,
          action: 'dm.message.send',
          resourceType: 'dm_message',
          resourceId: msgId,
          metadata: {
            conversationKey: convKey,
            recipientId,
            textLength: text.length,
            conversationCreated: !!conversationCreated,
          },
        });
      } catch (err) {
        console.error('[dm] send error:', err?.message);
        send(ws, { type: 'dm:error', message: 'Mesaj gönderilemedi' });
      }
      return;
    }

    // ── DM:TYPING (ephemeral, no persistence, no audit) ──────────────────
    if (msg.type === 'dm:typing') {
      const recipientId = String(msg.recipientId || '').trim();
      if (!recipientId || recipientId === userId) return;

      // Lightweight rate limit — client zaten debounce ediyor (tipik 2.5s).
      // 5 event / 10 sn üst sınırı burst koruması.
      if (!userTypingLimits) return; // defensive (init order)
      if (checkRateLimit(userTypingLimits, userId, 5, 10_000)) return; // sessiz drop

      // Friendship gate — stalker typing spam önlensin.
      // Typing-only 8s cache: yüksek trafikte DB'yi yormaz; send/open hâlâ sağlam DB check yapar.
      const friends = await checkFriendshipForTyping(userId, recipientId);
      if (!friends) return;

      const convKey = makeDmKey(userId, recipientId);
      sendToUser(recipientId, {
        type: 'dm:typing',
        conversationKey: convKey,
        fromUserId: userId,
      });
      return;
    }

    // ── DM:MARK_READ ─────────────────────────────────────────────────────
    if (msg.type === 'dm:mark_read') {
      const convKey = String(msg.conversationKey || '').trim();
      if (!convKey) return;

      // Membership invariant: convKey canonical format + userId pair'de olmalı.
      // Bozuk/spoofed key → sessiz no-op (fail-closed).
      const parts = convKey.split(':');
      if (parts.length !== 3 || parts[0] !== 'dm' || !parts[1] || !parts[2]) return;
      if (parts[1] >= parts[2] || parts[1] === parts[2]) return; // canonical order zorunlu
      const otherId = parts[1] === userId ? parts[2] : (parts[2] === userId ? parts[1] : null);
      if (!otherId) return; // user convKey'de değil → spoof reddi

      try {
        const now = Date.now();
        // SQL receiver_id = userId koşulu ikinci savunma katmanı.
        const changes = dmStmt.markRead.run(now, convKey, userId);
        if (changes.changes === 0) return; // hiç güncelleme olmadıysa bildirim gönderme

        sendToUser(otherId, {
          type: 'dm:read',
          conversationKey: convKey,
          readBy: userId,
          readAt: now,
        });
      } catch (err) {
        console.error('[dm] mark_read error:', err?.message);
      }
      return;
    }

    // ── DM:UNREAD_TOTAL ──────────────────────────────────────────────────
    if (msg.type === 'dm:unread_total') {
      try {
        const rows = dmStmt.getUnreadBySender.all(userId);
        // Sadece aktif arkadaşlardan gelen okunmamış mesajları say
        const friendIds = await getFriendIds(userId);
        let count = 0;
        for (const row of rows) {
          if (friendIds.has(row.sender_id)) count += row.count;
        }
        send(ws, { type: 'dm:unread_total', count });
      } catch {
        send(ws, { type: 'dm:unread_total', count: 0 });
      }
      return;
    }

    // ── DM:HIDE_CONVERSATION ─────────────────────────────────────────────
    if (msg.type === 'dm:hide_conversation') {
      const convKey = String(msg.conversationKey || '').trim();
      if (!convKey) return;
      try {
        dmStmt.hideConversation.run(userId, convKey, Date.now());
        send(ws, { type: 'dm:conversation_hidden', conversationKey: convKey });
      } catch (err) {
        console.error('[dm] hide_conversation error:', err?.message);
      }
      return;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);

    if (userId) unregisterUserConnection(userId, ws);

    // Presence: ungraceful disconnect (network drop, kill, missed pong).
    // Graceful path'te bye handler ws.presenceUserId'yi null'ladı; burada tekrar
    // çağrılmaz. Aksi halde bu son-şans noktası last_seen'i düzgün yazar.
    if (ws.presenceUserId && ws.presenceSessionKey) {
      presence.handleDisconnect(ws.presenceUserId, ws.presenceSessionKey, 'close')
        .catch(err => console.warn('[presence] close err:', err && err.message));
    }

    if (currentRoom) {
      const oldRoom = currentRoom;
      currentRoom = null;

      const becameEmpty = leaveRoom(ws, oldRoom);
      if (becameEmpty) {
        scheduleCleanup(oldRoom);
      }
    }
  });
});

// ── Heartbeat + rate limit cleanup ───────────────────────────────────────
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
    // Presence backward-compat: eski client'lar presence:ping göndermez
    // ama WS protokol-pong geliyorsa bağlantı alive demektir → presence'ı touch.
    // 30s < 45s STALE_THRESHOLD olduğu için cleanup asla vurmaz.
    if (ws.presenceUserId && ws.presenceSessionKey) {
      presence.handleHeartbeat(ws.presenceUserId, ws.presenceSessionKey)
        .catch(err => console.warn('[presence] ws-hb touch err:', err && err.message));
    }
  });
  // Stale rate limit entry'leri temizle
  const now = Date.now();
  floodControl.sweep(now);
  for (const [k, v] of userJoinLimits) { if (now > v.resetAt) userJoinLimits.delete(k); }
  for (const [k, v] of userTypingLimits) { if (now > v.resetAt) userTypingLimits.delete(k); }
  // Flood config cache TTL cleanup
  for (const [k, v] of floodConfigCache) { if (now > v.expiresAt) floodConfigCache.delete(k); }
  // Spam guard history cleanup (60s window)
  spamGuard.sweep(now);
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ── Start ─────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[chat-server] :${PORT} hazır (WebSocket v3)`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`[chat-server] ${signal} alındı, kapatılıyor...`);
  clearInterval(heartbeat);
  wss.clients.forEach((ws) => {
    try { ws.close(1001, 'Server shutting down'); } catch {}
  });
  wss.close(() => {
    try { dmDb.close(); } catch {}
    console.log('[chat-server] SQLite kapatıldı');
    httpServer.close(() => {
      console.log('[chat-server] HTTP kapatıldı');
      process.exit(0);
    });
  });
  setTimeout(() => { process.exit(1); }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));