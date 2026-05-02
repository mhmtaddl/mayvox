import { Request, Response, NextFunction } from 'express';
import { AuthError, verifyAuthToken } from '../services/authService';

/**
 * JWT auth middleware.
 * req.userId intentionally maps to profiles.id because domain tables use profiles.
 * req.appUserId keeps the app_users.id value for auth/account operations.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token gerekli' });
    return;
  }

  const token = header.slice(7);

  try {
    const user = verifyAuthToken(token);
    (req as any).user = user;
    (req as any).userId = user.profileId;
    (req as any).profileId = user.profileId;
    (req as any).appUserId = user.appUserId;
    next();
  } catch (err) {
    const message = err instanceof AuthError ? err.message : 'Token doğrulama hatası';
    res.status(401).json({ error: message });
  }
}
