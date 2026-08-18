"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "@/lib/cx";
import { DURATION, EASE, motion, set } from "@/lib/motion/motion";

/**
 * Transient messages.
 *
 * Reserved for things that happened out of view — "code copied", "session
 * expired". A submission verdict does **not** go through here: it has its own
 * permanent place on screen and must not vanish after three seconds.
 */

type ToastTone = "neutral" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{
  show: (message: string, tone?: ToastTone) => void;
} | null>(null);

const VISIBLE_MS = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, VISIBLE_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    set(node, { opacity: 0, translateY: 8 });
    const handle = motion(node, {
      opacity: 1,
      translateY: 0,
      duration: DURATION.base,
      ease: EASE.out,
    });
    return () => handle.cancel();
  }, []);

  return (
    <div
      ref={ref}
      className={cx(
        "pointer-events-auto max-w-md border bg-paper-raised px-3 py-2 text-small",
        "rounded-[2px]",
        toast.tone === "error"
          ? "border-[color-mix(in_srgb,var(--v-wa)_50%,transparent)] text-[var(--v-wa)]"
          : "border-rule-strong text-ink",
      )}
    >
      {toast.message}
    </div>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast requires a ToastProvider.");
  return value;
}
