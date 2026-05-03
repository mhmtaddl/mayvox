import 'dotenv/config';

const DEFAULT_CORS_ORIGINS = [
  'https://mayvox.com',
  'https://www.mayvox.com',
  'https://cylksohbet.org',
  'https://www.cylksohbet.org',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'capacitor://localhost',
];

export const config = {
  port: parseInt(process.env.PORT || '4001'),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGINS.join(',')).split(',').map(s => s.trim()),
  chatServerUrl: process.env.CHAT_SERVER_URL || 'http://127.0.0.1:10001',
  internalNotifySecret: process.env.INTERNAL_NOTIFY_SECRET || '',
  // ── LiveKit (voice moderation: timeout drop + room kick) ──
  // Üçü de boşsa moderation aksiyonları sadece DB'ye yazar; aktif katılımcıları düşüremez.
  // Bu moderator aksiyonunu başarısız yapmaz — lazy deploy için tasarlandı.
  livekitUrl:       process.env.LIVEKIT_URL || '',
  livekitApiKey:    process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
};

if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
if (!config.jwtSecret) throw new Error('JWT_SECRET is required');
