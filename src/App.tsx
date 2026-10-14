import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useLoadStatus } from '@/app/providers';
import { AppShell } from '@/components/layout/AppShell';
import { RequireRole, HomeRedirect } from '@/routes/guards';
import { Spinner } from '@/components/ui/Feedback';
import { useAppliedTheme } from '@/components/layout/ThemeToggle';
import { RecoveryScreen } from '@/features/data/RecoveryScreen';
import LoginPage from '@/features/auth/LoginPage';

const StaffDashboard = lazy(() => import('@/features/dashboard/StaffDashboard'));
const CirculationDesk = lazy(() => import('@/features/circulation/CirculationDesk'));
const LoansPage = lazy(() => import('@/features/circulation/LoansPage'));
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage'));
const BookDetailPage = lazy(() => import('@/features/catalog/BookDetailPage'));
const TaxonomyPage = lazy(() => import('@/features/catalog/TaxonomyPage'));
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage'));
const MembersPage = lazy(() => import('@/features/members/MembersPage'));
const MemberDetailPage = lazy(() => import('@/features/members/MemberDetailPage'));
const ReservationsPage = lazy(() => import('@/features/reservations/ReservationsPage'));
const FinesPage = lazy(() => import('@/features/fines/FinesPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const DataPage = lazy(() => import('@/features/data/DataPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const PatronHome = lazy(() => import('@/features/patron/PatronHome'));
const DiscoverPage = lazy(() => import('@/features/discover/DiscoverPage'));
const MyBooksPage = lazy(() => import('@/features/patron/MyBooksPage'));
const PatronReservations = lazy(() => import('@/features/patron/PatronReservations'));
const SavedBooksPage = lazy(() => import('@/features/patron/SavedBooksPage'));
const PatronFines = lazy(() => import('@/features/patron/PatronFines'));
const ProfilePage = lazy(() => import('@/features/patron/ProfilePage'));
const SelfCheckoutPage = lazy(() => import('@/features/patron/SelfCheckoutPage'));
const CoursesPage = lazy(() => import('@/features/courses/CoursesPage'));
const LibrarianPage = lazy(() => import('@/features/librarian/LibrarianPage'));
const NotFound = lazy(() => import('@/features/auth/NotFound'));

const page = (el: ReactNode) => (
  <Suspense fallback={<div className="py-20"><Spinner label="Loading screen" /></div>}>{el}</Suspense>
);

function staffRoutes(admin: boolean) {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={page(<StaffDashboard />)} />
      <Route path="circulation" element={page(<CirculationDesk />)} />
      <Route path="books" element={page(<CatalogPage />)} />
      <Route path="books/:id" element={page(<BookDetailPage />)} />
      <Route path="inventory" element={page(<InventoryPage />)} />
      <Route path="members" element={page(<MembersPage />)} />
      <Route path="members/:id" element={page(<MemberDetailPage />)} />
      <Route path="loans" element={page(<LoansPage />)} />
      <Route path="reservations" element={page(<ReservationsPage />)} />
      <Route path="fines" element={page(<FinesPage />)} />
      <Route path="reports" element={page(<ReportsPage />)} />
      <Route path="notifications" element={page(<NotificationsPage />)} />
      {admin && (
        <>
          <Route path="taxonomy" element={page(<TaxonomyPage />)} />
          <Route path="activity" element={page(<ActivityPage />)} />
          <Route path="data" element={page(<DataPage />)} />
          <Route path="settings" element={page(<SettingsPage />)} />
        </>
      )}
      <Route path="*" element={page(<NotFound />)} />
    </>
  );
}

function patronRoutes(role: 'student' | 'faculty') {
  return (
    <>
      <Route index element={<Navigate to="home" replace />} />
      <Route path="home" element={page(<PatronHome />)} />
      <Route path="librarian" element={page(<LibrarianPage />)} />
      <Route path="discover" element={page(<DiscoverPage />)} />
      <Route path="books/:id" element={page(<BookDetailPage />)} />
      <Route path="my-books" element={page(<MyBooksPage />)} />
      <Route path="reservations" element={page(<PatronReservations />)} />
      <Route path="saved" element={page(<SavedBooksPage />)} />
      <Route path="saved-books" element={<Navigate to="../saved" replace />} />
      <Route path="fines" element={page(<PatronFines />)} />
      <Route path="notifications" element={page(<NotificationsPage />)} />
      <Route path="profile" element={page(<ProfilePage />)} />
      {role === 'student' && <Route path="self-checkout" element={page(<SelfCheckoutPage />)} />}
      {role === 'faculty' && <Route path="courses" element={page(<CoursesPage />)} />}
      <Route path="*" element={page(<NotFound />)} />
    </>
  );
}

export function AppRoutes() {
  useAppliedTheme();
  const status = useLoadStatus();
  if (status.state === 'corrupt') return <RecoveryScreen reason={status.reason} />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<RequireRole roles={['admin']} />}>
        <Route path="/admin" element={<AppShell />}>{staffRoutes(true)}</Route>
      </Route>
      <Route element={<RequireRole roles={['librarian']} />}>
        <Route path="/librarian" element={<AppShell />}>{staffRoutes(false)}</Route>
      </Route>
      <Route element={<RequireRole roles={['student']} />}>
        <Route path="/student" element={<AppShell />}>{patronRoutes('student')}</Route>
      </Route>
      <Route element={<RequireRole roles={['faculty']} />}>
        <Route path="/faculty" element={<AppShell />}>{patronRoutes('faculty')}</Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
