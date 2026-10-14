import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, BookOpen, GraduationCap, IdCard, Info, Library, Printer, ShieldCheck, type LucideIcon } from 'lucide-react';
import { BarcodeScanner } from '@/components/scan/BarcodeScanner';
import { resolveMemberCard, type CardRegistration } from '@/services/scan';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { seriesLabel } from '@/lib/cardSeries';
import { printMemberCards } from '@/lib/printLabels';
import type { Role } from '@/types/models';
import { useData, useLibrary } from '@/app/providers';
import { ROLE_HOME, ROLE_LABEL } from '@/services/session';
import { DEMO_ADMIN, DEMO_FACULTY_ID, DEMO_LIBRARIAN, DEMO_STUDENT_ID } from '@/seed/seed';
import { LogoMark } from '@/components/layout/Logo';
import { BackgroundVideo } from '@/components/layout/BackgroundVideo';
import { Input, Select } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { nowISO } from '@/lib/dates';
import { useAppliedTheme } from '@/components/layout/ThemeToggle';

interface Persona {
  role: Role;
  icon: LucideIcon;
  blurb: string;
}

const PERSONAS: Persona[] = [
  { role: 'admin', icon: ShieldCheck, blurb: 'Full control: catalog, members, policies, reports, audit log and data tools.' },
  { role: 'librarian', icon: Library, blurb: 'Run the circulation desk: issue, return, renew, holds and fines.' },
  { role: 'student', icon: GraduationCap, blurb: 'Discover books, track loans, place reservations and see fines.' },
  { role: 'faculty', icon: BookOpen, blurb: 'Extended loan periods and limits, reading lists and reservations.' },
];

export default function LoginPage() {
  useAppliedTheme();
  const lib = useLibrary();
  const data = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [role, setRole] = useState<Role>('admin');
  const students = data.members.filter((m) => m.type === 'student' && m.status === 'active');
  const faculty = data.members.filter((m) => m.type === 'faculty' && m.status === 'active');
  const [studentId, setStudentId] = useState(students.some((s) => s.id === DEMO_STUDENT_ID) ? DEMO_STUDENT_ID : students[0]?.id ?? '');
  const [facultyId, setFacultyId] = useState(faculty.some((s) => s.id === DEMO_FACULTY_ID) ? DEMO_FACULTY_ID : faculty[0]?.id ?? '');

  const patron = role === 'student' || role === 'faculty';
  /** Students sign in only by scanning their ID card — no typed numbers, no account picker. */
  const scanOnly = role === 'student';
  const [scanning, setScanning] = useState(false);
  const [manualPick, setManualPick] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [signup, setSignup] = useState<CardRegistration | null>(null);
  const [form, setForm] = useState({ name: '', email: '', department: '' });
  const [signupError, setSignupError] = useState<string>();
  const startSignup = (r: CardRegistration) => {
    setSignup(r);
    setSignupError(undefined);
    setForm({ name: r.name ?? '', email: '', department: r.details.department ?? '' });
  };
  const activate = () => {
    if (!signup) return;
    try {
      const m = lib.registerFromCard({ code: signup.code, type: signup.type, name: form.name, email: form.email, department: form.department });
      setSignup(null);
      enter(m.id, m.name);
    } catch (e) {
      setSignupError(errorMessage(e));
    }
  };
  const series = data.settings.cardSeries.filter((x) => x.active && x.type === role);
  const canEnter = role === 'student' ? !!studentId : role === 'faculty' ? !!facultyId : true;

  const enter = (pickedMemberId?: string, pickedName?: string) => {
    let name: string = role === 'admin' ? DEMO_ADMIN.name : DEMO_LIBRARIAN.name;
    let memberId: string | undefined;
    if (role === 'student' || role === 'faculty') {
      memberId = pickedMemberId ?? (role === 'student' ? studentId : facultyId);
      name = pickedName ?? data.members.find((m) => m.id === memberId)?.name ?? ROLE_LABEL[role];
    }
    lib.session.set({ role, name, memberId, startedAt: nowISO() });
    const target = from && from.startsWith(`/${role}/`) ? from : ROLE_HOME[role];
    navigate(target, { replace: true });
  };

  return (
    // `dark` scopes the dark design tokens to this page, so the sign-in stays legible over the video in either theme.
    <div className="dark relative min-h-dvh w-full overflow-hidden bg-[hsl(201_100%_13%)] text-white">
      <BackgroundVideo />

      <nav className="relative z-10 mx-auto flex max-w-7xl flex-row items-center justify-between px-6 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <span className="text-3xl tracking-tight text-white" style={{ fontFamily: CINEMATIC }}>
            LIBRAX<sup className="text-xs">®</sup>
          </span>
        </div>
        <p className="hidden text-sm text-white/65 md:block">Library operations · Book discovery</p>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-4 sm:px-8 lg:min-h-[calc(100dvh-96px)] lg:grid-cols-[1.15fr_1fr] lg:pb-10 lg:pt-0">
        {/* Cinematic headline */}
        <section className="text-center lg:text-left">
          <h1
            className="animate-fade-rise mx-auto max-w-3xl text-5xl font-normal leading-[0.95] tracking-[-2.46px] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] sm:text-7xl lg:mx-0 lg:text-[5.5rem]"
            style={{ fontFamily: CINEMATIC }}
          >
            Every shelf, <em className="not-italic text-white/60">every loan,</em> beautifully <em className="not-italic text-white/60">in order.</em>
          </h1>
          <p className="animate-fade-rise-delay mx-auto mt-8 max-w-xl text-base leading-relaxed text-white/80 [text-shadow:0_1px_14px_rgba(0,0,0,0.75)] sm:text-lg lg:mx-0">
            A complete library that runs entirely in your browser. Sign in with your library card, borrow by scanning, and let every rule take care of itself.
          </p>
        </section>

        {/* Sign-in card */}
        <main className="animate-fade-rise-delay-2 login-glass mx-auto w-full max-w-[480px] rounded-[28px] p-6 sm:p-8">
          <h2 className="text-3xl text-white" style={{ fontFamily: CINEMATIC }}>{patron && (!manualPick || scanOnly) ? 'Sign in with your library card' : 'Choose a demo account'}</h2>
          <p className="mt-1.5 text-sm text-white/60">{data.settings.libraryName}</p>

          <fieldset className="mt-7">
            <legend className="sr-only">Demo role</legend>
            <div className="grid gap-2.5">
              {PERSONAS.map((p) => {
                const selected = role === p.role;
                return (
                  <label
                    key={p.role}
                    className={cn(
                      'group flex cursor-pointer items-start gap-3.5 rounded-card border p-4 transition duration-base',
                      selected ? 'border-brass/80 bg-brass/15' : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]',
                    )}
                  >
                    <input type="radio" name="role" value={p.role} checked={selected} onChange={() => setRole(p.role)} className="sr-only" />
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition', selected ? 'bg-brass text-brass-ink' : 'bg-surface-raised text-ink-muted')}>
                      <p.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-ink">{ROLE_LABEL[p.role]}</span>
                        {p.role === 'admin' && <span className="text-xs text-ink-faint">· {DEMO_ADMIN.name}</span>}
                        {p.role === 'librarian' && <span className="text-xs text-ink-faint">· {DEMO_LIBRARIAN.name}</span>}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{p.blurb}</span>
                      {selected && p.role === 'student' && manualPick && !scanOnly && (
                        <span className="mt-3 block" onClick={(e) => e.preventDefault()}>
                          <Select aria-label="Student account" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                            {students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.memberNo}</option>)}
                          </Select>
                        </span>
                      )}
                      {selected && p.role === 'faculty' && manualPick && (
                        <span className="mt-3 block" onClick={(e) => e.preventDefault()}>
                          <Select aria-label="Faculty account" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                            {faculty.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.memberNo}</option>)}
                          </Select>
                        </span>
                      )}
                      {selected && ((p.role === 'student' && students.length === 0) || (p.role === 'faculty' && faculty.length === 0)) && (
                        <span className="mt-2 block text-xs text-rose">No active {p.role} members exist. Sign in as an administrator to add one.</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {patron && (!manualPick || scanOnly) ? (
            <>
              <button
                onClick={() => setScanning(true)}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brass text-[15px] font-semibold text-brass-ink transition hover:brightness-110"
              >
                <IdCard className="h-5 w-5" /> Scan your library card
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                {scanOnly ? (
                  <span className="text-ink-faint">Student ID cards only: scan the barcode on your card.</span>
                ) : (
                  <button onClick={() => setManualPick(true)} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                    No card? Choose a demo account
                  </button>
                )}
                <button
                  onClick={() => {
                    const list = role === 'student' ? students : faculty;
                    setPopupBlocked(!printMemberCards(list, data.settings.libraryName));
                  }}
                  className="inline-flex items-center gap-1.5 text-brass underline-offset-4 hover:underline"
                >
                  <Printer className="h-3.5 w-3.5" /> Print demo {role} cards
                </button>
              </div>
              {popupBlocked && <p role="alert" className="mt-2 text-xs text-rose">Your browser blocked the card window. Allow pop-ups for this site and try again.</p>}
            </>
          ) : (
            <>
              <button
                onClick={() => enter()}
                disabled={!canEnter}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brass text-[15px] font-semibold text-brass-ink transition hover:brightness-110 disabled:opacity-50"
              >
                Continue as {ROLE_LABEL[role]} <ArrowRight className="h-4 w-4" />
              </button>
              {patron && (
                <button onClick={() => setManualPick(false)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-brass underline-offset-4 hover:underline">
                  <IdCard className="h-3.5 w-3.5" /> Scan a library card instead
                </button>
              )}
            </>
          )}

          <BarcodeScanner
            open={scanning}
            onClose={() => setScanning(false)}
            title={`${ROLE_LABEL[role]} sign-in`}
            scanOnly={scanOnly}
            placeholder={series[0] ? `Card number, e.g. ${series[0].first}` : role === 'faculty' ? 'Card number, e.g. FAC-0001' : 'Card number, e.g. STU-0001'}
            hint={`Hold the barcode or QR code on your ID card up to the camera${scanOnly ? '' : ', or type the number below'}.${series.length ? ` Cards ${series.map(seriesLabel).join(', ')} work here.` : ''}`}
            onDetected={(code) => {
              if (role !== 'student' && role !== 'faculty') return undefined;
              const r = resolveMemberCard(data, code, role);
              if (!r.ok && r.register) {
                const reg = r.register;
                setScanning(false);
                startSignup(reg);
                return undefined;
              }
              if (!r.ok) return r.reason;
              setScanning(false);
              enter(r.member.id);
              return undefined;
            }}
          />

          <Dialog
            open={!!signup}
            onClose={() => setSignup(null)}
            title="Activate your library card"
            footer={<><button type="button" onClick={() => setSignup(null)} className="h-10 rounded-control px-4 text-sm text-ink-muted hover:text-ink">Cancel</button>
              <button type="button" onClick={activate} className="inline-flex h-10 items-center gap-2 rounded-control bg-brass px-4 text-sm font-semibold text-brass-ink hover:brightness-110">Activate &amp; sign in <ArrowRight className="h-4 w-4" /></button></>}
          >
            {signup && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); activate(); }}>
                <div className="flex items-start gap-3 rounded-card border border-line bg-surface-raised p-3.5">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage" aria-hidden />
                  <div className="min-w-0 text-sm">
                    <p className="font-mono font-semibold text-ink">{signup.code}</p>
                    <p className="text-xs text-ink-muted">In the {signup.series.label ?? 'approved'} series ({seriesLabel(signup.series)}). First time this card has been used.</p>
                    {signup.details.facts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">{signup.details.facts.map((f) => <span key={f} className="rounded-full bg-sky-soft px-2 py-0.5 text-[11px] text-sky">{f}</span>)}</div>
                    )}
                  </div>
                </div>
                <Field label="Full name" required error={signupError}><Input data-autofocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" /></Field>
                <Field label="Department" hint={signup.details.department ? 'Read from your card number' : undefined}><Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></Field>
                <Field label="College email" hint="Optional — used for due-date reminders"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="email" /></Field>
                <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
              </form>
            )}
          </Dialog>

          <div className="mt-6 flex gap-2.5 rounded-control border border-white/10 bg-white/[0.04] p-3.5 text-xs leading-relaxed text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky" aria-hidden />
            <p>
              <strong className="text-ink">Demonstration sign-in.</strong> No passwords are used or stored. Role switching only changes the interface;
              because LIBRAX runs entirely in this browser, it provides no real security and is not suitable for production authentication.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

const CINEMATIC = "'Instrument Serif', serif";
