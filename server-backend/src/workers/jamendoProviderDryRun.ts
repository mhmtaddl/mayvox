import { createJamendoProviderFromEnv, type MusicProviderMood } from '../services/musicProviders';

const moods: MusicProviderMood[] = ['chill', 'focus', 'night'];

function log(message: string): void {
  console.log(`[jamendo-provider-dry-run] ${message}`);
}

async function main(): Promise<void> {
  const provider = createJamendoProviderFromEnv();
  const limit = Math.max(1, Math.min(10, Number(process.env.JAMENDO_DRY_RUN_LIMIT ?? 5) || 5));

  log(`JAMENDO_CLIENT_ID: ${provider ? 'set' : 'missing'}`);
  if (!provider) {
    log('dry-run skipped; set JAMENDO_CLIENT_ID to fetch candidate tracks');
    return;
  }

  for (const mood of moods) {
    const tracks = await provider.getMoodTracks(mood, limit);
    log(`${mood}: ${tracks.length} candidate track(s)`);
    for (const track of tracks.slice(0, limit)) {
      const artist = track.artistName ? ` - ${track.artistName}` : '';
      const audio = track.audioUrl ? 'audio' : 'no-audio';
      log(`  ${track.providerTrackId}: ${track.title}${artist} (${audio})`);
    }
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown Jamendo dry-run error';
  console.error(`[jamendo-provider-dry-run] failed: ${message}`);
  process.exitCode = 1;
});
