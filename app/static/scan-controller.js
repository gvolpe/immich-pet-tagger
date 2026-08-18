import { button, el, escapeHtml, input, toast } from "./dom.js";
import { isSome, matchOption, matchResult, matchResultAsync, none, some } from "./fp.js";
import { cropSelectionKey, readCropData, renderPhotoItems, scanReviewAssetKey } from "./photo-grid.js";
import { activePetName, isScanReviewBusy, negativeKeys, requireAction, resetSelection, } from "./app-context.js";
function scanReviewBusyCopy(ctx) {
    const count = ctx.state.scanReviewBusyCount || ctx.state.selectedCrops.size;
    const photoText = count === 1 ? "1 selected photo" : `${count} selected photos`;
    return matchOption(ctx.state.scanReviewBusyAction, {
        some: action => action === "refs"
            ? { title: "Adding references...", detail: `Saving ${photoText} as pet refs` }
            : { title: "Tagging selected photos...", detail: `Applying Immich tags to ${photoText}` },
        none: () => ({ title: "Working...", detail: "Applying changes" }),
    });
}
function busyActionIs(ctx, expected) {
    return matchOption(ctx.state.scanReviewBusyAction, {
        some: action => action === expected,
        none: () => false,
    });
}
function updateScanReviewBusyOverlay(ctx) {
    const overlay = el("busyOverlay");
    const title = el("busyOverlayTitle");
    const detail = el("busyOverlayDetail");
    if (isScanReviewBusy(ctx.state)) {
        const copy = scanReviewBusyCopy(ctx);
        title.textContent = copy.title;
        detail.textContent = copy.detail;
        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
    }
    else {
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
    }
}
function setScanReviewBusy(ctx, action) {
    ctx.state.scanReviewBusyAction = action;
    ctx.state.scanReviewBusyCount = isSome(action) ? ctx.state.selectedCrops.size : 0;
    updateScanReviewBusyOverlay(ctx);
    requireAction(ctx, "updateSelUI")();
}
function visibleScanReviewAssets(ctx) {
    return matchOption(ctx.state.scanReviewFilter, {
        none: () => ctx.state.scanReviewAssets,
        some: petName => ctx.state.scanReviewAssets.filter(asset => asset.pet_name === petName),
    });
}
function scanStat(label, val, cls) {
    return `<div class="poll-stat"><span class="poll-stat-label">${label}</span><span class="poll-stat-val ${val > 0 ? cls : ""}">${val}</span></div>`;
}
function runningStats(counts) {
    return scanStat("Review", counts.review || 0, "nonzero-good") +
        scanStat("Low conf.", counts.low_confidence || 0, "nonzero-warn") +
        scanStat("Other", counts.unknown || 0, "") +
        ((counts.excluded ?? 0) > 0 ? scanStat("Rejected", counts.excluded ?? 0, "") : "") +
        scanStat("Already tagged", counts.already_tagged || 0, "") +
        ((counts.failed ?? 0) > 0 ? scanStat("Failed", counts.failed ?? 0, "nonzero-bad") : "");
}
function finishedStats(counts) {
    return scanStat("Review", counts.review || 0, "nonzero-good") +
        scanStat("Low conf.", counts.low_confidence || 0, "nonzero-warn") +
        scanStat("Other", counts.unknown || 0, "") +
        scanStat("Out of range", counts.out_of_range || 0, "") +
        ((counts.excluded ?? 0) > 0 ? scanStat("Rejected", counts.excluded ?? 0, "") : "") +
        scanStat("Already tagged", counts.already_tagged || 0, "") +
        ((counts.failed ?? 0) > 0 ? scanStat("Failed", counts.failed ?? 0, "nonzero-bad") : "") +
        ((counts.no_thumb ?? 0) > 0 ? scanStat("No thumb", counts.no_thumb ?? 0, "nonzero-warn") : "");
}
function visibleSelectableReviewThumbs() {
    return [...document.querySelectorAll("#photoGrid .photo-thumb")].filter(thumb => !thumb.classList.contains("is-ref") &&
        !thumb.classList.contains("is-neg") &&
        !thumb.classList.contains("is-tagged"));
}
function allVisibleScanReviewSelected(ctx) {
    const thumbs = visibleSelectableReviewThumbs();
    return thumbs.length > 0 && thumbs.every(thumb => ctx.state.selectedCrops.has(thumb.id.slice(3)));
}
function renderScanReview(ctx) {
    const grid = el("photoGrid");
    const label = el("resultsLabel");
    resetSelection(ctx.state);
    requireAction(ctx, "updateSelUI")();
    const assets = visibleScanReviewAssets(ctx);
    label.textContent = `${assets.length} scan candidate${assets.length !== 1 ? "s" : ""}`;
    if (!assets.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1; height:200px;"><div class="empty-sub">Nothing is waiting for review</div></div>';
        return;
    }
    const negSet = new Set(negativeKeys(ctx.state));
    grid.innerHTML = assets.flatMap(asset => renderPhotoItems(asset, ctx.state.scanReviewThreshold, ctx.state.immichUrl)).join("");
    assets.forEach(asset => {
        if (negSet.has(asset.id))
            document.getElementById("th-" + asset.id)?.classList.add("is-neg");
    });
    requireAction(ctx, "updateScanReviewSelectAllBtn")();
}
function renderScanReviewFilterBtns(ctx) {
    const container = el("scanFilterBtns");
    const counts = new Map();
    ctx.state.scanReviewAssets.forEach(asset => {
        if (asset.pet_name)
            counts.set(asset.pet_name, (counts.get(asset.pet_name) || 0) + 1);
    });
    matchOption(ctx.state.scanReviewFilter, {
        some: name => { if (!counts.has(name))
            ctx.state.scanReviewFilter = none; },
        none: () => undefined,
    });
    const petNames = ctx.state.pets.map(pet => pet.name).filter(name => counts.has(name));
    const selectLabel = allVisibleScanReviewSelected(ctx) ? "Deselect all" : "Select all";
    const allActive = matchOption(ctx.state.scanReviewFilter, { some: () => false, none: () => true });
    container.innerHTML = [
        `<button class="btn" id="scanReviewSelectAllBtn">${selectLabel}</button>`,
        `<button class="btn ${allActive ? "btn-primary" : ""}" data-filter-pet="">All (${ctx.state.scanReviewAssets.length})</button>`,
        ...petNames.map(name => {
            const active = matchOption(ctx.state.scanReviewFilter, { some: selected => selected === name, none: () => false });
            return `<button class="btn ${active ? "btn-primary" : ""}" data-filter-pet="${escapeHtml(name)}">${escapeHtml(name)} (${counts.get(name)})</button>`;
        }),
    ].join("");
    el("scanReviewSelectAllBtn").onclick = () => toggleVisibleScanReviewSelection(ctx);
    [...container.querySelectorAll("[data-filter-pet]")].forEach(btn => {
        btn.onclick = () => {
            ctx.state.scanReviewFilter = btn.dataset.filterPet ? some(btn.dataset.filterPet) : none;
            renderScanReviewFilterBtns(ctx);
            renderScanReview(ctx);
        };
    });
    container.style.display = ctx.state.scanReviewAssets.length ? "flex" : "none";
}
function toggleVisibleScanReviewSelection(ctx) {
    if (isScanReviewBusy(ctx.state))
        return;
    const thumbs = visibleSelectableReviewThumbs();
    if (!thumbs.length)
        return;
    const deselect = allVisibleScanReviewSelected(ctx);
    thumbs.forEach(thumb => {
        const key = thumb.id.slice(3);
        if (deselect) {
            ctx.state.selectedCrops.delete(key);
            thumb.classList.remove("selected");
            return;
        }
        matchResult(readCropData(thumb), {
            ok: crop => {
                ctx.state.selectedCrops.set(key, crop);
                thumb.classList.add("selected");
            },
            err: message => toast(message, "error"),
        });
    });
    ctx.state.lastClickedKey = deselect ? none : some(thumbs[thumbs.length - 1].id.slice(3));
    requireAction(ctx, "updateSelUI")();
}
async function scanAssignSelected(ctx) {
    if (isScanReviewBusy(ctx.state) || !ctx.state.selectedCrops.size)
        return;
    const petNames = [...ctx.state.scanReviewSelectedPets];
    if (!petNames.length) {
        toast("Select at least one pet", "error");
        return;
    }
    const newCrops = [...ctx.state.selectedCrops.values()];
    const keys = new Set(newCrops.map(cropSelectionKey));
    setScanReviewBusy(ctx, some("tag"));
    const result = await ctx.services.scan.applyReview({ assets: newCrops, pet_names: petNames });
    await matchResultAsync(result, {
        ok: async (data) => {
            requireAction(ctx, "removeSelectedScanReviewItems")(keys);
            await requireAction(ctx, "refreshState")();
            const names = petNames.join(", ");
            const extra = data.failed ? ` (${data.failed} failed)` : "";
            toast(`Tagged ${data.added} as ${names}${extra}`, data.failed ? "error" : "success");
        },
        err: message => toast(message, "error"),
    });
    setScanReviewBusy(ctx, none);
}
async function scanAddSelectedAsRefs(ctx) {
    if (isScanReviewBusy(ctx.state) || !ctx.state.selectedCrops.size)
        return;
    const petNames = [...ctx.state.scanReviewSelectedPets];
    if (petNames.length !== 1) {
        toast("Select exactly one pet for refs", "error");
        return;
    }
    const petName = petNames[0];
    const newCrops = [...ctx.state.selectedCrops.values()];
    const keys = new Set(newCrops.map(cropSelectionKey));
    setScanReviewBusy(ctx, some("refs"));
    const result = await requireAction(ctx, "addCropsToPetRefs")(petName, newCrops, none);
    await matchResultAsync(result, {
        ok: async (data) => {
            requireAction(ctx, "removeSelectedScanReviewItems")(keys);
            const isActivePet = matchOption(activePetName(ctx.state), {
                some: activeName => activeName === petName,
                none: () => false,
            });
            if (isActivePet)
                await requireAction(ctx, "loadRefs")(petName);
            await requireAction(ctx, "refreshState")();
            const extra = data.faces_failed ? ` (${data.faces_failed} faces failed)` : "";
            toast(`Added ${newCrops.length} ref${newCrops.length !== 1 ? "s" : ""} to ${petName}${extra}`, data.faces_failed ? "error" : "success");
        },
        err: message => toast(message, "error"),
    });
    setScanReviewBusy(ctx, none);
}
function showScanResult(ctx, result) {
    const resultEl = el("scanResult");
    const stopBtn = el("stopScanBtn");
    ctx.state.scanRunning = result.status === "running";
    if (result.status === undefined || result.status === "none") {
        resultEl.style.display = "none";
        stopBtn.style.display = "none";
        return;
    }
    resultEl.className = "scan-result";
    resultEl.style.display = "";
    if (result.status === "running") {
        stopBtn.style.display = "";
        const dateStr = result.current_date ? new Date(result.current_date + "T00:00:00").toLocaleDateString() : "";
        const counts = result.counts || {};
        resultEl.innerHTML = '<div class="scan-result-header">Scanning...</div>' +
            (dateStr ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">${dateStr}</div>` : "") +
            `<div class="poll-stats" style="margin-top:6px;">${runningStats(counts)}</div>`;
        return;
    }
    stopBtn.style.display = "none";
    if (result.status === "stopped") {
        resultEl.innerHTML = '<div class="scan-result-header">Scan stopped</div>';
        return;
    }
    if (result.status === "error") {
        resultEl.innerHTML = `<div class="scan-result-header">Scan failed</div><div style="font-size:11px;color:var(--danger);margin-top:4px;">${escapeHtml(result.error || "")}</div>`;
        return;
    }
    if (!result.counts)
        return;
    const reviewCount = result.counts.review || 0;
    resultEl.innerHTML = '<div class="scan-result-header">Scan result</div>' +
        `<div class="poll-stats" style="margin-top:6px;">${finishedStats(result.counts)}</div>` +
        (reviewCount > 0 ? `<button class="btn" style="font-size:11px;margin-top:8px;width:100%;" onclick="viewScanReview()">Review ${reviewCount} candidate${reviewCount !== 1 ? "s" : ""}</button>` : "");
}
export function createScanController(ctx) {
    const renderScanReviewPetBtns = () => {
        const container = el("scanPetBtns");
        if (!ctx.state.scanReviewMode) {
            container.innerHTML = "";
            return;
        }
        const busy = isScanReviewBusy(ctx.state);
        const canTag = ctx.state.scanReviewSelectedPets.size > 0 && !busy;
        const canAddRefs = ctx.state.scanReviewSelectedPets.size === 1 && !busy;
        const tagLabel = busyActionIs(ctx, "tag")
            ? '<span class="btn-spinner"></span>Tagging...'
            : "Tag selected";
        const refsLabel = busyActionIs(ctx, "refs")
            ? '<span class="btn-spinner"></span>Adding refs...'
            : "Add as refs";
        const petButtons = ctx.state.pets.map(pet => {
            const active = ctx.state.scanReviewSelectedPets.has(pet.name);
            return `<button class="btn scan-pet-choice ${active ? "btn-primary active" : ""}" data-pet="${escapeHtml(pet.name)}" ${busy ? "disabled" : ""}>${escapeHtml(pet.name)}</button>`;
        });
        container.innerHTML = [
            ...petButtons,
            `<button class="btn btn-primary ${busyActionIs(ctx, "tag") ? "is-busy" : ""}" id="scanApplyBtn" ${canTag ? "" : "disabled"}>${tagLabel}</button>`,
            `<button class="btn ${busyActionIs(ctx, "refs") ? "is-busy" : ""}" id="scanAddRefsBtn" ${canAddRefs ? "" : "disabled"} title="Add selected scan crops as references for one selected pet">${refsLabel}</button>`,
        ].join("");
        [...container.querySelectorAll(".scan-pet-choice")].forEach(btn => {
            btn.onclick = () => {
                const pet = btn.dataset.pet;
                if (!pet)
                    return;
                if (ctx.state.scanReviewSelectedPets.has(pet))
                    ctx.state.scanReviewSelectedPets.delete(pet);
                else
                    ctx.state.scanReviewSelectedPets.add(pet);
                renderScanReviewPetBtns();
            };
        });
        el("scanApplyBtn").onclick = () => { void scanAssignSelected(ctx); };
        el("scanAddRefsBtn").onclick = () => { void scanAddSelectedAsRefs(ctx); };
    };
    const updateScanReviewSelectAllBtn = () => {
        const btnEl = document.getElementById("scanReviewSelectAllBtn");
        if (!btnEl)
            return;
        const thumbs = visibleSelectableReviewThumbs();
        button("scanReviewSelectAllBtn").disabled = isScanReviewBusy(ctx.state) || thumbs.length === 0;
        btnEl.textContent = allVisibleScanReviewSelected(ctx) ? "Deselect all" : "Select all";
    };
    const removeSelectedScanReviewItems = (keys) => {
        ctx.state.scanReviewAssets = ctx.state.scanReviewAssets.filter(asset => !keys.has(scanReviewAssetKey(asset)));
        renderScanReviewFilterBtns(ctx);
        renderScanReview(ctx);
    };
    const viewScanReview = async () => {
        ctx.state.scanReviewMode = true;
        ctx.state.scanLowConfMode = false;
        ctx.state.negCandidateMode = false;
        resetSelection(ctx.state);
        ctx.state.scanReviewSelectedPets.clear();
        ctx.state.scanReviewFilter = none;
        const grid = el("photoGrid");
        const label = el("resultsLabel");
        grid.innerHTML = '<div class="loading" style="grid-column:1/-1">Loading scan candidates...</div>';
        label.textContent = "Loading...";
        el("scanFilterBtns").style.display = "none";
        renderScanReviewPetBtns();
        requireAction(ctx, "updateSelUI")();
        const result = await ctx.services.scan.review();
        matchResult(result, {
            ok: data => {
                ctx.state.scanReviewAssets = data.assets;
                ctx.state.scanReviewThreshold = data.threshold ?? 0.8;
                if (!data.assets.length) {
                    label.textContent = "No scan candidates";
                    grid.innerHTML = '<div class="empty" style="grid-column:1/-1; height:200px;"><div class="empty-sub">Nothing is waiting for review</div></div>';
                    return;
                }
                renderScanReviewFilterBtns(ctx);
                renderScanReview(ctx);
            },
            err: message => {
                label.textContent = "Failed to load";
                grid.innerHTML = `<div class="empty" style="grid-column:1/-1; height:200px;"><div class="empty-sub">${escapeHtml(message)}</div></div>`;
            },
        });
    };
    const loadScanResult = async () => {
        const result = await ctx.services.scan.result();
        matchResult(result, {
            ok: value => showScanResult(ctx, value),
            err: () => undefined,
        });
    };
    const applyTimestamp = async () => {
        const val = input("scanDate").value;
        if (!val) {
            toast("Pick a date first", "error");
            return;
        }
        const untilVal = input("scanUntil").value || null;
        const result = await ctx.services.scan.start({ scan_since: val, scan_until: untilVal, review: true });
        await matchResultAsync(result, {
            err: message => {
                toast(message, "error");
                return Promise.resolve();
            },
            ok: async () => {
                showScanResult(ctx, { status: "running" });
                const timer = window.setInterval(async () => {
                    const next = await ctx.services.scan.result();
                    await matchResultAsync(next, {
                        err: () => Promise.resolve(),
                        ok: async (scanResult) => {
                            showScanResult(ctx, scanResult);
                            if (scanResult.status !== "running") {
                                window.clearInterval(timer);
                                if (scanResult.status === "idle" && (scanResult.counts?.review || 0) > 0) {
                                    await viewScanReview();
                                }
                            }
                        },
                    });
                }, 2000);
            },
        });
    };
    const stopScan = async () => {
        const result = await ctx.services.scan.stop();
        matchResult(result, {
            ok: () => showScanResult(ctx, { status: "stopped" }),
            err: message => toast(message, "error"),
        });
    };
    const prefillScanUntil = () => {
        const scanUntil = input("scanUntil");
        if (!scanUntil.value)
            scanUntil.value = new Date().toISOString().slice(0, 10);
    };
    window.addEventListener("beforeunload", event => {
        if (!ctx.state.scanRunning)
            return;
        event.preventDefault();
    });
    return {
        applyTimestamp,
        loadScanResult,
        prefillScanUntil,
        removeSelectedScanReviewItems,
        renderScanReviewPetBtns,
        stopScan,
        updateScanReviewSelectAllBtn,
        viewScanReview,
    };
}
