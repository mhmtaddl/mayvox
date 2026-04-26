const USER_VOLUME_KEY = 'mayvox:user-volume:v1';
const LEGACY_USER_VOLUME_KEY = 'userVolumes';
const USER_VOLUME_EVENT = 'mayvox:user-volume-change';

const DEFAULT_VOLUME = 100;
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

export const DEBUG_VOLUME = false;

type UserVolumeListener = () => void;

function clampVolumePercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(value)));
}

function readStoredVolumes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(USER_VOLUME_KEY) ?? localStorage.getItem(LEGACY_USER_VOLUME_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const volumes: Record<string, number> = {};
    for (const [userId, value] of Object.entries(parsed)) {
      if (typeof value === 'number') volumes[userId] = clampVolumePercent(value);
    }
    return volumes;
  } catch {
    return {};
  }
}

function writeStoredVolumes(volumes: Record<string, number>) {
  localStorage.setItem(USER_VOLUME_KEY, JSON.stringify(volumes));
  window.dispatchEvent(new Event(USER_VOLUME_EVENT));
}

export function getAllUserVolumePercents(): Record<string, number> {
  return readStoredVolumes();
}

export function getUserVolumePercent(userId: string): number {
  return readStoredVolumes()[userId] ?? DEFAULT_VOLUME;
}

export function setUserVolumePercent(userId: string, value: number): void {
  const volumes = readStoredVolumes();
  volumes[userId] = clampVolumePercent(value);
  writeStoredVolumes(volumes);
}

export function subscribeUserVolume(listener: UserVolumeListener): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === USER_VOLUME_KEY || event.key === LEGACY_USER_VOLUME_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(USER_VOLUME_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(USER_VOLUME_EVENT, listener);
  };
}

export function applyVolumeToAudioElement(audio: HTMLAudioElement, userId: string): void {
  const percent = getUserVolumePercent(userId);
  audio.volume = Math.max(0, Math.min(1, percent / 100));
  if (DEBUG_VOLUME) console.debug('[user-volume] apply element', { userId, percent, volume: audio.volume });
}
