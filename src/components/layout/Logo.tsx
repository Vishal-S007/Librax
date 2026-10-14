export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-surface-raised" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" className="stroke-line-strong" />
      <path d="M18 14h7v29h21v7H18z" className="fill-brass" />
      <path d="M30 14h5v24h-5z" className="fill-sage" />
      <path d="M38 14h5v24h-5z" className="fill-brass" opacity=".55" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-display text-[19px] font-semibold tracking-[0.08em] text-ink">LIBRAX</span>
    </span>
  );
}
