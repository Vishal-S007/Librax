import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { DataTable } from '@/components/tables/DataTable';
import { Sidebar } from '@/components/layout/Sidebar';
import { LibraryProvider } from '@/app/providers';
import { createLibrary } from '@/app/library';
import { MemoryAdapter } from '@/repositories/adapter';
import { SessionStore } from '@/services/session';
import { tiny } from './helpers';

describe('UI components', () => {
  it('renders an empty state with its action', () => {
    render(<EmptyState icon={BookOpen} title="Nothing here" body="Add something" action={<button>Add</button>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('links a field label and shows its error accessibly', () => {
    render(<Field label="Email" error="Enter a valid email address"><Input /></Field>);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });

  it('shows the empty state when a table has no rows, and sorts when it does', async () => {
    const cols = [{ key: 'n', header: 'Name', render: (r: { n: string }) => r.n, sortValue: (r: { n: string }) => r.n }];
    const { rerender } = render(<DataTable caption="t" rows={[]} columns={cols} rowKey={(r) => r.n} empty={<p>No rows</p>} />);
    expect(screen.getByText('No rows')).toBeInTheDocument();
    rerender(<DataTable caption="t" rows={[{ n: 'b' }, { n: 'a' }]} columns={cols} rowKey={(r) => r.n} empty={<p>No rows</p>} />);
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(0, 2)).toEqual(['a', 'b']);
  });
});

describe('role-specific navigation', () => {
  function renderSidebar(role: 'admin' | 'student', memberId?: string) {
    const session = new SessionStore();
    const lib = createLibrary(new MemoryAdapter(), { seed: tiny, session });
    lib.store.load();
    session.set({ role, name: 'Tester', memberId, startedAt: new Date().toISOString() });
    return render(
      <LibraryProvider library={lib}>
        <MemoryRouter initialEntries={[`/${role}`]}>
          <Sidebar collapsed={false} onToggleCollapse={() => undefined} mobileOpen={false} onCloseMobile={() => undefined} desktop />
        </MemoryRouter>
      </LibraryProvider>,
    );
  }
  it('shows administration items to admins only', () => {
    renderSidebar('admin');
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/admin/settings');
  });
  it('shows discovery but not member management to students', () => {
    renderSidebar('student', 's1');
    expect(screen.getByRole('link', { name: /Discover/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Members$/ })).toBeNull();
  });
});
