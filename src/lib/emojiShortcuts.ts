/**
 * Mesaj yazarken ':)' → 🙂 gibi text shortcut → emoji dönüşümü.
 * Hem oda chat'i (ChatPanel) hem özel mesaj (DMPanel) kullanır.
 * Uzun pattern'ler önce (:D'nin ':'+')' olarak yanlış eşleşmesi için).
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

export function replaceEmojiShortcuts(text: string): string {
  let result = text;
  for (const [shortcut, emoji] of EMOJI_SHORTCUTS) {
    result = result.split(shortcut).join(emoji);
  }
  return result;
}
