import { execute, queryMany, queryOne } from '../repositories/db';
import { getServerAccessContext } from './accessContextService';
import { AppError } from './serverService';
import { config } from '../config';

export type StreamPlatform = 'twitch' | 'youtube' | 'kick';

export interface ServerStreamLinkDto {
  id: string;
  serverId: string;
  userId: string;
  platform: StreamPlatform;
  channelUrl: string;
  channelName: string;
  enabled: boolean;
  liveStatus: boolean;
  liveTitle: string | null;
  viewerCount: number | null;
  thumbnailUrl: string | null;
  liveStartedAt: string | null;
  lastLiveTitle: string | null;
  lastLiveStartedAt: string | null;
  lastLiveEndedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
  username: string | null;
  avatar: string | null;
}

export interface StreamIntegrationDto {
  platform: 'twitch';
  enabled: boolean;
  clientId: string;
  hasClientSecret: boolean;
  updatedAt: string | null;
}

export interface YoutubeStreamIntegrationDto {
  platform: 'youtube';
  enabled: boolean;
  apiKey: string;
  hasApiKey: boolean;
  updatedAt: string | null;
}

interface StreamRow {
  id: string;
  server_id: string;
  user_id: string;
  platform: StreamPlatform;
  channel_url: string;
  channel_name: string;
  enabled: boolean;
  live_status: boolean;
  live_title: string | null;
  viewer_count: number | null;
  thumbnail_url: string | null;
  live_started_at: string | null;
  last_live_title: string | null;
  last_live_started_at: string | null;
  last_live_ended_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  username: string | null;
  avatar: string | null;
}

const PLATFORMS = new Set<StreamPlatform>(['twitch', 'youtube', 'kick']);
const TWITCH_REFRESH_INTERVAL_MS = 2 * 60_000;
const YOUTUBE_REFRESH_INTERVAL_MS = 3 * 60_000;

const twitchTokenCache = new Map<string, { token: string; expiresAt: number }>();

function timeValue(iso?: string | null): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

interface TwitchCredentials {
  clientId: string;
  clientSecret: string;
}

interface TwitchStreamPayload {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
}

interface YoutubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YoutubeVideoItem {
  id?: string;
  snippet?: {
    title?: string;
    liveBroadcastContent?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    concurrentViewers?: string;
  };
}

interface YoutubeCompletedLive {
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  thumbnailUrl: string | null;
}

function mapRow(row: StreamRow): ServerStreamLinkDto {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    platform: row.platform,
    channelUrl: row.channel_url,
    channelName: row.channel_name,
    enabled: row.enabled,
    liveStatus: row.live_status,
    liveTitle: row.live_title,
    viewerCount: row.viewer_count,
    thumbnailUrl: row.thumbnail_url,
    liveStartedAt: row.live_started_at,
    lastLiveTitle: row.last_live_title,
    lastLiveStartedAt: row.last_live_started_at,
    lastLiveEndedAt: row.last_live_ended_at,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayName: row.display_name,
    username: row.username,
    avatar: row.avatar,
  };
}

function twitchCredentialsConfigured(credentials: TwitchCredentials): boolean {
  return !!credentials.clientId && !!credentials.clientSecret;
}

function twitchLoginFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.endsWith('twitch.tv')) return null;
    const first = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean)[0] || '';
    const reserved = new Set(['directory', 'downloads', 'jobs', 'p', 'settings', 'subscriptions', 'turbo', 'videos']);
    const login = first.replace(/^@/, '').toLowerCase();
    if (!login || reserved.has(login)) return null;
    return login;
  } catch {
    return null;
  }
}

function staleForRefresh(row: StreamRow): boolean {
  if (!row.enabled || row.platform !== 'twitch') return false;
  if (!row.last_checked_at) return true;
  const checkedAt = new Date(row.last_checked_at).getTime();
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= TWITCH_REFRESH_INTERVAL_MS;
}

function staleForYoutubeRefresh(row: StreamRow): boolean {
  if (!row.enabled || row.platform !== 'youtube') return false;
  if (!row.last_checked_at) return true;
  const checkedAt = new Date(row.last_checked_at).getTime();
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= YOUTUBE_REFRESH_INTERVAL_MS;
}

async function getServerTwitchCredentials(serverId: string): Promise<TwitchCredentials> {
  const row = await queryOne<{ client_id: string | null; client_secret: string | null }>(
    `SELECT client_id, client_secret
       FROM server_stream_integrations
      WHERE server_id = $1
        AND platform = 'twitch'
        AND enabled = true
      LIMIT 1`,
    [serverId],
  );

  const serverCredentials = {
    clientId: String(row?.client_id || '').trim(),
    clientSecret: String(row?.client_secret || '').trim(),
  };
  if (twitchCredentialsConfigured(serverCredentials)) return serverCredentials;

  return {
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
  };
}

async function getServerYoutubeApiKey(serverId: string): Promise<string> {
  const row = await queryOne<{ client_id: string | null }>(
    `SELECT client_id
       FROM server_stream_integrations
      WHERE server_id = $1
        AND platform = 'youtube'
        AND enabled = true
      LIMIT 1`,
    [serverId],
  );

  return String(row?.client_id || config.youtubeApiKey || '').trim();
}

async function getTwitchAppToken(credentials: TwitchCredentials): Promise<string | null> {
  if (!twitchCredentialsConfigured(credentials)) return null;
  const cacheKey = credentials.clientId;
  const cached = twitchTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    console.warn('[streams:twitch] token request failed', response.status);
    return null;
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  twitchTokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000,
  });
  return data.access_token;
}

async function refreshTwitchStatus(serverId: string, rows: StreamRow[]): Promise<void> {
  const candidates = rows.filter(staleForRefresh);
  if (candidates.length === 0) return;

  const loginById = new Map<string, string>();
  for (const row of candidates) {
    const login = twitchLoginFromUrl(row.channel_url);
    if (login) loginById.set(row.id, login);
  }
  const logins = Array.from(new Set(loginById.values())).slice(0, 100);
  if (logins.length === 0) return;

  const credentials = await getServerTwitchCredentials(serverId);
  const token = await getTwitchAppToken(credentials);
  if (!token) return;

  const params = new URLSearchParams();
  for (const login of logins) params.append('user_login', login);

  try {
    const response = await fetch(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
      headers: {
        'Client-Id': credentials.clientId,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      console.warn('[streams:twitch] stream request failed', response.status);
      return;
    }

    const payload = await response.json() as { data?: TwitchStreamPayload[] };
    const liveByLogin = new Map<string, TwitchStreamPayload>();
    for (const stream of payload.data ?? []) {
      if (stream.type === 'live') liveByLogin.set(stream.user_login.toLowerCase(), stream);
    }

    await Promise.all(candidates.map(async row => {
      const login = loginById.get(row.id);
      if (!login) return;
      const live = liveByLogin.get(login);
      await execute(
        `UPDATE server_stream_links
            SET live_status = $3,
                live_title = $4,
                viewer_count = $5,
                thumbnail_url = $6,
                live_started_at = $7,
                last_live_title = CASE WHEN $8 AND NOT $3 THEN COALESCE($9, last_live_title) ELSE last_live_title END,
                last_live_started_at = CASE WHEN $8 AND NOT $3 THEN COALESCE($10::timestamptz, last_live_started_at) ELSE last_live_started_at END,
                last_live_ended_at = CASE WHEN $8 AND NOT $3 THEN now() ELSE last_live_ended_at END,
                last_checked_at = now(),
                updated_at = now()
          WHERE id::text = $1
            AND server_id = $2`,
        [
          row.id,
          row.server_id,
          !!live,
          live?.title ?? null,
          live?.viewer_count ?? null,
          live?.thumbnail_url ?? null,
          live?.started_at ?? null,
          row.live_status,
          row.live_title,
          row.live_started_at,
        ],
      );
    }));
  } catch (err) {
    console.warn('[streams:twitch] refresh failed', err instanceof Error ? err.message : err);
  }
}

function youtubeRefFromUrl(url: string): { channelId?: string; handle?: string; query?: string; videoId?: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const videoId = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean)[0];
      return videoId ? { videoId } : null;
    }
    if (!host.includes('youtube.com')) return null;
    const parts = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean);
    if (parts[0]?.toLowerCase() === 'watch') {
      const videoId = parsed.searchParams.get('v')?.trim();
      return videoId ? { videoId } : null;
    }
    if (['live', 'shorts', 'embed'].includes(parts[0]?.toLowerCase() || '') && parts[1]) {
      return { videoId: parts[1] };
    }
    if (parts[0]?.toLowerCase() === 'channel' && parts[1]) return { channelId: parts[1] };
    const handle = parts.find(part => part.startsWith('@'));
    if (handle) return { handle };
    const namedPathIndex = parts.findIndex(part => ['c', 'user'].includes(part.toLowerCase()));
    if (namedPathIndex >= 0 && parts[namedPathIndex + 1]) return { query: decodeURIComponent(parts[namedPathIndex + 1]) };
    if (parts[0] && !['watch', 'live', 'shorts', 'embed'].includes(parts[0].toLowerCase())) {
      return { query: decodeURIComponent(parts[0]).replace(/^@/, '') };
    }
    return null;
  } catch {
    return null;
  }
}

async function refreshYoutubeVideoStatus(apiKey: string, row: StreamRow, videoId: string): Promise<void> {
  const params = new URLSearchParams({
    part: 'snippet,liveStreamingDetails',
    id: videoId,
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!response.ok) {
    console.warn('[streams:youtube] video request failed', response.status);
    return;
  }

  const payload = await response.json() as { items?: YoutubeVideoItem[] };
  const video = payload.items?.[0];
  const liveDetails = video?.liveStreamingDetails;
  const isLive = video?.snippet?.liveBroadcastContent === 'live'
    || (!!liveDetails?.actualStartTime && !liveDetails?.actualEndTime);
  const thumbnail = video?.snippet?.thumbnails?.high?.url
    || video?.snippet?.thumbnails?.medium?.url
    || video?.snippet?.thumbnails?.default?.url
    || null;

  await execute(
    `UPDATE server_stream_links
        SET live_status = $3,
            live_title = $4,
            viewer_count = $5,
            thumbnail_url = $6,
            live_started_at = $7,
            last_live_title = CASE WHEN $8 AND NOT $3 THEN COALESCE($9, last_live_title) ELSE last_live_title END,
            last_live_started_at = CASE WHEN $8 AND NOT $3 THEN COALESCE($10::timestamptz, last_live_started_at) ELSE last_live_started_at END,
            last_live_ended_at = CASE WHEN $8 AND NOT $3 THEN COALESCE($11::timestamptz, now()) ELSE last_live_ended_at END,
            last_checked_at = now(),
            updated_at = now()
      WHERE id::text = $1
        AND server_id = $2`,
    [
      row.id,
      row.server_id,
      isLive,
      isLive ? video?.snippet?.title ?? null : null,
      isLive && liveDetails?.concurrentViewers ? Number(liveDetails.concurrentViewers) || null : null,
      isLive ? thumbnail : null,
      isLive ? liveDetails?.actualStartTime ?? video?.snippet?.publishedAt ?? null : null,
      row.live_status,
      row.live_title,
      row.live_started_at,
      liveDetails?.actualEndTime ?? null,
    ],
  );
}

async function resolveYoutubeChannelId(apiKey: string, ref: { channelId?: string; handle?: string; query?: string }): Promise<string | null> {
  if (ref.channelId) return ref.channelId;

  const params = new URLSearchParams({
    part: 'id',
    key: apiKey,
  });
  if (ref.handle) {
    params.set('forHandle', ref.handle);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
    if (response.ok) {
      const data = await response.json() as { items?: Array<{ id?: string }> };
      const id = data.items?.[0]?.id;
      if (id) return id;
    }
  }

  const query = ref.query || ref.handle?.replace(/^@/, '');
  if (!query) return null;
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    maxResults: '1',
    q: query,
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
  if (!response.ok) return null;
  const data = await response.json() as { items?: Array<{ id?: { channelId?: string } }> };
  return data.items?.[0]?.id?.channelId || null;
}

async function getLatestYoutubeCompletedLive(apiKey: string, channelId: string): Promise<YoutubeCompletedLive | null> {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    channelId,
    eventType: 'completed',
    type: 'video',
    order: 'date',
    maxResults: '1',
    key: apiKey,
  });
  const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
  if (!searchResponse.ok) return null;
  const searchPayload = await searchResponse.json() as { items?: YoutubeSearchItem[] };
  const videoId = searchPayload.items?.[0]?.id?.videoId;
  if (!videoId) return null;

  const videoParams = new URLSearchParams({
    part: 'snippet,liveStreamingDetails',
    id: videoId,
    key: apiKey,
  });
  const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoParams.toString()}`);
  if (!videoResponse.ok) return null;
  const videoPayload = await videoResponse.json() as { items?: YoutubeVideoItem[] };
  const video = videoPayload.items?.[0];
  const liveDetails = video?.liveStreamingDetails;
  if (!video || !liveDetails?.actualStartTime || !liveDetails?.actualEndTime) return null;
  const thumbnail = video.snippet?.thumbnails?.high?.url
    || video.snippet?.thumbnails?.medium?.url
    || video.snippet?.thumbnails?.default?.url
    || null;

  return {
    title: video.snippet?.title ?? null,
    startedAt: liveDetails.actualStartTime,
    endedAt: liveDetails.actualEndTime,
    thumbnailUrl: thumbnail,
  };
}

async function refreshYoutubeStatus(serverId: string, rows: StreamRow[]): Promise<void> {
  const candidates = rows.filter(staleForYoutubeRefresh);
  if (candidates.length === 0) return;

  const apiKey = await getServerYoutubeApiKey(serverId);
  if (!apiKey) return;

  try {
    await Promise.all(candidates.map(async row => {
      const ref = youtubeRefFromUrl(row.channel_url);
      if (!ref) return;
      if (ref.videoId) {
        await refreshYoutubeVideoStatus(apiKey, row, ref.videoId);
        return;
      }
      const channelId = await resolveYoutubeChannelId(apiKey, ref);
      if (!channelId) return;

      const params = new URLSearchParams({
        part: 'snippet',
        channelId,
        eventType: 'live',
        type: 'video',
        maxResults: '1',
        key: apiKey,
      });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      if (!response.ok) {
        console.warn('[streams:youtube] stream request failed', response.status);
        return;
      }

      const payload = await response.json() as { items?: YoutubeSearchItem[] };
      const live = payload.items?.[0];
      const thumbnail = live?.snippet?.thumbnails?.high?.url
        || live?.snippet?.thumbnails?.medium?.url
        || live?.snippet?.thumbnails?.default?.url
        || null;
      const latestCompleted = live ? null : await getLatestYoutubeCompletedLive(apiKey, channelId);
      const shouldBackfillCompleted = !live
        && !!latestCompleted?.endedAt
        && (!row.last_live_ended_at || timeValue(latestCompleted.endedAt) > timeValue(row.last_live_ended_at));

      await execute(
        `UPDATE server_stream_links
            SET live_status = $3,
                live_title = $4,
                viewer_count = NULL,
                thumbnail_url = $5,
                live_started_at = $6,
                last_live_title = CASE
                  WHEN $10 THEN COALESCE($11, last_live_title)
                  WHEN $7 AND NOT $3 THEN COALESCE($8, last_live_title)
                  ELSE last_live_title
                END,
                last_live_started_at = CASE
                  WHEN $10 THEN COALESCE($12::timestamptz, last_live_started_at)
                  WHEN $7 AND NOT $3 THEN COALESCE($9::timestamptz, last_live_started_at)
                  ELSE last_live_started_at
                END,
                last_live_ended_at = CASE
                  WHEN $10 THEN COALESCE($13::timestamptz, last_live_ended_at)
                  WHEN $7 AND NOT $3 THEN now()
                  ELSE last_live_ended_at
                END,
                last_checked_at = now(),
                updated_at = now()
          WHERE id::text = $1
            AND server_id = $2`,
        [
          row.id,
          row.server_id,
          !!live,
          live?.snippet?.title ?? null,
          thumbnail,
          live?.snippet?.publishedAt ?? null,
          row.live_status,
          row.live_title,
          row.live_started_at,
          shouldBackfillCompleted,
          latestCompleted?.title ?? null,
          latestCompleted?.startedAt ?? null,
          latestCompleted?.endedAt ?? null,
        ],
      );
    }));
  } catch (err) {
    console.warn('[streams:youtube] refresh failed', err instanceof Error ? err.message : err);
  }
}

function normalizePlatform(value: unknown): StreamPlatform {
  const platform = String(value || '').trim().toLowerCase() as StreamPlatform;
  if (!PLATFORMS.has(platform)) throw new AppError(400, 'Geçersiz yayın platformu');
  return platform;
}

function normalizeUrl(platform: StreamPlatform, raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) throw new AppError(400, 'Yayın adresi gerekli');
  const withProtocol = /^https?:\/\//i.test(value) ? value : platform === 'twitch'
    ? `https://www.twitch.tv/${value.replace(/^@/, '')}`
    : platform === 'kick'
      ? `https://kick.com/${value.replace(/^@/, '')}`
      : `https://www.youtube.com/${value.replace(/^@/, '')}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AppError(400, 'Geçerli bir yayın adresi gir');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'Geçerli bir yayın adresi gir');
  }
  return parsed.toString();
}

function deriveChannelName(url: string, explicit?: unknown): string {
  const manual = String(explicit || '').trim();
  if (manual) return manual.slice(0, 120);

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').map(part => part.trim()).filter(Boolean);

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const handle = parts.find(part => part.startsWith('@'));
      if (handle) return decodeURIComponent(handle).replace(/^@/, '').slice(0, 120);
      const namedPathIndex = parts.findIndex(part => ['c', 'user'].includes(part.toLowerCase()));
      if (namedPathIndex >= 0 && parts[namedPathIndex + 1]) {
        return decodeURIComponent(parts[namedPathIndex + 1]).replace(/^@/, '').slice(0, 120);
      }
      return 'YouTube yayını';
    }

    const candidate = parts.find(part => !['channel', 'c', 'user', 'live', 'watch', 'videos'].includes(part.toLowerCase()));
    if (candidate) return decodeURIComponent(candidate).replace(/^@/, '').slice(0, 120);
    if (host.includes('twitch.tv')) return 'Twitch yayını';
    if (host.includes('kick.com')) return 'Kick yayını';
    return host.slice(0, 120);
  } catch {
    return 'Yayın';
  }
}

async function requireMember(userId: string, serverId: string) {
  const ctx = await getServerAccessContext(userId, serverId);
  if (!ctx.membership.exists) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  return ctx;
}

async function requireStreamManager(userId: string, serverId: string) {
  const ctx = await requireMember(userId, serverId);
  if (!ctx.membership.isOwner && !ctx.flags.canManageServer && !ctx.flags.canKickMembers) {
    throw new AppError(403, 'Yayın bağlantılarını yönetme yetkin yok');
  }
  return ctx;
}

export async function listServerStreamLinks(serverId: string, userId: string): Promise<ServerStreamLinkDto[]> {
  await requireMember(userId, serverId);

  const rows = await queryMany<StreamRow>(
    `SELECT
        ssl.id::text,
        ssl.server_id::text,
        ssl.user_id::text,
        ssl.platform,
        ssl.channel_url,
        ssl.channel_name,
        ssl.enabled,
        ssl.live_status,
        ssl.live_title,
        ssl.viewer_count,
        ssl.thumbnail_url,
        ssl.live_started_at::text,
        ssl.last_live_title,
        ssl.last_live_started_at::text,
        ssl.last_live_ended_at::text,
        ssl.last_checked_at::text,
        ssl.created_at::text,
        ssl.updated_at::text,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), NULLIF(p.email, ''), 'Kullanıcı') AS display_name,
        COALESCE(NULLIF(p.name, ''), NULLIF(p.email, ''), 'Kullanıcı') AS username,
        p.avatar
       FROM server_stream_links ssl
       LEFT JOIN profiles p ON p.id = ssl.user_id
      WHERE ssl.server_id = $1
      ORDER BY ssl.live_status DESC, ssl.created_at DESC`,
    [serverId],
  );

  await refreshTwitchStatus(serverId, rows);
  await refreshYoutubeStatus(serverId, rows);

  const refreshedRows = await queryMany<StreamRow>(
    `SELECT
        ssl.id::text,
        ssl.server_id::text,
        ssl.user_id::text,
        ssl.platform,
        ssl.channel_url,
        ssl.channel_name,
        ssl.enabled,
        ssl.live_status,
        ssl.live_title,
        ssl.viewer_count,
        ssl.thumbnail_url,
        ssl.live_started_at::text,
        ssl.last_live_title,
        ssl.last_live_started_at::text,
        ssl.last_live_ended_at::text,
        ssl.last_checked_at::text,
        ssl.created_at::text,
        ssl.updated_at::text,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), NULLIF(p.email, ''), 'Kullanıcı') AS display_name,
        COALESCE(NULLIF(p.name, ''), NULLIF(p.email, ''), 'Kullanıcı') AS username,
        p.avatar
       FROM server_stream_links ssl
       LEFT JOIN profiles p ON p.id = ssl.user_id
      WHERE ssl.server_id = $1
      ORDER BY ssl.live_status DESC, ssl.created_at DESC`,
    [serverId],
  );

  return refreshedRows.map(mapRow);
}

export async function createServerStreamLink(
  serverId: string,
  userId: string,
  input: { platform?: unknown; channelUrl?: unknown; channelName?: unknown; enabled?: unknown },
): Promise<ServerStreamLinkDto> {
  await requireStreamManager(userId, serverId);

  const platform = normalizePlatform(input.platform);
  const channelUrl = normalizeUrl(platform, input.channelUrl);
  const channelName = deriveChannelName(channelUrl, input.channelName);
  const enabled = input.enabled === undefined ? true : input.enabled !== false;

  const row = await queryOne<StreamRow>(
    `INSERT INTO server_stream_links
       (server_id, user_id, platform, channel_url, channel_name, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (server_id, user_id, platform)
     DO UPDATE SET
       channel_url = EXCLUDED.channel_url,
       channel_name = EXCLUDED.channel_name,
       enabled = EXCLUDED.enabled,
       updated_at = now()
     RETURNING
       id::text,
       server_id::text,
       user_id::text,
       platform,
       channel_url,
       channel_name,
       enabled,
       live_status,
       live_title,
       viewer_count,
       thumbnail_url,
       live_started_at::text,
       last_live_title,
       last_live_started_at::text,
       last_live_ended_at::text,
       last_checked_at::text,
       created_at::text,
       updated_at::text,
       NULL::text AS display_name,
       NULL::text AS username,
       NULL::text AS avatar`,
    [serverId, userId, platform, channelUrl, channelName, enabled],
  );

  if (!row) throw new AppError(500, 'Yayın bağlantısı kaydedilemedi');
  return mapRow(row);
}

export async function updateServerStreamLink(
  serverId: string,
  userId: string,
  streamId: string,
  input: { channelUrl?: unknown; channelName?: unknown; enabled?: unknown },
): Promise<ServerStreamLinkDto> {
  await requireStreamManager(userId, serverId);

  const existing = await queryOne<StreamRow>(
    `SELECT
        ssl.id::text,
        ssl.server_id::text,
        ssl.user_id::text,
        ssl.platform,
        ssl.channel_url,
        ssl.channel_name,
        ssl.enabled,
        ssl.live_status,
        ssl.live_title,
        ssl.viewer_count,
        ssl.thumbnail_url,
        ssl.live_started_at::text,
        ssl.last_live_title,
        ssl.last_live_started_at::text,
        ssl.last_live_ended_at::text,
        ssl.last_checked_at::text,
        ssl.created_at::text,
        ssl.updated_at::text,
        NULL::text AS display_name,
        NULL::text AS username,
        NULL::text AS avatar
       FROM server_stream_links ssl
      WHERE ssl.server_id = $1
        AND ssl.id::text = $2
      LIMIT 1`,
    [serverId, streamId],
  );
  if (!existing) throw new AppError(404, 'Yayın bağlantısı bulunamadı');

  const channelUrl = input.channelUrl === undefined
    ? existing.channel_url
    : normalizeUrl(existing.platform, input.channelUrl);
  const channelName = input.channelName === undefined
    ? existing.channel_name
    : deriveChannelName(channelUrl, input.channelName);
  const enabled = input.enabled === undefined ? existing.enabled : input.enabled !== false;
  const urlChanged = channelUrl !== existing.channel_url;

  const row = await queryOne<StreamRow>(
    `UPDATE server_stream_links
        SET channel_url = $3,
            channel_name = $4,
            enabled = $5,
            live_status = CASE WHEN $6 THEN false ELSE live_status END,
            live_title = CASE WHEN $6 THEN NULL ELSE live_title END,
            viewer_count = CASE WHEN $6 THEN NULL ELSE viewer_count END,
            thumbnail_url = CASE WHEN $6 THEN NULL ELSE thumbnail_url END,
            live_started_at = CASE WHEN $6 THEN NULL ELSE live_started_at END,
            last_checked_at = CASE WHEN $6 THEN NULL ELSE last_checked_at END,
            updated_at = now()
      WHERE server_id = $1
        AND id::text = $2
      RETURNING
        id::text,
        server_id::text,
        user_id::text,
        platform,
        channel_url,
        channel_name,
        enabled,
        live_status,
        live_title,
        viewer_count,
        thumbnail_url,
        live_started_at::text,
        last_live_title,
        last_live_started_at::text,
        last_live_ended_at::text,
        last_checked_at::text,
        created_at::text,
        updated_at::text,
        NULL::text AS display_name,
        NULL::text AS username,
        NULL::text AS avatar`,
    [serverId, streamId, channelUrl, channelName, enabled, urlChanged],
  );

  if (!row) throw new AppError(404, 'Yayın bağlantısı bulunamadı');
  return mapRow(row);
}

export async function deleteServerStreamLink(serverId: string, userId: string, streamId: string): Promise<void> {
  await requireStreamManager(userId, serverId);
  const deleted = await execute(
    `DELETE FROM server_stream_links
      WHERE server_id = $1
        AND id::text = $2`,
    [serverId, streamId],
  );
  if (deleted === 0) throw new AppError(404, 'Yayın bağlantısı bulunamadı');
}

export async function getTwitchIntegration(serverId: string, userId: string): Promise<StreamIntegrationDto> {
  await requireStreamManager(userId, serverId);
  const row = await queryOne<{
    client_id: string | null;
    client_secret: string | null;
    enabled: boolean;
    updated_at: string | null;
  }>(
    `SELECT client_id, client_secret, enabled, updated_at::text
       FROM server_stream_integrations
      WHERE server_id = $1
        AND platform = 'twitch'
      LIMIT 1`,
    [serverId],
  );

  return {
    platform: 'twitch',
    enabled: row?.enabled ?? true,
    clientId: row?.client_id ?? '',
    hasClientSecret: !!String(row?.client_secret || '').trim(),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function updateTwitchIntegration(
  serverId: string,
  userId: string,
  input: { clientId?: unknown; clientSecret?: unknown; enabled?: unknown },
): Promise<StreamIntegrationDto> {
  await requireStreamManager(userId, serverId);

  const clientId = String(input.clientId || '').trim();
  const clientSecret = String(input.clientSecret || '').trim();
  const enabled = input.enabled === undefined ? true : input.enabled !== false;

  if (!clientId) throw new AppError(400, 'Twitch Client ID gerekli');
  if (!clientSecret) throw new AppError(400, 'Twitch Client Secret gerekli');

  const row = await queryOne<{
    client_id: string;
    client_secret: string;
    enabled: boolean;
    updated_at: string;
  }>(
    `INSERT INTO server_stream_integrations
       (server_id, platform, client_id, client_secret, enabled)
     VALUES ($1, 'twitch', $2, $3, $4)
     ON CONFLICT (server_id, platform)
     DO UPDATE SET
       client_id = EXCLUDED.client_id,
       client_secret = EXCLUDED.client_secret,
       enabled = EXCLUDED.enabled,
       updated_at = now()
     RETURNING client_id, client_secret, enabled, updated_at::text`,
    [serverId, clientId, clientSecret, enabled],
  );

  twitchTokenCache.delete(clientId);

  return {
    platform: 'twitch',
    enabled: row?.enabled ?? enabled,
    clientId: row?.client_id ?? clientId,
    hasClientSecret: !!String(row?.client_secret || clientSecret).trim(),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function getYoutubeIntegration(serverId: string, userId: string): Promise<YoutubeStreamIntegrationDto> {
  await requireStreamManager(userId, serverId);
  const row = await queryOne<{
    client_id: string | null;
    enabled: boolean;
    updated_at: string | null;
  }>(
    `SELECT client_id, enabled, updated_at::text
       FROM server_stream_integrations
      WHERE server_id = $1
        AND platform = 'youtube'
      LIMIT 1`,
    [serverId],
  );

  const apiKey = row?.client_id ?? '';
  return {
    platform: 'youtube',
    enabled: row?.enabled ?? true,
    apiKey,
    hasApiKey: !!String(apiKey || config.youtubeApiKey).trim(),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function updateYoutubeIntegration(
  serverId: string,
  userId: string,
  input: { apiKey?: unknown; enabled?: unknown },
): Promise<YoutubeStreamIntegrationDto> {
  await requireStreamManager(userId, serverId);

  const apiKey = String(input.apiKey || '').trim();
  const enabled = input.enabled === undefined ? true : input.enabled !== false;

  if (!apiKey) throw new AppError(400, 'YouTube API anahtarı gerekli');

  const row = await queryOne<{
    client_id: string;
    enabled: boolean;
    updated_at: string;
  }>(
    `INSERT INTO server_stream_integrations
       (server_id, platform, client_id, client_secret, enabled)
     VALUES ($1, 'youtube', $2, NULL, $3)
     ON CONFLICT (server_id, platform)
     DO UPDATE SET
       client_id = EXCLUDED.client_id,
       client_secret = NULL,
       enabled = EXCLUDED.enabled,
       updated_at = now()
     RETURNING client_id, enabled, updated_at::text`,
    [serverId, apiKey, enabled],
  );

  return {
    platform: 'youtube',
    enabled: row?.enabled ?? enabled,
    apiKey: row?.client_id ?? apiKey,
    hasApiKey: !!String(row?.client_id || apiKey).trim(),
    updatedAt: row?.updated_at ?? null,
  };
}
