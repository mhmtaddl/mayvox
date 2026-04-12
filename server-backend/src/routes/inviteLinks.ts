import { Router, Request, Response, NextFunction } from 'express';
import * as inviteLinkService from '../services/inviteLinkService';
import { AppError } from '../services/serverService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Accept rate limit ──
// 5 istek / 30 sn / userId (fallback IP). Success + failure her ikisini sayar —
// brute-force token probing'e karşı. Pattern: chat-server/server.cjs ile tutarlı.
const ACCEPT_WINDOW_MS = 30_000;
const ACCEPT_MAX = 5;
const acceptLimits = new Map<string, { count: number; resetAt: number }>();

function checkAcceptLimit(key: string): boolean {
  const now = Date.now();
  let entry = acceptLimits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + ACCEPT_WINDOW_MS };
    acceptLimits.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= ACCEPT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of acceptLimits) if (now > v.resetAt) acceptLimits.delete(k);
}, 5 * 60_000).unref?.();

function acceptRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as any).userId as string | undefined;
  const key = userId ? `u:${userId}` : `ip:${req.ip || 'unknown'}`;
  if (!checkAcceptLimit(key)) {
    console.warn(`[invite-accept] rate-limited key=${key}`);
    res.status(429).json({ error: 'Çok fazla deneme, biraz bekleyin.' });
    return;
  }
  next();
}

/** GET /invite-links/preview?token=... — ön izleme (kabul etmeden) */
router.get('/preview', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) { res.status(400).json({ error: 'token gerekli' }); return; }
    const preview = await inviteLinkService.previewInviteLink(token);
    res.json(preview);
  } catch (err) { handleError(res, err); }
});

/** POST /invite-links/accept — {token} ile daveti kabul et */
router.post('/accept', authMiddleware, acceptRateLimit, async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token) { res.status(400).json({ error: 'token gerekli' }); return; }
    const result = await inviteLinkService.acceptInviteLink((req as any).userId, token);
    res.json(result);
  } catch (err) { handleError(res, err); }
});

function handleError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[invite-links-route]', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

export default router;
