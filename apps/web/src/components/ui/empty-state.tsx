/**
 * An empty screen is an invitation to act, not a report of absence. So it
 * always says what to do next.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-rule px-6 py-12 text-center">
      <p className="font-[family-name:var(--font-display)] text-subhead text-ink">
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-small text-ink-muted">
        {description}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
