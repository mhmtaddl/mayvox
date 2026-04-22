/**
 * MAYVOX Flood Control — per-user sliding window.
 *
 * - Spam (içerik) filtresinden ayrı; burada ana hedef gönderim FREKANSI.
 * - In-memory; restart = reset (kabul edilen tradeoff).
 * - DB/IO yok; her check O(windowLen) — tipik < 10 timestamp.
 * - Multi-kind: 'room_chat', 'dm' vb. her biri kendi config'i.
 * - Kademeli ceza iskeleti: offenseCount + cooldownUntil tutuluyor;
 *   şu an sabit cooldown — ilerde offense sayısına göre eskale edilebilir.
 */

/**
 * @typedef {Object} FloodKindConfig
 * @property {number} limit         Window içinde izin verilen max event
 * @property {number} windowMs      Sliding window uzunluğu (ms)
 * @property {number} cooldownMs    Window doldurulunca kısa kilit süresi
 * @property {number} offenseDecayMs Offense sayacının sıfırlandığı idle süre
 */

/** @type {Record<string, FloodKindConfig>} */
const DEFAULTS = {
  // Kullanıcı istediği örnek mantık: 5 msg / 5s.
  room_chat: { limit: 5, windowMs: 5_000, cooldownMs: 3_000, offenseDecayMs: 60_000 },
  // DM mevcut davranışa yakın; sliding window ile boundary kaçağı kapalı.
  dm:        { limit: 8, windowMs: 10_000, cooldownMs: 5_000, offenseDecayMs: 60_000 },
};

/**
 * @typedef {Object} CheckResult
 * @property {boolean} allowed
 * @property {'flood_window'|'flood_cooldown'|null} reason
 * @property {number} retryAfterMs  Mesaj kabul edileceği en erken bekleme süresi
 * @property {number} offenseCount  Bu kullanıcı + kind için güncel ihlal sayısı
 */

/**
 * @param {Partial<Record<string, Partial<FloodKindConfig>>>} [overrides]
 */
function createFloodControl(overrides = {}) {
  // kind -> (userId -> bucket)
  /** @type {Map<string, Map<string, { times: number[], cooldownUntil: number, offenseCount: number, lastOffenseAt: number }>>} */
  const state = new Map();

  /** @type {Record<string, FloodKindConfig>} */
  const config = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    config[k] = { ...v, ...(overrides[k] || {}) };
  }

  function getBucket(kind, userId) {
    let perKind = state.get(kind);
    if (!perKind) {
      perKind = new Map();
      state.set(kind, perKind);
    }
    let entry = perKind.get(userId);
    if (!entry) {
      entry = { times: [], cooldownUntil: 0, offenseCount: 0, lastOffenseAt: 0 };
      perKind.set(userId, entry);
    }
    return entry;
  }

  /**
   * Event'i kabul et/reddet. Kabul edilirse timestamp bucket'a yazılır (yan etki).
   * @param {string} kind
   * @param {string} userId
   * @param {number} [now]
   * @returns {CheckResult}
   */
  function check(kind, userId, now = Date.now()) {
    const cfg = config[kind];
    if (!cfg || !userId) {
      // Bilinmeyen kind veya userId yoksa fail-open — flood kontrolü auth sonrası çalışır.
      return { allowed: true, reason: null, retryAfterMs: 0, offenseCount: 0 };
    }
    const bucket = getBucket(kind, userId);

    // Uzun sessizlikten sonra offense sayacını sıfırla (kademeli ceza reset).
    if (bucket.lastOffenseAt && now - bucket.lastOffenseAt > cfg.offenseDecayMs) {
      bucket.offenseCount = 0;
    }

    // Aktif cooldown içindeysek kısa-devre reddet.
    if (bucket.cooldownUntil > now) {
      return {
        allowed: false,
        reason: 'flood_cooldown',
        retryAfterMs: bucket.cooldownUntil - now,
        offenseCount: bucket.offenseCount,
      };
    }

    // Window trim — sıralı array, baştaki eski entry'ler atılır.
    const cutoff = now - cfg.windowMs;
    const times = bucket.times;
    let drop = 0;
    while (drop < times.length && times[drop] <= cutoff) drop++;
    if (drop > 0) times.splice(0, drop);

    if (times.length >= cfg.limit) {
      // İhlal → cooldown aç + offense++.
      bucket.offenseCount += 1;
      bucket.lastOffenseAt = now;
      bucket.cooldownUntil = now + cfg.cooldownMs;
      return {
        allowed: false,
        reason: 'flood_window',
        retryAfterMs: cfg.cooldownMs,
        offenseCount: bucket.offenseCount,
      };
    }

    times.push(now);
    return { allowed: true, reason: null, retryAfterMs: 0, offenseCount: bucket.offenseCount };
  }

  /**
   * Memory sweep — heartbeat loop'tan çağır. Idle user bucket'larını siler.
   * @param {number} [now]
   */
  function sweep(now = Date.now()) {
    for (const [kind, perKind] of state) {
      const cfg = config[kind];
      if (!cfg) { state.delete(kind); continue; }
      const maxIdle = Math.max(cfg.windowMs, cfg.cooldownMs, cfg.offenseDecayMs);
      for (const [userId, entry] of perKind) {
        const lastActivity = Math.max(
          entry.times.length > 0 ? entry.times[entry.times.length - 1] : 0,
          entry.cooldownUntil,
          entry.lastOffenseAt,
        );
        if (now - lastActivity > maxIdle) perKind.delete(userId);
      }
      if (perKind.size === 0) state.delete(kind);
    }
  }

  function getConfig() { return config; }

  return { check, sweep, getConfig };
}

module.exports = { createFloodControl };
