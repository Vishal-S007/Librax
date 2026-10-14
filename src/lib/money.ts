import type { Minor } from '@/types/models';

/** Number of minor units per major unit for supported currencies. */
const MINOR_DIGITS: Record<string, number> = { INR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, AUD: 2, CAD: 2, SGD: 2 };

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_DIGITS);

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

/** Formats integer minor units as a currency string. Division happens only at display time. */
export function formatMoney(amount: Minor, currency: string): string {
  const digits = minorDigits(currency);
  const factor = 10 ** digits;
  const negative = amount < 0;
  const abs = Math.abs(Math.trunc(amount));
  const major = Math.floor(abs / factor);
  const minor = abs % factor;
  const majorStr = major.toLocaleString('en-US');
  const symbol = currencySymbol(currency);
  const body = digits > 0 ? `${majorStr}.${String(minor).padStart(digits, '0')}` : majorStr;
  return `${negative ? '−' : ''}${symbol}${body}`;
}

export function currencySymbol(currency: string): string {
  switch (currency) {
    case 'INR': return '₹';
    case 'USD': case 'AUD': case 'CAD': case 'SGD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'JPY': return '¥';
    default: return `${currency} `;
  }
}

/**
 * Parses a user-entered decimal string ("12.5", "1,200.75") into integer minor units
 * using string arithmetic — no floating point involved. Returns null if invalid.
 */
export function parseMoney(input: string, currency: string): Minor | null {
  const digits = minorDigits(currency);
  const cleaned = input.replace(/[,\s]/g, '').replace(/^[^\d-]+/, '');
  const re = digits > 0 ? new RegExp(`^(-)?(\\d+)(?:\\.(\\d{1,${digits}}))?$`) : /^(-)?(\d+)$/;
  const m = re.exec(cleaned);
  if (!m) return null;
  const sign = m[1] ? -1 : 1;
  const major = Number(m[2]);
  const frac = digits > 0 ? Number((m[3] ?? '').padEnd(digits, '0') || '0') : 0;
  if (!Number.isSafeInteger(major)) return null;
  return sign * (major * 10 ** digits + frac);
}

/** Renders minor units as a plain decimal string suitable for an input field. */
export function toDecimalString(amount: Minor, currency: string): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(amount);
  const abs = Math.abs(amount);
  const factor = 10 ** digits;
  return `${amount < 0 ? '-' : ''}${Math.floor(abs / factor)}.${String(abs % factor).padStart(digits, '0')}`;
}

export function sumMinor(values: Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}
