import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/types/models';
import { useSession } from '@/app/providers';
import { ROLE_HOME } from '@/services/session';

/**
 * Client-side route guard for the DEMO session. This only shapes the interface —
 * it is not security, because everything runs and is stored in the browser.
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!roles.includes(session.role)) return <Navigate to={ROLE_HOME[session.role]} replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const session = useSession();
  return <Navigate to={session ? ROLE_HOME[session.role] : '/login'} replace />;
}
