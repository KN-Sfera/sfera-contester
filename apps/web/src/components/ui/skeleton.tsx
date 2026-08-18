import { cx } from "@/lib/cx";

/**
 * Placeholder for content being loaded. It pulses `opacity` alone — nothing
 * here changes size, so the layout does not twitch while loading.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-[pulse_1400ms_ease-in-out_infinite] bg-paper-sunken",
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
