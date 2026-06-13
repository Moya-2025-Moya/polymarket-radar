// A small "?" that reveals an explanation on hover. CSS-only (group-hover).
export function Hint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex align-middle">
      <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-border text-[9px] leading-none text-faint">
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-elevated px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-foreground opacity-0 shadow-xl transition-opacity duration-100 group-hover/hint:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
