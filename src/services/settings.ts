import type { LibraryData, Settings } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { settingsSchema } from '@/repositories/schema';
import { log, type Ctx } from './common';

/**
 * POLICY CHANGE SCOPE
 * - Loan periods and borrowing limits apply to loans issued after the change.
 *   Existing due dates are not rewritten.
 * - Renewal limits are checked at renewal time, so they apply to existing loans' future renewals.
 * - Fine rate, grace period and cap are applied when a loan is returned, so they apply to every
 *   return processed after the change (including loans issued earlier). Fines already recorded
 *   are never recalculated — adjust them explicitly if needed.
 * - Pickup period applies to holds created after the change.
 */
export function updateSettings(d: LibraryData, next: Settings, ctx: Ctx): Settings {
  const parsed = settingsSchema.safeParse(next);
  if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? 'Invalid settings', 'invalid_settings');
  const prev = d.settings;
  const show = (v: unknown) => (Array.isArray(v) ? `${v.length} card series` : String(v));
  const changed = (Object.keys(parsed.data) as (keyof Settings)[]).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(parsed.data[k]));
  d.settings = parsed.data;
  if (changed.length) {
    const meta: Record<string, string> = {};
    for (const k of changed) meta[k] = `${show(prev[k])} → ${show(parsed.data[k])}`;
    log(d, ctx, 'settings.updated', `Updated ${changed.length} polic${changed.length > 1 ? 'ies' : 'y'}`, {
      kind: 'settings', id: 'settings', label: 'Library settings',
    }, meta);
  }
  return d.settings;
}
