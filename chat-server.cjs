/**
 * PigeVox WebSocket Chat Server v2
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

// ── Config ──
const PORT = process.env.CHAT_PORT || 10001;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[chat-server] SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseAuth = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : supabase;

// ── State ──
const rooms = new Map();       // roomId → Set<ws>
const cleanupTimers = new Map(); // roomId → timeout

// ── HTTP health check ──
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const conns = [...rooms.values()].reduce((s, r) => s + r.size, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: conns }));
    return;
  }
  res.writeHead(404); res.end();
});

// ── WebSocket ──
const wss = new WebSocketServer({ server: httpServer, maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  let authenticated = false;
  let userId = null;
  let userName = null;
  let userAvatar = null;
  let currentRoom = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const authTimeout = setTimeout(() => {
    if (!authenticated) ws.close(4001, 'Auth timeout');
  }, 5000);

  // Rate limit state
  let msgCount = 0;
  let msgReset = Date.now();

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Geçersiz JSON' }); }

    // Rate limit
    msgCount++;
    if (Date.now() - msgReset > 1000) { msgCount = 1; msgReset = Date.now(); }
    if (msgCount > 20) return send(ws, { type: 'error', message: 'Çok hızlı' });

    // ────────────────── AUTH ──────────────────
    if (msg.type === 'auth') {
      if (authenticated) return;
      try {
        const { data: { user }, error } = await supabaseAuth.auth.getUser(msg.token);
        if (error || !user) throw new Error(error?.message || 'Geçersiz token');

        // ★ Profil: tüm kolonlar (select * ile)
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        console.log('[chat] Profil sorgu:', profileErr ? `HATA: ${profileErr.message}` : 'OK');
        console.log('[chat] Profil data:', profile ? JSON.stringify({ name: profile.name, first_name: profile.first_name, last_name: profile.last_name, avatar: profile.avatar?.slice(0, 30) }) : 'NULL');

        userId = user.id;

        // ★ İsim: first_name + last_name > name > email
        const fn = profile?.first_name || '';
        const ln = profile?.last_name || '';
        const fullName = `${fn} ${ln}`.trim();
        userName = fullName || profile?.name || user.email;

        // ★ Avatar
        userAvatar = profile?.avatar || '';

        authenticated = true;
        clearTimeout(authTimeout);

        console.log(`[chat] Auth OK: ${userName} (${userId}) avatar: ${userAvatar ? userAvatar.slice(0, 30) + '...' : 'yok'}`);
        send(ws, { type: 'auth_ok', userId, userName });
      } catch (err) {
        console.log(`[chat] Auth HATA: ${err.message}`);
        send(ws, { type: 'auth_error', message: err.message });
        ws.close(4002, 'Auth failed');
      }
      return;
    }

    if (!authenticated) return send(ws, { type: 'error', message: 'Auth gerekli' });

    // ────────────────── JOIN ROOM ──────────────────
    if (msg.type === 'join') {
      const roomId = msg.roomId;
      if (!roomId || typeof roomId !== 'string') return;

      // Eski odadan çık (ama mesajlar DB'de kalır)
      if (currentRoom) leaveRoom(ws, currentRoom);

      // ★ Cleanup timer varsa iptal et — biri geri geldi
      if (cleanupTimers.has(roomId)) {
        clearTimeout(cleanupTimers.get(roomId));
        cleanupTimers.delete(roomId);
        console.log(`[chat] Cleanup iptal: ${roomId} (biri geri geldi)`);
      }

      currentRoom = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);

      // ★ O odanın geçmiş mesajlarını DB'den yükle
      try {
        const { data: messages } = await supabase
          .from('room_messages')
          .select('*')
          .eq('channel_id', roomId)
          .order('created_at', { ascending: true })
          .limit(200);

        send(ws, { type: 'history', roomId, messages: (messages || []).map(formatMsg) });
      } catch {
        send(ws, { type: 'history', roomId, messages: [] });
      }

      console.log(`[chat] ${userName} → ${roomId} (${rooms.get(roomId).size} kişi)`);
      return;
    }

    // ────────────────── SEND MESSAGE ──────────────────
    if (msg.type === 'send') {
      if (!currentRoom) return send(ws, { type: 'error', message: 'Odada değilsin' });
      const text = (msg.text || '').trim();
      if (!text || text.length > 2000) return;

      try {
        // ★ DB'ye kaydet — avatar dahil
        const { data, error } = await supabase.from('room_messages').insert({
          channel_id: currentRoom,
          sender_id: userId,
          sender_name: userName,
          sender_avatar: userAvatar,
          text,
        }).select().single();

        if (error) throw error;

        // ★ Odadaki herkese broadcast — frontend formatında
        broadcastToRoom(currentRoom, { type: 'message', message: formatMsg(data) });
      } catch (err) {
        console.warn('[chat] Mesaj kayıt hatası:', err.message);
        send(ws, { type: 'error', message: 'Mesaj gönderilemedi' });
      }
      return;
    }

    // ────────────────── DELETE ──────────────────
    if (msg.type === 'delete') {
      if (!currentRoom || !msg.messageId) return;
      try {
        await supabase.from('room_messages').delete().eq('id', msg.messageId);
        broadcastToRoom(currentRoom, { type: 'delete', messageId: msg.messageId });
      } catch {}
      return;
    }

    // ────────────────── EDIT ──────────────────
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

    // ────────────────── CLEAR ALL ──────────────────
    if (msg.type === 'clear') {
      if (!currentRoom) return;
      try {
        await supabase.from('room_messages').delete().eq('channel_id', currentRoom);
        broadcastToRoom(currentRoom, { type: 'clear', roomId: currentRoom });
        console.log(`[chat] ${userName} tüm mesajları sildi: ${currentRoom}`);
      } catch {}
      return;
    }

    // ────────────────── LEAVE ──────────────────
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
      // ★ Oda boşaldıysa 5dk cleanup başlat
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
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

function leaveRoom(ws, roomId) {
  const clients = rooms.get(roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(roomId);
  }
}

// ★ Frontend'in beklediği mesaj formatı
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

// ★ 5 dakika boş oda cleanup
function scheduleCleanup(roomId) {
  // Odada hâlâ biri varsa cleanup yapma
  const clients = rooms.get(roomId);
  if (clients && clients.size > 0) return;

  // Zaten timer varsa tekrar kurma
  if (cleanupTimers.has(roomId)) return;

  console.log(`[chat] Cleanup timer başladı: ${roomId} (5dk)`);

  cleanupTimers.set(roomId, setTimeout(async () => {
    cleanupTimers.delete(roomId);

    // Son kontrol — biri geri gelmiş mi?
    const check = rooms.get(roomId);
    if (check && check.size > 0) {
      console.log(`[chat] Cleanup iptal: ${roomId} (biri var)`);
      return;
    }

    try {
      const { count } = await supabase
        .from('room_messages')
        .delete()
        .eq('channel_id', roomId);
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
  console.log(`[chat-server] :${PORT} hazır (WebSocket v2)`);
});
