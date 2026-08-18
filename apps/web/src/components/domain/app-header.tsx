"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cx } from "@/lib/cx";
import { useSession } from "@/lib/auth/session-context";
import { isCurrent, NAV_LINKS } from "@/lib/nav";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, signOut } = useSession();

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-[2px]">
      {/*
        Below `sm` the header is two rows — brand and account above, the tabs
        below. Four tabs plus the account controls do not fit across 375 px,
        and a tab hidden behind a sideways scroll is a tab nobody finds. From
        `sm` up the first row dissolves (`sm:contents`) and everything sits on
        one line; `order` puts the nav back between the brand and the account.
      */}
      <div className="mx-auto flex max-w-6xl flex-col px-4 sm:h-14 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <div className="flex h-14 items-center gap-3 sm:contents">
          <Link
            href="/"
            className="shrink-0 font-[family-name:var(--font-display)] text-subhead leading-none no-underline sm:order-1"
          >
            Sfera
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:order-3">
            <ThemeToggle />

            {status === "authenticated" && user && (
              <>
                <span className="hidden text-label text-ink-muted sm:inline">
                  {user.displayName}
                </span>
                <Button size="sm" variant="ghost" onClick={onSignOut}>
                  Sign out
                </Button>
              </>
            )}

            {status === "anonymous" && (
              <>
                <Link
                  href="/register"
                  className="hidden text-label uppercase tracking-[0.08em] text-ink-faint no-underline transition-colors duration-[var(--dur-fast)] hover:text-ink sm:inline"
                >
                  Register
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    router.push(`/login?next=${encodeURIComponent(pathname)}`)
                  }
                >
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>

        <nav
          aria-label="Main"
          className={cx(
            "-mx-4 flex items-center gap-1 overflow-x-auto border-t border-rule px-3 pb-1",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "sm:order-2 sm:mx-0 sm:min-w-0 sm:border-t-0 sm:px-0 sm:pb-0",
          )}
        >
          {NAV_LINKS.map((link) => {
            const active = isCurrent(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-label uppercase tracking-[0.08em] no-underline sm:py-1",
                  "transition-colors duration-[var(--dur-fast)]",
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-muted",
                )}
              >
                {link.label}
                {link.soon && (
                  <span className="border border-rule px-1 text-micro leading-[1.4] text-ink-faint">
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
