import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Sign-in and sign-up screens. No navigation — there is nowhere to go without
 * a session, and an empty menu only distracts.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-rule px-5 py-3">
        <Link
          href="/problems"
          className="font-[family-name:var(--font-display)] text-subhead no-underline"
        >
          Sfera
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
