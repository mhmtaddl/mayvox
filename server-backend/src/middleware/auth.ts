import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AuthRequest } from '../types';

/**
 * Supabase JWT doğrulama middleware.
 * Authorization: Bearer <token> header'ından token alır,
 * Supabase JWT secret ile doğrular, req.userId'ye Supabase user id koyar.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token gerekli' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.supabaseJwtSecret) as jwt.JwtPayload;
    const userId = payload.sub;
    if (!userId) {
      res.status(401).json({ error: 'Geçersiz token: kullanıcı kimliği bulunamadı' });
      return;
    }
    req.userId = userId;
    next();
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError ? 'Token süresi dolmuş' : 'Geçersiz token';
    res.status(401).json({ error: message });
  }
}
