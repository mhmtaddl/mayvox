import express from 'express';
import cors from 'cors';
import { config } from './config';
import { pool } from './repositories/db';
import serverRoutes from './routes/servers';
import inviteLinkRoutes from './routes/inviteLinks';
import { assertCapabilitySyncOnStartup } from './services/capabilitySyncService';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──
app.use('/servers', serverRoutes);
app.use('/invite-links', inviteLinkRoutes);

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// ── Start ──
app.listen(config.port, config.host, () => {
  console.log(`[MAYVOX Server Backend] ${config.host}:${config.port} üzerinde çalışıyor`);

  // Realtime invite bridge sağlık kontrolü — production'da sessiz degrade olmasın.
  const rtReady = !!config.internalNotifySecret;
  if (rtReady) {
    console.log(`[realtime] bridge AKTİF → ${config.chatServerUrl} (invite push etkin)`);
  } else {
    console.warn('[realtime] bridge DEVRE DIŞI — INTERNAL_NOTIFY_SECRET tanımlı değil. Invite push çalışmayacak; frontend sadece polling ile güncellenecek.');
  }

  // Capability sync — code ↔ DB drift protection (capabilities.ts ↔ role_capabilities).
  // CAPABILITY_SYNC_STRICT=1 iken drift → process exit. Default: warn only.
  const strict = process.env.CAPABILITY_SYNC_STRICT === '1';
  void assertCapabilitySyncOnStartup(strict).catch(err => {
    console.warn('[capabilitySync] validator error', err instanceof Error ? err.message : err);
  });
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
