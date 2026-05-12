export function isSystemMusicIdentity(identity?: string | null): boolean {
  return typeof identity === 'string' && identity.startsWith('system-music:');
}
