/**
 * MAYVOX Spam Guard — heuristic-based content spam detection.
 *
 * - 4 kural: repeatedText (60s / 3+ aynı mesaj), allCaps (10+ char & %80+),
 *   emojiSpam (sadece emoji, 10+), linkSpam (3+ URL).
 * - In-memory; restart = reset. DB/IO yok.
 * - Sadece profanity.enabled=true iken çağrılmaz — spam.enabled ayrı toggle.
 *
 * API:
 *   checkSpam(userId, text) → { spam: boolean, reason: string|null }
 *   sweep(now)              → stale user history temizle (heartbeat'ten çağır)
 */

// Son mesaj geçmişi: userId -> [{ text, at }]
// Her kullanıcının son N mesajı; window 60s, max 10 entry.
const userHistory = new Map();
const REPEATED_WINDOW_MS = 60_000;
const REPEATED_THRESHOLD = 3;      // aynı metin window içinde 3+ kez
const MAX_HISTORY_PER_USER = 10;

// All-caps: en az 10 ALFABETIK harf, %80+ büyük
const ALLCAPS_MIN_LETTERS = 10;
const ALLCAPS_RATIO = 0.8;

// Emoji spam: sadece emoji+whitespace, en az 10 emoji
const EMOJI_MIN_COUNT = 10;
// Unicode emoji range — Emoji_Presentation property. Node regex'i `\p{Extended_Pictographic}` destekler.
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const NON_EMOJI_LETTER_RE = /\p{L}|\p{N}/u;  // harf veya rakam varsa "sadece emoji" değildir

// Link spam: 3+ URL
const URL_RE = /\bhttps?:\/\/\S+/gi;
const URL_THRESHOLD = 3;

function isRepeatedText(userId, text, now) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  let hist = userHistory.get(userId);
  if (!hist) {
    hist = [];
    userHistory.set(userId, hist);
  }
  // Window dışı entry'leri at
  const cutoff = now - REPEATED_WINDOW_MS;
  while (hist.length > 0 && hist[0].at <= cutoff) hist.shift();
  // Bu mesajın window içindeki tekrarını say
  let count = 0;
  for (const e of hist) if (e.text === trimmed) count++;
  // Bu mesajı ekle (limit N), eski entry'leri budama zaten yapıldı
  hist.push({ text: trimmed, at: now });
  if (hist.length > MAX_HISTORY_PER_USER) hist.splice(0, hist.length - MAX_HISTORY_PER_USER);
  // Eşiği geçti mi? (eklemeden SONRAKI sayaç THRESHOLD'a eşit → 3. mesaj block)
  return (count + 1) >= REPEATED_THRESHOLD;
}

function isAllCaps(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < ALLCAPS_MIN_LETTERS) return false;
  let upper = 0;
  for (const ch of letters) if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
  return (upper / letters.length) >= ALLCAPS_RATIO;
}

function isEmojiSpam(text) {
  const emojis = text.match(EMOJI_RE) || [];
  if (emojis.length < EMOJI_MIN_COUNT) return false;
  // Harf/rakam varsa "sadece emoji" değil — geçerli mesaj
  return !NON_EMOJI_LETTER_RE.test(text);
}

function isLinkSpam(text) {
  const urls = text.match(URL_RE) || [];
  return urls.length >= URL_THRESHOLD;
}

/**
 * @param {string} userId
 * @param {string} text
 * @param {number} [now]
 * @returns {{ spam: boolean, reason: string|null }}
 */
function checkSpam(userId, text, now = Date.now()) {
  if (!userId || typeof text !== 'string') return { spam: false, reason: null };
  // Önce quick non-history kurallar (tek mesaj kendinde spam)
  if (isAllCaps(text))   return { spam: true, reason: 'all_caps' };
  if (isEmojiSpam(text)) return { spam: true, reason: 'emoji_spam' };
  if (isLinkSpam(text))  return { spam: true, reason: 'link_spam' };
  // Sonra repeated — history güncellenir (side effect)
  if (isRepeatedText(userId, text, now)) return { spam: true, reason: 'repeated_text' };
  return { spam: false, reason: null };
}

/**
 * Memory sweep — heartbeat loop'tan çağır. Window dışı bırakılan user'lar silinir.
 */
function sweep(now = Date.now()) {
  const cutoff = now - REPEATED_WINDOW_MS;
  for (const [userId, hist] of userHistory) {
    while (hist.length > 0 && hist[0].at <= cutoff) hist.shift();
    if (hist.length === 0) userHistory.delete(userId);
  }
}

module.exports = { checkSpam, sweep };
