"use client";

import { cx } from "@/lib/cx";

/**
 * Tabs — on small screens they replace the problem page's three-column
 * layout. Squeezing a split pane into 375 px produces an unusable editor, so
 * the panels change form instead of shrinking.
 *
 * The implementation follows the ARIA pattern: arrows move between tabs,
 * Home/End jump to the ends.
 */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** The dot flags a change in a panel the user is not looking at. */
  dot?: boolean;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
  className,
}: TabsProps<T>) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = items.findIndex((item) => item.id === active);
    if (index < 0) return;

    const move = (target: number) => {
      event.preventDefault();
      onChange(items[(target + items.length) % items.length]!.id);
    };

    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx("flex border-b border-rule", className)}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              "relative flex-1 border-b-2 px-3 py-2.5 text-label font-medium uppercase tracking-[0.08em]",
              "transition-colors duration-[var(--dur-fast)]",
              selected
                ? "border-ink text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted",
            )}
          >
            {item.label}
            {item.dot && !selected && (
              <span
                aria-label="new results"
                className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--v-ac)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<T extends string>({
  id,
  active,
  children,
  className,
}: {
  id: T;
  active: T;
  children: React.ReactNode;
  className?: string;
}) {
  const selected = id === active;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!selected}
      tabIndex={0}
      className={cx(selected ? className : undefined)}
    >
      {selected && children}
    </div>
  );
}
