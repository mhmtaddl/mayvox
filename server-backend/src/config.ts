import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '4000'),
  databaseUrl: process.env.DATABASE_URL || '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
if (!config.supabaseJwtSecret) throw new Error('SUPABASE_JWT_SECRET is required');
