"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth/session-context";

/**
 * The gate for pages that require an account.
 *
 * Next middleware could not settle this — the session is verified by the API,
 * not by Next. While the check runs we show a skeleton; redirecting at that
 * point would throw out everyone who merely refreshed the page.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "anonymous") return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div aria-busy="true" className="py-6">
      <SkeletonRows rows={5} />
    </div>
  );
}
