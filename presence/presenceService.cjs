/**
 * PresenceService — store-agnostic business logic.
 *
 * Schema: user_sessions primary key = session_key (text). Her WS = 1 row.
 *
 * Timestamp disiplini:
 *   - Tüm timestamp'ler chat-server Node process'inden gelir (Hetzner server).
 *   - Client'tan gelen "time" alanları DB'ye ASLA yazılmaz.
 *   - last_seen_at yalnızca SON session kapanınca yazılır.
 */

const HEARTBEAT_DB_THROTTLE_MS = 30_000; // DB'ye last_heartbeat_at yazım sıklığı
const STALE_THRESHOLD_MS = 45_000;        // Memory store için: bu süreyi aşan session stale
const CLEANUP_INTERVAL_MS = 15_000;       // Memory store cleanup scan sıklığı

function createPresenceService({ store, supabase, broadcastFn, log = console }) {
  // sessionKey -> lastDbWriteMs (heartbeat DB throttle için)
  const dbWriteThrottle = new Map();

  async function handleConnect(userId, sessionKey, meta) {
    const nowIso = new Date().toISOString(); // Node server time = Hetzner saati

    // 1) DB: session row oluştur (session_key PK, çakışma olmaz — ilk connect'te INSERT)
    const { error: insertErr } = await supabase
      .from('user_sessions')
      .insert({
        session_key: sessionKey,
        user_id: userId,
        device_id: meta.deviceId,
        platform: meta.platform,
        app_version: meta.appVersion || null,
        connected_at: nowIso,
        last_heartbeat_at: nowIso,
        disconnected_at: null,
        disconnect_reason: null,
      });

    if (insertErr) {
      log.warn('[presence] insert session failed:', insertErr.message);
      // DB başarısız olsa bile in-memory devam etsin — UI bozulmasın.
    }

    // 2) Store'a ekle
    const { wasOffline } = await store.addSession(userId, sessionKey, {
      deviceId: meta.deviceId,
      platform: meta.platform,
    });

    // 3) İlk session'sa online broadcast
    if (wasOffline) {
      broadcastPresenceChange(userId, { online: true, lastSeenAt: null });
    }
  }

  async function handleHeartbeat(userId, sessionKey) {
    await store.touchSession(userId, sessionKey);

    // DB'ye last_heartbeat_at yazımı throttled (30s'de bir)
    const lastWrite = dbWriteThrottle.get(sessionKey) || 0;
    const now = Date.now();
    if (now - lastWrite >= HEARTBEAT_DB_THROTTLE_MS) {
      dbWriteThrottle.set(sessionKey, now);
      // Fire-and-forget — hot path'i blocklamayalım
      supabase
        .from('user_sessions')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('session_key', sessionKey)
        .is('disconnected_at', null)
        .then(({ error }) => {
          if (error) log.warn('[presence] hb db write failed:', error.message);
        });
    }
  }

  async function handleDisconnect(userId, sessionKey, reason = 'close') {
    const { remaining } = await store.removeSession(userId, sessionKey);
    dbWriteThrottle.delete(sessionKey);

    const disconnectIso = new Date().toISOString();

    // DB: sadece hala açık olan satırı kapat (idempotent)
    const { error: closeErr } = await supabase
      .from('user_sessions')
      .update({
        disconnected_at: disconnectIso,
        disconnect_reason: reason,
      })
      .eq('session_key', sessionKey)
      .is('disconnected_at', null);

    if (closeErr) log.warn('[presence] close session failed:', closeErr.message);

    // Son session kapandıysa profiles.last_seen_at yaz + broadcast
    if (remaining === 0) {
      const lastSeenIso = new Date().toISOString();
      const { error: lsErr } = await supabase
        .from('profiles')
        .update({ last_seen_at: lastSeenIso })
        .eq('id', userId);

      if (lsErr) log.warn('[presence] last_seen update failed:', lsErr.message);

      broadcastPresenceChange(userId, { online: false, lastSeenAt: lastSeenIso });
    }
  }

  function broadcastPresenceChange(userId, { online, lastSeenAt }) {
    try {
      const user = {
        userId,
        online,
        lastSeenAt,
        ...(online === false ? {
          statusText: 'Çevrimdışı',
          selfMuted: false,
          selfDeafened: false,
          autoStatus: null,
          currentRoom: null,
          gameActivity: null,
        } : {}),
      };
      broadcastFn({
        type: 'presence:update',
        user,
        serverNow: new Date().toISOString(),
      });
    } catch (err) {
      log.warn('[presence] broadcast failed:', err && err.message);
    }
  }

  /**
   * Memory store için stale watcher — WS ping/pong 30s'lik terminate'inin
   * hukuk dışı durumlarda da tetiklenmesi için sigorta.
   */
  function startCleanupLoop() {
    const timer = setInterval(async () => {
      try {
        const stale = await store.cleanupStale(STALE_THRESHOLD_MS);
        for (const { userId, sessionKey } of stale) {
          await handleDisconnect(userId, sessionKey, 'stale');
        }
      } catch (err) {
        log.warn('[presence] cleanup loop error:', err && err.message);
      }
    }, CLEANUP_INTERVAL_MS);

    // Redis store için keyspace notifications (phase 2)
    if (typeof store.onExpiredSession === 'function') {
      store.onExpiredSession(async ({ userId, sessionKey }) => {
        await handleDisconnect(userId, sessionKey, 'expired');
      });
    }

    return () => clearInterval(timer);
  }

  /**
   * Boot-time temizlik: chat-server ölürse DB'de hala "aktif" görünen
   * session'ları kapat. Bu hem cold boot'ta hem migration'dan sonra idempotent.
   */
  async function bootCleanup() {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('user_sessions')
      .update({
        disconnected_at: nowIso,
        disconnect_reason: 'server_boot',
      })
      .is('disconnected_at', null);
    if (error) log.warn('[presence] boot cleanup failed:', error.message);
    else log.log && log.log('[presence] boot cleanup OK');
  }

  return {
    handleConnect,
    handleHeartbeat,
    handleDisconnect,
    broadcastPresenceChange,
    startCleanupLoop,
    bootCleanup,
  };
}

module.exports = { createPresenceService };
