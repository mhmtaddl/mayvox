const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const { rateLimit } = require('express-rate-limit');
// In packaged Electron builds, env vars are loaded by main.cjs before fork.
// In dev, load from the project root .env file.
if (!process.env.ELECTRON_IS_PACKAGED) {
  require('dotenv').config();
}

const app = express();
app.set('trust proxy', 1); // Render reverse proxy için gerekli
app.use(express.json());

// Rate limiting — IP başına 1 dakikada max 20 token isteği
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
});

// CORS
// Kabul edilen origin'ler:
//   - http://localhost:3000 / 127.0.0.1:3000 → Vite dev server
//   - "null" → packaged Electron app (file:// origin tarayıcı tarafından "null" gönderir)
// Not: token endpoint zaten Supabase JWT doğrulaması yapıyor;
//      CORS bypass edense bile geçerli oturumu olmadan token alamaz.
const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'null'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check — Render'ın liveness probe'u ve uptime monitor'lar için
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

app.post('/livekit-token', tokenLimiter, async (req, res) => {
  // 1. Authorization header kontrolü
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz istek: Authorization header eksik' });
  }

  const jwt = authHeader.split(' ')[1];

  // 2. Supabase ile oturumu doğrula
  // SUPABASE_URL tercih edilir; VITE_SUPABASE_URL eski Render deploy'ları için fallback.
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum' });
  }

  // 3. Body doğrulama
  const { roomName } = req.body;
  if (!roomName) {
    return res.status(400).json({ error: 'roomName gerekli' });
  }

  // 4. Canonical kullanıcı adını JWT'den türet — body'deki participantName güvenilmez
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.name) {
    return res.status(403).json({ error: 'Profil bulunamadı' });
  }

  const participantName = profile.name;

  // 5. LiveKit token üret
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: participantName }
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  // 6. Token döndür
  const token = await at.toJwt();
  res.json({ token });
});

// Rate limiting — kullanıcı arama (debounce ile sık çağrılır, gevşek limit)
const checkUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
});

// Rate limiting — şifre sıfırlama isteği (hassas işlem, sıkı limit)
const resetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen 10 dakika bekleyin.' },
});

// Yardımcı: 10 karakterlik geçici şifre üretir
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Kullanıcı adı veya e-posta ile kullanıcı kontrolü (kimlik doğrulama gerektirmez)
// profiles tablosu public SELECT policy'e sahip — anon key yeterli
app.post('/api/check-user', checkUserLimiter, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'identifier gerekli' });
  }

  const supabaseAnon = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  const isEmail = identifier.includes('@');
  const { data } = isEmail
    ? await supabaseAnon.from('profiles').select('id, name').eq('email', identifier.toLowerCase()).single()
    : await supabaseAnon.from('profiles').select('id, name').eq('name', identifier).single();

  if (!data) return res.json({ exists: false });
  res.json({ exists: true, userId: data.id, name: data.name });
});

// Şifre sıfırlama isteği oluştur (kimlik doğrulama gerektirmez)
app.post('/api/request-password-reset', resetLimiter, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId gerekli' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ password_reset_requested: true })
    .eq('id', userId);

  if (error) return res.status(500).json({ error: 'İstek kaydedilemedi' });
  res.json({ success: true });
});

// Admin: şifreyi sıfırla, e-posta gönder (admin yetkisi gerektirir)
app.post('/api/admin-reset-password', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz istek' });
  }
  const jwt = authHeader.split(' ')[1];

  const supabaseAnon = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'Geçersiz oturum' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Çağıranın admin olup olmadığını kontrol et
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('is_admin, is_primary_admin').eq('id', user.id).single();
  if (!callerProfile?.is_admin && !callerProfile?.is_primary_admin) {
    return res.status(403).json({ error: 'Admin yetkisi gerekli' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId gerekli' });

  // Hedef kullanıcının profilini al
  const { data: targetProfile } = await supabaseAdmin
    .from('profiles').select('name, email').eq('id', targetUserId).single();
  if (!targetProfile?.email) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  // Geçici şifre üret
  const tempPassword = generateTempPassword();

  // 1. ÖNCE e-posta gönder — başarısız olursa auth şifresi değiştirilmez
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CylkSohbet <onboarding@resend.dev>';
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [targetProfile.email],
      subject: 'Caylaklar — Geçici Parolanız',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1a1a2e;color:#e2e8f0;border-radius:12px;">
          <h2 style="color:#7c3aed;margin-bottom:4px;">Caylaklar</h2>
          <p style="color:#94a3b8;font-size:13px;margin-top:0;">cylksohbet.org</p>
          <p>Merhaba <strong>${targetProfile.name}</strong>,</p>
          <p>Parolanız bir yönetici tarafından sıfırlandı. Aşağıdaki geçici parola ile giriş yapabilirsiniz:</p>
          <div style="background:#2d2d44;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
            <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Geçici Parola</p>
            <span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#a78bfa;">${tempPassword}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px;">Giriş yaptıktan sonra yeni bir parola belirlemeniz istenecektir.</p>
          <hr style="border:none;border-top:1px solid #2d2d44;margin:24px 0;" />
          <p style="color:#64748b;font-size:11px;margin:0;">Bu e-postayı siz talep etmediyseniz lütfen yöneticinizle iletişime geçin.</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const emailErr = await emailRes.text().catch(() => '');
    console.error('[reset] E-posta gönderilemedi:', emailErr);
    return res.status(500).json({ error: 'E-posta gönderilemedi, şifre değiştirilmedi.' });
  }

  // 2. Mail başarılı — şimdi auth şifresini güncelle
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    password: tempPassword,
  });
  if (updateError) {
    console.error('[reset] Auth şifre güncellenemedi:', updateError.message);
    return res.status(500).json({ error: 'Şifre güncellenemedi, lütfen tekrar deneyin.' });
  }

  // 3. Profil flaglerini güncelle
  await supabaseAdmin.from('profiles').update({
    must_change_password: true,
    password_reset_requested: false,
  }).eq('id', targetUserId);

  res.json({ success: true });
});

// Admin: sıfırlama isteğini reddet / kapat
app.post('/api/dismiss-password-reset', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz istek' });
  }
  const jwt = authHeader.split(' ')[1];

  const supabaseAnon = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'Geçersiz oturum' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('is_admin, is_primary_admin').eq('id', user.id).single();
  if (!callerProfile?.is_admin && !callerProfile?.is_primary_admin) {
    return res.status(403).json({ error: 'Admin yetkisi gerekli' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId gerekli' });

  await supabaseAdmin.from('profiles').update({ password_reset_requested: false }).eq('id', targetUserId);
  res.json({ success: true });
});

// Kullanıcı yeni parolasını belirledi — must_change_password flag'ini kapat
app.post('/api/clear-must-change-password', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz istek' });
  }
  const jwt = authHeader.split(' ')[1];

  const supabaseAnon = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'Geçersiz oturum' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id);

  if (error) {
    console.error('[clear-must-change] Flag temizlenemedi:', error.message);
    return res.status(500).json({ error: 'Flag temizlenemedi' });
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;

// Startup: kritik env var kontrolü
const missingVars = [];
if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) missingVars.push('SUPABASE_URL');
if (!process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) missingVars.push('SUPABASE_ANON_KEY');
if (!process.env.LIVEKIT_API_KEY) missingVars.push('LIVEKIT_API_KEY');
if (!process.env.LIVEKIT_API_SECRET) missingVars.push('LIVEKIT_API_SECRET');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
if (!process.env.RESEND_API_KEY) missingVars.push('RESEND_API_KEY');
if (missingVars.length > 0) {
  console.warn(`[token-server] UYARI: Eksik env var(lar): ${missingVars.join(', ')}`);
}

app.listen(PORT, () => {
  console.log(`[token-server] http://localhost:${PORT} — Hazır`);
});
