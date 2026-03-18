const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS — sadece local Electron/dev origins
const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || 'null');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.post('/livekit-token', async (req, res) => {
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
