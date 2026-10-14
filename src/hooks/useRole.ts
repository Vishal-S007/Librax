import { useCallback } from 'react';
import type { AppNotification } from '@/types/models';
import { useSession } from '@/app/providers';
import { isStaff } from '@/routes/nav';

export function useBase(): string {
  const s = useSession();
  return s ? `/${s.role}` : '/login';
}

/** Notification inbox recipients for the current session. */
export function useRecipients(): string[] {
  const s = useSession();
  if (!s) return [];
  return isStaff(s.role) ? ['staff'] : s.memberId ? [s.memberId] : [];
}

export function useLinkFor() {
  const s = useSession();
  const base = useBase();
  const staff = isStaff(s?.role);
  return useCallback(
    (link: AppNotification['link']): string | undefined => {
      if (!link) return undefined;
      switch (link.kind) {
        case 'book': return `${base}/books/${link.id}`;
        case 'loan': return staff ? `${base}/loans?focus=${link.id}` : `${base}/my-books`;
        case 'reservation': return `${base}/reservations`;
        case 'fine': return `${base}/fines${staff ? `?focus=${link.id}` : ''}`;
        case 'member': return staff ? `${base}/members/${link.id}` : `${base}/profile`;
      }
    },
    [base, staff],
  );
}
