import { apiFetch } from "./client";
import type { User } from "./types";

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  displayName: string;
}

export function login(credentials: Credentials): Promise<User> {
  return apiFetch<User>("/api/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export function register(input: Registration): Promise<User> {
  return apiFetch<User>("/api/auth/register", { method: "POST", body: input });
}

export function logout(): Promise<{ ok: true }> {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

/** Ends sessions on every device — bumps `token_version`. */
export function logoutEverywhere(): Promise<{ ok: true }> {
  return apiFetch("/api/auth/logout-all", { method: "POST" });
}

export function currentUser(): Promise<User> {
  return apiFetch<User>("/api/auth/me");
}
