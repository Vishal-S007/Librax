import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, CheckCircle2, ChevronDown, Cpu, Download, Info, Loader2, SendHorizontal, ShieldCheck, Sparkles, Square, WifiOff, Zap } from 'lucide-react';
import { useData, useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { BookCover } from '@/components/books/BookCover';
import { usePatron } from '@/features/patron/usePatron';
import {
  ROUTER_SCHEMA, STARTERS, answer, mergeUnderstanding, routerPrompt, systemPrompt, understand, writerPrompt,
  type Answer, type BookHit, type ProposedAction,
} from '@/services/librarian';
import { aiStatus, createAISession, type AISession, type AIStatus } from '@/lib/onDeviceAI';
import { fmtDate } from '@/lib/dates';
import { cn } from '@/lib/cn';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  answer?: Answer;
  engine?: 'ai' | 'rules';
  streaming?: boolean;
  /** action key -> result line once confirmed */
  done?: Record<string, string>;
}

const PREF = 'librax:ai-librarian';
const actionKey = (a: ProposedAction) => `${a.kind}:${a.kind === 'renew' ? a.loanId : a.bookId}`;
const readPref = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };
const writePref = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

/** Students and faculty: a librarian you can talk to, running entirely on this laptop. */
export default function LibrarianPage() {
  const { memberId, member } = usePatron();
  const data = useData();
  const now = useNow();
  const lib = useLibrary();
  const base = useBase();
  const { run } = useAction();

  const [status, setStatus] = useState<AIStatus | 'checking'>('checking');
  const [aiOn, setAiOn] = useState(readPref);
  const [progress, setProgress] = useState<number | null>(null);
  const [startError, setStartError] = useState<string>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useRef<AISession | null>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const dataRef = useRef(data);
  dataRef.current = data;
  const listRef = useRef<HTMLDivElement>(null);
  const kind = member?.type === 'faculty' ? 'faculty' : 'student';

  useEffect(() => {
    let live = true;
    void aiStatus().then((s) => live && setStatus(s));
    return () => { live = false; session.current?.destroy(); session.current = null; abort.current?.abort(); };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const ensureSession = async (): Promise<AISession | null> => {
    if (session.current) return session.current;
    if (!aiOn || (status !== 'available' && status !== 'downloadable' && status !== 'downloading')) return null;
    try {
      if (status !== 'available') setProgress(0);
      session.current = await createAISession(systemPrompt(dataRef.current, memberId, now), routerPrompt(dataRef.current), (p) => setProgress(p));
      setStatus('available');
      setStartError(undefined);
      return session.current;
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'The on-device model could not start.');
      return null;
    } finally {
      setProgress(null);
    }
  };

  const patch = (id: number, p: Partial<Msg>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const userId = nextId.current++;
    const botId = nextId.current++;
    setMessages((ms) => [...ms, { id: userId, role: 'user', text: q }, { id: botId, role: 'assistant', text: '', streaming: true }]);
    try {
      const ai = await ensureSession();
      let u = understand(q);
      if (ai) u = mergeUnderstanding(u, await ai.classify<{ intent?: string; keywords?: unknown }>(q, ROUTER_SCHEMA));
      const a = answer(dataRef.current, memberId, u, now);
      if (!ai) {
        patch(botId, { text: a.text, answer: a, engine: 'rules', streaming: false });
        return;
      }
      patch(botId, { answer: a, engine: 'ai' });
      abort.current = new AbortController();
      try {
        const text = await ai.write(writerPrompt(q, a), (t) => patch(botId, { text: t }), abort.current.signal);
        patch(botId, { text: text.trim() || a.text, streaming: false });
      } catch {
        // Model hiccup or Stop pressed: fall back to the exact answer so nothing is lost.
        setMessages((ms) => ms.map((m) => (m.id === botId ? { ...m, text: m.text.trim() || a.text, streaming: false, engine: m.text.trim() ? 'ai' : 'rules' } : m)));
      }
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const confirm = (msg: Msg, a: ProposedAction) => {
    const key = actionKey(a);
    let line: string | undefined;
    if (a.kind === 'reserve') {
      const r = run(() => lib.reserve(memberId, a.bookId), 'Reservation placed');
      if (r) line = r.status === 'ready' ? `Reserved — a copy is held for you until ${fmtDate(r.pickupBy)}.` : 'Reserved — you’re in the queue. I’ll notify you when it’s ready.';
    } else if (a.kind === 'renew') {
      const l = run(() => lib.renew(a.loanId), 'Renewed');
      if (l) line = `Renewed — now due ${fmtDate(l.dueAt)}.`;
    } else {
      const c = run(() => lib.setCourseBook(a.courseId, a.bookId, true), (c) => `Added to ${c.code}`);
      if (c) line = `Added to ${c.code} — students now get ${dataRef.current.settings.reserveLoanDays}-day loans for it.`;
    }
    if (line) patch(msg.id, { done: { ...msg.done, [key]: line } });
  };

  const toggleAI = (on: boolean) => {
    setAiOn(on);
    writePref(on);
    if (!on) { session.current?.destroy(); session.current = null; }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input); };
  const canUseAI = status === 'available' || status === 'downloadable' || status === 'downloading';

  return (
    <div>
      <PageHeader
        eyebrow="Runs on this laptop"
        title="AI Librarian"
        description="Ask in your own words. It searches the catalog, checks your loans and the rules, and can reserve or renew for you — you always confirm first."
        actions={<EngineBadge status={status} aiOn={aiOn} progress={progress} />}
      />

      {canUseAI && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface/80 px-4 py-3 text-sm backdrop-blur-md">
          <Cpu className="h-4 w-4 text-plum" aria-hidden />
          <span className="min-w-0 flex-1 text-ink-muted">
            {status === 'available'
              ? 'Gemini Nano is ready on this device. Questions never leave your laptop.'
              : 'Chrome can download its on-device model once (several GB). After that the AI works with no internet and no account.'}
          </span>
          {status !== 'available' && aiOn && !session.current && (
            <Button size="sm" variant="subtle" icon={<Download className="h-3.5 w-3.5" />} disabled={progress !== null} onClick={() => void ensureSession()}>
              {progress !== null ? `Downloading ${Math.round(progress * 100)}%` : 'Download model'}
            </Button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brass))]" checked={aiOn} onChange={(e) => toggleAI(e.target.checked)} />
            Use on-device AI
          </label>
        </div>
      )}
      {progress !== null && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Model download">
          <div className="h-full bg-plum transition-all" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>
      )}
      {startError && <p role="alert" className="mb-4 text-sm text-rose">{startError} Answers will use the instant LIBRAX engine instead.</p>}

      <section className="card flex h-[calc(100dvh-260px)] min-h-[460px] flex-col overflow-hidden">
        <div ref={listRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-plum-soft"><Sparkles className="h-7 w-7 text-plum" aria-hidden /></span>
              <h2 className="mt-4 font-display text-2xl text-ink">Hi {member?.name.split(' ')[0] ?? 'there'}, what can I find for you?</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Try a topic, an author, or something about your account.{kind === 'faculty' ? ' You can also say “add a book to CS301”.' : ''}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTERS[kind].map((s) => <Chip key={s} onClick={() => void ask(s)}>{s}</Chip>)}
              </div>
            </div>
          )}
          {messages.map((m) => m.role === 'user'
            ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brass px-4 py-2.5 text-sm text-brass-ink">{m.text}</p>
              </div>
            ) : (
              <BotMessage key={m.id} m={m} base={base} studentView={kind === 'student'} onConfirm={(a) => confirm(m, a)} onAsk={(s) => void ask(s)} busy={busy} />
            ))}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-surface/70 p-3">
          <label htmlFor="librarian-input" className="sr-only">Ask the AI Librarian</label>
          <input
            id="librarian-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={kind === 'faculty' ? 'e.g. “Add Graphs and Networks to CS301”' : 'e.g. “Any books on machine learning on the shelf?”'}
            autoComplete="off"
            maxLength={300}
            className="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas/60 px-4 text-sm text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none"
          />
          {busy && abort.current ? (
            <Button variant="secondary" icon={<Square className="h-4 w-4" />} onClick={() => abort.current?.abort()}>Stop</Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!input.trim() || busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}>Ask</Button>
          )}
        </form>
      </section>

      <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Every book, date and amount comes straight from the library’s records — the AI only words the reply, and it can’t change anything until you press Confirm.
      </p>
    </div>
  );
}

function EngineBadge({ status, aiOn, progress }: { status: AIStatus | 'checking'; aiOn: boolean; progress: number | null }) {
  if (status === 'checking') return <Badge tone="neutral">Checking device…</Badge>;
  if (progress !== null) return <Badge tone="plum" dot>Downloading model</Badge>;
  if (status === 'available' && aiOn) return <Badge tone="sage" dot>On-device AI · offline</Badge>;
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer"><Badge tone="sky"><Zap className="h-3 w-3" /> Instant engine</Badge></summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-ink-muted shadow-card">
        <p className="flex items-center gap-1.5 font-semibold text-ink"><Info className="h-3.5 w-3.5" /> About the AI engine</p>
        {status === 'unsupported' || status === 'unavailable' ? (
          <p className="mt-2">This browser doesn’t offer on-device AI, so answers come from LIBRAX’s own instant engine — same facts and actions, simpler wording.
            For the full AI, open LIBRAX in desktop Chrome 148+ on a computer with 22 GB free disk and 16 GB RAM (or a GPU with more than 4 GB).</p>
        ) : (
          <p className="mt-2">On-device AI is switched off. Turn on “Use on-device AI” to let Gemini Nano word the answers.</p>
        )}
      </div>
    </details>
  );
}

function Chip({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="rounded-full border border-line bg-surface-raised/70 px-3 py-1.5 text-xs text-ink-muted transition hover:border-brass hover:text-ink disabled:opacity-50">
      {children}
    </button>
  );
}

function BotMessage({ m, base, studentView, onConfirm, onAsk, busy }: {
  m: Msg; base: string; studentView: boolean; onConfirm: (a: ProposedAction) => void; onAsk: (s: string) => void; busy: boolean;
}) {
  const a = m.answer;
  const [why, setWhy] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-plum-soft"><Bot className="h-4 w-4 text-plum" aria-hidden /></span>
      <div className="min-w-0 max-w-[90%] flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-md border border-line bg-surface-raised/80 px-4 py-3 text-sm leading-relaxed text-ink">
          {m.text ? <p className="whitespace-pre-wrap">{m.text}{m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-plum align-middle" />}</p>
            : <p className="inline-flex items-center gap-2 text-ink-faint"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking that up…</p>}
        </div>

        {a && a.books.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {a.books.slice(0, 6).map((h) => <BookRow key={h.book.id} h={h} base={base} studentView={studentView} />)}
          </ul>
        )}

        {a && a.actions.length > 0 && (
          <div className="space-y-2">
            {a.actions.map((x) => {
              const done = m.done?.[actionKey(x)];
              return (
                <div key={actionKey(x)} className={cn('flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5 text-sm', done ? 'border-sage/40 bg-sage-soft' : x.ok ? 'border-brass/40 bg-brass-soft/60' : 'border-line bg-surface/60')}>
                  {done ? <CheckCircle2 className="h-4 w-4 text-sage" aria-hidden /> : <Sparkles className={cn('h-4 w-4', x.ok ? 'text-brass' : 'text-ink-faint')} aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{x.label}</p>
                    <p className="text-xs text-ink-muted">{done ?? x.why}</p>
                  </div>
                  {!done && x.ok && <Button size="sm" variant="primary" disabled={m.streaming} onClick={() => onConfirm(x)}>Confirm</Button>}
                </div>
              );
            })}
          </div>
        )}

        {a && !m.streaming && (
          <div className="flex flex-wrap items-center gap-2">
            {a.suggestions.map((s) => <Chip key={s} onClick={() => onAsk(s)} disabled={busy}>{s}</Chip>)}
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-faint">
              {m.engine === 'ai' ? <><Cpu className="h-3 w-3" /> On-device AI</> : <><WifiOff className="h-3 w-3" /> Instant engine</>}
              {a.facts.length > 0 && (
                <button type="button" onClick={() => setWhy((v) => !v)} className="ml-2 inline-flex items-center gap-0.5 underline-offset-2 hover:text-ink hover:underline" aria-expanded={why}>
                  Checked in LIBRAX <ChevronDown className={cn('h-3 w-3 transition', why && 'rotate-180')} />
                </button>
              )}
            </span>
          </div>
        )}
        {why && a && (
          <ul className="space-y-1 rounded-card border border-dashed border-line px-3 py-2 text-xs text-ink-muted">
            {a.facts.map((f) => <li key={f}>• {f}</li>)}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function BookRow({ h, base, studentView }: { h: BookHit; base: string; studentView: boolean }) {
  const status = h.yourLoan ? { tone: 'sky' as const, text: 'On loan to you' }
    : h.yourHold === 'ready' ? { tone: 'sage' as const, text: 'Ready for you' }
    : h.yourHold === 'waiting' ? { tone: 'plum' as const, text: 'You’re in the queue' }
    : h.available > 0 ? { tone: 'sage' as const, text: `${h.available} on shelf${h.shelf ? ` · ${h.shelf}` : ''}` }
    : h.total === 0 ? { tone: 'neutral' as const, text: 'No copies' }
    : { tone: 'rose' as const, text: `All out${h.waiting ? ` · ${h.waiting} waiting` : ''}` };
  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-surface/70 p-2.5">
      <BookCover book={h.book} size="sm" className="w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link to={`${base}/books/${h.book.id}`} className="block truncate text-sm font-medium text-ink hover:text-brass">{h.book.title}</Link>
        <p className="truncate text-xs text-ink-faint">{h.book.authors.join(', ')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={status.tone}>{status.text}</Badge>
          {h.reserveCodes.length > 0 && <Badge tone="plum">Reserve · {h.reserveCodes.join(', ')}</Badge>}
          {studentView && h.available > 0 && !h.yourLoan && (
            <Link to={`${base}/self-checkout`} className="text-[11px] text-brass underline-offset-2 hover:underline">Self-checkout</Link>
          )}
        </div>
      </div>
    </li>
  );
}
