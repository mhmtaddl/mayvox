/**
 * PigeVox WebSocket Chat Server
 * - Supabase JWT auth
 * - Room-based messaging
 * - Supabase Postgres persistence
 * - Reconnect-safe
 */

const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const crypto = require('crypto');

if (!process.env.ELECTRON_IS_PACKAGED) {
  try { require('dotenv').config(); } catch {}
}

// ── Config ──
const PORT = process.env.CHAT_PORT || 10001;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[chat-server] SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli!');
  process.exit(1);
}

// Service role client — DB işlemleri için
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// Anon client — token doğrulama için (getUser anon key ile çalışır)
const supabaseAuth = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : supabase;

// ── State ──
const rooms = new Map(); // roomId → Set<ws>
const wsUserMap = new WeakMap(); // ws → { userId, userName, userAvatar }

// ── HTTP server (health check) ──
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: [...rooms.values()].reduce((s, r) => s + r.size, 0) }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── WebSocket server ──
const wss = new WebSocketServer({ server: httpServer, maxPayload: 8 * 1024 }); // max 8KB message

wss.on('connection', async (ws, req) => {
  let authenticated = false;
  let userId = null;
  let userName = null;
  let userAvatar = null;
  let currentRoom = null;

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Auth timeout — 5sn içinde auth olmazsa kapat
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, 5000);

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Geçersiz JSON' });
    }

    // Rate limit — basit: her ws'ye 20 mesaj/sn
    if (!ws._msgCount) ws._msgCount = 0;
    if (!ws._msgReset) ws._msgReset = Date.now();
    ws._msgCount++;
    if (Date.now() - ws._msgReset > 1000) { ws._msgCount = 1; ws._msgReset = Date.now(); }
    if (ws._msgCount > 20) return send(ws, { type: 'error', message: 'Çok hızlı gönderiyorsun' });

    // ── AUTH ──
    if (msg.type === 'auth') {
      if (authenticated) return;
      try {
        console.log('[chat] Auth denemesi, token:', msg.token?.slice(0, 20) + '...');
        const { data: { user }, error } = await supabaseAuth.auth.getUser(msg.token);
        console.log('[chat] getUser sonuç:', error ? `HATA: ${error.message}` : `OK: ${user?.id}`);
        if (error || !user) throw new Error(error?.message || 'Geçersiz token');

        // Profil bilgilerini al
        const { data: profile } = await supabase.from('profiles').select('name, first_name, last_name, avatar').eq('id', user.id).single();

        userId = user.id;
        userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.name : user.email;
        userAvatar = profile?.avatar || '';
        authenticated = true;
        clearTimeout(authTimeout);

        wsUserMap.set(ws, { userId, userName, userAvatar });
        send(ws, { type: 'auth_ok', userId, userName });
      } catch (err) {
        send(ws, { type: 'auth_error', message: err.message });
        ws.close(4002, 'Auth failed');
      }
      return;
    }

    // Auth kontrolü
    if (!authenticated) return send(ws, { type: 'error', message: 'Auth gerekli' });

    // ── JOIN ROOM ──
    if (msg.type === 'join') {
      const roomId = msg.roomId;
      if (!roomId || typeof roomId !== 'string') return;

      // Eski odadan çık
      if (currentRoom) leaveRoom(ws, currentRoom);

      // Yeni odaya katıl
      currentRoom = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);

      // Son mesajları gönder
      try {
        const { data: messages } = await supabase
          .from('room_messages')
          .select('*')
          .eq('channel_id', roomId)
          .order('created_at', { ascending: true })
          .limit(200);

        send(ws, { type: 'history', roomId, messages: (messages || []).map(formatMsg) });
      } catch (err) {
        send(ws, { type: 'history', roomId, messages: [] });
      }

      console.log(`[chat] ${userName} → ${roomId} (${rooms.get(roomId).size} kişi)`);
      return;
    }

    // ── SEND MESSAGE ──
    if (msg.type === 'send') {
      if (!currentRoom) return send(ws, { type: 'error', message: 'Odada değilsin' });
      const text = (msg.text || '').trim();
      if (!text || text.length > 2000) return;

      try {
        const { data, error } = await supabase.from('room_messages').insert({
          channel_id: currentRoom,
          sender_id: userId,
          sender_name: userName,
          sender_avatar: userAvatar,
          text,
        }).select().single();

        if (error) throw error;

        // Odadaki herkese broadcast
        broadcastToRoom(currentRoom, { type: 'message', message: formatMsg(data) });
      } catch (err) {
        send(ws, { type: 'error', message: 'Mesaj gönderilemedi' });
      }
      return;
    }

    // ── DELETE MESSAGE ──
    if (msg.type === 'delete') {
      if (!currentRoom || !msg.messageId) return;
      try {
        await supabase.from('room_messages').delete().eq('id', msg.messageId);
        broadcastToRoom(currentRoom, { type: 'delete', messageId: msg.messageId });
      } catch {}
      return;
    }

    // ── EDIT MESSAGE ──
    if (msg.type === 'edit') {
      if (!currentRoom || !msg.messageId || !msg.text) return;
      const text = msg.text.trim();
      if (!text || text.length > 2000) return;
      try {
        await supabase.from('room_messages').update({ text }).eq('id', msg.messageId);
        broadcastToRoom(currentRoom, { type: 'edit', messageId: msg.messageId, text });
      } catch {}
      return;
    }

    // ── CLEAR ALL (admin/mod) ──
    if (msg.type === 'clear') {
      if (!currentRoom) return;
      try {
        await supabase.from('room_messages').delete().eq('channel_id', currentRoom);
        broadcastToRoom(currentRoom, { type: 'clear', roomId: currentRoom });
      } catch {}
      return;
    }

    // ── LEAVE ──
    if (msg.type === 'leave') {
      if (currentRoom) {
        leaveRoom(ws, currentRoom);
        currentRoom = null;
      }
      return;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (currentRoom) {
      leaveRoom(ws, currentRoom);
      // 5 dk sonra oda boşsa mesajları temizle
      scheduleCleanup(currentRoom);
    }
  });
});

// ── Helpers ──
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastToRoom(roomId, data) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function leaveRoom(ws, roomId) {
  const clients = rooms.get(roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(roomId);
  }
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

// ── 5 dk cleanup ──
const cleanupTimers = new Map();
function scheduleCleanup(roomId) {
  if (cleanupTimers.has(roomId)) clearTimeout(cleanupTimers.get(roomId));
  cleanupTimers.set(roomId, setTimeout(async () => {
    cleanupTimers.delete(roomId);
    const clients = rooms.get(roomId);
    if (clients && clients.size > 0) return; // Hâlâ biri var
    try {
      await supabase.from('room_messages').delete().eq('channel_id', roomId);
      console.log(`[chat] Oda ${roomId} mesajları temizlendi (5dk boş)`);
    } catch (err) {
      console.warn(`[chat] Cleanup hatası:`, err.message);
    }
  }, 5 * 60 * 1000));
}

// ── Heartbeat — 30sn ──
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ── Start ──
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[chat-server] :${PORT} hazır (WebSocket)`);
});
