import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { listDeviceKeys, upsertDeviceKey } from '../services/e2eeService';

const router = Router();

router.use(authMiddleware as any);

function handleError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'E2EE işlemi başarısız';
  res.status(400).json({ error: message });
}

router.put('/device-key', async (req: Request, res: Response) => {
  try {
    await upsertDeviceKey((req as any).userId, req.body?.deviceId, req.body?.publicKey);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/device-keys', async (req: Request, res: Response) => {
  try {
    const raw = typeof req.query.userIds === 'string' ? req.query.userIds : '';
    const userIds = raw.split(',').map(id => id.trim()).filter(Boolean);
    res.json({ devices: await listDeviceKeys(userIds) });
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
