/**
 * HTTP client for the API.
 *
 * The browser talks to Fastify directly rather than through Next rewrites.
 * The reason: rewrites buffer responses, and SSE ("test 7/20") has to arrive
 * immediately. The consequence is that the session rides in a cross-port
 * cookie, hence `credentials: "include"` on every request.
 *
 * Server components may only use this for public data — the cookie never
 * reaches them.
 */

/** Port Fastify listens on. Matches the API's default `PORT`. */
const DEFAULT_API_PORT = 3001;

/**
 * With no explicit configuration we stay on the host the page came from.
 *
 * This is not cosmetic: the session cookie is `SameSite=Lax`, and `localhost`
 * and `127.0.0.1` are **different sites** to a browser. A hard-coded
 * `127.0.0.1` with the page served from `localhost` would mean the cookie is
 * never sent and every request ends in a 401.
 */
function defaultApiUrl(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEFAULT_API_PORT}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl();

/** Field errors from zod on the backend: { email: ["..."], password: [...] }. */
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** First message for a given form field. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  401: "Sign in to continue.",
  403: "You do not have access to this.",
  404: "Not found.",
  429: "Too many attempts. Wait a moment.",
  500: "The server returned an error.",
  502: "The API is not responding.",
  503: "The API is not responding.",
};

interface ErrorBody {
  error?: string | { fieldErrors?: FieldErrors; formErrors?: string[] };
}

function readError(status: number, body: unknown): ApiError {
  const payload = (body ?? {}) as ErrorBody;

  if (typeof payload.error === "string") {
    return new ApiError(status, payload.error);
  }

  if (payload.error && typeof payload.error === "object") {
    const { fieldErrors = {}, formErrors = [] } = payload.error;
    const message =
      formErrors[0] ??
      Object.values(fieldErrors)[0]?.[0] ??
      STATUS_MESSAGES[status] ??
      "The request failed.";
    return new ApiError(status, message, fieldErrors);
  }

  return new ApiError(status, STATUS_MESSAGES[status] ?? "The request failed.");
}

export interface ApiRequest extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequest = {},
): Promise<T> {
  const { body, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The distinction matters: "the API is not responding" points at the
    // organiser, a 4xx points at your own request.
    throw new ApiError(0, "No connection to the server.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? safeJson(text) : null;

  if (!response.ok) throw readError(response.status, parsed);

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** SSE endpoint address. EventSource takes no headers — the cookie suffices. */
export function eventSourceUrl(path: string): string {
  return `${API_URL}${path}`;
}
