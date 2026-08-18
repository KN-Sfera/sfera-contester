"use client";

import { SessionProvider } from "@/lib/auth/session-context";
import { ThemeProvider } from "@/lib/theme/theme-context";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Split out of `layout.tsx` so the layout itself stays a server component —
 * otherwise the whole application would render on the client.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
