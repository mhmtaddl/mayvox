/**
 * PigeVox WebSocket Chat Server v4
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
    read_at INTEGER DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_dm_msg_conv ON dm_messages(conversation_key, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_msg_receiver ON dm_messages(receiver_id, read_at);
  CREATE INDEX IF NOT EXISTS idx_dm_conv_user_a ON dm_conversations(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_dm_conv_user_b ON dm_conversations(user_b_id);
`);

console.log('[chat-server] SQLite DM DB hazır:', DM_DB_PATH);

// Prepared statements
const dmStmt = {
  getConversations: dmDb.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM dm_messages m
       WHERE m.conversation_key = c.conversation_key
       AND m.receiver_id = ? AND m.read_at IS NULL) as unread_count
    FROM dm_conversations c
    WHERE c.user_a_id = ? OR c.user_b_id = ?
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
  insertMessage: dmDb.prepare(`
    INSERT INTO dm_messages (id, conversation_key, sender_id, receiver_id, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  updateLastMessage: dmDb.prepare(`
    UPDATE dm_conversations
    SET last_message = ?, last_message_at = ?
    WHERE conversation_key = ?
  `),
  markRead: dmDb.prepare(`
    UPDATE dm_messages
    SET read_at = ?
    WHERE conversation_key = ? AND receiver_id = ? AND read_at IS NULL
  `),
  getUnreadCount: dmDb.prepare(`
    SELECT COUNT(*) as count FROM dm_messages
    WHERE receiver_id = ? AND read_at IS NULL
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
  for (const c of conns) {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  }
}

async function checkFriendship(userA, userB) {
  const [low, high] = userA < userB ? [userA, userB] : [userB, userA];
  const { data } = await supabase
    .from('friendships')
    .select('user_low_id')
    .eq('user_low_id', low)
    .eq('user_high_id', high)
    .maybeSingle();
  return !!data;
}

// ── State ─────────────────────────────────────────────────────────────────
const rooms = new Map();          // roomId -> Set<ws>
const cleanupTimers = new Map();  // roomId -> timeout

// ── HTTP health check ────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const conns = [...rooms.values()].reduce((sum, set) => sum + set.size, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: conns }));
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

        send(ws, {
          type: 'auth_ok',
          userId,
          userName,
        });

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

    // ── JOIN ROOM ─────────────────────────────────────────────────────────
    if (msg.type === 'join') {
      const roomId = String(msg.roomId || '').trim();
      if (!roomId) return;

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
      } catch {}
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
      } catch {}
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
      } catch {}
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
        const rows = dmStmt.getConversations.all(userId, userId, userId);
        // Her konuşma için karşı tarafın profil bilgisini çek
        const convos = [];
        for (const row of rows) {
          const otherId = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
          convos.push({
            conversationKey: row.conversation_key,
            recipientId: otherId,
            lastMessage: row.last_message,
            lastMessageAt: row.last_message_at,
            unreadCount: row.unread_count,
            createdAt: row.created_at,
          });
        }
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

        // Conversation yoksa oluştur
        const now = Date.now();
        dmStmt.createConversation.run(convKey, convKey.split(':')[1], convKey.split(':')[2], now);

        // Mesaj geçmişini yükle
        const messages = dmStmt.getMessages.all(convKey);

        // Okunmamış mesajları okundu işaretle
        dmStmt.markRead.run(now, convKey, userId);

        send(ws, {
          type: 'dm:history',
          conversationKey: convKey,
          recipientId,
          messages: messages.map(m => ({
            id: m.id,
            senderId: m.sender_id,
            text: m.text,
            createdAt: m.created_at,
            readAt: m.read_at,
          })),
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

      try {
        // Arkadaşlık kontrolü
        const friends = await checkFriendship(userId, recipientId);
        if (!friends) {
          return send(ws, { type: 'dm:error', message: 'Bu kullanıcıyla arkadaş değilsin' });
        }

        const convKey = makeDmKey(userId, recipientId);
        const now = Date.now();
        const msgId = generateId();

        // Conversation yoksa oluştur
        dmStmt.createConversation.run(convKey, convKey.split(':')[1], convKey.split(':')[2], now);

        // Mesajı kaydet
        dmStmt.insertMessage.run(msgId, convKey, userId, recipientId, text, now);

        // Son mesajı güncelle
        const preview = text.length > 100 ? text.slice(0, 100) + '…' : text;
        dmStmt.updateLastMessage.run(preview, now, convKey);

        const newMsg = {
          id: msgId,
          conversationKey: convKey,
          senderId: userId,
          senderName: userName,
          senderAvatar: userAvatar,
          recipientId,
          text,
          createdAt: now,
        };

        // Gönderene teslim
        sendToUser(userId, { type: 'dm:new_message', message: newMsg });

        // Alıcıya teslim
        sendToUser(recipientId, { type: 'dm:new_message', message: newMsg });

        console.log(`[dm] ${userName} → ${recipientId}: ${text.slice(0, 40)}`);
      } catch (err) {
        console.error('[dm] send error:', err?.message);
        send(ws, { type: 'dm:error', message: 'Mesaj gönderilemedi' });
      }
      return;
    }

    // ── DM:MARK_READ ─────────────────────────────────────────────────────
    if (msg.type === 'dm:mark_read') {
      const convKey = String(msg.conversationKey || '').trim();
      if (!convKey) return;

      try {
        const now = Date.now();
        dmStmt.markRead.run(now, convKey, userId);

        // Karşı tarafa bildir
        const parts = convKey.split(':');
        const otherId = parts[1] === userId ? parts[2] : parts[1];
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
        const row = dmStmt.getUnreadCount.get(userId);
        send(ws, { type: 'dm:unread_total', count: row?.count || 0 });
      } catch {
        send(ws, { type: 'dm:unread_total', count: 0 });
      }
      return;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);

    if (userId) unregisterUserConnection(userId, ws);

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

// ── Heartbeat ─────────────────────────────────────────────────────────────
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ── Start ─────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[chat-server] :${PORT} hazır (WebSocket v3)`);
});