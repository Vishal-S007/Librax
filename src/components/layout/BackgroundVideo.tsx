import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export const BACKGROUND_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Looping background video, purely decorative: hidden from screen readers, paused for people who
 * prefer reduced motion, and if it can't load (e.g. offline) the page keeps its normal background.
 *
 * - `clear`: full-screen behind the sign-in page.
 * - `blurred`: fixed behind the app, heavily blurred and tinted with the theme's canvas colour so
 *   dashboards stay readable in both light and dark themes.
 */
export function BackgroundVideo({ variant = 'clear' }: { variant?: 'clear' | 'blurred' }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const apply = () => { if (mq?.matches) v.pause(); else void v.play().catch(() => undefined); };
    apply();
    mq?.addEventListener?.('change', apply);
    // Save battery: pause while the tab is hidden.
    const onVisibility = () => { if (document.hidden) v.pause(); else apply(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mq?.removeEventListener?.('change', apply);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (failed) return null;

  const video = (
    <video
      ref={ref}
      className={cn('h-full w-full object-cover', variant === 'clear' ? 'absolute inset-0 z-0' : 'scale-105 blur-[5px] saturate-[1.15]')}
      src={BACKGROUND_VIDEO_SRC}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden
      tabIndex={-1}
      onCanPlay={(e) => { if (!prefersReducedMotion()) void e.currentTarget.play().catch(() => undefined); }}
      onError={() => setFailed(true)}
    />
  );

  if (variant === 'clear') return video;
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {video}
      <div className="absolute inset-0 bg-canvas/40 dark:bg-canvas/35" />
    </div>
  );
}
