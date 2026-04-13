import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

/**
 * requireSystemAdmin
 * ─────────────────
 * MUST run AFTER authMiddleware (needs req.userId).
 * profiles tablosu Supabase tarafında — kullanıcının token'ıyla scoped client
 * üstünden sorgulanır ki RLS policy "kendi profilini oku"ya takılmasın.
 */
export async function requireSystemAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[requireSystemAdmin] supabase error', error.message);
      res.status(500).json({ error: 'Yetki doğrulanamadı' });
      return;
    }
    if (!data || (data as { role?: string }).role !== 'system_admin') {
      res.status(403).json({ error: 'Bu işlem için sistem yöneticisi yetkisi gerekli' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requireSystemAdmin] role lookup failed', err);
    res.status(500).json({ error: 'Yetki doğrulanamadı' });
  }
}
