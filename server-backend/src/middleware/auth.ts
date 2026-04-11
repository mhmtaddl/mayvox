import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

/**
 * Supabase auth middleware.
 * Authorization: Bearer <access_token> header'ından token alır,
 * supabase.auth.getUser() ile doğrular, req.userId'ye user id koyar.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token gerekli' });
    return;
  }

  const token = header.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
      return;
    }

    (req as any).userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token doğrulama hatası' });
  }
}
