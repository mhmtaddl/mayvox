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
 * firstName + lastName birleştirip normalize eder.
 * Gösterim için kullanılır — user.name (displayName) alanına DOKUNMAZ.
 */
export function formatFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${toTitleCaseTr(firstName)} ${toTitleCaseTr(lastName)}`.trim();
}
