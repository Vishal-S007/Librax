import type { CardSeries } from '@/types/models';

/**
 * Library-card number series, e.g. 1JB22CS001 – 1JB22CS180.
 * A series is a fixed prefix plus a fixed-width number, so the first and last
 * card numbers define it completely. Cards inside an active series can sign in
 * (and register on first use) without anyone typing a member number.
 */

export interface SeriesSpec { prefix: string; from: number; to: number; width: number; size: number }

const MAX_SERIES_SIZE = 100_000;

export function normalizeCard(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function split(code: string): { prefix: string; num: number; width: number } | null {
  const m = normalizeCard(code).match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1]!, num: Number(m[2]), width: m[2]!.length };
}

export function parseSeries(first: string, last: string): { ok: true; spec: SeriesSpec } | { ok: false; reason: string } {
  const a = split(first);
  const b = split(last);
  if (!normalizeCard(first) || !normalizeCard(last)) return { ok: false, reason: 'Enter the first and last card numbers.' };
  if (!a || !b) return { ok: false, reason: 'Card numbers must end in digits, e.g. 1JB22CS001.' };
  if (a.prefix !== b.prefix) return { ok: false, reason: `Both numbers must start the same way (“${a.prefix || '—'}” vs “${b.prefix || '—'}”).` };
  if (a.width !== b.width) return { ok: false, reason: 'Both numbers need the same number of digits at the end.' };
  if (a.num > b.num) return { ok: false, reason: 'The first card number must come before the last one.' };
  const size = b.num - a.num + 1;
  if (size > MAX_SERIES_SIZE) return { ok: false, reason: `A series can hold at most ${MAX_SERIES_SIZE.toLocaleString()} cards.` };
  if (!/^[A-Z0-9-/]*$/.test(a.prefix)) return { ok: false, reason: 'Use only letters, digits, “-” or “/” in card numbers.' };
  return { ok: true, spec: { prefix: a.prefix, from: a.num, to: b.num, width: a.width, size } };
}

export function inSeries(code: string, s: Pick<CardSeries, 'first' | 'last'>): boolean {
  const p = parseSeries(s.first, s.last);
  const c = split(code);
  if (!p.ok || !c) return false;
  return c.prefix === p.spec.prefix && c.width === p.spec.width && c.num >= p.spec.from && c.num <= p.spec.to;
}

export function seriesFor(all: CardSeries[], code: string): CardSeries | undefined {
  return all.find((s) => s.active && inSeries(code, s));
}

export function seriesOverlap(a: Pick<CardSeries, 'first' | 'last'>, b: Pick<CardSeries, 'first' | 'last'>): boolean {
  const x = parseSeries(a.first, a.last);
  const y = parseSeries(b.first, b.last);
  if (!x.ok || !y.ok) return false;
  return x.spec.prefix === y.spec.prefix && x.spec.width === y.spec.width && x.spec.from <= y.spec.to && y.spec.from <= x.spec.to;
}

export const seriesLabel = (s: Pick<CardSeries, 'first' | 'last'>) => `${normalizeCard(s.first)} – ${normalizeCard(s.last)}`;

/* ---------------- Reading what a card says ---------------- */

/** VTU-style branch codes used in Karnataka USNs (e.g. 1JB22CS001). */
const BRANCHES: Record<string, string> = {
  CS: 'Computer Science & Engineering', IS: 'Information Science & Engineering', EC: 'Electronics & Communication',
  EE: 'Electrical & Electronics', ME: 'Mechanical Engineering', CV: 'Civil Engineering', AI: 'Artificial Intelligence & ML',
  AD: 'AI & Data Science', CG: 'Computer Science (Design)', CD: 'Computer Science (Data Science)', CY: 'Computer Science (Cyber Security)',
  CI: 'Computer Science (AI & ML)', IC: 'CS (IoT & Cyber Security)', ET: 'Electronics & Telecommunication', IM: 'Industrial Engineering & Management',
  BT: 'Biotechnology', CH: 'Chemical Engineering', AE: 'Aeronautical Engineering', AU: 'Automobile Engineering', EI: 'Electronics & Instrumentation',
  ML: 'Medical Electronics', MBA: 'Business Administration', MCA: 'Computer Applications',
};

export interface CardDetails {
  department?: string;
  joined?: number;
  /** Human-readable facts read from the number itself. */
  facts: string[];
}

/** Reads what can be inferred from the card number (a VTU-style USN carries year and branch). */
export function describeCard(code: string): CardDetails {
  const c = normalizeCard(code);
  const usn = c.match(/^(\d)([A-Z]{2})(\d{2})([A-Z]{2,3})(\d{3})$/);
  if (!usn) return { facts: [] };
  const joined = 2000 + Number(usn[3]);
  const department = BRANCHES[usn[4]!];
  return {
    joined,
    department,
    facts: [
      `College code ${usn[1]}${usn[2]}`,
      `Joined ${joined}`,
      department ? department : `Branch ${usn[4]}`,
      `Roll number ${Number(usn[5])}`,
    ],
  };
}

/**
 * Pulls the card number (and a name, if present) out of whatever the scanner read.
 * Many college ID cards use a QR code like "Name: Riya Sharma | USN: 1JB22CS045",
 * while barcodes usually hold just the number.
 */
export function extractCard(raw: string, isKnown: (code: string) => boolean): { code: string; name?: string } {
  const whole = normalizeCard(raw);
  const nameMatch = raw.match(/\bname\s*[:=-]\s*([A-Za-z][A-Za-z .'-]{1,60}?)\s*(?:[|,;\n\r]|\b(?:usn|id|roll|reg)\b|$)/i);
  const name = nameMatch?.[1]?.trim();
  if (isKnown(whole)) return { code: whole, name };
  const tokens = raw.toUpperCase().split(/[^A-Z0-9/-]+/).filter((t) => t.length >= 3);
  const hit = tokens.find(isKnown);
  return { code: hit ?? whole, name };
}

/** The first `limit` card numbers of a series that satisfy `keep` (e.g. not yet registered). */
export function seriesNumbers(s: Pick<CardSeries, 'first' | 'last'>, limit: number, keep: (code: string) => boolean = () => true): string[] {
  const p = parseSeries(s.first, s.last);
  if (!p.ok) return [];
  const out: string[] = [];
  for (let n = p.spec.from; n <= p.spec.to && out.length < limit; n++) {
    const code = `${p.spec.prefix}${String(n).padStart(p.spec.width, '0')}`;
    if (keep(code)) out.push(code);
  }
  return out;
}
