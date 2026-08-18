import { el, escapeHtml, initials, toast } from "./dom.js";
import { fromNullable, isNone, matchOption, matchOptionAsync, matchResult, none } from "./fp.js";
import { guideHtml } from "./guide.js";
import { activePetName, clearActivePet, requireAction, resetModes, setActivePet, } from "./app-context.js";
import { clearGridSelection } from "./selection-controller.js";
function renderEmptyPetState(ctx) {
    const petsList = el("petsList");
    petsList.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text3);text-align:center;line-height:1.6;">No pets yet.<br>Add one to get started.</div>';
    clearActivePet(ctx.state);
    el("refsTitle").textContent = "No pet selected";
    el("findRefsBtn").style.display = "none";
    el("addByIdBtn").style.display = "none";
    el("clearRefsBtn").style.display = "none";
    el("refsGrid").innerHTML = '<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-sub">Add a pet first</div></div>';
}
export function createCoreController(ctx) {
    const showGuide = () => {
        resetModes(ctx.state);
        el("scanFilterBtns").style.display = "none";
        el("scanPetBtns").style.display = "none";
        el("resultsLabel").textContent = "";
        el("photoGrid").innerHTML = guideHtml();
        clearGridSelection(ctx);
        requireAction(ctx, "updateSelUI")();
    };
    const clearSearch = () => {
        resetModes(ctx.state);
        el("scanFilterBtns").style.display = "none";
        el("scanPetBtns").style.display = "none";
        el("resultsLabel").textContent = "";
        el("photoGrid").innerHTML = '<div class="empty" style="grid-column:1/-1; height:300px;"><div class="empty-icon">🐾</div><div class="empty-title">Find photos</div><div class="empty-sub">Click "Find references" to get started</div></div>';
        clearGridSelection(ctx);
        requireAction(ctx, "updateSelUI")();
    };
    const renderSidebar = () => {
        const petsList = el("petsList");
        if (!ctx.state.pets.length) {
            renderEmptyPetState(ctx);
            showGuide();
            return;
        }
        petsList.innerHTML = ctx.state.pets.map(pet => {
            const activeClass = matchOption(activePetName(ctx.state), {
                some: name => name === pet.name ? "active" : "",
                none: () => "",
            });
            return `
        <div class="pet-item ${activeClass}" data-name="${escapeHtml(pet.name)}" onclick="selectPet(this.dataset.name)">
          <div class="pet-avatar">${pet.person_id ? `<img src="/api/person-thumb/${pet.person_id}" onerror="this.parentElement.textContent=initials(this.parentElement.parentElement.dataset.name)" alt="">` : initials(pet.name)}</div>
          <div class="pet-info">
            <div class="pet-name">${escapeHtml(pet.name)}</div>
            <div class="pet-count">${pet.ref_count} ref${pet.ref_count !== 1 ? "s" : ""}</div>
          </div>
          <button class="pet-edit" onclick="event.stopPropagation(); openEditPet(this.closest('.pet-item').dataset.name)" title="Edit">✎</button>
          <button class="pet-delete" onclick="event.stopPropagation(); openDeletePet(this.closest('.pet-item').dataset.name)" title="Delete">✕</button>
        </div>`;
        }).join("");
    };
    const loadPets = async () => {
        const result = await ctx.services.pets.list();
        matchResult(result, {
            ok: data => {
                const previous = ctx.state.activePet;
                ctx.state.pets = data.pets;
                ctx.state.activePet = matchOption(previous, {
                    some: current => fromNullable(ctx.state.pets.find(pet => pet.name === current.name)),
                    none: () => none,
                });
                renderSidebar();
                requireAction(ctx, "updateNegStatus")();
            },
            err: message => toast("Could not load pets: " + message, "error"),
        });
    };
    const refreshState = async () => {
        const config = await ctx.services.config.load();
        matchResult(config, {
            ok: cfg => {
                ctx.state.immichUrl = cfg.immich_external_url.replace(/\/$/, "");
                const banner = el("modelsBanner");
                matchOption(fromNullable(cfg.models_error), {
                    some: message => {
                        banner.innerHTML = "<strong>Model load failed.</strong> " + message + " On first use, yolov8n.pt (~6 MB) and the CLIP model (~350 MB) are downloaded. Ensure the service has internet access, then retry. To use offline, place the model files in the service data directory.";
                        banner.classList.add("visible");
                    },
                    none: () => banner.classList.remove("visible"),
                });
            },
            err: () => undefined,
        });
        await loadPets();
        await requireAction(ctx, "loadNegatives")();
    };
    const selectPet = async (name) => {
        await matchOptionAsync(fromNullable(name), {
            none: () => Promise.resolve(),
            some: async (petName) => {
                const alreadyActive = matchOption(activePetName(ctx.state), {
                    some: activeName => activeName === petName,
                    none: () => false,
                });
                if (alreadyActive)
                    return;
                if (ctx.state.selectedCrops.size > 0) {
                    const ok = confirm(`You have ${ctx.state.selectedCrops.size} selected photo${ctx.state.selectedCrops.size !== 1 ? "s" : ""} not yet assigned. Switch anyway?`);
                    if (!ok)
                        return;
                }
                resetModes(ctx.state);
                el("scanFilterBtns").style.display = "none";
                el("scanPetBtns").style.display = "none";
                const pet = fromNullable(ctx.state.pets.find(candidate => candidate.name === petName));
                if (isNone(pet))
                    return;
                setActivePet(ctx.state, pet.value);
                clearSearch();
                renderSidebar();
                el("refsTitle").textContent = petName;
                el("findRefsBtn").style.display = "";
                el("addByIdBtn").style.display = "";
                el("clearRefsBtn").style.display = "";
                await requireAction(ctx, "loadRefs")(petName);
                await requireAction(ctx, "loadNegatives")();
            },
        });
    };
    return { refreshState, loadPets, renderSidebar, showGuide, clearSearch, selectPet };
}
