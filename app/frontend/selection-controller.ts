import { button, el, maybeEl, toast } from "./dom.js";
import { isSome, matchOption, matchResult, none, some } from "./fp.js";
import { readCropData } from "./photo-grid.js";
import {
  isScanReviewBusy,
  requireAction,
  type AppContext,
} from "./app-context.js";

export interface SelectionController {
  toggleSelect(event: MouseEvent, key: string): void;
  updateSelUI(): void;
}

function isLockedThumb(thumb: HTMLElement): boolean {
  return thumb.classList.contains("is-ref") ||
    thumb.classList.contains("is-neg") ||
    thumb.classList.contains("is-tagged");
}

function selectThumb(ctx: AppContext, key: string, thumb: HTMLElement): void {
  matchResult(readCropData(thumb), {
    ok: crop => {
      ctx.state.selectedCrops.set(key, crop);
      thumb.classList.add("selected");
    },
    err: message => toast(message, "error"),
  });
}

function toggleSingleThumb(ctx: AppContext, key: string, thumb: HTMLElement): void {
  if (ctx.state.selectedCrops.has(key)) {
    ctx.state.selectedCrops.delete(key);
    thumb.classList.remove("selected");
  } else {
    selectThumb(ctx, key, thumb);
  }
  ctx.state.lastClickedKey = some(key);
}

function selectThumbRange(ctx: AppContext, fromKey: string, toKey: string, toThumb: HTMLElement): void {
  const thumbs = [...document.querySelectorAll<HTMLElement>("#photoGrid .photo-thumb")];
  matchOption(maybeEl<HTMLElement>("th-" + fromKey), {
    none: () => toggleSingleThumb(ctx, toKey, toThumb),
    some: fromThumb => {
      const fromIdx = thumbs.indexOf(fromThumb);
      const toIdx = thumbs.indexOf(toThumb);
      if (fromIdx === -1 || toIdx === -1) {
        toggleSingleThumb(ctx, toKey, toThumb);
        return;
      }

      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      for (let i = lo; i <= hi; i += 1) {
        const thumb = thumbs[i];
        if (isLockedThumb(thumb)) continue;
        const key = thumb.id.slice(3);
        if (!ctx.state.selectedCrops.has(key)) selectThumb(ctx, key, thumb);
      }
    },
  });
}

export function createSelectionController(ctx: AppContext): SelectionController {
  const toggleSelect = (event: MouseEvent, key: string): void => {
    const thumb = el("th-" + key);
    if (ctx.state.scanReviewMode && isScanReviewBusy(ctx.state)) return;
    if (isLockedThumb(thumb)) return;

    if (event.shiftKey && isSome(ctx.state.lastClickedKey) && ctx.state.lastClickedKey.value !== key) {
      selectThumbRange(ctx, ctx.state.lastClickedKey.value, key, thumb);
    } else {
      toggleSingleThumb(ctx, key, thumb);
    }
    updateSelUI();
  };

  const updateSelUI = (): void => {
    const selectedCount = ctx.state.selectedCrops.size;
    const scanBusy = ctx.state.scanReviewMode && isScanReviewBusy(ctx.state);
    el("selCount").textContent = selectedCount ? `${selectedCount} selected` : "";
    el("assignBtn").style.display = selectedCount &&
      isSome(ctx.state.activePet) &&
      !ctx.state.negCandidateMode &&
      !ctx.state.scanReviewMode &&
      !ctx.state.scanLowConfMode
      ? ""
      : "none";
    el("skipBtn").style.display = selectedCount ? "" : "none";
    button("skipBtn").disabled = scanBusy;
    el("addNegBtn").style.display = selectedCount ? "" : "none";
    button("addNegBtn").disabled = scanBusy;
    el("scanPetBtns").style.display = selectedCount && ctx.state.scanReviewMode ? "flex" : "none";
    if (ctx.state.scanReviewMode) {
      requireAction(ctx, "renderScanReviewPetBtns")();
      requireAction(ctx, "updateScanReviewSelectAllBtn")();
    }
  };

  return { toggleSelect, updateSelUI };
}

export function clearGridSelection(ctx: AppContext): void {
  ctx.state.selectedCrops.clear();
  ctx.state.lastClickedKey = none;
}
