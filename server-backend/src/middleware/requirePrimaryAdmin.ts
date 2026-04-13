import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

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

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token gerekli' });
    return;
  }
  const token = header.slice(7);

  try {
    const scoped = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await scoped
      .from('profiles')
      .select('is_primary_admin')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[requirePrimaryAdmin] supabase error', error.message);
      res.status(500).json({ error: 'Yetki doğrulanamadı' });
      return;
    }
    if (!data || !(data as { is_primary_admin?: boolean }).is_primary_admin) {
      res.status(403).json({ error: 'Bu işlem yalnızca ana yönetici tarafından yapılabilir' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requirePrimaryAdmin] failed', err);
    res.status(500).json({ error: 'Yetki doğrulanamadı' });
  }
}
