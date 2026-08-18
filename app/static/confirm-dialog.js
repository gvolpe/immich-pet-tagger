import { button, el } from "./dom.js";
import { matchOption, none, some } from "./fp.js";
let pending = none;
function closeDialog(confirmed) {
    el("confirmActionModal").classList.remove("open");
    matchOption(pending, {
        some: confirmation => confirmation.resolve(confirmed),
        none: () => undefined,
    });
    pending = none;
}
export function confirmDialog(options) {
    matchOption(pending, {
        some: confirmation => confirmation.resolve(false),
        none: () => undefined,
    });
    el("confirmActionTitle").textContent = options.title;
    el("confirmActionMessage").textContent = options.message;
    button("confirmActionCancel").textContent = options.cancelLabel || "Cancel";
    button("confirmActionConfirm").textContent = options.confirmLabel;
    el("confirmActionModal").classList.add("open");
    return new Promise(resolve => {
        pending = some({ resolve });
    });
}
export function wireConfirmDialog() {
    button("confirmActionCancel").onclick = () => closeDialog(false);
    button("confirmActionConfirm").onclick = () => closeDialog(true);
    el("confirmActionModal").addEventListener("click", function (event) {
        if (event.target === this)
            closeDialog(false);
    });
}
