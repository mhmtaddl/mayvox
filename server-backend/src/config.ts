import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '4000'),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),
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
if (!config.supabaseUrl) throw new Error('SUPABASE_URL is required');
if (!config.supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY is required');
