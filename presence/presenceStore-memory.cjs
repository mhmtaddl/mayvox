/**
 * PresenceStore — in-memory implementation (Phase 1).
 * Tek Node process'te çalışır. Multi-instance'a geçince Phase 2: Redis.
 *
 * Interface (presenceService tarafından beklenir):
 *   addSession(userId, sessionKey, meta) -> Promise<{ wasOffline: boolean }>
 *   removeSession(userId, sessionKey)    -> Promise<{ remaining: number }>
 *   touchSession(userId, sessionKey)     -> Promise<void>
 *   getOnlineCount(userId)               -> Promise<number>
 *   isOnline(userId)                     -> Promise<boolean>
 *   cleanupStale(thresholdMs)            -> Promise<Array<{userId, sessionKey}>>
 */

// user_id -> Map<sessionKey, { lastTouchMs, meta }>
const userSessions = new Map();

async function addSession(userId, sessionKey, meta = {}) {
  let sessions = userSessions.get(userId);
  const wasOffline = !sessions || sessions.size === 0;
  if (!sessions) {
    sessions = new Map();
    userSessions.set(userId, sessions);
  }
  sessions.set(sessionKey, { lastTouchMs: Date.now(), meta });
  return { wasOffline };
}

async function removeSession(userId, sessionKey) {
  const sessions = userSessions.get(userId);
  if (!sessions) return { remaining: 0 };
  sessions.delete(sessionKey);
  const remaining = sessions.size;
  if (remaining === 0) userSessions.delete(userId);
  return { remaining };
}

async function touchSession(userId, sessionKey) {
  const sessions = userSessions.get(userId);
  if (!sessions) return;
  const entry = sessions.get(sessionKey);
  if (entry) entry.lastTouchMs = Date.now();
}

async function getOnlineCount(userId) {
  const sessions = userSessions.get(userId);
  return sessions ? sessions.size : 0;
}

async function isOnline(userId) {
  const sessions = userSessions.get(userId);
  return !!sessions && sessions.size > 0;
}

// Expiration scan: heartbeat'i thresholdMs'den uzun süre kaçıran session'ları döndür.
// WS ping/pong zaten 30s içinde ölü bağlantıyı terminate ediyor, ama sigorta niyetine.
async function cleanupStale(thresholdMs) {
  const now = Date.now();
  const expired = [];
  for (const [userId, sessions] of userSessions.entries()) {
    for (const [sessionKey, entry] of sessions.entries()) {
      if (now - entry.lastTouchMs > thresholdMs) {
        expired.push({ userId, sessionKey });
      }
    }
  }
  return expired;
}

module.exports = {
  addSession,
  removeSession,
  touchSession,
  getOnlineCount,
  isOnline,
  cleanupStale,
};
