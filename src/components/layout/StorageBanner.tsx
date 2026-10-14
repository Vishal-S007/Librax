import { TriangleAlert } from 'lucide-react';
import { useLoadStatus } from '@/app/providers';

export function StorageBanner() {
  const status = useLoadStatus();
  if (status.state !== 'unavailable') return null;
  return (
    <div role="alert" className="flex items-center gap-2 border-b border-rose/30 bg-rose-soft px-4 py-2 text-[13px] text-ink sm:px-6 lg:px-10">
      <TriangleAlert className="h-4 w-4 shrink-0 text-rose" aria-hidden />
      <span><strong>Changes are not being saved.</strong> {status.reason} Data will reset when this tab closes.</span>
    </div>
  );
}
