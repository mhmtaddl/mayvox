import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config';
import { queryMany } from '../repositories/db';
import { supabase } from '../supabaseClient';

/**
 * LiveKit moderation helpers.
 *
 * Kurallar:
 *  - Room name  = channel.id (UUID string). Frontend getLiveKitToken çağrısında bu kullanılıyor.
 *  - Identity   = profile.name. Token server ile aynı convention — değişirse ikisi de değişmeli.
 *  - ENV eksikse tüm fonksiyonlar no-op (0 channel etkilendi) döner, hata fırlatmaz.
 *    Bu deliberate: moderation aksiyonu DB tarafında başarılı, LiveKit tarafı sessiz downgrade.
 */

let _client: RoomServiceClient | null = null;

function getClient(): RoomServiceClient | null {
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) return null;
  if (!_client) {
    _client = new RoomServiceClient(config.livekitUrl, config.livekitApiKey, config.livekitApiSecret);
  }
  return _client;
}

export function isLiveKitConfigured(): boolean {
  return getClient() !== null;
}

/** user_id → profile.name (LiveKit identity). Bulunamazsa null. */
async function resolveIdentity(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const name = (data as { name?: string | null }).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

async function listServerVoiceChannelIds(serverId: string): Promise<string[]> {
  const rows = await queryMany<{ id: string }>(
    "SELECT id FROM channels WHERE server_id = $1 AND type = 'voice'",
    [serverId]
  );
  return rows.map(r => r.id);
}

/**
 * LiveKit RoomServiceClient.removeParticipant tek bir room'a. NotFound sessizce yutulur
 * (katılımcı o odada değilse işlem zaten başarılı sayılır).
 *
 * @returns true = katılımcı düşürüldü, false = yoktu ya da LiveKit konfigüre değil
 */
async function removeFromOneRoom(roomName: string, identity: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await client.removeParticipant(roomName, identity);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    // LiveKit server "participant not found" / "room not found" → sessiz success
    if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('404')) {
      return false;
    }
    // Diğer hatalar: logla ama moderator aksiyonunu patlatma
    console.warn('[livekit] removeParticipant failed', { roomName, identity, err });
    return false;
  }
}

/**
 * Belirli bir kanalın (= room'un) içindeki kullanıcıyı düşür.
 * Kullanılan yerler: room_kick (tek kanal hedefli).
 */
export async function removeParticipantFromChannel(
  channelId: string,
  targetUserId: string
): Promise<{ configured: boolean; removed: boolean }> {
  if (!isLiveKitConfigured()) return { configured: false, removed: false };
  const identity = await resolveIdentity(targetUserId);
  if (!identity) return { configured: true, removed: false };
  const removed = await removeFromOneRoom(channelId, identity);
  return { configured: true, removed };
}

/**
 * Sunucudaki TÜM voice kanallarından kullanıcıyı düşür.
 * Kullanılan yerler: timeout (kullanıcı o an hangi odadaysa düşsün), global room_kick.
 *
 * @returns etkilenen (gerçekten düşürülen) kanal sayısı.
 */
export async function removeParticipantFromAllServerRooms(
  serverId: string,
  targetUserId: string
): Promise<{ configured: boolean; channelsAffected: number }> {
  if (!isLiveKitConfigured()) return { configured: false, channelsAffected: 0 };
  const identity = await resolveIdentity(targetUserId);
  if (!identity) return { configured: true, channelsAffected: 0 };

  const channelIds = await listServerVoiceChannelIds(serverId);
  if (channelIds.length === 0) return { configured: true, channelsAffected: 0 };

  // Paralel dene; her bir oda bağımsız.
  const results = await Promise.all(channelIds.map(id => removeFromOneRoom(id, identity)));
  return { configured: true, channelsAffected: results.filter(Boolean).length };
}
