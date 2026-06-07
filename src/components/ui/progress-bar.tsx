import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** Fraction in [0, 1]. */
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-secondary shadow-[inset_0_1px_2px_rgba(16,24,40,0.06)]",
        className,
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary bg-gradient-to-b from-white/25 to-transparent transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
