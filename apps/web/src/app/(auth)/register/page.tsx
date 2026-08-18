import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-title">New account</h1>
      <p className="mt-2 text-small text-ink-muted">
        Your display name is what appears on the scoreboard.
      </p>

      <RegisterForm />

      <p className="mt-6 border-t border-rule pt-4 text-small text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
