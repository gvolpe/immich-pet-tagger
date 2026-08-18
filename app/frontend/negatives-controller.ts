import { el, escapeHtml, toast } from "./dom.js";
import { confirmDialog } from "./confirm-dialog.js";
import { matchOption, matchResult, matchResultAsync, none, some, type Result } from "./fp.js";
import type { ApplyReviewResponse } from "./types.js";
import { cropSelectionKey, renderPhotoItems } from "./photo-grid.js";
import {
  negativeKeys,
  requireAction,
  resetModes,
  resetSelection,
  type AppContext,
} from "./app-context.js";

export interface NegativesController {
  addSelectedAsNegatives(): Promise<void>;
  clearAllNegatives(): Promise<void>;
  loadNegatives(): Promise<void>;
  removeNegative(id: string): Promise<void>;
  skipSelected(): Promise<void>;
  updateNegStatus(): void;
  viewNegCandidates(): Promise<void>;
}

function clearNegTimer(ctx: AppContext): void {
  matchOption(ctx.state.negPollTimer, {
    some: timer => window.clearInterval(timer),
    none: () => undefined,
  });
  ctx.state.negPollTimer = none;
}

export function createNegativesController(ctx: AppContext): NegativesController {
  const updateNegStatus = (): void => {
    const count = el("negCount");
    count.textContent = String(ctx.state.negatives.count || ctx.state.negatives.assets.length);
    count.style.color = "";
  };

  const loadNegatives = async (): Promise<void> => {
    const result = await ctx.services.negatives.list();
    matchResult(result, {
      ok: data => {
        ctx.state.negatives = data;
        updateNegStatus();
        el("clearNegsBtn").style.display = data.assets.length ? "" : "none";
        const grid = el("negGrid");
        if (!data.assets.length) {
          grid.innerHTML = "";
          return;
        }
        grid.innerHTML = data.assets.map(asset => `
          <div class="ref-thumb">
            <a href="${ctx.state.immichUrl}/photos/${asset.id}" target="_blank" rel="noopener" title="Open in Immich">
              <img src="${asset.thumb}" loading="lazy" onerror="this.style.opacity=0.2">
            </a>
            <button class="ref-remove" onclick="removeNegative('${asset.id}')" title="Remove">✕</button>
          </div>`).join("");
      },
      err: message => console.warn("loadNegatives:", message),
    });
  };

  const skipSelected = async (): Promise<void> => {
    if (!ctx.state.selectedCrops.size) return;
    const selected = [...ctx.state.selectedCrops.values()];
    const keys = new Set(selected.map(cropSelectionKey));
    const ids = [...new Set(selected.map(crop => crop.asset_id))];
    const result = await ctx.services.scan.skip(ids);
    await matchResultAsync(result, {
      ok: async () => {
        if (ctx.state.scanReviewMode) {
          requireAction(ctx, "removeSelectedScanReviewItems")(keys);
          toast(`Ignored ${ids.length} photo${ids.length !== 1 ? "s" : ""}.`, "success");
          return;
        }
        ids.forEach(id => document.querySelectorAll(`[data-asset-id="${id}"]`).forEach(node => node.remove()));
        resetSelection(ctx.state);
        requireAction(ctx, "updateSelUI")();
        toast(`Ignored ${ids.length} photo${ids.length !== 1 ? "s" : ""}. Won't appear again.`, "success");
      },
      err: message => toast("Error: " + message, "error"),
    });
  };

  const addSelectedAsNegatives = async (): Promise<void> => {
    if (!ctx.state.selectedCrops.size) return;
    const selected = [...ctx.state.selectedCrops.values()];
    const keys = new Set(selected.map(cropSelectionKey));
    const assetIds = [...new Set(selected.map(crop => crop.asset_id))];
    const result: Result<ApplyReviewResponse | { ok: boolean; count: number }, string> = ctx.state.scanReviewMode
      ? await ctx.services.scan.applyReview({ assets: selected, reject: true })
      : await ctx.services.negatives.add(assetIds);

    await matchResultAsync(result, {
      ok: async () => {
        if (ctx.state.scanReviewMode) {
          await loadNegatives();
          requireAction(ctx, "removeSelectedScanReviewItems")(keys);
          toast('Added to "not my pet"', "success");
          return;
        }
        ctx.state.selectedCrops.forEach((_, key) => {
          const thumb = document.getElementById("th-" + key);
          thumb?.classList.remove("selected");
          thumb?.classList.add("is-neg");
        });
        resetSelection(ctx.state);
        requireAction(ctx, "updateSelUI")();
        await loadNegatives();
        toast('Added to "not my pet"', "success");
      },
      err: message => toast("Error: " + message, "error"),
    });
  };

  const viewNegCandidates = async (): Promise<void> => {
    const myGen = ctx.state.negGeneration + 1;
    ctx.state.negGeneration = myGen;
    clearNegTimer(ctx);
    resetModes(ctx.state);
    ctx.state.negCandidateMode = true;
    el("scanPetBtns").style.display = "none";
    resetSelection(ctx.state);
    requireAction(ctx, "updateSelUI")();
    const grid = el("photoGrid");
    const label = el("resultsLabel");
    grid.innerHTML = '<div class="loading" id="negLoadMsg" style="grid-column:1/-1">Loading...</div>';
    label.textContent = "Finding candidates...";

    ctx.state.negPollTimer = some(window.setInterval(async () => {
      if (ctx.state.negGeneration !== myGen) {
        clearNegTimer(ctx);
        return;
      }
      const progress = await ctx.services.suggestions.negativesProgress();
      matchResult(progress, {
        ok: value => {
          const loadMsg = el("negLoadMsg");
          if ((value.total ?? 0) > 0) {
            loadMsg.textContent = `Loading ${Math.round((value.current ?? 0) / (value.total ?? 1) * 100)}%...`;
          } else if (value.running) {
            loadMsg.textContent = "Loading...";
          }
        },
        err: () => undefined,
      });
    }, 1000));

    const result = await ctx.services.suggestions.negatives();
    clearNegTimer(ctx);
    if (ctx.state.negGeneration !== myGen) return;
    matchResult(result, {
      ok: data => {
        updateNegStatus();
        label.textContent = `${data.assets.length} candidate${data.assets.length !== 1 ? "s" : ""} for "not my pet"`;
        if (!data.assets.length) {
          grid.innerHTML = '<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-icon">🐾</div><div class="empty-title">No candidates found</div><div class="empty-sub">Classifier is well calibrated</div></div>';
          return;
        }
        const threshold = data.threshold || 0.8;
        grid.innerHTML = data.assets.flatMap(asset => renderPhotoItems(asset, threshold, ctx.state.immichUrl)).join("");
        const negSet = new Set(negativeKeys(ctx.state));
        data.assets.forEach(asset => {
          if (negSet.has(asset.id)) document.getElementById("th-" + asset.id)?.classList.add("is-neg");
        });
      },
      err: message => {
        label.textContent = "Failed to load candidates";
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-sub">${escapeHtml(message)}</div></div>`;
        toast("Error: " + message, "error");
      },
    });
  };

  const clearAllNegatives = async (): Promise<void> => {
    const confirmed = await confirmDialog({
      title: 'Clear all "not my pet" samples?',
      message: 'Remove all "not my pet" samples from Pet Tagger? This will not affect Immich.',
      confirmLabel: "Clear samples",
    });
    if (!confirmed) return;
    const result = await ctx.services.negatives.clear();
    await matchResultAsync(result, {
      ok: async () => {
        ctx.state.negatives = { assets: [], count: 0 };
        await loadNegatives();
        toast('All "not my pet" samples cleared', "success");
      },
      err: message => toast("Error: " + message, "error"),
    });
  };

  const removeNegative = async (id: string): Promise<void> => {
    const result = await ctx.services.negatives.remove(id);
    await matchResultAsync(result, {
      ok: async () => {
        ctx.state.negatives = {
          count: Math.max(0, ctx.state.negatives.count - 1),
          assets: ctx.state.negatives.assets.filter(asset => asset.id !== id && asset.key !== id),
        };
        await loadNegatives();
        document.getElementById("th-" + id)?.classList.remove("is-neg");
        toast('Removed from "not my pet"');
      },
      err: message => toast("Error: " + message, "error"),
    });
  };

  return {
    addSelectedAsNegatives,
    clearAllNegatives,
    loadNegatives,
    removeNegative,
    skipSelected,
    updateNegStatus,
    viewNegCandidates,
  };
}
