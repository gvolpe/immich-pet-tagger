export type Option<T> =
  | { readonly tag: "some"; readonly value: T }
  | { readonly tag: "none" };

export const none: Option<never> = { tag: "none" };

export function some<T>(value: T): Option<T> {
  return { tag: "some", value };
}

export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value == null ? none : some(value);
}

export function fromPredicate<T>(value: T, predicate: (value: T) => boolean): Option<T> {
  return predicate(value) ? some(value) : none;
}

export function isSome<T>(option: Option<T>): option is { readonly tag: "some"; readonly value: T } {
  return option.tag === "some";
}

export function isNone<T>(option: Option<T>): option is { readonly tag: "none" } {
  return option.tag === "none";
}

export function matchOption<T, R>(
  option: Option<T>,
  cases: { readonly some: (value: T) => R; readonly none: () => R },
): R {
  return isSome(option) ? cases.some(option.value) : cases.none();
}

export async function matchOptionAsync<T, R>(
  option: Option<T>,
  cases: { readonly some: (value: T) => R | Promise<R>; readonly none: () => R | Promise<R> },
): Promise<R> {
  return isSome(option) ? cases.some(option.value) : cases.none();
}

export function mapOption<T, U>(option: Option<T>, map: (value: T) => U): Option<U> {
  return matchOption(option, {
    some: value => some(map(value)),
    none: () => none,
  });
}

export function flatMapOption<T, U>(option: Option<T>, map: (value: T) => Option<U>): Option<U> {
  return matchOption(option, {
    some: map,
    none: () => none,
  });
}

export function unwrapOr<T>(option: Option<T>, fallback: T): T {
  return matchOption(option, {
    some: value => value,
    none: () => fallback,
  });
}

export type Result<T, E = string> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "err"; readonly error: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { tag: "ok", value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { tag: "err", error };
}

export function isOk<T, E>(result: Result<T, E>): result is { readonly tag: "ok"; readonly value: T } {
  return result.tag === "ok";
}

export function isErr<T, E>(result: Result<T, E>): result is { readonly tag: "err"; readonly error: E } {
  return result.tag === "err";
}

export function matchResult<T, E, R>(
  result: Result<T, E>,
  cases: { readonly ok: (value: T) => R; readonly err: (error: E) => R },
): R {
  return isOk(result) ? cases.ok(result.value) : cases.err(result.error);
}

export async function matchResultAsync<T, E, R>(
  result: Result<T, E>,
  cases: { readonly ok: (value: T) => R | Promise<R>; readonly err: (error: E) => R | Promise<R> },
): Promise<R> {
  return isOk(result) ? cases.ok(result.value) : cases.err(result.error);
}

export function mapResult<T, E, U>(result: Result<T, E>, map: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok<U, E>(map(result.value)) : err<E, U>(result.error);
}

export async function tryCatch<T>(
  effect: () => Promise<T>,
  onError: (error: unknown) => string,
): Promise<Result<T, string>> {
  try {
    return ok(await effect());
  } catch (error) {
    return err(onError(error));
  }
}

export function tryCatchSync<T>(
  effect: () => T,
  onError: (error: unknown) => string,
): Result<T, string> {
  try {
    return ok(effect());
  } catch (error) {
    return err(onError(error));
  }
}
