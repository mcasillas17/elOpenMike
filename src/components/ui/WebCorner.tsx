// Faint crossed red/blue web-grid in a corner. Decorative only.
export function WebCorner({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute h-40 w-40 opacity-[0.16] ${className}`.trim()}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, #e62429 0 1px, transparent 1px 16px), repeating-linear-gradient(45deg, #1b6fe3 0 1px, transparent 1px 16px)",
      }}
    />
  );
}
