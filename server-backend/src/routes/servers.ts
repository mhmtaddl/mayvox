import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateCreateServer, validateJoinServer } from '../validators/serverValidators';
import * as serverService from '../services/serverService';
import * as channelService from '../services/channelService';
import type { AuthRequest } from '../types';

const router = Router();

// Tüm route'lar auth gerektirir
router.use(authMiddleware as any);

/** GET /servers/my — Kullanıcının sunucuları */
router.get('/my', async (req: AuthRequest, res: Response) => {
  try {
    const servers = await serverService.listMyServers(req.userId);
    res.json(servers);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /servers — Yeni sunucu oluştur */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const valid = validateCreateServer(req.body, res);
    if (!valid) return;
    const server = await serverService.createServer(req.userId, valid.name, valid.description);
    res.status(201).json(server);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /servers/search?q= — Public sunucu ara */
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const query = String(req.query.q ?? '');
    const servers = await serverService.searchServers(query);
    res.json(servers);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /servers/:id — Sunucu detay */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const server = await serverService.getServer(req.params.id, req.userId);
    if (!server) { res.status(404).json({ error: 'Sunucu bulunamadı' }); return; }
    res.json(server);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /servers/join — Davet kodu ile katıl */
router.post('/join', async (req: AuthRequest, res: Response) => {
  try {
    const valid = validateJoinServer(req.body, res);
    if (!valid) return;
    const server = await serverService.joinByInvite(req.userId, valid.code);
    res.status(201).json(server);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /servers/:id/leave — Sunucudan ayrıl */
router.post('/:id/leave', async (req: AuthRequest, res: Response) => {
  try {
    await serverService.leaveServer(req.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /servers/:id/channels — Sunucunun kanalları */
router.get('/:id/channels', async (req: AuthRequest, res: Response) => {
  try {
    const channels = await channelService.listChannels(req.params.id, req.userId);
    res.json(channels);
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res: Response, err: unknown) {
  if (err instanceof serverService.AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[server-route]', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

export default router;
