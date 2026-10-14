import type { Role, Session } from '@/types/models';
import { roleSchema } from '@/repositories/schema';
import { z } from 'zod';

export const SESSION_KEY = 'librax:session';

const sessionSchema = z.object({
  role: roleSchema,
  name: z.string(),
  memberId: z.string().optional(),
  startedAt: z.string(),
});

/** Demonstration-only session. It is NOT authentication and offers no security. */
export class SessionStore {
  private session: Session | null = null;
  private listeners = new Set<() => void>();

  load() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      const parsed = raw ? sessionSchema.safeParse(JSON.parse(raw)) : null;
      this.session = parsed?.success ? parsed.data : null;
    } catch {
      this.session = null;
    }
  }
  get = () => this.session;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  set(s: Session | null) {
    this.session = s;
    try {
      if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch { /* session persists in memory only */ }
    for (const l of this.listeners) l();
  }
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/dashboard',
  librarian: '/librarian/dashboard',
  student: '/student/home',
  faculty: '/faculty/home',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  librarian: 'Librarian',
  student: 'Student',
  faculty: 'Faculty',
};
