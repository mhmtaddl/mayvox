import express from 'express';
import cors from 'cors';
import { config } from './config';
import { pool } from './repositories/db';
import serverRoutes from './routes/servers';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──
app.use('/servers', serverRoutes);

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// ── Start ──
app.listen(config.port, () => {
  console.log(`[MAYVOX Server Backend] :${config.port} üzerinde çalışıyor`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[shutdown] SIGTERM alındı, bağlantılar kapatılıyor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
