import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Repeat2, User } from 'lucide-react';
import { useLibrary, useSession } from '@/app/providers';
import { ROLE_LABEL } from '@/services/session';
import { Popover } from './Popover';
import { isStaff } from '@/routes/nav';

export function initials(name: string) {
  return name.replace(/^(Dr\.|Prof\.)\s+/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function ProfileMenu() {
  const session = useSession();
  const lib = useLibrary();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!session) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition hover:bg-surface-raised sm:pr-3"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brass to-[rgb(var(--sage))] text-xs font-bold text-brass-ink">
          {initials(session.name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight text-ink">{session.name}</span>
          <span className="block text-[11px] leading-tight text-ink-faint">{ROLE_LABEL[session.role]}</span>
        </span>
      </button>
      <Popover open={open} onClose={close} label="Account" className="w-64 p-1.5">
        <div className="px-3 py-2.5">
          <p className="text-sm font-medium text-ink">{session.name}</p>
          <p className="text-xs text-ink-faint">{ROLE_LABEL[session.role]} · demonstration session</p>
        </div>
        <div className="my-1 h-px bg-line" />
        {!isStaff(session.role) && (
          <button onClick={() => { close(); navigate(`/${session.role}/profile`); }} className="flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink">
            <User className="h-4 w-4" /> My profile
          </button>
        )}
        <button onClick={() => { close(); lib.session.set(null); navigate('/login'); }} className="flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink">
          <Repeat2 className="h-4 w-4" /> Switch demo account
        </button>
        <button onClick={() => { close(); lib.session.set(null); navigate('/login', { replace: true }); }} className="flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2 text-sm text-rose hover:bg-rose-soft">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </Popover>
    </div>
  );
}
