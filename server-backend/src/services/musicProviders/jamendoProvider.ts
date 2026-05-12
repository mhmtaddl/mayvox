import type { MusicProvider, MusicProviderMood, ProviderTrack, SearchTracksInput } from './types';

type JamendoTrack = {
  id?: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  duration?: number | string;
  image?: string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
};

const JAMENDO_TRACKS_URL = 'https://api.jamendo.com/v3.0/tracks/';
const DEFAULT_LIMIT = 10;

const moodTags: Record<MusicProviderMood, string[]> = {
  chill: ['chillout', 'ambient', 'downtempo', 'lounge'],
  focus: ['instrumental', 'ambient', 'electronic'],
  night: ['lofi', 'downtempo', 'jazz', 'chillout'],
};

export class JamendoProvider implements MusicProvider {
  readonly name = 'jamendo';

  constructor(private readonly clientId: string) {}

  async searchTracks(input: SearchTracksInput): Promise<ProviderTrack[]> {
    const tags = buildTags(input);
    const params = new URLSearchParams({
      client_id: this.clientId,
      format: 'json',
      limit: String(normalizeLimit(input.limit)),
      audioformat: 'mp32',
      order: 'popularity_total',
    });

    if (input.query?.trim()) {
      params.set('search', input.query.trim());
    }
    if (tags.length > 0) {
      params.set('fuzzytags', tags.join('+'));
    }

    const response = await fetch(`${JAMENDO_TRACKS_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Jamendo request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { results?: JamendoTrack[] };
    const tracks = Array.isArray(payload.results) ? payload.results : [];
    return tracks.map(track => normalizeJamendoTrack(track, input.mood)).filter(Boolean) as ProviderTrack[];
  }

  getMoodTracks(mood: MusicProviderMood, limit = DEFAULT_LIMIT): Promise<ProviderTrack[]> {
    return this.searchTracks({ mood, limit });
  }
}

export function createJamendoProviderFromEnv(env: NodeJS.ProcessEnv = process.env): JamendoProvider | null {
  const clientId = env.JAMENDO_CLIENT_ID?.trim();
  return clientId ? new JamendoProvider(clientId) : null;
}

function buildTags(input: SearchTracksInput): string[] {
  const tags: string[] = [];
  if (input.mood) {
    tags.push(...moodTags[input.mood]);
  }
  if (input.genre?.trim()) {
    tags.push(input.genre.trim());
  }
  return [...new Set(tags)];
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(50, Math.round(limit ?? DEFAULT_LIMIT)));
}

function normalizeJamendoTrack(track: JamendoTrack, mood?: MusicProviderMood): ProviderTrack | null {
  if (!track.id || !track.name) {
    return null;
  }

  const durationSeconds = Number(track.duration);
  return {
    provider: 'jamendo',
    providerTrackId: track.id,
    title: track.name,
    artistName: track.artist_name ?? null,
    albumName: track.album_name ?? null,
    mood: mood ?? null,
    durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null,
    artworkUrl: track.image ?? null,
    previewUrl: track.audio ?? null,
    audioUrl: track.audio ?? null,
    licenseUrl: track.license_ccurl ?? null,
    raw: {
      id: track.id,
      audiodownload_allowed: Boolean(track.audiodownload_allowed),
      has_audio: Boolean(track.audio),
      has_audiodownload: Boolean(track.audiodownload),
    },
  };
}
