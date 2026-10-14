import type { CopyStatus, Loan, MemberStatus, ReservationStatus } from '@/types/models';
import { Badge, type Tone } from './Badge';
import { COPY_STATUS_LABEL } from '@/services/inventory';
import type { FineStatus } from '@/services/common';

const copyTone: Record<CopyStatus, Tone> = {
  available: 'sage', borrowed: 'sky', on_hold: 'plum', maintenance: 'brass', lost: 'rose', damaged: 'rose', withdrawn: 'neutral',
};
export function CopyStatusBadge({ status }: { status: CopyStatus }) {
  return <Badge tone={copyTone[status]} dot>{COPY_STATUS_LABEL[status]}</Badge>;
}

const memberTone: Record<MemberStatus, Tone> = { active: 'sage', inactive: 'neutral', suspended: 'rose' };
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return <Badge tone={memberTone[status]} dot>{status[0]!.toUpperCase() + status.slice(1)}</Badge>;
}

const resTone: Record<ReservationStatus, Tone> = { waiting: 'sky', ready: 'plum', fulfilled: 'sage', cancelled: 'neutral', expired: 'rose' };
const resLabel: Record<ReservationStatus, string> = { waiting: 'Waiting', ready: 'Ready for pickup', fulfilled: 'Fulfilled', cancelled: 'Cancelled', expired: 'Expired' };
export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge tone={resTone[status]} dot>{resLabel[status]}</Badge>;
}

const fineTone: Record<FineStatus, Tone> = { outstanding: 'rose', settled: 'sage', waived: 'neutral' };
export function FineStatusBadge({ status }: { status: FineStatus }) {
  return <Badge tone={fineTone[status]} dot>{status[0]!.toUpperCase() + status.slice(1)}</Badge>;
}

export function LoanStateBadge({ loan, now }: { loan: Loan; now: string }) {
  if (loan.returnedAt) return <Badge tone="neutral">Returned</Badge>;
  if (loan.dueAt < now) return <Badge tone="rose" dot>Overdue</Badge>;
  return <Badge tone="sky" dot>On loan</Badge>;
}
