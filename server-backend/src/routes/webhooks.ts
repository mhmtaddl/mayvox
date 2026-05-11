/**
 * LiveKit Webhook Receiver
 *
 * Endpoint: POST /webhooks/livekit
 *
 * LiveKit sunucusu participant_joined/left ve room_* event'lerini buraya POST eder.
 * HMAC signature verification `WebhookReceiver` içinde — LIVEKIT_API_KEY/SECRET ile.
 *
 * Güvenlik:
 *   - Public endpoint (LiveKit WAN'dan çağırıyor). authMiddleware UYGULANMAZ.
 *   - WebhookReceiver.receive() Authorization header'ı verify eder — sahte istek reddedilir.
 *   - LIVEKIT_API_KEY/SECRET yoksa endpoint 503 döner (noop'a düşmez — silent data loss engeli).
 *   - LiveKit retry döngüsüne girmemek için uygulama hatalarında 200 döner (sadece imza hatasında 401).
 *
 * Raw body: Express JSON middleware devreye girmeden önce `express.raw()` ile bağlanır
 * (index.ts'te router mount sırası bu yüzden kritik).
 */
import { Router, type Request, type Response } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../config';
import { openSession, closeSession } from '../services/voiceActivityService';
import { recordRoomActivityEventDirect } from '../services/roomActivityService';
import { fetchProfileNameMap } from '../services/profileLookupService';

const router = Router();

async function profileName(userId: string): Promise<string> {
  const names = await fetchProfileNameMap([userId]);
  return names.get(userId) || 'Kullanıcı';
}

let _receiver: WebhookReceiver | null = null;
function getReceiver(): WebhookReceiver | null {
  if (!config.livekitApiKey || !config.livekitApiSecret) return null;
  if (!_receiver) {
    _receiver = new WebhookReceiver(config.livekitApiKey, config.livekitApiSecret);
  }
  return _receiver;
}

router.post('/livekit', async (req: Request, res: Response) => {
  const receiver = getReceiver();
  if (!receiver) {
    // LIVEKIT_* env yok → config incomplete. 503: LiveKit retry yapsın.
    return res.status(503).json({ error: 'livekit_not_configured' });
  }

  // Raw body Buffer (express.raw ile mount edildi)
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const authHeader = req.headers['authorization'] || '';

  let event;
  try {
    event = await receiver.receive(raw, Array.isArray(authHeader) ? authHeader[0] : authHeader);
  } catch (err) {
    // İmza doğrulama veya JSON parse fail → sahte / bozuk istek → 401
    console.warn('[webhook/livekit] signature/parse fail:', err instanceof Error ? err.message : err);
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const eventName = event.event;
  const participantIdentity = event.participant?.identity;
  const roomName = event.room?.name;

  try {
    if (eventName === 'participant_joined' && participantIdentity && roomName) {
      const r = await openSession(participantIdentity, roomName);
      if (r.opened && r.serverId) {
        const name = await profileName(participantIdentity);
        await recordRoomActivityEventDirect({
          serverId: r.serverId,
          channelId: roomName,
          type: 'join',
          targetUserId: participantIdentity,
          label: `${name} odaya katıldı`,
          metadata: { source: 'livekit' },
        });
        console.log('[livekit-webhook] participant_joined', { hasIdentity: true, hasRoom: true });
      }
    } else if (eventName === 'participant_left' && participantIdentity && roomName) {
      const r = await closeSession(participantIdentity, roomName);
      if (r.closed && r.serverId) {
        const name = await profileName(participantIdentity);
        await recordRoomActivityEventDirect({
          serverId: r.serverId,
          channelId: roomName,
          type: 'leave',
          targetUserId: participantIdentity,
          label: `${name} odadan ayrıldı`,
          metadata: { source: 'livekit', pairsUpdated: r.pairsUpdated },
        });
        console.log('[livekit-webhook] participant_left', { hasIdentity: true, hasRoom: true, pairsUpdated: r.pairsUpdated });
      }
    }
    // room_started / room_finished / track_* → ignore. Gelecekte spektogram için kullanılabilir.
  } catch (err) {
    // DB hatası vs. LiveKit retry'a sokma — idempotent değil, veri bozulmasın.
    console.warn('[webhook/livekit] handler error:', err instanceof Error ? err.message : err, { eventName });
  }

  // Her halükarda 200: LiveKit retry döngüsünü engelle.
  res.status(200).end();
});

export default router;
