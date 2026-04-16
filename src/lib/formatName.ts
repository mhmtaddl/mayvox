/**
 * Türkçe uyumlu Title Case dönüşümü.
 * "MEHMET ADİL" → "Mehmet Adil"
 * "mehmet adil" → "Mehmet Adil"
 * Birden fazla boşluğu temizler, null/undefined güvenli.
 */
export function toTitleCaseTr(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      const first = word.charAt(0).toLocaleUpperCase('tr');
      const rest = word.slice(1).toLocaleLowerCase('tr');
      return first + rest;
    })
    .join(' ');
}

/**
 * firstName + lastName birleştirip gösterim için format eder.
 * İki isimli kullanıcılar için: "Mehmet Adil" + "Yıldızhan" → "M.Adil Yıldızhan"
 * Tek isim: "Mehmet" + "Yıldızhan" → "Mehmet Yıldızhan"
 * State/DB'deki orijinal firstName alanına DOKUNMAZ.
 */
export function formatFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = toTitleCaseTr(firstName);
  const last = toTitleCaseTr(lastName);
  if (first.includes(' ')) {
    const [w1, w2] = first.split(' ');
    const abbreviated = `${w1.charAt(0).toLocaleUpperCase('tr')}.${w2}`;
    return `${abbreviated} ${last}`.trim();
  }
  return `${first} ${last}`.trim();
}

/** Ad/Soyad input max karakter sınırı */
export const NAME_INPUT_MAX_LENGTH = 15;

/**
 * Canlı input normalize — yazım sırasında kullanılır (onChange).
 * Kurallar:
 * - İlk karakter boşluk olamaz (silinir).
 * - Maksimum 1 boşluk (sonraki ardışık boşluklar silinir).
 * - Her kelimenin ilk harfi büyük, gerisi küçük — Türkçe uyumlu.
 * - Toplam uzunluk 15 karakter ile sınırlı.
 */
export function normalizeNameInput(raw: string): string {
  if (!raw) return '';
  // 1) Leading whitespace kaldır
  let s = raw.replace(/^\s+/, '');
  // 2) İlk boşluktan sonraki tüm ek boşlukları kaldır (max 1 boşluk kuralı)
  const firstSpace = s.indexOf(' ');
  if (firstSpace >= 0) {
    const before = s.slice(0, firstSpace);
    const after = s.slice(firstSpace + 1).replace(/\s+/g, '');
    s = before + ' ' + after;
  }
  // 3) 15 karakter sınırı
  if (s.length > NAME_INPUT_MAX_LENGTH) s = s.slice(0, NAME_INPUT_MAX_LENGTH);
  // 4) Title case — boş string'e dokunma (trailing space korunur)
  return s
    .split(' ')
    .map(w => {
      if (!w) return '';
      return w.charAt(0).toLocaleUpperCase('tr') + w.slice(1).toLocaleLowerCase('tr');
    })
    .join(' ');
}
