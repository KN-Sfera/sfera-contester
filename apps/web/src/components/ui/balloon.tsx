import { balloonColor } from "@/lib/balloon";
import { cx } from "@/lib/cx";

/**
 * The problem balloon.
 *
 * At ICPC every problem has a balloon colour; solve it and the balloon lands
 * on your desk. Here it carries the same information, and it is the only round
 * element in the whole interface — which is why it registers instantly.
 *
 * The three states are distinguishable by more than colour: filled (solved),
 * coloured outline (attempted), grey outline (untouched). The problem letter
 * always sits next to it, so colour is never the sole carrier.
 */

export type BalloonState = "solved" | "attempted" | "untouched";

const SIZES = {
  sm: "size-2.5",
  md: "size-3.5",
  lg: "size-5",
} as const;

export interface BalloonProps {
  slug: string;
  state?: BalloonState;
  size?: keyof typeof SIZES;
  className?: string;
}

const STATE_LABEL: Record<BalloonState, string> = {
  solved: "solved",
  attempted: "attempted, not solved yet",
  untouched: "no attempts",
};

export function Balloon({
  slug,
  state = "untouched",
  size = "md",
  className,
}: BalloonProps) {
  const color = balloonColor(slug);

  return (
    <span
      role="img"
      aria-label={`Problem ${STATE_LABEL[state]}`}
      data-state={state}
      className={cx("inline-block shrink-0 rounded-full border", SIZES[size], className)}
      style={{
        background: state === "solved" ? color : "transparent",
        borderColor: state === "untouched" ? "var(--rule-strong)" : color,
        borderWidth: state === "attempted" ? 2 : 1,
      }}
    />
  );
}
