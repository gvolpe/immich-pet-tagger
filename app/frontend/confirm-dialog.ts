import { button, el } from "./dom.js";
import { matchOption, none, some, type Option } from "./fp.js";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}

interface PendingConfirmation {
  resolve(confirmed: boolean): void;
}

let pending: Option<PendingConfirmation> = none;

function closeDialog(confirmed: boolean): void {
  el("confirmActionModal").classList.remove("open");
  matchOption(pending, {
    some: confirmation => confirmation.resolve(confirmed),
    none: () => undefined,
  });
  pending = none;
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  matchOption(pending, {
    some: confirmation => confirmation.resolve(false),
    none: () => undefined,
  });

  el("confirmActionTitle").textContent = options.title;
  el("confirmActionMessage").textContent = options.message;
  button("confirmActionCancel").textContent = options.cancelLabel || "Cancel";
  button("confirmActionConfirm").textContent = options.confirmLabel;
  el("confirmActionModal").classList.add("open");

  return new Promise<boolean>(resolve => {
    pending = some({ resolve });
  });
}

export function wireConfirmDialog(): void {
  button("confirmActionCancel").onclick = () => closeDialog(false);
  button("confirmActionConfirm").onclick = () => closeDialog(true);
  el("confirmActionModal").addEventListener("click", function(event) {
    if (event.target === this) closeDialog(false);
  });
}
