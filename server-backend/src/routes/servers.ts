import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { validateCreateServer, validateJoinServer } from '../validators/serverValidators';
import * as serverService from '../services/serverService';
import * as channelService from '../services/channelService';
import * as channelAccessService from '../services/channelAccessService';
import * as inviteLinkService from '../services/inviteLinkService';
import { getServerAccessContext } from '../services/accessContextService';
import { listAuditLog } from '../services/auditLogService';
import { listServerRoles } from '../services/roleListService';
import * as joinRequestService from '../services/serverJoinRequestService';
import { getServerOverview } from '../services/serverOverviewService';
import * as mgmt from '../services/managementService';
import { AppError } from '../services/serverService';
import { getServerModerationConfig, updateServerModerationConfig } from '../services/moderationConfigService';
import { getStats as getModerationStats, isValidRange, listEvents as listModerationEvents, isValidKind } from '../services/moderationStatsService';
import { listActiveAutoPunishments } from '../services/moderationAutoPunishService';
import { clearRoomActivityEvents, listRoomActivityEvents } from '../services/roomActivityService';
import { getInsights, refreshActivityHeatmapOnce } from '../services/voiceActivityService';
import ExcelJS from 'exceljs';
import { queryOne } from '../repositories/db';
import * as recommendationService from '../services/recommendationService';
import * as roomActivityService from '../services/roomActivityService';

const router = Router();

router.use(authMiddleware as any);

const LOGO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RECOMMENDATION_COVER_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function logoExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

function recommendationCoverExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpg';
}

/** GET /servers/invites/incoming — kullanıcının gelen davetleri */
router.get('/invites/incoming', async (req: Request, res: Response) => {
  try { res.json(await mgmt.listMyInvites((req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/invites/:inviteId/accept */
router.post('/invites/:inviteId/accept', async (req: Request, res: Response) => {
  try { await mgmt.acceptInvite((req as any).userId, req.params.inviteId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/invites/:inviteId/decline */
router.post('/invites/:inviteId/decline', async (req: Request, res: Response) => {
  try { await mgmt.declineInvite((req as any).userId, req.params.inviteId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** GET /servers/my */
router.get('/my', async (req: Request, res: Response) => {
  try { res.json(await serverService.listMyServers((req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** POST /servers */
router.post('/', async (req: Request, res: Response) => {
  try {
    const valid = validateCreateServer(req.body, res);
    if (!valid) return;
    res.status(201).json(await serverService.createServer((req as any).userId, valid.name, valid.description, valid.isPublic, valid.motto, valid.plan));
  } catch (err) { handleError(res, err); }
});

/** GET /servers/search?q= */
router.get('/search', async (req: Request, res: Response) => {
  try { res.json(await serverService.searchServers(String(req.query.q ?? ''), (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** GET /servers/:id */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const server = await serverService.getServer(req.params.id as string, (req as any).userId);
    if (!server) { res.status(404).json({ error: 'Sunucu bulunamadı' }); return; }
    res.json(server);
  } catch (err) { handleError(res, err); }
});

/** PATCH /servers/:id */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    await mgmt.updateServer(req.params.id as string, (req as any).userId, req.body);
    res.json({ ok: true });
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/logo — self-hosted logo upload (base64 JSON) */
router.post('/:id/logo', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const userId = (req as any).userId as string;
    const ctx = await getServerAccessContext(userId, serverId);
    if (!ctx.flags.canManageServer) throw new AppError(403, 'Sunucu logosunu güncelleme yetkin yok');

    const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : '';
    const data = typeof req.body?.data === 'string' ? req.body.data : '';
    if (!LOGO_CONTENT_TYPES.has(contentType) || !data) {
      throw new AppError(400, 'Geçersiz logo dosyası');
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
      throw new AppError(400, 'Logo dosyası çok büyük');
    }

    const ext = logoExtension(contentType);
    const dir = path.join(process.cwd(), 'uploads', 'server-logos', serverId);
    const fileName = `logo-${Date.now()}.${ext}`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);

    const avatarUrl = `/uploads/server-logos/${serverId}/${fileName}`;
    await mgmt.updateServer(serverId, userId, { avatarUrl });
    res.json({ url: avatarUrl });
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id */
router.delete('/:id', async (req: Request, res: Response) => {
  try { await serverService.deleteServer((req as any).userId, req.params.id as string); res.status(204).end(); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/join */
router.post('/join', async (req: Request, res: Response) => {
  try {
    const valid = validateJoinServer(req.body, res);
    if (!valid) return;
    res.status(201).json(await serverService.joinByInvite((req as any).userId, valid.code));
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/leave */
router.post('/:id/leave', async (req: Request, res: Response) => {
  try { await serverService.leaveServer((req as any).userId, req.params.id as string); res.status(204).end(); }
  catch (err) { handleError(res, err); }
});

/** GET /servers/:id/access-context — kullanıcının bu sunucudaki tam yetki context'i */
router.get('/:id/access-context', async (req: Request, res: Response) => {
  try {
    const ctx = await getServerAccessContext((req as any).userId, req.params.id as string);
    res.json(ctx);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/moderation-config — auto-mod ayarları (capability: server.moderation.update) */
router.get('/:id/moderation-config', async (req: Request, res: Response) => {
  try {
    const cfg = await getServerModerationConfig(req.params.id as string, (req as any).userId);
    res.json(cfg);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/recommendations — sunucuya özel keşif önerileri */
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
    const includeHidden = req.query.includeHidden === 'true' && (ctx.membership.isOwner || ctx.flags.canManageServer || ctx.flags.canKickMembers);
    const items = await recommendationService.listRecommendations(serverId, {
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: req.query.limit,
      includeHidden,
      userId: (req as any).userId,
    });
    res.json(items);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/recommendations/watchlist', async (req: Request, res: Response) => {
  try {
    const items = await recommendationService.listRecommendationWatchlist(
      req.params.id as string,
      (req as any).userId,
    );
    res.json(items);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/recommendations/users/:userId/profile', async (req: Request, res: Response) => {
  try {
    const profile = await recommendationService.getRecommendationCreatorProfile(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
    );
    res.json(profile);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/recommendations/:itemId', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
    const item = await recommendationService.getRecommendation(serverId, req.params.itemId as string, (req as any).userId);
    res.json(item);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/recommendations/:itemId/ratings', async (req: Request, res: Response) => {
  try {
    const ratings = await recommendationService.listRecommendationRatings(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
    );
    res.json(ratings);
  } catch (err) { handleError(res, err); }
});

router.put('/:id/recommendations/:itemId/rating', async (req: Request, res: Response) => {
  try {
    const result = await recommendationService.setRecommendationRating(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
      req.body?.score,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.delete('/:id/recommendations/:itemId/rating', async (req: Request, res: Response) => {
  try {
    const result = await recommendationService.deleteRecommendationRating(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.put('/:id/recommendations/:itemId/state', async (req: Request, res: Response) => {
  try {
    const result = await recommendationService.setRecommendationUserState(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
      req.body || {},
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/recommendations/:itemId/comments', async (req: Request, res: Response) => {
  try {
    const comments = await recommendationService.listRecommendationComments(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
    );
    res.json(comments);
  } catch (err) { handleError(res, err); }
});

router.put('/:id/recommendations/:itemId/comment', async (req: Request, res: Response) => {
  try {
    const result = await recommendationService.upsertRecommendationComment(
      req.params.id as string,
      req.params.itemId as string,
      (req as any).userId,
      req.body || {},
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.delete('/:id/recommendations/:itemId/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const result = await recommendationService.hideRecommendationComment(
      req.params.id as string,
      req.params.itemId as string,
      req.params.commentId as string,
      (req as any).userId,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const item = await recommendationService.createRecommendation(req.params.id as string, (req as any).userId, req.body || {});
    res.status(201).json(item);
  } catch (err) { handleError(res, err); }
});

router.post('/:id/recommendations/cover', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const userId = (req as any).userId as string;
    const ctx = await getServerAccessContext(userId, serverId);
    if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');

    const contentType = typeof req.body?.contentType === 'string'
      ? req.body.contentType
      : typeof req.body?.mimeType === 'string'
        ? req.body.mimeType
        : '';
    const data = typeof req.body?.data === 'string'
      ? req.body.data
      : typeof req.body?.dataBase64 === 'string'
        ? req.body.dataBase64
        : '';
    if (!RECOMMENDATION_COVER_CONTENT_TYPES.has(contentType) || !data) {
      throw new AppError(400, 'Geçersiz kapak görseli');
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      throw new AppError(400, 'Kapak görseli 5MB altında olmalı');
    }

    const ext = recommendationCoverExtension(contentType);
    const dir = path.join(process.cwd(), 'uploads', 'recommendations', serverId);
    const fileName = `${randomUUID()}.${ext}`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);

    const coverUrl = `/uploads/recommendations/${serverId}/${fileName}`;
    res.status(201).json({ url: coverUrl, coverUrl });
  } catch (err) { handleError(res, err); }
});

router.patch('/:id/recommendations/:itemId', async (req: Request, res: Response) => {
  try {
    const item = await recommendationService.updateRecommendation(req.params.id as string, req.params.itemId as string, (req as any).userId, req.body || {});
    res.json(item);
  } catch (err) { handleError(res, err); }
});

router.post('/:id/recommendations/:itemId/hide', async (req: Request, res: Response) => {
  try {
    const item = await recommendationService.hideRecommendation(req.params.id as string, req.params.itemId as string, (req as any).userId);
    res.json(item);
  } catch (err) { handleError(res, err); }
});

router.post('/:id/recommendations/:itemId/restore', async (req: Request, res: Response) => {
  try {
    const item = await recommendationService.restoreRecommendation(req.params.id as string, req.params.itemId as string, (req as any).userId);
    res.json(item);
  } catch (err) { handleError(res, err); }
});

router.delete('/:id/recommendations/:itemId', async (req: Request, res: Response) => {
  try {
    await recommendationService.deleteRecommendation(req.params.id as string, req.params.itemId as string, (req as any).userId);
    res.status(204).send();
  } catch (err) { handleError(res, err); }
});

/** PATCH /servers/:id/moderation-config — flood limit vb. güncelle (partial) */
router.patch('/:id/moderation-config', async (req: Request, res: Response) => {
  try {
    const next = await updateServerModerationConfig(req.params.id as string, (req as any).userId, req.body);
    res.json(next);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/insights?range=7d|30d|90d — voice activity + social graph
 *  Yetki: insights.view (owner/super_admin/admin/super_mod). Normal üyeler 403. */
router.get('/:id/insights', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const rangeStr = typeof req.query.range === 'string' ? req.query.range : '30d';
    const rangeMap: Record<string, 7 | 30 | 90> = { '7d': 7, '30d': 30, '90d': 90 };
    const rangeDays = rangeMap[rangeStr];
    if (!rangeDays) {
      res.status(400).json({ error: 'range must be 7d|30d|90d' });
      return;
    }
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    if (!ctx.flags.canViewInsights) {
      res.status(403).json({ error: 'İçgörüleri görme yetkin yok' });
      return;
    }
    const insights = await getInsights(serverId, rangeDays);
    res.json(insights);
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/insights/refresh — aktivite haritası MV'sini manuel refresh et.
 *  Yetki: insights.view (GET ile aynı gate). Backend tek in-flight promise ile spam'i
 *  serialize eder; { refreshedAt } döner, frontend UI'ı anında günceller. */
router.post('/:id/insights/refresh', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    if (!ctx.flags.canViewInsights) {
      res.status(403).json({ error: 'İçgörüleri yenileme yetkin yok' });
      return;
    }
    const refreshedAt = await refreshActivityHeatmapOnce();
    res.json({ refreshedAt: refreshedAt.toISOString() });
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/moderation-stats?range=5m|1h|24h — block sayaçları */
router.get('/:id/moderation-stats', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const range = typeof req.query.range === 'string' ? req.query.range : '5m';
    if (!isValidRange(range)) {
      res.status(400).json({ error: 'range must be 5m|1h|24h' });
      return;
    }
    // Role gate: sunucu üyesi olsun yeter (read-only sayaçlar, hassas veri yok).
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    const stats = await getModerationStats(serverId, range);
    res.json(stats);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/active-auto-punishments
 *  Şu an aktif auto-mod kaynaklı chat-ban'lar — sadece canKickMembers.
 */
router.get('/:id/active-auto-punishments', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    if (!ctx.flags.canKickMembers) {
      res.status(403).json({ error: 'Aktif cezaları görme yetkin yok' });
      return;
    }
    const rows = await listActiveAutoPunishments(serverId);
    res.json(rows);
  } catch (err) { handleError(res, err); }
});


/** GET /servers/:id/channels/:channelId/activity-events?limit=75
 *  Oda Son Olaylar geçmişi — sadece moderator+ / admin.
 */
router.get('/:id/channels/:channelId/activity-events', async (req: Request, res: Response) => {
  try {
    const rows = await listRoomActivityEvents(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
      req.query.limit,
    );
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/channels/:channelId/activity-events
 *  Oda Son Olaylar geçmişini temizle - sadece owner / super_admin.
 */
router.delete('/:id/channels/:channelId/activity-events', async (req: Request, res: Response) => {
  try {
    const result = await clearRoomActivityEvents(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/moderation-events?limit=50&kind=flood|profanity|spam
 *  Detaylı olay feed'i — sadece owner/admin/mod (canKickMembers) görür.
 *  Mesaj içeriği ASLA dönülmez; sadece metadata (user/channel/time).
 */
router.get('/:id/moderation-events', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    if (!ctx.flags.canKickMembers) {
      res.status(403).json({ error: 'Moderasyon olaylarını görme yetkin yok' });
      return;
    }
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const rawKind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const kind = rawKind && isValidKind(rawKind) ? rawKind : undefined;
    const events = await listModerationEvents(serverId, { limit, kind });
    res.json(events);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/moderation-events/export?kind=flood|profanity|spam
 *  CSV export — hard cap 50.000 satır. Aynı role gate (canKickMembers).
 *  Mesaj içeriği DAHİL DEĞİL — sadece metadata.
 */
router.get('/:id/moderation-events/export', async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    const ctx = await getServerAccessContext((req as any).userId, serverId);
    if (!ctx.membership.exists) {
      res.status(403).json({ error: 'Bu sunucunun üyesi değilsin' });
      return;
    }
    if (!ctx.flags.canKickMembers) {
      res.status(403).json({ error: 'Moderasyon olaylarını dışa aktarma yetkin yok' });
      return;
    }
    const rawKind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const kind = rawKind && isValidKind(rawKind) ? rawKind : undefined;
    const events = await listModerationEvents(serverId, { limit: 50_000, kind });
    // Sunucu adı (rapor başlığı için)
    const srvRow = await queryOne<{ name: string }>(
      'SELECT name FROM servers WHERE id = $1',
      [serverId],
    );
    const serverName = srvRow?.name || serverId;
    // kind → TR etiket
    const KIND_TR: Record<string, string> = { flood: 'Flood', profanity: 'Küfür', spam: 'Spam' };
    const FILTER_LABEL = kind ? KIND_TR[kind] || kind : 'Tümü';
    // ISO → "22.04.2026 16:15:07" (Europe/Istanbul)
    const fmtDate = (iso: string): string => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString('tr-TR', {
          timeZone: 'Europe/Istanbul',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
      } catch { return iso; }
    };
    const nowLabel = fmtDate(new Date().toISOString());

    // ── ExcelJS workbook ──
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MayVox';
    wb.created = new Date();
    const ws = wb.addWorksheet('Moderasyon Kayıtları', {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.55, header: 0.3, footer: 0.3 },
        printTitlesRow: '7:7', // header her yazdırma sayfasında tekrar
      },
      views: [{ state: 'frozen', ySplit: 7 }], // header sabit
    });

    // ── Kolon genişlikleri ──
    // Meta blok için A geniş olsun (Sunucu/Oluşturulma/Filtre/Toplam label'ları
    // hiç kesilmesin). Tablo için aynı sütunlar yeniden kullanılır.
    ws.columns = [
      { width: 14 }, // A — Kayıt No (override aşağıda)
      { width: 14 }, // B — Olay Türü
      { width: 26 }, // C — Kullanıcı (override aşağıda)
      { width: 40 }, // D — Kullanıcı ID
      { width: 26 }, // E — Kanal
      { width: 40 }, // F — Kanal ID
      { width: 22 }, // G — Tarih / Saat
    ];
    // Manuel override — user talebi
    ws.getColumn(1).width = 20; // Kayıt No
    ws.getColumn(3).width = 30; // Kullanıcı

    // ── Rapor başlığı (A1:G1) ──
    const TITLE_BG = 'FF0F172A';   // slate-900 (sakin kurumsal, indigo yerine)
    const TITLE_FG = 'FFFFFFFF';
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Moderasyon Kayıtları Raporu';
    titleCell.font = { bold: true, size: 15, color: { argb: TITLE_FG } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    ws.getRow(1).height = 30;

    // ── Meta bloğu (A2:G5) ──
    // Label (A kolonu, geniş), value (B:G merge). Sola hizalı, label bold.
    const metaLabelFont = { bold: true, color: { argb: 'FF334155' }, size: 11 };
    const metaValueFont = { color: { argb: 'FF0F172A' }, size: 11 };
    const metaPairs: Array<[string, string]> = [
      ['Sunucu',       serverName],
      ['Oluşturulma',  nowLabel],
      ['Filtre',       FILTER_LABEL],
      ['Toplam Kayıt', String(events.length)],
    ];
    metaPairs.forEach((pair, i) => {
      const rowNum = i + 2;
      const r = ws.getRow(rowNum);
      r.height = 18;
      const lbl = ws.getCell(`A${rowNum}`);
      lbl.value = pair[0];
      lbl.font = metaLabelFont;
      lbl.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.mergeCells(`B${rowNum}:G${rowNum}`);
      const val = ws.getCell(`B${rowNum}`);
      val.value = pair[1];
      val.font = metaValueFont;
      val.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    // Meta ↔ tablo arası ince ayırıcı (row 6: ince line + nefes)
    const sepRow = ws.getRow(6);
    sepRow.height = 6;
    for (let col = 1; col <= 7; col++) {
      sepRow.getCell(col).border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, // slate-300
      };
    }

    // ── Veri satırları (row 8+) — tarih Date nesnesi, olay türü TR ──
    // Data boş değilse Excel Table kullanacağız (addTable); header row 7 bizzat Table tarafından yönetilir.
    const tableRows = events.map((ev, i) => {
      const d = new Date(ev.createdAt);
      return [
        i + 1,                                 // Kayıt No → 1'den başlayan sıra
        KIND_TR[ev.kind] || ev.kind,           // Olay Türü
        ev.userName || 'Bilinmiyor',           // Kullanıcı
        ev.userId || '',                       // Kullanıcı ID
        ev.channelName || '',                  // Kanal
        ev.channelId || '',                    // Kanal ID
        Number.isNaN(d.getTime()) ? ev.createdAt : d, // Date objesi (Excel native sort)
      ];
    });

    if (events.length > 0) {
      // ── Excel Table (AutoFilter + sıralama okları hazır) ──
      ws.addTable({
        name: 'ModerasyonKayitlari',
        ref: 'A7',
        headerRow: true,
        totalsRow: false,
        style: {
          // Mevcut hafif mavi tema; ancak biz cell-level override'larla daha sade yapacağız.
          theme: 'TableStyleMedium2',
          showRowStripes: true,
        },
        columns: [
          { name: 'Kayıt No' },
          { name: 'Olay Türü' },
          { name: 'Kullanıcı' },
          { name: 'Kullanıcı ID' },
          { name: 'Kanal' },
          { name: 'Kanal ID' },
          { name: 'Tarih / Saat' },
        ],
        rows: tableRows,
      });

      // ── Header row 7 stilini override (daha sakin, kurumsal) ──
      const HEADER_BG = 'FF1E293B'; // slate-800
      const HEADER_FG = 'FFFFFFFF';
      ws.getRow(7).height = 24;
      ws.getRow(7).eachCell((c, col) => {
        if (col > 7) return;
        c.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
        c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
        c.border = {
          top:    { style: 'thin',   color: { argb: 'FF475569' } },
          bottom: { style: 'medium', color: { argb: 'FF475569' } },
        };
      });
      // Kayıt No ve Olay Türü başlıkları ortalı
      ws.getRow(7).getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(7).getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(7).getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

      // ── Veri satırı stilleri ──
      // Olay Türü: her tür kendi soft tint'i + bold renkli text
      const KIND_STYLE: Record<string, { bg: string; fg: string }> = {
        Flood: { bg: 'FFE0F7FA', fg: 'FF0E7490' }, // cyan-50 / cyan-700
        Küfür: { bg: 'FFFFE4E6', fg: 'FFBE123C' }, // rose-50 / rose-700
        Spam:  { bg: 'FFF3E8FF', fg: 'FF7C3AED' }, // violet-100 / violet-600
      };
      // Zebra (Table style rows stripes) ÜZERİNE override — daha yumuşak slate-50
      const ZEBRA_BG = 'FFF8FAFC'; // slate-50

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const rowIdx = 8 + i;
        const r = ws.getRow(rowIdx);
        r.height = 20;

        // Kolon-bazlı hizalama + font
        // A: Kayıt No (ortalı, tabular)
        r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        r.getCell(1).font = { color: { argb: 'FF64748B' }, size: 11 };
        // B: Olay Türü (ortalı + renkli tint)
        const kindKey = KIND_TR[ev.kind] || ev.kind;
        const ks = KIND_STYLE[kindKey];
        const kindCell = r.getCell(2);
        kindCell.alignment = { horizontal: 'center', vertical: 'middle' };
        kindCell.font = { bold: true, size: 11, color: { argb: ks?.fg || 'FF475569' } };
        if (ks) {
          kindCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ks.bg } };
        }
        // C: Kullanıcı (sola, bilinmiyor ise italic muted)
        const userCell = r.getCell(3);
        userCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        userCell.font = !ev.userName
          ? { italic: true, color: { argb: 'FF94A3B8' }, size: 11 }
          : { color: { argb: 'FF0F172A' }, size: 11 };
        // D: Kullanıcı ID (sola, mono görünüm — küçük renk)
        r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        r.getCell(4).font = { color: { argb: 'FF64748B' }, size: 10 };
        // E: Kanal (sola)
        r.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        r.getCell(5).font = { color: { argb: 'FF0F172A' }, size: 11 };
        // F: Kanal ID (sola, muted)
        r.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        r.getCell(6).font = { color: { argb: 'FF64748B' }, size: 10 };
        // G: Tarih (ortalı, Türkçe format)
        const dateCell = r.getCell(7);
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
        dateCell.font = { color: { argb: 'FF334155' }, size: 11 };
        dateCell.numFmt = 'dd.mm.yyyy hh:mm';

        // Zebra (Table'ın kendi stripe'ı üzerine soft override — alternatif satır)
        if (i % 2 === 1) {
          for (let col = 1; col <= 7; col++) {
            // Olay Türü hücresinin tint'ini ezme
            if (col === 2 && ks) continue;
            const cell = r.getCell(col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_BG } };
          }
        }
      }
    } else {
      // ── Empty state: header satırını manuel yaz (Table boş rows ile çalışmıyor) ──
      const HEADER_BG = 'FF1E293B';
      ws.getRow(7).values = ['Kayıt No', 'Olay Türü', 'Kullanıcı', 'Kullanıcı ID', 'Kanal', 'Kanal ID', 'Tarih / Saat'];
      ws.getRow(7).height = 24;
      ws.getRow(7).eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      });
      ws.mergeCells('A8:G8');
      const empty = ws.getCell('A8');
      empty.value = 'Bu filtreyle eşleşen moderasyon olayı yok.';
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      empty.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 11 };
      ws.getRow(8).height = 32;
    }

    // ── Stream ──
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = kind ? `-${kind}` : '';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="moderasyon-kayitlari${suffix}-${stamp}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/audit-log — admin audit feed (SERVER_MANAGE) */
router.get('/:id/audit-log', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const rows = await listAuditLog(
      req.params.id as string,
      (req as any).userId,
      { limit: Number.isFinite(limit) ? limit : undefined, action },
    );
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/roles — built-in roles + effective capabilities */
router.get('/:id/roles', async (req: Request, res: Response) => {
  try {
    const rows = await listServerRoles(req.params.id as string, (req as any).userId);
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

/** ── Join request akışı (invite-only sunucular) ── */

router.post('/:id/join-requests', async (req: Request, res: Response) => {
  try {
    await joinRequestService.createJoinRequest((req as any).userId, req.params.id as string);
    res.status(201).json({ ok: true });
  } catch (err) { handleError(res, err); }
});

router.get('/my/pending-join-requests-summary', async (req: Request, res: Response) => {
  try {
    const items = await joinRequestService.listMyPendingRequestsSummary((req as any).userId);
    res.json(items);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/join-requests', async (req: Request, res: Response) => {
  try {
    const includeHistory = req.query.history === '1';
    const rows = await joinRequestService.listJoinRequests(req.params.id as string, (req as any).userId, { includeHistory });
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

router.get('/:id/join-requests/pending-count', async (req: Request, res: Response) => {
  try {
    const count = await joinRequestService.countPendingRequests(req.params.id as string, (req as any).userId);
    res.json({ count });
  } catch (err) { handleError(res, err); }
});

router.post('/:id/join-requests/:rid/accept', async (req: Request, res: Response) => {
  try {
    await joinRequestService.acceptJoinRequest(req.params.id as string, (req as any).userId, req.params.rid as string);
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

router.post('/:id/join-requests/:rid/reject', async (req: Request, res: Response) => {
  try {
    await joinRequestService.rejectJoinRequest(req.params.id as string, (req as any).userId, req.params.rid as string);
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/overview — plan + counts vs limits (admin summary) */
router.get('/:id/overview', async (req: Request, res: Response) => {
  try {
    const data = await getServerOverview(req.params.id as string, (req as any).userId);
    res.json(data);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/channels */
router.get('/:id/channels', async (req: Request, res: Response) => {
  try { res.json(await channelService.listChannels(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

router.get('/:id/channels/:channelId/activity-events', async (req: Request, res: Response) => {
  try {
    const events = await roomActivityService.listRoomActivityEvents(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
      req.query.limit,
    );
    res.json(events);
  } catch (err) { handleError(res, err); }
});

router.delete('/:id/channels/:channelId/activity-events', async (req: Request, res: Response) => {
  try {
    const result = await roomActivityService.clearRoomActivityEvents(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/channels — kanal oluştur (admin+) */
router.post('/:id/channels', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const channel = await channelService.createChannel(
      req.params.id as string,
      (req as any).userId,
      {
        name: body.name,
        mode: body.mode,
        maxUsers: body.maxUsers,
        isInviteOnly: body.isInviteOnly,
        isHidden: body.isHidden,
        description: body.description,
        isPersistent: body.isPersistent,
        iconName: body.iconName,
        iconColor: body.iconColor,
      }
    );
    res.status(201).json(channel);
  } catch (err) { handleError(res, err); }
});

/** PATCH /servers/:id/channels/reorder — kanal sırasını toplu güncelle (admin+) */
router.patch('/:id/channels/reorder', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const expectedToken = typeof body.expectedOrderToken === 'string'
      ? body.expectedOrderToken
      : typeof body.orderToken === 'string'
        ? body.orderToken
        : null;
    const result = await channelService.reorderChannels(
      req.params.id as string,
      (req as any).userId,
      updates,
      expectedToken,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/** PATCH /servers/:id/channels/:channelId — kanal güncelle (admin+) */
router.patch('/:id/channels/:channelId', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const channel = await channelService.updateChannel(
      req.params.id as string,
      (req as any).userId,
      req.params.channelId as string,
      {
        name: body.name,
        mode: body.mode,
        maxUsers: body.maxUsers,
        isInviteOnly: body.isInviteOnly,
        isHidden: body.isHidden,
        description: body.description,
        iconName: body.iconName,
        iconColor: body.iconColor,
      }
    );
    res.json(channel);
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/channels/:channelId — kanal sil (admin+, sistem kanalları hariç) */
router.delete('/:id/channels/:channelId', async (req: Request, res: Response) => {
  try {
    await channelService.deleteChannel(
      req.params.id as string,
      (req as any).userId,
      req.params.channelId as string
    );
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

// ── Kanal erişim yönetimi (hidden / invite-only) ──

/** GET /servers/:id/channels/:channelId/access — erişim verilmiş kullanıcılar (admin+) */
router.get('/:id/channels/:channelId/access', async (req: Request, res: Response) => {
  try {
    const result = await channelAccessService.listChannelAccess(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/channels/:channelId/access — kanal erişimi ver (admin+) */
router.post('/:id/channels/:channelId/access', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const targetUserId = typeof body.userId === 'string' ? body.userId : '';
    if (!targetUserId) { res.status(400).json({ error: 'userId gerekli' }); return; }
    await channelAccessService.grantChannelAccess(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
      targetUserId,
    );
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/channels/:channelId/access/:userId — kanal erişimini kaldır (admin+) */
router.delete('/:id/channels/:channelId/access/:userId', async (req: Request, res: Response) => {
  try {
    await channelAccessService.revokeChannelAccess(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
      req.params.userId as string,
    );
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/channels/:channelId/access/check — kullanıcı join edebilir mi? */
router.get('/:id/channels/:channelId/access/check', async (req: Request, res: Response) => {
  try {
    const summary = await channelAccessService.evaluateChannelAccess(
      req.params.id as string,
      req.params.channelId as string,
      (req as any).userId,
    );
    res.json(summary);
  } catch (err) { handleError(res, err); }
});

// ── Üye yönetimi ──

/** GET /servers/:id/members */
router.get('/:id/members', async (req: Request, res: Response) => {
  try { res.json(await mgmt.listMembers(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/invite — kullanıcıya davet gönder */
router.post('/:id/members/invite', async (req: Request, res: Response) => {
  try { await mgmt.sendUserInvite(req.params.id as string, (req as any).userId, req.body.userId); res.status(201).json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** GET /servers/:id/members/invites — gönderilmiş bekleyen davetler */
router.get('/:id/members/invites', async (req: Request, res: Response) => {
  try { res.json(await mgmt.listSentInvites(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/members/invites/:inviteId */
router.delete('/:id/members/invites/:inviteId', async (req: Request, res: Response) => {
  try { await mgmt.cancelUserInvite(req.params.id as string, (req as any).userId, req.params.inviteId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/:userId/kick */
router.post('/:id/members/:userId/kick', async (req: Request, res: Response) => {
  try { await mgmt.kickMember(req.params.id as string, (req as any).userId, req.params.userId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

// ── Moderation voice actions (migration 023) ──

/** GET /servers/:id/members/me/moderation-state — kendi aktif cezalarını oku
 *  Kullanım: frontend banner, chat-server mesaj gate, token-server voice gate. */
router.get('/:id/members/me/moderation-state', async (req: Request, res: Response) => {
  try { res.json(await mgmt.getMyModerationState(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/:userId/mute
 *  Body: { expiresInSeconds?: number | null }  — null/omitted = süresiz */
router.post('/:id/members/:userId/mute', async (req: Request, res: Response) => {
  try {
    const expires = req.body?.expiresInSeconds;
    const out = await mgmt.muteMember(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
      expires === undefined || expires === null ? null : Number(expires),
    );
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/members/:userId/mute */
router.delete('/:id/members/:userId/mute', async (req: Request, res: Response) => {
  try {
    const out = await mgmt.unmuteMember(req.params.id as string, (req as any).userId, req.params.userId as string);
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/:userId/chat-ban
 *  Body: { expiresInSeconds?: number | null }  — null/undefined = süresiz */
router.post('/:id/members/:userId/chat-ban', async (req: Request, res: Response) => {
  try {
    const expires = req.body?.expiresInSeconds;
    const out = await mgmt.chatBanMember(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
      expires === undefined || expires === null ? null : Number(expires),
    );
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/members/:userId/chat-ban */
router.delete('/:id/members/:userId/chat-ban', async (req: Request, res: Response) => {
  try {
    const out = await mgmt.chatUnbanMember(req.params.id as string, (req as any).userId, req.params.userId as string);
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/:userId/timeout
 *  Body: { durationSeconds: 60|300|600|3600|86400|604800 } */
router.post('/:id/members/:userId/timeout', async (req: Request, res: Response) => {
  try {
    const duration = Number(req.body?.durationSeconds);
    const out = await mgmt.timeoutMember(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
      duration,
    );
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/members/:userId/timeout */
router.delete('/:id/members/:userId/timeout', async (req: Request, res: Response) => {
  try {
    const out = await mgmt.clearTimeoutMember(req.params.id as string, (req as any).userId, req.params.userId as string);
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** POST /servers/:id/members/:userId/room-kick
 *  Body: { channelId?: string }  — yoksa tüm voice odalardan düşür */
router.post('/:id/members/:userId/room-kick', async (req: Request, res: Response) => {
  try {
    const channelId = typeof req.body?.channelId === 'string' && req.body.channelId.length > 0
      ? (req.body.channelId as string)
      : null;
    const out = await mgmt.kickFromRoom(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
      channelId,
    );
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

/** PATCH /servers/:id/members/:userId/role */
router.patch('/:id/members/:userId/role', async (req: Request, res: Response) => {
  try { await mgmt.changeRole(req.params.id as string, (req as any).userId, req.params.userId as string, req.body.role); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/members/:userId/moderation-history
 *  Audit log'daki moderation satırlarını siler; aktif cezalara dokunmaz. */
router.delete('/:id/members/:userId/moderation-history', async (req: Request, res: Response) => {
  try {
    const out = await mgmt.resetMemberModerationHistory(
      req.params.id as string,
      (req as any).userId,
      req.params.userId as string,
    );
    res.json({ ok: true, ...out });
  } catch (err) { handleError(res, err); }
});

// ── Ban yönetimi ──

/** POST /servers/:id/members/:userId/ban */
router.post('/:id/members/:userId/ban', async (req: Request, res: Response) => {
  try { await mgmt.banMember(req.params.id as string, (req as any).userId, req.params.userId as string, req.body.reason ?? ''); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

/** GET /servers/:id/bans */
router.get('/:id/bans', async (req: Request, res: Response) => {
  try { res.json(await mgmt.listBans(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/bans/:userId */
router.delete('/:id/bans/:userId', async (req: Request, res: Response) => {
  try { await mgmt.unbanMember(req.params.id as string, (req as any).userId, req.params.userId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

// ── Davet yönetimi ──

/** GET /servers/:id/invites */
router.get('/:id/invites', async (req: Request, res: Response) => {
  try { res.json(await mgmt.listInvites(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
});

/** POST /servers/:id/invites */
router.post('/:id/invites', async (req: Request, res: Response) => {
  try {
    const maxUses = req.body.maxUses ?? null;
    const expiresInHours = req.body.expiresInHours ?? null;
    res.status(201).json(await mgmt.createInvite(req.params.id as string, (req as any).userId, maxUses, expiresInHours));
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/invites/:inviteId */
router.delete('/:id/invites/:inviteId', async (req: Request, res: Response) => {
  try { await mgmt.deleteInvite(req.params.id as string, (req as any).userId, req.params.inviteId as string); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
});

// ── Invite V2: link invite'lar ──

/** POST /servers/:id/invite-links — yeni link invite oluştur (capability gated) */
router.post('/:id/invite-links', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await inviteLinkService.createInviteLink(
      req.params.id as string,
      (req as any).userId,
      {
        scope: body.scope,
        channelId: body.channelId ?? null,
        expiresInHours: body.expiresInHours ?? null,
        maxUses: body.maxUses ?? null,
      }
    );
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

/** GET /servers/:id/invite-links — aktif/geçmiş link invite listesi */
router.get('/:id/invite-links', async (req: Request, res: Response) => {
  try {
    const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
    const includeInactive = req.query.includeInactive === '1';
    const rows = await inviteLinkService.listInviteLinks(
      req.params.id as string,
      (req as any).userId,
      { channelId, includeInactive }
    );
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

/** DELETE /servers/:id/invite-links/:inviteId — iptal */
router.delete('/:id/invite-links/:inviteId', async (req: Request, res: Response) => {
  try {
    await inviteLinkService.revokeInviteLink(
      req.params.id as string,
      (req as any).userId,
      req.params.inviteId as string
    );
    res.status(204).end();
  } catch (err) { handleError(res, err); }
});

function handleError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[server-route]', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

export default router;
