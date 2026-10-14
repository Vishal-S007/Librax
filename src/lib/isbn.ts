export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw);
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = s[i]!;
      const v = ch === 'X' ? 10 : Number(ch);
      sum += v * (10 - i);
    }
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === Number(s[12]);
  }
  return false;
}

/** Builds a valid ISBN-13 from a 12-digit stem by appending its check digit. */
export function isbn13FromStem(stem: string): string {
  if (!/^\d{12}$/.test(stem)) throw new Error('ISBN stem must be 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(stem[i]) * (i % 2 === 0 ? 1 : 3);
  return stem + String((10 - (sum % 10)) % 10);
}

export function formatIsbn(raw: string): string {
  const s = normalizeIsbn(raw);
  if (s.length === 13) return `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`;
  return s;
}
