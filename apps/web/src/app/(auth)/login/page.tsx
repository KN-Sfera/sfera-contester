import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-title">Sign in</h1>
      <p className="mt-2 text-small text-ink-muted">
        One account covers both practice problems and contests.
      </p>

      <Suspense>
        <LoginForm />
      </Suspense>

      <p className="mt-6 border-t border-rule pt-4 text-small text-ink-muted">
        No account yet?{" "}
        <Link href="/register" className="text-ink underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
