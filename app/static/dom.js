import { fromNullable, matchOption, some } from "./fp.js";
export function el(id) {
    return matchOption(maybeEl(id), {
        some: node => node,
        none: () => { throw new Error(`Missing DOM element #${id}`); },
    });
}
export function maybeEl(id) {
    return fromNullable(document.getElementById(id));
}
export function input(id) {
    return el(id);
}
export function button(id) {
    return el(id);
}
export function toast(message, type = "") {
    const toastEl = el("toast");
    toastEl.textContent = message;
    toastEl.className = "toast show" + (type ? ` ${type}` : "");
    window.clearTimeout(toastEl.hideTimer);
    toastEl.hideTimer = window.setTimeout(() => {
        toastEl.className = "toast";
    }, 4000);
}
export function initials(name) {
    return name.slice(0, 2).toUpperCase();
}
export function escapeHtml(value) {
    const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    };
    return String(value).replace(/[&<>"']/g, char => entities[char] ?? char);
}
export function modalError(id, message) {
    el(id).textContent = message;
}
export function clearModalError(id) {
    el(id).textContent = "";
}
export function parseAssetId(value) {
    const text = value.trim();
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    const afterPhotos = text.match(new RegExp(`photos/(${uuid})`, "i"));
    if (afterPhotos?.[1])
        return some(afterPhotos[1]);
    return fromNullable(text.match(new RegExp(uuid, "i"))?.[0] ?? null);
}
export function fmtDate(iso) {
    return matchOption(fromNullable(iso), {
        some: value => {
            const [year, month, day] = value.slice(0, 10).split("-");
            return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
        },
        none: () => "",
    });
}
