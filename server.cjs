const express = require('express');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const { rateLimit } = require('express-rate-limit');
if (!process.env.ELECTRON_IS_PACKAGED) {
  require('dotenv').config();
}

const app = express();
app.set('trust proxy', 1);

// ── CORS ───────────────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  'https://mayvox.com',
  'https://www.mayvox.com',
  'https://cylksohbet.org',
  'https://www.cylksohbet.org',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ORIGINS;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ── Rate limiting ──────────────────────────────────────────────────────────
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
});

const checkUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
});

const resetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen 10 dakika bekleyin.' },
});

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// ── Supabase helpers ──────────────────────────────────────────────────────
const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const createAnonClient = () => createClient(getSupabaseUrl(), getSupabaseAnonKey());
const createAdminClient = () => createClient(getSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Resend helpers ────────────────────────────────────────────────────────
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'MAYVOX <noreply@mayvox.com>';
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || 'support@mayvox.com';

async function sendResendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    const err = new Error('RESEND_API_KEY yapılandırılmamış');
    err.code = 'RESEND_NOT_CONFIGURED';
    throw err;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      reply_to: RESEND_REPLY_TO,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const err = new Error(`Resend API hatası: ${errText}`);
    err.responseText = errText;
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

// ── Auth helpers ──────────────────────────────────────────────────────────
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Yetkisiz istek: Authorization header eksik' });
    return null;
  }
  const { data: { user }, error } = await createAnonClient().auth.getUser(authHeader.split(' ')[1]);
  if (error || !user) {
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum' });
    return null;
  }
  return user;
}

async function verifyAdmin(req, res) {
  const user = await verifyAuth(req, res);
  if (!user) return null;
  const { data: profile } = await createAdminClient()
    .from('profiles').select('is_admin, is_primary_admin').eq('id', user.id).single();
  if (!profile?.is_admin && !profile?.is_primary_admin) {
    res.status(403).json({ error: 'Admin yetkisi gerekli' });
    return null;
  }
  return user;
}

// ── LiveKit Token ──────────────────────────────────────────────────────────
const LIVEKIT_URL = process.env.LIVEKIT_HOST || process.env.LIVEKIT_URL;
const roomService = LIVEKIT_URL
  ? new RoomServiceClient(LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
  : null;

// Backend access-check endpoint'i — token server tek başına karar vermez,
// kanal erişim kararı canonical olarak server-backend'de evaluate edilir.
const SERVER_BACKEND_URL = (process.env.SERVER_BACKEND_URL || 'http://127.0.0.1:4001').replace(/\/$/, '');

// Per-user token rate limit — auth sonrası userId bazlı sliding window.
// Normal reconnect + join davranışı sorunsuz, brute-force spam bloklanır.
// IP-based tokenLimiter'ın üstüne ikinci katman.
const USER_TOKEN_WINDOW_MS = 60_000;
const USER_TOKEN_MAX = 12;
const userTokenLimits = new Map(); // userId -> { count, resetAt }

function checkUserTokenLimit(userId) {
  const now = Date.now();
  let entry = userTokenLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + USER_TOKEN_WINDOW_MS };
    userTokenLimits.set(userId, entry);
  }
  entry.count += 1;
  return entry.count <= USER_TOKEN_MAX;
}

// Basit GC — expired entry'leri 5 dk'da bir temizle.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userTokenLimits) {
    if (now > v.resetAt) userTokenLimits.delete(k);
  }
}, 5 * 60_000).unref?.();

async function checkChannelAccess(serverId, channelId, authHeader) {
  const url = `${SERVER_BACKEND_URL}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/access/check`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    const data = await resp.json();
    return { ok: true, summary: data };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

app.post('/livekit-token', tokenLimiter, async (req, res) => {
  const user = await verifyAuth(req, res);
  if (!user) return;

  // Per-user rate limit — auth sonrası ikinci katman.
  if (!checkUserTokenLimit(user.id)) {
    console.warn(`[livekit-token] rate-limited user=${user.id}`);
    return res.status(429).json({ error: 'Çok fazla istek, biraz bekleyin.' });
  }

  const { roomName, serverId, channelId } = req.body || {};
  if (!roomName || typeof roomName !== 'string') {
    console.warn(`[livekit-token] malformed user=${user.id} reason=missing-roomName`);
    return res.status(400).json({ error: 'Kanal bilgisi geçersiz.' });
  }

  // Private channel enforcement — serverId + channelId zorunlu, fail closed.
  if (!serverId || typeof serverId !== 'string' || !channelId || typeof channelId !== 'string') {
    console.warn(`[livekit-token] malformed user=${user.id} reason=missing-ids roomName=${roomName}`);
    return res.status(400).json({ error: 'Kanal bilgisi geçersiz.' });
  }

  // Strict consistency: roomName canonical olarak channelId olmalı.
  if (roomName !== channelId) {
    console.warn(`[livekit-token] id-mismatch user=${user.id} server=${serverId} roomName=${roomName} channelId=${channelId}`);
    return res.status(400).json({ error: 'Kanal bilgisi geçersiz.' });
  }

  const authHeader = req.headers.authorization;
  const check = await checkChannelAccess(serverId, channelId, authHeader);
  if (!check.ok) {
    console.warn(`[livekit-token] access-check-failed user=${user.id} server=${serverId} channel=${channelId} status=${check.status || '-'} err=${check.error || '-'}`);
    return res.status(503).json({ error: 'Erişim doğrulanamadı, tekrar deneyin.' });
  }
  const summary = check.summary || {};
  if (!summary.canJoin) {
    const reason = summary.reason || 'unknown';
    console.warn(`[livekit-token] denied user=${user.id} server=${serverId} channel=${channelId} reason=${reason}`);
    let msg = 'Bu kanala erişim yetkin yok.';
    if (reason === 'invite-only') msg = 'Bu özel kanal yalnızca davetlilere açık.';
    else if (reason === 'not-member') msg = 'Bu sunucunun üyesi değilsin.';
    return res.status(403).json({ error: msg, reason });
  }

  // Tek-oda kuralı: kullanıcı başka bir odadaysa oradan çıkar
  if (roomService) try {
    const rooms = await roomService.listRooms();
    for (const room of rooms) {
      if (room.name === roomName) continue;
      const participants = await roomService.listParticipants(room.name);
      if (participants.some(p => p.identity === user.id)) {
        await roomService.removeParticipant(room.name, user.id);
      }
    }
  } catch (e) {
    console.warn(`[livekit-token] cleanup-failed user=${user.id} err=${e && e.message ? e.message : e}`);
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: user.id }
  );
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();
  res.json({ token });
});

// ── Kullanıcı arama ────────────────────────────────────────────────────────
app.post('/api/check-user', checkUserLimiter, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'identifier gerekli' });
  }
  const isEmail = identifier.includes('@');
  const { data } = isEmail
    ? await createAnonClient().from('profiles').select('id, name').eq('email', identifier.toLowerCase()).single()
    : await createAnonClient().from('profiles').select('id, name').eq('name', identifier).single();
  if (!data) return res.json({ exists: false });
  res.json({ exists: true, userId: data.id, name: data.name });
});

// ── Şifre sıfırlama isteği (self-service, direkt mail) ───────────────────
app.post('/api/request-password-reset', resetLimiter, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId gerekli' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'E-posta servisi yapılandırılmamış' });

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('profiles').select('name, email').eq('id', userId).single();
  if (!target?.email) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const tempPassword = generateTempPassword();

  try {
    await sendResendEmail({
      to: target.email,
      subject: 'MayVox — Geçici Parolanız',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">MayVox</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">mayvox.com</p><p>Merhaba <strong>${target.name}</strong>,</p><p>Şifre sıfırlama talebiniz alındı.</p><div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;"><p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Geçici Parola</p><span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${tempPassword}</span></div><p style="color:#94a3b8;font-size:13px;">Bu parola ile giriş yaptıktan sonra yeni bir parola belirlemeniz istenecektir.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen bizimle iletişime geçin.</p></div>`,
    });
  } catch (e) {
    console.error('[self-reset] E-posta gönderilemedi:', e.responseText || e.message);
    return res.status(500).json({ error: 'E-posta gönderilemedi, şifre değiştirilmedi.' });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (updateError) {
    console.error('[self-reset] Auth güncelleme hatası:', updateError.message);
    return res.status(500).json({ error: 'Şifre güncellenemedi, lütfen tekrar deneyin.' });
  }

  await admin.from('profiles').update({ must_change_password: true, password_reset_requested: false }).eq('id', userId);
  res.json({ success: true });
});

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 10; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// ── Admin: şifre sıfırla + e-posta ────────────────────────────────────────
app.post('/api/admin-reset-password', async (req, res) => {
  const user = await verifyAdmin(req, res);
  if (!user) return;

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId gerekli' });

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('profiles').select('name, email').eq('id', targetUserId).single();
  if (!target?.email) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const tempPassword = generateTempPassword();

  try {
    await sendResendEmail({
      to: target.email,
      subject: 'MayVox — Geçici Parolanız',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">MayVox</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">mayvox.com</p><p>Merhaba <strong>${target.name}</strong>,</p><p>Parolanız bir yönetici tarafından sıfırlandı.</p><div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;"><p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Geçici Parola</p><span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${tempPassword}</span></div><p style="color:#94a3b8;font-size:13px;">Giriş yaptıktan sonra yeni bir parola belirlemeniz istenecektir.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen yöneticinizle iletişime geçin.</p></div>`,
    });
  } catch (e) {
    console.error('[reset] E-posta gönderilemedi:', e.responseText || e.message);
    return res.status(500).json({ error: 'E-posta gönderilemedi, şifre değiştirilmedi.' });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
  if (updateError) {
    console.error('[reset] Auth güncelleme hatası:', updateError.message);
    return res.status(500).json({ error: 'Şifre güncellenemedi, lütfen tekrar deneyin.' });
  }

  await admin.from('profiles').update({ must_change_password: true, password_reset_requested: false }).eq('id', targetUserId);
  res.json({ success: true });
});

// ── Admin: sıfırlama reddet ───────────────────────────────────────────────
app.post('/api/dismiss-password-reset', async (req, res) => {
  const user = await verifyAdmin(req, res);
  if (!user) return;
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId gerekli' });
  await createAdminClient().from('profiles').update({ password_reset_requested: false }).eq('id', targetUserId);
  res.json({ success: true });
});

// ── Admin: davet e-postası ────────────────────────────────────────────────
app.post('/api/send-invite-email', async (req, res) => {
  const user = await verifyAdmin(req, res);
  if (!user) return;
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'E-posta servisi yapılandırılmamış' });

  const { email, code, expiresAt } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'email ve code gerekli' });

  const expDate = expiresAt ? new Date(expiresAt).toLocaleString('tr-TR') : '';

  try {
    await sendResendEmail({
      to: email,
      subject: 'MayVox — Davet Kodunuz',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">MayVox</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">mayvox.com</p><p>Merhaba,</p><p>Başvurun onaylandı — aramıza hoş geldin! 🎉</p><div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;"><p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Davet Kodu</p><span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${code}</span>${expDate ? `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">Son geçerlilik: ${expDate}</p>` : ''}</div><p style="margin:0 0 16px;">Uygulamayı indir, bu kodu kullanarak üyeliğini tamamla ve aramıza katıl.</p><div style="text-align:center;margin:24px 0;"><a href="https://mayvox.com" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Uygulamayı İndir</a></div><p style="color:#94a3b8;font-size:13px;">Bu kodu yalnızca siz kullanabilirsiniz.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen dikkate almayın.</p></div>`,
    });
  } catch (e) {
    console.error('[invite] E-posta hatası:', e.responseText || e.message);
    return res.status(500).json({ error: 'E-posta gönderilemedi' });
  }
  res.json({ success: true });
});

// ── Admin: red e-postası (başvuru reddedildiğinde) ────────────────────────
app.post('/api/send-rejection-email', async (req, res) => {
  const user = await verifyAdmin(req, res);
  if (!user) return;
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'E-posta servisi yapılandırılmamış' });

  const { email, reason } = req.body;
  if (!email) return res.status(400).json({ error: 'email gerekli' });

  const reasonBlock = reason
    ? `<div style="background:#22223a;border-left:3px solid #7c3aed;border-radius:6px;padding:14px 16px;margin:20px 0;"><p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;">Not</p><p style="margin:6px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">${String(reason).replace(/[<>]/g, '')}</p></div>`
    : '';

  try {
    await sendResendEmail({
      to: email,
      subject: 'MayVox — Başvurunuz Hakkında',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">MayVox</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">mayvox.com</p><p>Merhaba,</p><p>MayVox erken erişim başvurunuz için teşekkür ederiz.</p><p style="color:#cbd5e1;">Şu an için başvurunuzu kabul edemiyoruz. Erken erişim sınırlı sayıda kullanıcıya açıldığı için tüm başvuruları karşılayamıyoruz.</p>${reasonBlock}<p style="color:#cbd5e1;">İleride yeniden başvuruda bulunabilirsiniz; kontenjan açıldığında tekrar değerlendirilir.</p><p style="color:#94a3b8;font-size:13px;margin-top:24px;">Sizi MayVox'ta ağırlamayı umuyoruz.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen dikkate almayın.</p></div>`,
    });
  } catch (e) {
    console.error('[reject] E-posta hatası:', e.responseText || e.message);
    return res.status(500).json({ error: 'E-posta gönderilemedi' });
  }
  res.json({ success: true });
});

// ── must_change_password temizle ──────────────────────────────────────────
app.post('/api/clear-must-change-password', async (req, res) => {
  const user = await verifyAuth(req, res);
  if (!user) return;
  const { error } = await createAdminClient()
    .from('profiles').update({ must_change_password: false }).eq('id', user.id);
  if (error) return res.status(500).json({ error: 'Flag temizlenemedi' });
  res.json({ success: true });
});

// ── Startup ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;

const required = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter(k => !process.env[k]);
if (!getSupabaseUrl()) missing.push('SUPABASE_URL');
if (!getSupabaseAnonKey()) missing.push('SUPABASE_ANON_KEY');
if (!LIVEKIT_URL) missing.push('LIVEKIT_URL (veya LIVEKIT_HOST)');
if (missing.length) console.warn(`[server] Eksik env: ${missing.join(', ')}`);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] :${PORT} hazır`);
});

function gracefulShutdown(signal) {
  console.log(`[server] ${signal} alındı, kapatılıyor...`);
  server.close(() => {
    console.log('[server] HTTP kapatıldı');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
