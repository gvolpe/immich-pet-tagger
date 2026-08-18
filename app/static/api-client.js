import { err, matchResult, ok, tryCatch, tryCatchSync } from "./fp.js";
function parseJson(text) {
    if (!text)
        return ok(undefined);
    return tryCatchSync(() => JSON.parse(text), error => `Invalid JSON response: ${errorMessage(error)}`);
}
async function readText(response) {
    return tryCatch(() => response.text(), () => response.statusText || "Request failed");
}
async function readJson(response) {
    const text = await readText(response);
    return matchResult(text, {
        ok: (parseJson),
        err: error => err(error),
    });
}
async function readApiError(response) {
    const text = await readText(response);
    return matchResult(text, {
        ok: message => err(apiDetailMessage(message, response.statusText || "Request failed")),
        err: message => err(message),
    });
}
export async function apiResult(path, opts = {}) {
    const { body, ...init } = opts;
    const response = await tryCatch(() => fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...init,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }), errorMessage);
    return matchResult(response, {
        ok: value => value.ok ? readJson(value) : readApiError(value),
        err: message => Promise.resolve(err(message)),
    });
}
export function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    return "Unexpected error";
}
export function apiDetailMessage(error, fallback = "Request failed") {
    const message = errorMessage(error) || fallback;
    const parsed = tryCatchSync(() => JSON.parse(message), () => message);
    return matchResult(parsed, {
        ok: value => typeof value.detail === "string" && value.detail ? value.detail : message,
        err: value => value,
    });
}
