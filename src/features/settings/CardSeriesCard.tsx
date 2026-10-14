import { useEffect, useState } from 'react';
import { IdCard, Plus, Printer, Trash2 } from 'lucide-react';
import type { CardSeries } from '@/types/models';
import { useData, useLibrary } from '@/app/providers';
import { useAction } from '@/hooks/useAction';
import { Card } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { describeCard, parseSeries, seriesNumbers, seriesOverlap } from '@/lib/cardSeries';
import { printMemberCards } from '@/lib/printLabels';
import { newId } from '@/lib/ids';

/** Admin: the ID-card number ranges that can sign in and activate themselves on first scan. */
export function CardSeriesCard() {
  const data = useData();
  const lib = useLibrary();
  const { run, pending } = useAction();
  const [rows, setRows] = useState<CardSeries[]>(data.settings.cardSeries);
  useEffect(() => setRows(data.settings.cardSeries), [data.settings.cardSeries]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(data.settings.cardSeries);
  const set = (id: string, p: Partial<CardSeries>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const registered = new Set(data.members.map((m) => m.memberNo.toUpperCase()));

  const problem = (r: CardSeries, i: number): string | undefined => {
    const p = parseSeries(r.first, r.last);
    if (!p.ok) return p.reason;
    const clash = rows.findIndex((o, j) => j !== i && seriesOverlap(r, o));
    return clash >= 0 ? 'Overlaps another series' : undefined;
  };
  const invalid = rows.some((r, i) => !!problem(r, i));

  const save = () => run(
    () => lib.updateSettings({ ...data.settings, cardSeries: rows.map((r) => ({ ...r, first: r.first.trim().toUpperCase(), last: r.last.trim().toUpperCase(), label: r.label?.trim() || undefined })) }),
    'Card series saved',
  );
  const print = (r: CardSeries) => {
    const codes = seriesNumbers(r, 12, (c) => !registered.has(c));
    printMemberCards(codes.map((c) => ({ name: 'New library card', memberNo: c, type: r.type, department: describeCard(c).department ?? r.label ?? '' })), data.settings.libraryName);
  };

  return (
    <Card
      title="Library card series"
      subtitle="Cards in these ranges sign in by scanning. A card used for the first time activates itself after the reader confirms their name."
      className="lg:col-span-2"
      action={<div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={!dirty || pending} onClick={() => setRows(data.settings.cardSeries)}>Discard</Button>
        <Button size="sm" variant="primary" disabled={!dirty || invalid} loading={pending} onClick={save}>Save series</Button>
      </div>}
    >
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink-faint">No series yet — only cards already registered by staff can sign in.</p>}
        {rows.map((r, i) => {
          const p = parseSeries(r.first, r.last);
          const err = problem(r, i);
          const activated = p.ok ? data.members.filter((m) => {
            const c = m.memberNo.toUpperCase();
            return c.startsWith(p.spec.prefix) && c.length === p.spec.prefix.length + p.spec.width && Number(c.slice(p.spec.prefix.length)) >= p.spec.from && Number(c.slice(p.spec.prefix.length)) <= p.spec.to;
          }).length : 0;
          return (
            <div key={r.id} className="grid items-start gap-2 rounded-card border border-line p-3 sm:grid-cols-[120px_1fr_1fr_1.2fr_auto]">
              <Select aria-label="Card type" value={r.type} onChange={(e) => set(r.id, { type: e.target.value as CardSeries['type'] })}>
                <option value="student">Students</option><option value="faculty">Faculty</option>
              </Select>
              <Input aria-label="First card number" placeholder="First, e.g. 1JB22CS001" value={r.first} onChange={(e) => set(r.id, { first: e.target.value })} className="font-mono uppercase" />
              <Input aria-label="Last card number" placeholder="Last, e.g. 1JB22CS180" value={r.last} onChange={(e) => set(r.id, { last: e.target.value })} className="font-mono uppercase" />
              <Input aria-label="Label" placeholder="Label, e.g. CSE 2022 batch" value={r.label ?? ''} onChange={(e) => set(r.id, { label: e.target.value })} />
              <div className="flex items-center gap-1">
                <label className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-muted"><input type="checkbox" checked={r.active} onChange={(e) => set(r.id, { active: e.target.checked })} /> On</label>
                <Button size="sm" variant="ghost" aria-label="Print unused cards" title="Print 12 unused cards" disabled={!!err} onClick={() => print(r)}><Printer className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Remove series" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:col-span-5">
                {err ? <span className="text-rose">{err}</span> : p.ok && <>
                  <Badge tone={r.active ? 'sage' : 'neutral'}>{p.spec.size.toLocaleString()} cards</Badge>
                  <span className="text-ink-muted">{activated} activated</span>
                  {describeCard(r.first).facts.length > 0 && <span className="text-ink-faint">· reads as {describeCard(r.first).facts.slice(1, 3).join(', ')}</span>}
                </>}
              </div>
            </div>
          );
        })}
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRows((rs) => [...rs, { id: newId('ser'), type: 'student', first: '', last: '', active: true }])}>Add a series</Button>
        <p className="flex items-start gap-1.5 text-xs text-ink-faint"><IdCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />Barcodes and QR codes on college ID cards both work. Members registered by staff keep signing in with their existing numbers.</p>
      </div>
    </Card>
  );
}
