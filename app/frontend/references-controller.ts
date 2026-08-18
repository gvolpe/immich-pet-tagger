import { clearModalError, el, escapeHtml, input, modalError, parseAssetId, toast } from "./dom.js";
import { confirmDialog } from "./confirm-dialog.js";
import { err, isSome, matchOption, matchOptionAsync, matchResult, matchResultAsync, none, ok, some, type Option, type Result } from "./fp.js";
import { cropSelectionKey, markGridItems, renderPhotoItems } from "./photo-grid.js";
import {
  negativeKeys,
  requireAction,
  resetModes,
  resetSelection,
  type AppContext,
} from "./app-context.js";
import type {
  AddByIdMode,
  AddRefsResponse,
  AssetCropsResponse,
  CropSelection,
  RefAsset,
} from "./types.js";

export interface ReferencesController {
  addCropsToPetRefs(petName: string, newCrops: CropSelection[], loadedRefs: Option<RefAsset[]>): Promise<Result<AddRefsResponse, string>>;
  assignSelected(): Promise<void>;
  clearAllRefs(): Promise<void>;
  closeAddById(): void;
  loadRefs(name: string): Promise<void>;
  openAddById(): void;
  openAddNegById(): void;
  removeRef(assetId: string, cropIdx?: number | null): Promise<void>;
  submitAddById(): Promise<void>;
  viewFindRefs(): void;
  viewBorderline(): Promise<void>;
  viewSuggestions(): Promise<void>;
}

let addByIdMode: AddByIdMode = "ref";

function clearBorderlineTimer(ctx: AppContext): void {
  matchOption(ctx.state.blPollTimer, {
    some: timer => window.clearInterval(timer),
    none: () => undefined,
  });
  ctx.state.blPollTimer = none;
}

function renderRefs(ctx: AppContext, assets: RefAsset[]): void {
  const grid = el("refsGrid");
  if (!assets.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;height:160px;"><div class="empty-sub">No references yet.<br>Click "Find references" to add some.</div></div>';
    return;
  }
  grid.innerHTML = assets.map(asset => {
    const cropArg = asset.crop_idx != null ? asset.crop_idx : "null";
    return `<div class="ref-thumb">
      <a href="${ctx.state.immichUrl}/photos/${asset.id}" target="_blank" rel="noopener" title="Open in Immich">
        <img src="${asset.thumb}" loading="lazy" onerror="this.style.opacity=0.2">
      </a>
      <button class="ref-remove" onclick="removeRef('${asset.id}', ${cropArg})" title="Remove">✕</button>
    </div>`;
  }).join("");
}

function mergeCropRefs(existing: CropSelection[], newCrops: CropSelection[]): CropSelection[] {
  const seen = new Set<string>();
  return [...existing, ...newCrops].filter(crop => {
    const key = cropSelectionKey(crop);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function refsToCrops(refs: RefAsset[]): CropSelection[] {
  return refs.map(ref => ({ asset_id: ref.id, crop_idx: ref.crop_idx, bbox: ref.bbox }));
}

function renderMultiCropPicker(ctx: AppContext, asset: AssetCropsResponse): void {
  closeAddById();
  resetModes(ctx.state);
  el("scanFilterBtns").style.display = "none";
  el("scanPetBtns").style.display = "none";
  resetSelection(ctx.state);
  requireAction(ctx, "updateSelUI")();
  el("resultsLabel").textContent = `${asset.crops?.length ?? 0} pets detected. Select the one to add as reference`;
  el("photoGrid").innerHTML = renderPhotoItems(asset, 0.8, ctx.state.immichUrl).join("");
  markGridItems([asset], ctx.state.refsItems, negativeKeys(ctx.state));
}

function newCropFromAsset(assetId: string, asset: AssetCropsResponse): CropSelection {
  const crops = asset.crops || [];
  return crops.length === 1
    ? { asset_id: assetId, crop_idx: crops[0].crop_idx, bbox: crops[0].bbox }
    : { asset_id: assetId, crop_idx: null, bbox: null };
}

function openAddByIdModal(mode: AddByIdMode): void {
  addByIdMode = mode;
  input("addByIdInput").value = "";
  clearModalError("addByIdError");
  const example = "e.g. a1b2c3d4-11aa-22bb-33cc-4d5e6f7a8b9c";
  if (mode === "neg") {
    el("addByIdTitle").textContent = 'Add "not my pet" by ID or link';
    el("addByIdHint").textContent = `Paste an Immich photo URL or just the asset ID (${example}). It will be added directly to "not my pet".`;
  } else {
    el("addByIdTitle").textContent = "Add reference by ID or link";
    el("addByIdHint").textContent = `Paste an Immich photo URL or just the asset ID (${example}). If one animal is detected it is added immediately; multiple crops let you pick the right one.`;
  }
  el("addByIdModal").classList.add("open");
  window.setTimeout(() => el("addByIdInput").focus(), 100);
}

function closeAddById(): void {
  el("addByIdModal").classList.remove("open");
  clearModalError("addByIdError");
}

async function validateAndAddNegative(ctx: AppContext, assetId: string): Promise<void> {
  const validation = await ctx.services.refs.assetCrops(assetId);
  await matchResultAsync(validation, {
    err: message => {
      modalError("addByIdError", message);
      return Promise.resolve();
    },
    ok: async () => {
      const result = await ctx.services.negatives.add([assetId]);
      await matchResultAsync(result, {
        ok: async () => {
          closeAddById();
          await requireAction(ctx, "loadNegatives")();
          toast('Added to "not my pet"', "success");
        },
        err: message => modalError("addByIdError", message),
      });
    },
  });
}

async function addSingleAssetRef(ctx: AppContext, petName: string, assetId: string, asset: AssetCropsResponse): Promise<void> {
  const existing = refsToCrops(ctx.state.refsItems);
  const alreadyPresent = existing.some(ref => ref.asset_id === assetId);
  const merged = alreadyPresent ? existing : [...existing, newCropFromAsset(assetId, asset)];
  const result = await ctx.services.refs.save(petName, merged);
  await matchResultAsync(result, {
    ok: async () => {
      closeAddById();
      await requireAction(ctx, "loadRefs")(petName);
      await requireAction(ctx, "refreshState")();
      toast(`Added to ${petName}`, "success");
    },
    err: message => modalError("addByIdError", message),
  });
}

export function createReferencesController(ctx: AppContext): ReferencesController {
  const loadRefs = async (name: string): Promise<void> => {
    const grid = el("refsGrid");
    grid.innerHTML = '<div class="loading">Loading...</div>';
    const result = await ctx.services.refs.list(name);
    matchResult(result, {
      ok: data => {
        ctx.state.refsItems = data.assets;
        renderRefs(ctx, data.assets);
      },
      err: () => {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-sub">Error loading refs</div></div>';
      },
    });
  };

  const addCropsToPetRefs = async (
    petName: string,
    newCrops: CropSelection[],
    loadedRefs: Option<RefAsset[]> = none,
  ): Promise<Result<AddRefsResponse, string>> => {
    const existingRefs: Result<CropSelection[], string> = await matchOptionAsync(loadedRefs, {
      some: refs => ok<CropSelection[], string>(refsToCrops(refs)),
      none: async () => {
        const result = await ctx.services.refs.list(petName);
        return matchResult(result, {
          ok: data => ok<CropSelection[], string>(refsToCrops(data.assets)),
          err: message => err<string, CropSelection[]>(message),
        });
      },
    });

    return matchResult(existingRefs, {
      ok: existing => ctx.services.refs.save(petName, mergeCropRefs(existing, newCrops)),
      err: message => Promise.resolve(err<string, AddRefsResponse>(message)),
    });
  };

  const removeRef = async (assetId: string, cropIdx: number | null = null): Promise<void> => {
    await matchOptionAsync(ctx.state.activePet, {
      none: () => Promise.resolve(),
      some: async pet => {
        const result = await ctx.services.refs.remove(pet.name, assetId, cropIdx);
        await matchResultAsync(result, {
          ok: async () => {
            ctx.state.refsItems = ctx.state.refsItems.filter(ref => {
              if (ref.id !== assetId) return true;
              if (cropIdx != null) return ref.crop_idx !== cropIdx;
              return false;
            });
            const grid = el("refsGrid");
            const scrollTop = grid.scrollTop;
            renderRefs(ctx, ctx.state.refsItems);
            grid.scrollTop = scrollTop;
            await requireAction(ctx, "refreshState")();
            toast("Removed");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  const assignSelected = async (): Promise<void> => {
    if (!ctx.state.selectedCrops.size) return;
    await matchOptionAsync(ctx.state.activePet, {
      none: () => Promise.resolve(),
      some: async pet => {
        const newCrops = [...ctx.state.selectedCrops.values()];
        const result = await addCropsToPetRefs(pet.name, newCrops, some(ctx.state.refsItems));
        await matchResultAsync(result, {
          ok: async () => {
            resetSelection(ctx.state);
            requireAction(ctx, "updateSelUI")();
            document.querySelectorAll(".photo-thumb.selected").forEach(node => {
              node.classList.remove("selected");
              node.classList.add("is-ref");
            });
            await loadRefs(pet.name);
            await requireAction(ctx, "refreshState")();
            toast(`Added to ${pet.name}`, "success");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  const viewSuggestions = async (): Promise<void> => {
    await matchOptionAsync(ctx.state.activePet, {
      none: () => Promise.resolve(),
      some: async pet => {
        if (!pet.description) {
          toast("Edit this pet and add a description to use this feature", "error");
          return;
        }
        resetModes(ctx.state);
        el("scanPetBtns").style.display = "none";
        el("scanFilterBtns").style.display = "none";
        resetSelection(ctx.state);
        requireAction(ctx, "updateSelUI")();
        const grid = el("photoGrid");
        const label = el("resultsLabel");
        grid.innerHTML = '<div class="loading" style="grid-column:1/-1">Finding similar photos... this may take a moment</div>';
        label.textContent = "Finding references...";
        const result = await ctx.services.suggestions.refs(pet.name);
        matchResult(result, {
          ok: data => {
            label.textContent = `${data.assets.length} photo${data.assets.length !== 1 ? "s" : ""} similar to ${pet.name}'s refs`;
            if (!data.assets.length) {
              grid.innerHTML = '<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-icon">🐾</div><div class="empty-title">No suggestions found</div><div class="empty-sub">Add more refs or broaden the date range</div></div>';
              return;
            }
            grid.innerHTML = data.assets.flatMap(asset => renderPhotoItems(asset, 0.8, ctx.state.immichUrl)).join("");
            markGridItems(data.assets, ctx.state.refsItems, negativeKeys(ctx.state));
          },
          err: message => {
            label.textContent = "Failed to load suggestions";
            grid.innerHTML = `<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-sub">${escapeHtml(message)}</div></div>`;
            toast("Suggestions error: " + message, "error");
          },
        });
      },
    });
  };

  const viewBorderline = async (): Promise<void> => {
    await matchOptionAsync(ctx.state.activePet, {
      none: () => Promise.resolve(),
      some: async pet => {
        if (!pet.ref_count) return;
        const myGen = ctx.state.blGeneration + 1;
        ctx.state.blGeneration = myGen;
        clearBorderlineTimer(ctx);
        resetModes(ctx.state);
        el("scanPetBtns").style.display = "none";
        resetSelection(ctx.state);
        requireAction(ctx, "updateSelUI")();
        const grid = el("photoGrid");
        const label = el("resultsLabel");
        grid.innerHTML = '<div class="loading" id="blLoadMsg" style="grid-column:1/-1">Loading...</div>';
        label.textContent = "Finding references...";

        ctx.state.blPollTimer = some(window.setInterval(async () => {
          if (ctx.state.blGeneration !== myGen) {
            clearBorderlineTimer(ctx);
            return;
          }
          const progress = await ctx.services.suggestions.borderlineProgress(pet.name);
          matchResult(progress, {
            ok: value => {
              const loadMsg = el("blLoadMsg");
              if ((value.total ?? 0) > 0) {
                loadMsg.textContent = `Loading ${Math.round((value.current ?? 0) / (value.total ?? 1) * 100)}%...`;
              } else if (value.running) {
                loadMsg.textContent = "Loading...";
              }
            },
            err: () => undefined,
          });
        }, 1000));

        const result = await ctx.services.suggestions.borderline(pet.name);
        clearBorderlineTimer(ctx);
        if (ctx.state.blGeneration !== myGen) return;
        matchResult(result, {
          ok: data => {
            label.textContent = `${data.assets.length} photo${data.assets.length !== 1 ? "s" : ""} ${pet.name} might be missing. Add good ones as refs to improve accuracy.`;
            if (!data.assets.length) {
              grid.innerHTML = '<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-icon">🐾</div><div class="empty-title">No missed photos found</div><div class="empty-sub">The classifier is either very confident or not finding this pet at all</div></div>';
              return;
            }
            const threshold = data.threshold ?? 0.8;
            grid.innerHTML = data.assets.flatMap(asset => renderPhotoItems(asset, threshold, ctx.state.immichUrl)).join("");
            markGridItems(data.assets, ctx.state.refsItems, negativeKeys(ctx.state));
          },
          err: message => {
            label.textContent = "Failed to load missed photos";
            grid.innerHTML = `<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-sub">${escapeHtml(message)}</div></div>`;
            toast("Error: " + message, "error");
          },
        });
      },
    });
  };

  const viewFindRefs = (): void => {
    matchOption(ctx.state.activePet, {
      none: () => undefined,
      some: pet => { void (pet.ref_count > 0 ? viewBorderline() : viewSuggestions()); },
    });
  };

  const openAddById = (): void => {
    if (isSome(ctx.state.activePet)) openAddByIdModal("ref");
  };

  const openAddNegById = (): void => openAddByIdModal("neg");

  const submitAddById = async (): Promise<void> => {
    clearModalError("addByIdError");
    await matchOptionAsync(parseAssetId(input("addByIdInput").value), {
      none: () => {
        modalError("addByIdError", "Could not find an asset ID. Paste an Immich photo link or the bare ID.");
        return Promise.resolve();
      },
      some: async assetId => {
        if (addByIdMode === "neg") {
          await validateAndAddNegative(ctx, assetId);
          return;
        }

        await matchOptionAsync(ctx.state.activePet, {
          none: () => Promise.resolve(),
          some: async pet => {
            const result = await ctx.services.refs.assetCrops(assetId);
            await matchResultAsync(result, {
              err: message => {
                modalError("addByIdError", message);
                return Promise.resolve();
              },
              ok: async asset => {
                const crops = asset.crops || [];
                if (crops.length <= 1) {
                  await addSingleAssetRef(ctx, pet.name, assetId, asset);
                  return;
                }
                renderMultiCropPicker(ctx, asset);
              },
            });
          },
        });
      },
    });
  };

  const clearAllRefs = async (): Promise<void> => {
    await matchOptionAsync(ctx.state.activePet, {
      none: () => Promise.resolve(),
      some: async pet => {
        const confirmed = await confirmDialog({
          title: "Clear all references?",
          message: `Remove all reference photos for ${pet.name} from Pet Tagger? This will not affect Immich.`,
          confirmLabel: "Clear references",
        });
        if (!confirmed) return;
        const result = await ctx.services.refs.clear(pet.name);
        await matchResultAsync(result, {
          ok: async () => {
            ctx.state.refsItems = [];
            await loadRefs(pet.name);
            await requireAction(ctx, "refreshState")();
            toast("All refs cleared", "success");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  return {
    addCropsToPetRefs,
    assignSelected,
    clearAllRefs,
    closeAddById,
    loadRefs,
    openAddById,
    openAddNegById,
    removeRef,
    submitAddById,
    viewFindRefs,
    viewBorderline,
    viewSuggestions,
  };
}
