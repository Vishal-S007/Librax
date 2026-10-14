import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Stack of open traps: only the most recently opened dialog reacts to Tab and Escape. */
const stack: symbol[] = [];
/** Containers with a live trap, and where focus was before each one first opened. */
const liveContainers = new Set<HTMLElement>();
const returnFocus = new WeakMap<HTMLElement, HTMLElement | null>();

/** Traps Tab focus inside a container while active and restores focus on close. */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape?: () => void) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const id = Symbol('trap');
    stack.push(id);
    const el = ref.current;
    if (el) {
      // Remember the element to return to only on the first open, not on a dev-mode re-run.
      if (!returnFocus.has(el)) returnFocus.set(el, document.activeElement as HTMLElement | null);
      liveContainers.add(el);
    }
    if (!el?.contains(document.activeElement)) {
      const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el)?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape' && escRef.current) { e.stopPropagation(); escRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
      if (!el) return;
      liveContainers.delete(el);
      // Decide after the current commit: React may immediately re-run this effect (StrictMode),
      // and another dialog may be opening in the same update (scanner → "Add title").
      queueMicrotask(() => {
        if (liveContainers.has(el)) return; // re-opened: keep focus where it is
        const now = document.activeElement;
        const inOtherDialog = [...liveContainers].some((c) => c.contains(now));
        const target = returnFocus.get(el);
        returnFocus.delete(el);
        if (!inOtherDialog) target?.focus?.();
      });
    };
  }, [active, ref]);
}
