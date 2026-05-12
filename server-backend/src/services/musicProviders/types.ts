export type MusicProviderMood = 'chill' | 'focus' | 'night';

export interface ProviderTrack {
  provider: string;
  providerTrackId: string;
  title: string;
  artistName?: string | null;
  albumName?: string | null;
  mood?: MusicProviderMood | string | null;
  durationMs?: number | null;
  artworkUrl?: string | null;
  previewUrl?: string | null;
  audioUrl?: string | null;
  licenseUrl?: string | null;
  raw?: unknown;
}

export interface SearchTracksInput {
  query?: string;
  mood?: MusicProviderMood;
  genre?: string;
  limit?: number;
}

export interface MusicProvider {
  readonly name: string;
  searchTracks(input: SearchTracksInput): Promise<ProviderTrack[]>;
  getMoodTracks(mood: MusicProviderMood, limit?: number): Promise<ProviderTrack[]>;
}
