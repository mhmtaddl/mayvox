import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { pool } from './repositories/db';
import serverRoutes from './routes/servers';
import inviteLinkRoutes from './routes/inviteLinks';
import internalRoutes from './routes/internal';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';
import authRoutes from './routes/auth';
import e2eeRoutes from './routes/e2ee';
import { assertCapabilitySyncOnStartup } from './services/capabilitySyncService';
import { reconcileOrphanSessions, refreshActivityHeatmap } from './services/voiceActivityService';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '30d',
  immutable: true,
}));

// ── LiveKit webhook — JSON parser'dan ÖNCE raw body ile mount ──
// WebhookReceiver HMAC verify raw string gerektirir; express.json() tüketirse bozulur.
app.use('/webhooks', express.raw({ type: '*/*', limit: '256kb' }), webhookRoutes);

// ── Genel JSON parser (diğer route'lar) ──
app.use(express.json({ limit: '5mb' }));

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──
app.use('/auth', authRoutes);
app.use('/e2ee', e2eeRoutes);
app.use('/servers', serverRoutes);
app.use('/invite-links', inviteLinkRoutes);
app.use('/internal', internalRoutes);
app.use('/admin', adminRoutes);

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
  const strict = process.env.CAPABILITY_SYNC_STRICT === '1';
  void assertCapabilitySyncOnStartup(strict).catch(err => {
    console.warn('[capabilitySync] validator error', err instanceof Error ? err.message : err);
  });

  // Voice activity — orphan cleanup + heatmap MV günlük refresh
  void reconcileOrphanSessions().then(r => {
    if (r.closedCount > 0) {
      console.log(`[voice-activity] ${r.closedCount} orphan session kapatıldı (startup)`);
    }
  }).catch(err => console.warn('[voice-activity] reconcile hata:', err instanceof Error ? err.message : err));

  // MV refresh: saatte bir. Restart'ta sayaç sıfırlanır; ilk çağrı startup'tan 5s sonra
  // (aktivite verisi release/restart sonrası hızla tazelensin diye; REFRESH CONCURRENTLY ucuz).
  setTimeout(() => {
    void refreshActivityHeatmap().catch(err =>
      console.warn('[voice-activity] heatmap refresh hata:', err instanceof Error ? err.message : err));
    setInterval(() => {
      void refreshActivityHeatmap().catch(err =>
        console.warn('[voice-activity] heatmap refresh hata:', err instanceof Error ? err.message : err));
    }, 60 * 60 * 1000);
  }, 5_000);
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
