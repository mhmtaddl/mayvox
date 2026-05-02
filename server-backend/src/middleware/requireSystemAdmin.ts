import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../repositories/db';

/**
 * requireSystemAdmin
 * ─────────────────
 * MUST run AFTER authMiddleware (needs req.userId).
 * profiles tablosunu doğrudan backend DB bağlantısıyla kontrol eder.
 */
export async function requireSystemAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    return;
  }

  try {
    const data = await queryOne<{ role: string | null; is_admin: boolean | null }>(
      'SELECT role, is_admin FROM profiles WHERE id = $1',
      [userId],
    );
    if (!data || (data.role !== 'system_admin' && data.is_admin !== true)) {
      res.status(403).json({ error: 'Bu işlem için sistem yöneticisi yetkisi gerekli' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requireSystemAdmin] role lookup failed', err);
    res.status(500).json({ error: 'Yetki doğrulanamadı' });
  }
}
