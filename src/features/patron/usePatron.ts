import { useData, useSession } from '@/app/providers';

export function usePatron() {
  const data = useData();
  const session = useSession();
  const memberId = session?.memberId ?? '';
  const member = data.members.find((m) => m.id === memberId);
  return { data, memberId, member };
}
