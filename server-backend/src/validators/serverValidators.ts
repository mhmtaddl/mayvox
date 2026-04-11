import { Response } from 'express';

export function validateCreateServer(body: Record<string, unknown>, res: Response): { name: string; description: string } | null {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim();

  if (!name || name.length < 2 || name.length > 32) {
    res.status(400).json({ error: 'Sunucu adı 2-32 karakter olmalı' });
    return null;
  }
  if (description.length > 200) {
    res.status(400).json({ error: 'Açıklama en fazla 200 karakter olabilir' });
    return null;
  }

  return { name, description };
}

export function validateJoinServer(body: Record<string, unknown>, res: Response): { code: string } | null {
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code || code.length < 4 || code.length > 12) {
    res.status(400).json({ error: 'Geçerli bir davet kodu gir' });
    return null;
  }
  return { code };
}
