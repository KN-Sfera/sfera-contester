"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";

/** Must match `MIN_PASSWORD_LENGTH` in the API. */
const MIN_PASSWORD = 10;

export function RegisterForm() {
  const router = useRouter();
  const { signUp } = useSession();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Local validation using the same rules as the backend — nobody should
    // wait for a round trip to learn their password is too short.
    if (password.length < MIN_PASSWORD) {
      setError(
        new ApiError(0, "", {
          password: [`The password must be at least ${MIN_PASSWORD} characters.`],
        }),
      );
      return;
    }

    setPending(true);
    setError(null);

    try {
      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      router.replace("/problems");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "Could not create the account."),
      );
      setPending(false);
    }
  };

  // Invite mode at a contest is an ordinary configuration, not a failure — the
  // message should point at the organiser rather than suggest something broke.
  const registrationClosed = error?.status === 403;

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      {registrationClosed && (
        <p role="alert" className="border border-rule-strong px-3 py-2.5 text-small">
          {error.message} Ask the organiser to create an account for you.
        </p>
      )}

      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        required
        minLength={2}
        maxLength={64}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        error={error?.fieldError("displayName")}
      />

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
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={error?.fieldError("password")}
      />

      {error && !registrationClosed && Object.keys(error.fieldErrors).length === 0 && (
        <p role="alert" className="text-small text-[var(--v-wa)]">
          {error.message}
        </p>
      )}

      <Button type="submit" variant="primary" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
