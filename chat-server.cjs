/**
 * PigeVox WebSocket Chat Server v3
 * - Supabase JWT auth
 * - Room-based messaging with persistent history
 * - Avatar + display name from profiles
 * - 5 min empty room cleanup
 * - Reconnect-safe
 */

const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

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
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);

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