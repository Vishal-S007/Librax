import { z } from 'zod';
import type { CardSeries, DatabaseEnvelope, LibraryData, Settings } from '@/types/models';
import { parseSeries, seriesOverlap } from '@/lib/cardSeries';

/** Current storage schema version. Bump and add a migration when the shape changes. */
export const SCHEMA_VERSION = 3;

const iso = z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
const id = z.string().min(1);
const minor = z.number().int();

export const roleSchema = z.enum(['admin', 'librarian', 'student', 'faculty']);

export const bookSchema = z.object({
  id,
  isbn: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authors: z.array(z.string()).min(1),
  publisher: z.string(),
  publicationYear: z.number().int(),
  category: z.string().min(1),
  description: z.string(),
  language: z.string(),
  edition: z.string().optional(),
  pageCount: z.number().int().nonnegative(),
  coverUrl: z.string().optional(),
  coverHue: z.number().int().min(0).max(359),
  tags: z.array(z.string()),
  featured: z.boolean().optional(),
  status: z.enum(['active', 'archived']),
  createdAt: iso,
  updatedAt: iso,
});

export const copySchema = z.object({
  id,
  bookId: id,
  barcode: z.string().min(1),
  shelfLocation: z.string(),
  condition: z.enum(['new', 'good', 'fair', 'worn', 'poor']),
  acquiredAt: iso,
  status: z.enum(['available', 'borrowed', 'on_hold', 'maintenance', 'lost', 'damaged', 'withdrawn']),
  notes: z.string().optional(),
  updatedAt: iso,
});

export const memberSchema = z.object({
  id,
  memberNo: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  type: z.enum(['student', 'faculty', 'staff']),
  department: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
  borrowLimit: z.number().int().positive().optional(),
  registeredAt: iso,
  updatedAt: iso,
});

export const loanSchema = z.object({
  id,
  copyId: id,
  bookId: id,
  memberId: id,
  issuedAt: iso,
  dueAt: iso,
  returnedAt: iso.optional(),
  renewals: z.number().int().nonnegative(),
  issuedBy: z.string(),
  returnedBy: z.string().optional(),
  fineId: z.string().optional(),
});

export const reservationSchema = z.object({
  id,
  bookId: id,
  memberId: id,
  createdAt: iso,
  status: z.enum(['waiting', 'ready', 'fulfilled', 'cancelled', 'expired']),
  copyId: z.string().optional(),
  readyAt: iso.optional(),
  pickupBy: iso.optional(),
  closedAt: iso.optional(),
  loanId: z.string().optional(),
});

const actorName = z.string();

export const fineSchema = z.object({
  id,
  memberId: id,
  loanId: z.string().optional(),
  kind: z.enum(['overdue', 'damage', 'lost', 'manual']),
  assessed: minor.nonnegative(),
  daysOverdue: z.number().int().optional(),
  description: z.string(),
  createdAt: iso,
  adjustments: z.array(z.object({ id, amount: minor, reason: z.string().min(1), at: iso, by: actorName })),
  settlements: z.array(
    z.object({
      id,
      amount: minor.positive(),
      method: z.enum(['cash', 'card_at_desk', 'waiver_note', 'other']),
      reference: z.string().optional(),
      at: iso,
      by: actorName,
    }),
  ),
});

export const notificationSchema = z.object({
  id,
  recipient: z.string().min(1),
  kind: z.enum([
    'issued', 'returned', 'due_soon', 'overdue', 'reservation_placed', 'reservation_ready', 'reservation_expired',
    'reservation_cancelled', 'renewal_approved', 'renewal_rejected', 'fine_changed', 'system',
  ]),
  title: z.string(),
  body: z.string(),
  createdAt: iso,
  read: z.boolean(),
  link: z.object({ kind: z.enum(['book', 'loan', 'reservation', 'fine', 'member']), id }).optional(),
  dedupeKey: z.string().optional(),
});

export const activitySchema = z.object({
  id,
  type: z.string().min(1),
  at: iso,
  actor: z.object({ name: z.string(), role: roleSchema }),
  entity: z
    .object({
      kind: z.enum(['book', 'copy', 'member', 'loan', 'reservation', 'fine', 'settings', 'data']),
      id: z.string(),
      label: z.string(),
    })
    .optional(),
  summary: z.string(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const cardSeriesSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['student', 'faculty']),
    first: z.string().trim().min(1).max(40),
    last: z.string().trim().min(1).max(40),
    label: z.string().max(60).optional(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const r = parseSeries(v.first, v.last);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.reason, path: ['first'] });
  });

export const settingsSchema = z
  .object({
    libraryName: z.string().trim().min(2, 'Enter a library name').max(80),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
    loanDays: z.number().int().min(1, 'At least 1 day').max(180),
    facultyLoanDays: z.number().int().min(1).max(365),
    maxBorrowStudent: z.number().int().min(1).max(50),
    maxBorrowFaculty: z.number().int().min(1).max(100),
    maxBorrowStaff: z.number().int().min(1).max(100),
    renewalLimit: z.number().int().min(0).max(10),
    facultyRenewalLimit: z.number().int().min(0).max(20),
    fineRatePerDay: minor.min(0).max(1_000_000),
    fineGraceDays: z.number().int().min(0).max(30),
    maxFinePerLoan: minor.min(0).max(100_000_000),
    blockBorrowingAbove: minor.min(0),
    blockRenewalWhenOverdue: z.boolean(),
    pickupDays: z.number().int().min(1).max(30),
    dueSoonDays: z.number().int().min(1).max(14),
    reserveLoanDays: z.number().int().min(1, 'At least 1 day').max(14, 'At most 14 days'),
    cardSeries: z.array(cardSeriesSchema).max(50),
    theme: z.enum(['dark', 'light', 'system']),
  })
  .refine((s) => !s.cardSeries.some((a, i) => s.cardSeries.some((b, j) => j > i && seriesOverlap(a, b))), {
    message: 'Two card series overlap — each card number may belong to only one series',
    path: ['cardSeries'],
  })
  .refine((s) => s.maxFinePerLoan === 0 || s.maxFinePerLoan >= s.fineRatePerDay, {
    message: 'Maximum fine must be at least one day of fines (or 0 for no cap)',
    path: ['maxFinePerLoan'],
  });

export const courseSchema = z.object({
  id,
  code: z.string().trim().min(2).max(20),
  title: z.string().trim().min(2).max(120),
  facultyId: id,
  bookIds: z.array(z.string()),
  term: z.string().optional(),
  status: z.enum(['active', 'archived']),
  createdAt: iso,
  updatedAt: iso,
});

export const libraryDataSchema = z.object({
  books: z.array(bookSchema),
  copies: z.array(copySchema),
  members: z.array(memberSchema),
  loans: z.array(loanSchema),
  reservations: z.array(reservationSchema),
  fines: z.array(fineSchema),
  notifications: z.array(notificationSchema),
  activity: z.array(activitySchema),
  saved: z.record(z.array(z.string())),
  courses: z.array(courseSchema),
  settings: settingsSchema,
});

export const envelopeSchema = z.object({
  app: z.literal('librax'),
  schemaVersion: z.number().int().positive(),
  seededAt: iso.optional(),
  updatedAt: iso,
  data: libraryDataSchema,
});

/** Example ranges an administrator replaces with the college's real ID-card numbers. */
export const DEFAULT_CARD_SERIES: CardSeries[] = [
  { id: 'ser_default_students', type: 'student', first: 'AU1000', last: 'AU2500', label: 'Student ID cards', active: true },
  { id: 'ser_default_faculty', type: 'faculty', first: 'SJBF001', last: 'SJBF150', label: 'Example: faculty IDs', active: true },
];

export const DEFAULT_SETTINGS: Settings = {
  libraryName: 'LIBRAX Central Library',
  currency: 'INR',
  loanDays: 14,
  facultyLoanDays: 30,
  maxBorrowStudent: 4,
  maxBorrowFaculty: 10,
  maxBorrowStaff: 6,
  renewalLimit: 2,
  facultyRenewalLimit: 4,
  fineRatePerDay: 500, // ₹5.00
  fineGraceDays: 1,
  maxFinePerLoan: 30000, // ₹300.00
  blockBorrowingAbove: 50000, // ₹500.00
  blockRenewalWhenOverdue: true,
  pickupDays: 3,
  dueSoonDays: 2,
  reserveLoanDays: 3,
  cardSeries: DEFAULT_CARD_SERIES,
  theme: 'dark',
};

export function emptyData(): LibraryData {
  return {
    books: [], copies: [], members: [], loans: [], reservations: [], fines: [],
    notifications: [], activity: [], saved: {}, courses: [], settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Ordered migrations: key N upgrades an envelope from version N to N+1.
 * Each receives untyped JSON because older shapes do not match current types.
 */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  /** v1 → v2: course reserves. Adds an empty course list and the reserve loan period. */
  1: (raw) => {
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      data: { ...data, courses: Array.isArray(data.courses) ? data.courses : [], settings: { reserveLoanDays: 3, ...settings } },
    };
  },
  /** v2 → v3: library-card series for card sign-in and first-scan registration. */
  2: (raw) => {
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    return { ...raw, data: { ...data, settings: { cardSeries: DEFAULT_CARD_SERIES.map((x) => ({ ...x })), ...settings } } };
  },
};

export type MigrationResult =
  | { ok: true; envelope: DatabaseEnvelope; migratedFrom?: number }
  | { ok: false; reason: string };

/** Safely parses, migrates and validates a stored or imported envelope. Never throws. */
export function parseEnvelope(raw: unknown, migrations = MIGRATIONS, target = SCHEMA_VERSION): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'Not a LIBRAX data file.' };
  let obj = raw as Record<string, unknown>;
  if (obj.app !== 'librax') return { ok: false, reason: 'Not a LIBRAX data file.' };
  const from = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : NaN;
  if (!Number.isInteger(from) || from < 1) return { ok: false, reason: 'Missing schema version.' };
  if (from > target) return { ok: false, reason: `Data was created by a newer version (schema ${from}).` };
  for (let v = from; v < target; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, reason: `No migration path from schema ${v}.` };
    obj = { ...step(obj), schemaVersion: v + 1 };
  }
  const parsed = envelopeSchema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: `Invalid data at ${first?.path.join('.') || 'root'}: ${first?.message ?? 'unknown error'}` };
  }
  return { ok: true, envelope: parsed.data as unknown as DatabaseEnvelope, migratedFrom: from !== target ? from : undefined };
}
