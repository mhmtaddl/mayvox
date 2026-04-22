import { Router, Request, Response } from 'express';
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

const router = Router();

router.use(authMiddleware as any);

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

/** PATCH /servers/:id/moderation-config — flood limit vb. güncelle (partial) */
router.patch('/:id/moderation-config', async (req: Request, res: Response) => {
  try {
    const next = await updateServerModerationConfig(req.params.id as string, (req as any).userId, req.body);
    res.json(next);
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
    const expectedToken = typeof body.orderToken === 'string' ? body.orderToken : null;
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
