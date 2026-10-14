import { Receipt } from 'lucide-react';
import { useNow } from '@/app/providers';
import { Card, PageHeader } from '@/components/ui/Layout';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { FineStatusBadge } from '@/components/ui/Status';
import { fineBalance, fineStatus, memberBalance } from '@/services/common';
import { accruingFines } from '@/services/fines';
import { formatMoney } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { usePatron } from './usePatron';

export default function PatronFines() {
  const { data, memberId } = usePatron();
  const now = useNow();
  const cur = data.settings.currency;
  const fines = data.fines.filter((f) => f.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accruing = accruingFines(data, now, memberId);
  return (
    <div>
      <PageHeader eyebrow="Account" title="Fines" description={`Outstanding: ${formatMoney(memberBalance(data, memberId), cur)}. Pay at the circulation desk — LIBRAX does not process online payments.`} />
      {accruing.length > 0 && <div className="mb-4"><Callout tone="rose" title="Fines accruing on overdue items">{accruing.map((a) => `${data.books.find((b) => b.id === a.loan.bookId)?.title}: ${formatMoney(a.amount, cur)}`).join(' · ')}. Recorded when returned.</Callout></div>}
      <Card bodyClassName="p-0">
        {fines.length === 0 ? <EmptyState icon={Receipt} title="No fines" body="Return items on time to keep it that way." /> : (
          <ul className="divide-y divide-line">
            {fines.map((f) => (
              <li key={f.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1"><p className="text-ink">{f.description}</p><p className="text-xs text-ink-faint">{fmtDate(f.createdAt)} · assessed {formatMoney(f.assessed, cur)}</p></div>
                  <span className="tabular font-medium text-ink">{formatMoney(fineBalance(f), cur)}</span>
                  <FineStatusBadge status={fineStatus(f)} />
                </div>
                {[...f.adjustments.map((a) => `${fmtDate(a.at)} adjusted ${formatMoney(a.amount, cur)} — ${a.reason}`), ...f.settlements.map((s) => `${fmtDate(s.at)} paid ${formatMoney(s.amount, cur)} at desk`)].map((t, i) => <p key={i} className="mt-1 text-xs text-ink-muted">{t}</p>)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
