"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError } from "@/lib/api/client";
import * as authApi from "@/lib/api/auth";
import type { User } from "@/lib/api/types";

/**
 * The user session.
 *
 * Next middleware cannot settle this — the session lives in a cookie the API
 * verifies and Next knows nothing about. So the state is client-side, and
 * protected pages render a skeleton for as long as `loading` lasts.
 */

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionValue {
  status: SessionStatus;
  user: User | null;
  signIn: (credentials: authApi.Credentials) => Promise<User>;
  signUp: (input: authApi.Registration) => Promise<User>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    authApi
      .currentUser()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A 401 is the ordinary "not signed in" state, not a failure. Any
        // other error leaves us anonymous too — without a session there is
        // nothing we could do anyway.
        if (!(error instanceof ApiError)) console.error(error);
        setUser(null);
        setStatus("anonymous");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials: authApi.Credentials) => {
    const current = await authApi.login(credentials);
    setUser(current);
    setStatus("authenticated");
    return current;
  }, []);

  const signUp = useCallback(async (input: authApi.Registration) => {
    const current = await authApi.register(input);
    setUser(current);
    setStatus("authenticated");
    return current;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the API never answers we sign out locally — otherwise the UI
      // claims you are signed in while no request will go through.
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession requires a SessionProvider above it.");
  }
  return value;
}
