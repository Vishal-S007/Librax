/**
 * LIBRAX domain models.
 * All timestamps are ISO-8601 strings. All money values are integer minor units
 * (e.g. paise / cents) — never floating point.
 */

export type ID = string;
export type ISODate = string;
export type Minor = number;

export type Role = 'admin' | 'librarian' | 'student' | 'faculty';
export type MembershipType = 'student' | 'faculty' | 'staff';
export type MemberStatus = 'active' | 'inactive' | 'suspended';

export interface Book {
  id: ID;
  isbn: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher: string;
  publicationYear: number;
  category: string;
  description: string;
  language: string;
  edition?: string;
  pageCount: number;
  coverUrl?: string;
  /** Hue (0–359) used for the generated typographic cover when no image is supplied. */
  coverHue: number;
  tags: string[];
  featured?: boolean;
  status: 'active' | 'archived';
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type CopyStatus =
  | 'available'
  | 'borrowed'
  | 'on_hold'
  | 'maintenance'
  | 'lost'
  | 'damaged'
  | 'withdrawn';

export type CopyCondition = 'new' | 'good' | 'fair' | 'worn' | 'poor';

export interface Copy {
  id: ID;
  bookId: ID;
  barcode: string;
  shelfLocation: string;
  condition: CopyCondition;
  acquiredAt: ISODate;
  status: CopyStatus;
  notes?: string;
  updatedAt: ISODate;
}

export interface Member {
  id: ID;
  memberNo: string;
  name: string;
  email: string;
  phone?: string;
  type: MembershipType;
  department: string;
  status: MemberStatus;
  /** Per-member override. When undefined, the policy for the membership type applies. */
  borrowLimit?: number;
  registeredAt: ISODate;
  updatedAt: ISODate;
}

export interface Loan {
  id: ID;
  copyId: ID;
  bookId: ID;
  memberId: ID;
  issuedAt: ISODate;
  dueAt: ISODate;
  returnedAt?: ISODate;
  renewals: number;
  issuedBy: string;
  returnedBy?: string;
  fineId?: ID;
}

export type ReservationStatus = 'waiting' | 'ready' | 'fulfilled' | 'cancelled' | 'expired';

export interface Reservation {
  id: ID;
  bookId: ID;
  memberId: ID;
  createdAt: ISODate;
  status: ReservationStatus;
  /** Copy held for this reservation while status is "ready". */
  copyId?: ID;
  readyAt?: ISODate;
  pickupBy?: ISODate;
  closedAt?: ISODate;
  loanId?: ID;
}

export type FineKind = 'overdue' | 'damage' | 'lost' | 'manual';

export interface FineAdjustment {
  id: ID;
  amount: Minor; // signed: negative reduces the balance
  reason: string;
  at: ISODate;
  by: string;
}

export interface FineSettlement {
  id: ID;
  amount: Minor; // positive
  method: 'cash' | 'card_at_desk' | 'waiver_note' | 'other';
  reference?: string;
  at: ISODate;
  by: string;
}

export interface Fine {
  id: ID;
  memberId: ID;
  loanId?: ID;
  kind: FineKind;
  assessed: Minor;
  daysOverdue?: number;
  description: string;
  createdAt: ISODate;
  adjustments: FineAdjustment[];
  settlements: FineSettlement[];
}

export type NotificationKind =
  | 'issued'
  | 'returned'
  | 'due_soon'
  | 'overdue'
  | 'reservation_placed'
  | 'reservation_ready'
  | 'reservation_expired'
  | 'reservation_cancelled'
  | 'renewal_approved'
  | 'renewal_rejected'
  | 'fine_changed'
  | 'system';

export interface AppNotification {
  id: ID;
  /** A member id, or "staff" for the librarian/admin inbox. */
  recipient: ID | 'staff';
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: ISODate;
  read: boolean;
  /** In-app path (role prefix is resolved at render time). */
  link?: { kind: 'book' | 'loan' | 'reservation' | 'fine' | 'member'; id: ID };
  /** Prevents generating the same reminder twice. */
  dedupeKey?: string;
}

export type ActivityType =
  | 'book.created'
  | 'book.updated'
  | 'book.archived'
  | 'book.restored'
  | 'copy.created'
  | 'copy.updated'
  | 'copy.status'
  | 'member.created'
  | 'member.updated'
  | 'member.status'
  | 'loan.issued'
  | 'loan.returned'
  | 'loan.renewed'
  | 'reservation.created'
  | 'reservation.ready'
  | 'reservation.cancelled'
  | 'reservation.expired'
  | 'reservation.fulfilled'
  | 'fine.assessed'
  | 'fine.adjusted'
  | 'fine.settled'
  | 'settings.updated'
  | 'data.imported'
  | 'data.restored'
  | 'data.reset'
  | 'course.created'
  | 'course.updated'
  | 'course.archived'
  | 'loan.self_issued' | 'member.card_registered';

export interface Activity {
  id: ID;
  type: ActivityType;
  at: ISODate;
  actor: { name: string; role: Role };
  entity?: { kind: 'book' | 'copy' | 'member' | 'loan' | 'reservation' | 'fine' | 'settings' | 'data'; id: ID; label: string };
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

/**
 * A faculty member's course reading list. Titles on an active course are "course reserves":
 * students borrow them on a short loan and cannot renew them, so the whole class gets a turn.
 */
export interface Course {
  id: ID;
  code: string; // e.g. "CS301"
  title: string;
  facultyId: ID;
  bookIds: ID[];
  term?: string;
  status: 'active' | 'archived';
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Settings {
  libraryName: string;
  currency: string; // ISO 4217 code
  loanDays: number;
  facultyLoanDays: number;
  maxBorrowStudent: number;
  maxBorrowFaculty: number;
  maxBorrowStaff: number;
  renewalLimit: number;
  facultyRenewalLimit: number;
  fineRatePerDay: Minor;
  fineGraceDays: number;
  maxFinePerLoan: Minor;
  /** Members owing more than this cannot borrow. 0 disables the check. */
  blockBorrowingAbove: Minor;
  blockRenewalWhenOverdue: boolean;
  pickupDays: number;
  dueSoonDays: number;
  /** Loan period for students borrowing a title on an active course reserve. */
  reserveLoanDays: number;
  /** Card-number ranges that may sign in (and self-register on first scan). */
  cardSeries: CardSeries[];
  theme: 'dark' | 'light' | 'system';
}

export interface CardSeries {
  id: ID;
  type: 'student' | 'faculty';
  /** First and last card numbers, e.g. 1JB22CS001 and 1JB22CS180. */
  first: string;
  last: string;
  label?: string;
  active: boolean;
}

export interface Session {
  role: Role;
  name: string;
  /** For student / faculty sessions: the member the session acts as. */
  memberId?: ID;
  startedAt: ISODate;
}

export interface LibraryData {
  books: Book[];
  copies: Copy[];
  members: Member[];
  loans: Loan[];
  reservations: Reservation[];
  fines: Fine[];
  notifications: AppNotification[];
  activity: Activity[];
  /** memberId -> saved book ids */
  saved: Record<ID, ID[]>;
  courses: Course[];
  settings: Settings;
}

export interface DatabaseEnvelope {
  app: 'librax';
  schemaVersion: number;
  seededAt?: ISODate;
  updatedAt: ISODate;
  data: LibraryData;
}

export interface Actor {
  name: string;
  role: Role;
  memberId?: ID;
}
