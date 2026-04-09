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

app.post('/livekit-token', tokenLimiter, async (req, res) => {
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { roomName } = req.body;
  if (!roomName) return res.status(400).json({ error: 'roomName gerekli' });

  // Tek-oda kuralı: kullanıcı başka bir odadaysa oradan çıkar
  if (roomService) try {
    const rooms = await roomService.listRooms();
    for (const room of rooms) {
      if (room.name === roomName) continue; // Aynı oda — LiveKit kendi DUPLICATE_IDENTITY'sini halleder
      const participants = await roomService.listParticipants(room.name);
      if (participants.some(p => p.identity === user.id)) {
        await roomService.removeParticipant(room.name, user.id);
      }
    }
  } catch (e) {
    // Temizlik başarısız olursa token üretimini engelleme
    console.warn('Room cleanup failed:', e.message);
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

// ── Şifre sıfırlama isteği ────────────────────────────────────────────────
app.post('/api/request-password-reset', resetLimiter, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId gerekli' });
  const { error } = await createAdminClient()
    .from('profiles').update({ password_reset_requested: true }).eq('id', userId);
  if (error) return res.status(500).json({ error: 'İstek kaydedilemedi' });
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
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'PigeVox <onboarding@resend.dev>';

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail, to: [target.email], subject: 'Caylaklar — Geçici Parolanız',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">Caylaklar</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">cylksohbet.org</p><p>Merhaba <strong>${target.name}</strong>,</p><p>Parolanız bir yönetici tarafından sıfırlandı.</p><div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;"><p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Geçici Parola</p><span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${tempPassword}</span></div><p style="color:#94a3b8;font-size:13px;">Giriş yaptıktan sonra yeni bir parola belirlemeniz istenecektir.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen yöneticinizle iletişime geçin.</p></div>`,
    }),
  });
  if (!emailRes.ok) {
    console.error('[reset] E-posta gönderilemedi:', await emailRes.text().catch(() => ''));
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
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'PigeVox <onboarding@resend.dev>';

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail, to: [email], subject: 'Caylaklar — Davet Kodunuz',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;"><h2 style="color:#7c3aed;margin-bottom:4px;">Caylaklar</h2><p style="color:#94a3b8;font-size:13px;margin-top:0;">cylksohbet.org</p><p>Merhaba,</p><p>Davet kodunuz hazır!</p><div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;"><p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Davet Kodu</p><span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${code}</span>${expDate ? `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">Son geçerlilik: ${expDate}</p>` : ''}</div><p style="color:#94a3b8;font-size:13px;">Bu kodu yalnızca siz kullanabilirsiniz.</p><hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;"/><p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen dikkate almayın.</p></div>`,
    }),
  });
  if (!emailRes.ok) {
    console.error('[invite] E-posta hatası:', await emailRes.text().catch(() => ''));
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
