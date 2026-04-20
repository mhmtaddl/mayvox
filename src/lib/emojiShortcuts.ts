/**
 * Mesaj yazarken ':)' → 🙂 gibi text shortcut → emoji dönüşümü.
 * Hem oda chat'i (ChatPanel) hem özel mesaj (DMPanel) kullanır.
 * Uzun pattern'ler önce (:D'nin ':'+')' olarak yanlış eşleşmesi için).
 *
 * URL guard: http/https URL'leri dönüşümden önce placeholder'a alınır,
 * dönüşüm sonrası geri konur. Böylece `https://foo` içindeki `:/` → 😕
 * gibi URL-bozan dönüşümler engellenir.
 */
const EMOJI_SHORTCUTS: Array<[string, string]> = [
  [':D', '😄'],
  [":'(", '😢'],
  [':)', '🙂'],
  [':(', '🙁'],
  [':/', '😕'],
  [':*', '😘'],
  [':O', '😮'],
  [':o', '😮'],
  [':P', '😛'],
  [':p', '😛'],
  [';)', '😉'],
  ['<3', '❤️'],
];

const URL_RE = /https?:\/\/\S+/gi;
// Placeholder: null-char sandwich — kullanıcı metninde neredeyse hiç görülmez.
const PH_OPEN = '\u0000';
const PH_CLOSE = '\u0000';
const PH_RE = /\u0000URL(\d+)\u0000/g;

export function replaceEmojiShortcuts(text: string): string {
  if (!text) return text;

  // 1. URL'leri stash et
  const urls: string[] = [];
  let stashed = text.replace(URL_RE, (m) => {
    urls.push(m);
    return `${PH_OPEN}URL${urls.length - 1}${PH_CLOSE}`;
  });

  // 2. Shortcut dönüşümlerini uygula (uzun pattern'ler önce)
  for (const [shortcut, emoji] of EMOJI_SHORTCUTS) {
    stashed = stashed.split(shortcut).join(emoji);
  }

  // 3. URL'leri geri koy
  return stashed.replace(PH_RE, (_, idx) => urls[Number(idx)] ?? '');
}
