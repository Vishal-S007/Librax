import type { Availability } from '@/services/common';
import { Badge } from '@/components/ui/Badge';

export function AvailabilityBadge({ a, compact }: { a: Availability; compact?: boolean }) {
  if (a.total === 0) return <Badge tone="neutral">No copies</Badge>;
  if (a.available > 0) return <Badge tone="sage" dot>{compact ? `${a.available} available` : `${a.available} of ${a.total} available`}</Badge>;
  if (a.waiting > 0) return <Badge tone="plum" dot>{`All out · ${a.waiting} waiting`}</Badge>;
  return <Badge tone="brass" dot>All copies out</Badge>;
}
