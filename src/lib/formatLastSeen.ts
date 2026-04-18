/**
 * WhatsApp-benzeri son görülme formatı.
 *
 * Server tarafından gelen ISO timestamp'i baz alır. Client saati referans
 * alınmaz — serverNowMs parametresi useBackendPresence'tan gelir (server
 * time offset'i hesaba katılmış).
 *
 * @param iso           profiles.last_seen_at (ISO string, server NOW())
 * @param online        true = çevrimiçi / false = offline / null = privacy gizli
 * @param serverNowMs   Şu an server time ms (Date.now() + offset)
 */
export function formatLastSeen(
  iso: string | null | undefined,
  online: boolean | null,
  serverNowMs: number,
): string {
  if (online === true) return 'çevrimiçi';
  if (online === null) return ''; // privacy gizli → UI yazmaz
  if (!iso) return '';

  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';

  const diff = serverNowMs - t;
  if (diff < 60_000) return 'az önce görüldü';

  const d = new Date(t);
  const now = new Date(serverNowMs);
  const sameDay = d.toDateString() === now.toDateString();
  const yesterdayDate = new Date(serverNowMs - 86_400_000);
  const isYesterday = yesterdayDate.toDateString() === d.toDateString();

  const hhmm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay)     return `bugün ${hhmm}`;
  if (isYesterday) return `dün ${hhmm}`;

  const date = d.toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  return `${date} ${hhmm}`;
}
