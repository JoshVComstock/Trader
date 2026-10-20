export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <g className="text-brand">
        <path d="M3 17 L9 11 L13 15 L21 6" />
        <path d="M15 6 L21 6 L21 12" />
      </g>
    </svg>
  );
}
