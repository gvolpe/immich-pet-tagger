export const none = { tag: "none" };
export function some(value) {
    return { tag: "some", value };
}
export function fromNullable(value) {
    return value == null ? none : some(value);
}
export function fromPredicate(value, predicate) {
    return predicate(value) ? some(value) : none;
}
export function isSome(option) {
    return option.tag === "some";
}
export function isNone(option) {
    return option.tag === "none";
}
export function matchOption(option, cases) {
    return isSome(option) ? cases.some(option.value) : cases.none();
}
export async function matchOptionAsync(option, cases) {
    return isSome(option) ? cases.some(option.value) : cases.none();
}
export function mapOption(option, map) {
    return matchOption(option, {
        some: value => some(map(value)),
        none: () => none,
    });
}
export function flatMapOption(option, map) {
    return matchOption(option, {
        some: map,
        none: () => none,
    });
}
export function unwrapOr(option, fallback) {
    return matchOption(option, {
        some: value => value,
        none: () => fallback,
    });
}
export function ok(value) {
    return { tag: "ok", value };
}
export function err(error) {
    return { tag: "err", error };
}
export function isOk(result) {
    return result.tag === "ok";
}
export function isErr(result) {
    return result.tag === "err";
}
export function matchResult(result, cases) {
    return isOk(result) ? cases.ok(result.value) : cases.err(result.error);
}
export async function matchResultAsync(result, cases) {
    return isOk(result) ? cases.ok(result.value) : cases.err(result.error);
}
export function mapResult(result, map) {
    return isOk(result) ? ok(map(result.value)) : err(result.error);
}
export async function tryCatch(effect, onError) {
    try {
        return ok(await effect());
    }
    catch (error) {
        return err(onError(error));
    }
}
export function tryCatchSync(effect, onError) {
    try {
        return ok(effect());
    }
    catch (error) {
        return err(onError(error));
    }
}
