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
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum' });
  }

  // 3. Body doğrulama
  const { roomName, participantName } = req.body;
  if (!roomName || !participantName) {
    return res.status(400).json({ error: 'roomName ve participantName gerekli' });
  }

  // 4. LiveKit token üret
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

  const token = await at.toJwt();
  res.json({ token });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LiveKit token server: http://localhost:${PORT}`);
});
