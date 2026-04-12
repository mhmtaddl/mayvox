import { Response } from 'express';

export function validateCreateServer(
  body: Record<string, unknown>,
  res: Response
): { name: string; description: string; isPublic: boolean; motto: string; plan: string } | null {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim();
  const isPublic = body.isPublic !== false;
  const motto = String(body.motto ?? '').trim().slice(0, 15);
  const plan = String(body.plan ?? 'free').trim();

  const words = name.split(/\s+/);
  if (!name || name.length < 3 || name.length > 15) {
    res.status(400).json({ error: 'Sunucu adı 3-15 karakter olmalı' });
    return null;
  }
  if (words.length > 3) {
    res.status(400).json({ error: 'Sunucu adı en fazla 3 kelime olabilir' });
    return null;
  }
  if (description.length > 200) {
    res.status(400).json({ error: 'Açıklama en fazla 200 karakter olabilir' });
    return null;
  }

  return { name, description, isPublic, motto, plan };
}

export function validateJoinServer(body: Record<string, unknown>, res: Response): { code: string } | null {
  // code: davet kodu (4-12), slug (.mv dahil), sunucu adı, sunucu UUID (36) — hepsi tolere edilir.
  // joinByInvite akıllı çözümleme yapar (upper/lower gerektiği gibi uygular).
  const code = String(body.code ?? '').trim();
  if (!code || code.length < 3 || code.length > 128) {
    res.status(400).json({ error: 'Geçerli bir davet kodu, slug veya sunucu adı gir' });
    return null;
  }
  return { code };
}
