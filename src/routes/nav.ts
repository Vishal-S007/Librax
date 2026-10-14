import {
  Activity, BarChart3, Bell, BookMarked, BookOpen, Bookmark, Compass, Database, Home, LayoutDashboard, Library,
  GraduationCap, ListOrdered, Package, Receipt, Repeat, ScanLine, Settings, Sparkles, Tags, User, Users, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/models';

export interface NavItem {
  path: string; // relative to the role base
  label: string;
  icon: LucideIcon;
  group?: string;
}

const staffCore: NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { path: 'circulation', label: 'Circulation desk', icon: Repeat, group: 'Overview' },
  { path: 'books', label: 'Catalog', icon: BookOpen, group: 'Collection' },
  { path: 'inventory', label: 'Inventory', icon: Package, group: 'Collection' },
  { path: 'members', label: 'Members', icon: Users, group: 'People' },
  { path: 'loans', label: 'Loans', icon: BookMarked, group: 'People' },
  { path: 'reservations', label: 'Reservations', icon: ListOrdered, group: 'People' },
  { path: 'fines', label: 'Fines', icon: Receipt, group: 'People' },
  { path: 'reports', label: 'Reports', icon: BarChart3, group: 'Insights' },
];

const patron = (special: NavItem): NavItem[] => [
  { path: 'home', label: 'Home', icon: Home },
  { path: 'librarian', label: 'AI Librarian', icon: Sparkles },
  special,
  { path: 'discover', label: 'Discover', icon: Compass },
  { path: 'my-books', label: 'My books', icon: Library },
  { path: 'reservations', label: 'Reservations', icon: ListOrdered },
  { path: 'saved', label: 'Saved books', icon: Bookmark },
  { path: 'fines', label: 'Fines', icon: Receipt },
  { path: 'notifications', label: 'Notifications', icon: Bell },
  { path: 'profile', label: 'Profile', icon: User },
];

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    ...staffCore,
    { path: 'taxonomy', label: 'Categories & authors', icon: Tags, group: 'Collection' },
    { path: 'activity', label: 'Activity log', icon: Activity, group: 'Insights' },
    { path: 'data', label: 'Import & export', icon: Database, group: 'System' },
    { path: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  ],
  librarian: staffCore,
  /** Students alone can borrow by themselves; faculty alone run course reserves. */
  student: patron({ path: 'self-checkout', label: 'Self-checkout', icon: ScanLine }),
  faculty: patron({ path: 'courses', label: 'Course reserves', icon: GraduationCap }),
};

export const GROUP_ORDER = ['Overview', 'Collection', 'People', 'Insights', 'System'];

export const isStaff = (r: Role | undefined) => r === 'admin' || r === 'librarian';
