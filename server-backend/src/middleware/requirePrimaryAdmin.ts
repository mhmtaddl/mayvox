import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../repositories/db';

/**
 * requirePrimaryAdmin
 * ─────────────────
 * MUST run AFTER authMiddleware + requireSystemAdmin.
 * Stricter tier: yalnız `profiles.is_primary_admin = true` olanlar geçer.
 * Sunucu/kullanıcı silme gibi geri alınamaz aksiyonlarda kullanılır.
 */
export async function requirePrimaryAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    return;
  }

  try {
    const data = await queryOne<{ is_primary_admin: boolean | null }>(
      'SELECT is_primary_admin FROM profiles WHERE id = $1',
      [userId],
    );
    if (!data?.is_primary_admin) {
      res.status(403).json({ error: 'Bu işlem yalnızca ana yönetici tarafından yapılabilir' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requirePrimaryAdmin] failed', err);
    res.status(500).json({ error: 'Yetki doğrulanamadı' });
  }
}
