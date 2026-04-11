import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateCreateServer, validateJoinServer } from '../validators/serverValidators';
import * as serverService from '../services/serverService';
import * as channelService from '../services/channelService';
import * as mgmt from '../services/managementService';
import { AppError } from '../services/serverService';

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

/** GET /servers/:id/channels */
router.get('/:id/channels', async (req: Request, res: Response) => {
  try { res.json(await channelService.listChannels(req.params.id as string, (req as any).userId)); }
  catch (err) { handleError(res, err); }
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

/** PATCH /servers/:id/members/:userId/role */
router.patch('/:id/members/:userId/role', async (req: Request, res: Response) => {
  try { await mgmt.changeRole(req.params.id as string, (req as any).userId, req.params.userId as string, req.body.role); res.json({ ok: true }); }
  catch (err) { handleError(res, err); }
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

function handleError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[server-route]', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

export default router;
