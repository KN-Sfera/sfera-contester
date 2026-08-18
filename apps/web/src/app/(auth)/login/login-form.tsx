"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await signIn({ email: email.trim(), password });
      // `next` comes from the redirect off a protected page. We accept
      // relative paths only — a full URL would turn sign-in into an open
      // redirect.
      const next = params.get("next");
      router.replace(next?.startsWith("/") ? next : "/problems");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, "Sign-in failed."),
      );
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <Field
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error?.fieldError("email")}
      />

      <Field
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error?.fieldError("password")}
      />

      {error && Object.keys(error.fieldErrors).length === 0 && (
        <p role="alert" className="text-small text-[var(--v-wa)]">
          {error.message}
        </p>
      )}

      <Button type="submit" variant="primary" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
