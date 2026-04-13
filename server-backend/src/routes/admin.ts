import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireSystemAdmin } from '../middleware/requireSystemAdmin';
import { requirePrimaryAdmin } from '../middleware/requirePrimaryAdmin';
import { adminRateLimit, adminWriteRateLimit } from '../middleware/adminRateLimit';
import {
  listAllServers,
  adminDeleteServer,
  adminSetServerBanned,
  adminSetServerPlan,
  adminForceOwnerLeave,
  NotFoundError,
  ValidationError,
  type PlanKey,
} from '../services/systemAdminService';
import {
  listAllUsers,
  listUserOwnedServers,
  setUserPlanManual,
  revokeUserPlanManual,
  type DurationType,
  type UserSort,
} from '../services/systemUsersService';

const router = Router();

// HARD RULE: auth → systemAdmin → rate limit (her istek yeniden doğrulanır).
router.use(authMiddleware as any);
router.use(requireSystemAdmin);
router.use(adminRateLimit);

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('[admin route] unexpected error', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

// ── GET /admin/servers ──
// Query: ?search=&limit=20&offset=0
router.get('/servers', async (req: Request, res: Response) => {
  const searchRaw = typeof req.query.search === 'string' ? req.query.search : '';
  const search = searchRaw.trim().slice(0, 120);
  const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
  const offset = Number.parseInt(String(req.query.offset ?? '0'), 10);
  if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
    res.status(400).json({ error: 'limit/offset geçersiz' });
    return;
  }
  try {
    const result = await listAllServers({ search, limit, offset });
    res.json(result);
  } catch (e) {
    handleServiceError(res, e);
  }
});

// ── DELETE /admin/servers/:id ── (PRIMARY ADMIN ONLY)
router.delete('/servers/:id', requirePrimaryAdmin, adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: 'id gerekli' });
    return;
  }
  const reason = typeof req.body?.reason === 'string' ? String(req.body.reason).slice(0, 500) : undefined;
  try {
    await adminDeleteServer((req as any).userId, id, reason);
    res.status(204).end();
  } catch (e) {
    handleServiceError(res, e);
  }
});

// ── PATCH /admin/servers/:id/ban ──
// body: { banned: boolean, reason?: string }
router.patch('/servers/:id/ban', adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: 'id gerekli' });
    return;
  }
  const banned = req.body?.banned;
  if (typeof banned !== 'boolean') {
    res.status(400).json({ error: 'banned boolean olmalı' });
    return;
  }
  const reason = typeof req.body?.reason === 'string' ? String(req.body.reason).slice(0, 500) : undefined;
  try {
    await adminSetServerBanned((req as any).userId, id, banned, reason);
    res.status(204).end();
  } catch (e) {
    handleServiceError(res, e);
  }
});

// ── PATCH /admin/servers/:id/plan ──
// body: { plan: 'free' | 'pro' | 'ultra' }
router.patch('/servers/:id/plan', adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: 'id gerekli' });
    return;
  }
  const planRaw = req.body?.plan;
  if (planRaw !== 'free' && planRaw !== 'pro' && planRaw !== 'ultra') {
    res.status(400).json({ error: 'plan free | pro | ultra olmalı' });
    return;
  }
  const plan = planRaw as PlanKey;
  try {
    await adminSetServerPlan((req as any).userId, id, plan);
    res.status(204).end();
  } catch (e) {
    handleServiceError(res, e);
  }
});

// ── PATCH /admin/servers/:id/force-owner-leave ──
router.patch('/servers/:id/force-owner-leave', adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: 'id gerekli' });
    return;
  }
  try {
    const result = await adminForceOwnerLeave((req as any).userId, id);
    res.json(result);
  } catch (e) {
    handleServiceError(res, e);
  }
});

// ── GET /admin/users ──
// Query: role, plan, planStatus, ownership, search, limit, offset
router.get('/users', async (req: Request, res: Response) => {
  const headerAuth = req.headers.authorization;
  const token = headerAuth?.startsWith('Bearer ') ? headerAuth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Token gerekli' });
    return;
  }

  const role = req.query.role === 'admin' || req.query.role === 'mod' || req.query.role === 'user' ? req.query.role : undefined;
  const planRaw = req.query.plan;
  const plan = planRaw === 'free' || planRaw === 'pro' || planRaw === 'ultra' ? planRaw : undefined;
  const planStatusRaw = req.query.planStatus;
  const planStatus = planStatusRaw === 'active' || planStatusRaw === 'expired' || planStatusRaw === 'unlimited' || planStatusRaw === 'none'
    ? planStatusRaw : undefined;
  const ownershipRaw = req.query.ownership;
  const ownership = ownershipRaw === 'has-server' || ownershipRaw === 'no-server' || ownershipRaw === 'only-owners' ? ownershipRaw : undefined;
  const searchRaw = typeof req.query.search === 'string' ? req.query.search : '';
  const search = searchRaw.trim().slice(0, 120);
  const sortRaw = req.query.sort;
  const sort: UserSort | undefined =
    sortRaw === 'name-asc' || sortRaw === 'name-desc' || sortRaw === 'created-asc' || sortRaw === 'created-desc'
      ? sortRaw : undefined;
  const limit = Number.parseInt(String(req.query.limit ?? '25'), 10);
  const offset = Number.parseInt(String(req.query.offset ?? '0'), 10);
  if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
    res.status(400).json({ error: 'limit/offset geçersiz' });
    return;
  }

  try {
    const result = await listAllUsers(token, { role, plan, planStatus, ownership, search, sort, limit, offset });
    res.json(result);
  } catch (e) {
    console.error('[admin/users] list failed', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
});

// ── GET /admin/users/:id/servers ──
router.get('/users/:id/servers', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) { res.status(400).json({ error: 'id gerekli' }); return; }
  try {
    const rows = await listUserOwnedServers(id);
    res.json({ items: rows });
  } catch (e) {
    console.error('[admin/users/:id/servers] failed', e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── PATCH /admin/users/:id/plan ──
// body: { plan: 'free'|'pro'|'ultra', durationType: '1week'|'1month'|'1year'|'custom'|'unlimited', customEndAt?: string }
router.patch('/users/:id/plan', adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) { res.status(400).json({ error: 'id gerekli' }); return; }

  const headerAuth = req.headers.authorization;
  const token = headerAuth?.startsWith('Bearer ') ? headerAuth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Token gerekli' }); return; }

  const planRaw = req.body?.plan;
  if (planRaw !== 'free' && planRaw !== 'pro' && planRaw !== 'ultra') {
    res.status(400).json({ error: 'plan free|pro|ultra olmalı' }); return;
  }
  const durationRaw = req.body?.durationType;
  const validDurations: DurationType[] = ['1week', '1month', '1year', 'custom', 'unlimited'];
  if (!validDurations.includes(durationRaw)) {
    res.status(400).json({ error: 'durationType geçersiz' }); return;
  }
  const customEndAt = typeof req.body?.customEndAt === 'string' ? req.body.customEndAt : undefined;

  try {
    await setUserPlanManual({
      adminUserId: (req as any).userId,
      adminToken: token,
      targetUserId: id,
      plan: planRaw as PlanKey,
      durationType: durationRaw as DurationType,
      customEndAt,
    });
    res.status(204).end();
  } catch (e) {
    const code = (e as Error & { code?: number }).code;
    res.status(code === 403 ? 403 : 400).json({ error: e instanceof Error ? e.message : 'İşlem başarısız' });
  }
});

// ── DELETE /admin/users/:id/plan ──
router.delete('/users/:id/plan', adminWriteRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) { res.status(400).json({ error: 'id gerekli' }); return; }

  const headerAuth = req.headers.authorization;
  const token = headerAuth?.startsWith('Bearer ') ? headerAuth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Token gerekli' }); return; }

  try {
    await revokeUserPlanManual((req as any).userId, token, id);
    res.status(204).end();
  } catch (e) {
    const code = (e as Error & { code?: number }).code;
    res.status(code === 403 ? 403 : 400).json({ error: e instanceof Error ? e.message : 'İşlem başarısız' });
  }
});

export default router;
