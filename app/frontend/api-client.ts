import type { ApiOptions } from "./types.js";
import { err, matchResult, ok, tryCatch, tryCatchSync, type Result } from "./fp.js";

export type ApiResult<T> = Promise<Result<T, string>>;

function parseJson<T>(text: string): Result<T, string> {
  if (!text) return ok(undefined as T);
  return tryCatchSync(
    () => JSON.parse(text) as T,
    error => `Invalid JSON response: ${errorMessage(error)}`,
  );
}

async function readText(response: Response): Promise<Result<string, string>> {
  return tryCatch(
    () => response.text(),
    () => response.statusText || "Request failed",
  );
}

async function readJson<T>(response: Response): Promise<Result<T, string>> {
  const text = await readText(response);
  return matchResult(text, {
    ok: parseJson<T>,
    err: error => err(error),
  });
}

async function readApiError(response: Response): Promise<Result<never, string>> {
  const text = await readText(response);
  return matchResult(text, {
    ok: message => err(apiDetailMessage(message, response.statusText || "Request failed")),
    err: message => err(message),
  });
}

export async function apiResult<T>(path: string, opts: ApiOptions = {}): ApiResult<T> {
  const { body, ...init } = opts;
  const response = await tryCatch(
    () => fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    errorMessage,
  );

  return matchResult(response, {
    ok: value => value.ok ? readJson<T>(value) : readApiError(value),
    err: message => Promise.resolve(err(message)),
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}

export function apiDetailMessage(error: unknown, fallback = "Request failed"): string {
  const message = errorMessage(error) || fallback;
  const parsed = tryCatchSync(
    () => JSON.parse(message) as { detail?: unknown },
    () => message,
  );
  return matchResult(parsed, {
    ok: value => typeof value.detail === "string" && value.detail ? value.detail : message,
    err: value => value,
  });
}
