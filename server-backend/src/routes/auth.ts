import { Router, Request, Response } from 'express';
import { changeEmail, changePassword, login, me, register, AuthError } from '../services/authService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

function handleAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[auth route] unexpected error', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await login(req.body?.identifier, req.body?.password);
    res.json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/me', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const result = await me((req as any).user);
    res.json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const result = await register({
      email: req.body?.email,
      username: req.body?.username,
      password: req.body?.password,
      displayName: req.body?.displayName,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      age: req.body?.age,
      avatar: req.body?.avatar,
    });
    res.status(201).json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/change-password', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await changePassword((req as any).user, req.body?.password);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.post('/change-email', authMiddleware as any, async (req: Request, res: Response) => {
  try {
    await changeEmail((req as any).user, req.body?.email);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err);
  }
});

export default router;
