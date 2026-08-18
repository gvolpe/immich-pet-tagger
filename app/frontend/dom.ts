import type { ToastKind } from "./types.js";
import { fromNullable, matchOption, some, type Option } from "./fp.js";

type ToastElement = HTMLElement & { hideTimer?: number };

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return matchOption(maybeEl<T>(id), {
    some: node => node,
    none: () => { throw new Error(`Missing DOM element #${id}`); },
  });
}

export function maybeEl<T extends HTMLElement = HTMLElement>(id: string): Option<T> {
  return fromNullable(document.getElementById(id) as T | null);
}

export function input(id: string): HTMLInputElement {
  return el<HTMLInputElement>(id);
}

export function button(id: string): HTMLButtonElement {
  return el<HTMLButtonElement>(id);
}

export function toast(message: string, type: ToastKind = ""): void {
  const toastEl = el<ToastElement>("toast");
  toastEl.textContent = message;
  toastEl.className = "toast show" + (type ? ` ${type}` : "");
  window.clearTimeout(toastEl.hideTimer);
  toastEl.hideTimer = window.setTimeout(() => {
    toastEl.className = "toast";
  }, 4000);
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, char => entities[char] ?? char);
}

export function modalError(id: string, message: string): void {
  el(id).textContent = message;
}

export function clearModalError(id: string): void {
  el(id).textContent = "";
}

export function parseAssetId(value: string): Option<string> {
  const text = value.trim();
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const afterPhotos = text.match(new RegExp(`photos/(${uuid})`, "i"));
  if (afterPhotos?.[1]) return some(afterPhotos[1]);
  return fromNullable(text.match(new RegExp(uuid, "i"))?.[0] ?? null);
}

export function fmtDate(iso?: string | null): string {
  return matchOption(fromNullable(iso), {
    some: value => {
      const [year, month, day] = value.slice(0, 10).split("-");
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
    },
    none: () => "",
  });
}
