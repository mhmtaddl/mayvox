import { Router, type Request, type Response } from 'express';
import { config } from '../config';
import { logAction } from '../services/auditLogService';

const router = Router();

// Defense-in-depth: /internal/* yalnızca loopback'ten.
// Üretimde nginx dış erişimi keser; burada ikinci kilit.
function isLoopback(req: Request): boolean {
  const addr = req.socket?.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function requireInternal(req: Request, res: Response): boolean {
  if (!config.internalNotifySecret) {
    res.status(503).json({ error: 'internal_disabled' });
    return false;
  }
  if (!isLoopback(req)) {
    console.warn(`[internal] non-loopback reddedildi remote=${req.socket?.remoteAddress}`);
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  const provided = req.headers['x-internal-secret'];
  if (provided !== config.internalNotifySecret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /internal/audit — diğer servislerden (chat-server) audit yazma köprüsü.
 * Body kısıtlı: body text ASLA saklanmaz. `metadata` sadece metadata.
 * Üst katman chat-server kodunda; burası yalnızca shared-secret + loopback gate.
 */
router.post('/audit', async (req: Request, res: Response) => {
  if (!requireInternal(req, res)) return;

  const { serverId, actorId, action, resourceType, resourceId, metadata } = req.body ?? {};

  if (typeof actorId !== 'string' || !actorId) return res.status(400).json({ error: 'actorId required' });
  if (typeof action !== 'string' || !action) return res.status(400).json({ error: 'action required' });
  if (action.length > 64) return res.status(400).json({ error: 'action too long' });

  // Whitelist: chat-server yalnızca DM audit'i yazabilsin — yetki genişlemesin.
  if (!action.startsWith('dm.')) {
    return res.status(400).json({ error: 'action not permitted on this bridge' });
  }

  // Metadata sanity: 2 KB üst sınır, plain object, body metni asla yazma.
  let safeMetadata: Record<string, unknown> | undefined;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return res.status(400).json({ error: 'metadata must be object' });
    }
    const str = JSON.stringify(metadata);
    if (str.length > 2048) return res.status(400).json({ error: 'metadata too large' });
    safeMetadata = metadata as Record<string, unknown>;
  }

  try {
    await logAction({
      serverId: typeof serverId === 'string' && serverId ? serverId : null,
      actorId,
      action,
      resourceType: typeof resourceType === 'string' ? resourceType : undefined,
      resourceId: typeof resourceId === 'string' ? resourceId : undefined,
      metadata: safeMetadata,
    });
    res.status(204).end();
  } catch (err) {
    console.warn('[internal/audit] write failed', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'audit_failed' });
  }
});

export default router;
