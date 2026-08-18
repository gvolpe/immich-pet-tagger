import { clearModalError, el, escapeHtml, input, modalError, toast } from "./dom.js";
import { err, fromNullable, matchOption, matchOptionAsync, matchResult, matchResultAsync, none, ok, some, type Option, type Result } from "./fp.js";
import {
  activePetName,
  clearActivePet,
  requireAction,
  type AppContext,
} from "./app-context.js";
import type { ImmichPerson, ImportPetPayload, PetSavePayload } from "./types.js";

export interface PetDialogsController {
  backToImportPicker(): void;
  closeDeleteModal(): void;
  closeEditModal(): void;
  closeImportDetail(): void;
  closeImportPicker(): void;
  closeModal(): void;
  confirmDeletePet(localOnly: boolean): Promise<void>;
  confirmResetPet(): Promise<void>;
  filterImportPeople(): void;
  handlePersonCardClick(card: HTMLElement): void;
  openAddPet(): void;
  openDeletePet(name: string | null | undefined): void;
  openEditPet(name: string | null | undefined): void;
  openImportPet(): Promise<void>;
  submitAddPet(): Promise<void>;
  submitEditPet(): Promise<void>;
  submitImportPet(): Promise<void>;
  wireModalBackdrops(): void;
}

interface DateRange {
  since: string | null;
  until: string | null;
}

let petToEdit: Option<string> = none;
let petToDelete: Option<string> = none;
let allImportPeople: ImmichPerson[] = [];
let importSelectedPerson: Option<ImmichPerson> = none;

function optionalDate(value: string): string | null {
  return value || null;
}

function validateDateRange(sinceRaw: string, untilRaw: string): Result<DateRange, string> {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (sinceRaw && !dateRe.test(sinceRaw)) return err('Invalid "since" date');
  if (untilRaw && !dateRe.test(untilRaw)) return err('Invalid "until" date');
  if (sinceRaw && untilRaw && sinceRaw > untilRaw) return err('"Since" must be before "until"');
  return ok({ since: optionalDate(sinceRaw), until: optionalDate(untilRaw) });
}

function validatePetPayload(prefix: "pet" | "editPet"): Result<PetSavePayload, string> {
  const name = input(prefix === "pet" ? "petName" : "editPetName").value.trim();
  if (!name) return err("Name cannot be empty");
  const description = input(prefix === "pet" ? "petDescription" : "editPetDescription").value.trim();
  if (!description) return err("Description is required");
  return matchResult<DateRange, string, Result<PetSavePayload, string>>(validateDateRange(
    input(prefix === "pet" ? "petSince" : "editPetSince").value,
    input(prefix === "pet" ? "petUntil" : "editPetUntil").value,
  ), {
    ok: range => ok<PetSavePayload, string>({ name, description, since: range.since, until: range.until }),
    err: message => err<string, PetSavePayload>(message),
  });
}

function validateImportPayload(person: ImmichPerson): Result<ImportPetPayload, string> {
  const description = input("importPetDescription").value.trim();
  if (!description) return err("Description is required");
  return matchResult<DateRange, string, Result<ImportPetPayload, string>>(validateDateRange(input("importPetSince").value, input("importPetUntil").value), {
    ok: range => ok<ImportPetPayload, string>({
      person_id: person.id,
      name: person.name,
      description,
      since: range.since,
      until: range.until,
    }),
    err: message => err<string, ImportPetPayload>(message),
  });
}

function renderImportPeople(ctx: AppContext, people: ImmichPerson[]): void {
  const grid = el("importPeopleGrid");
  if (!people.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:24px;"><div class="empty-sub">No people found in Immich</div></div>';
    return;
  }
  const petPersonIds = new Set(ctx.state.pets.flatMap(pet => pet.person_id ? [pet.person_id] : []));
  grid.innerHTML = people.map(person => `
    <div class="person-card${petPersonIds.has(person.id) ? " already-added" : ""}" data-pid="${person.id}" onclick="handlePersonCardClick(this)">
      <img class="person-thumb" src="/api/person-thumb/${person.id}" onerror="this.style.opacity=0.2" loading="lazy" alt="">
      <span class="person-name-label">${escapeHtml(person.name || "-")}</span>
    </div>`).join("");
}

function closeAddPetModal(): void {
  el("addPetModal").classList.remove("open");
  clearModalError("addPetError");
}

export function createPetDialogsController(ctx: AppContext): PetDialogsController {
  const openAddPet = (): void => {
    input("petName").value = "";
    input("petDescription").value = "";
    input("petSince").value = "";
    input("petUntil").value = "";
    el("addPetModal").classList.add("open");
    window.setTimeout(() => el("petName").focus(), 100);
  };

  const submitAddPet = async (): Promise<void> => {
    clearModalError("addPetError");
    const payload = validatePetPayload("pet");
    await matchResultAsync(payload, {
      err: message => {
        modalError("addPetError", message);
        return Promise.resolve();
      },
      ok: async value => {
        const result = await ctx.services.pets.create(value);
        await matchResultAsync(result, {
          ok: async () => {
            closeAddPetModal();
            await requireAction(ctx, "loadPets")();
            await requireAction(ctx, "selectPet")(value.name);
            toast(`Created ${value.name}`, "success");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  const openEditPet = (name: string | null | undefined): void => {
    matchOption(fromNullable(name), {
      none: () => undefined,
      some: petName => {
        petToEdit = some(petName);
        matchOption(fromNullable(ctx.state.pets.find(pet => pet.name === petName)), {
          none: () => undefined,
          some: pet => {
            input("editPetName").value = pet.name;
            input("editPetDescription").value = pet.description || "";
            input("editPetSince").value = pet.since || "";
            input("editPetUntil").value = pet.until || "";
            el("editPetModal").classList.add("open");
            window.setTimeout(() => el("editPetName").focus(), 100);
          },
        });
      },
    });
  };

  const closeEditModal = (): void => {
    el("editPetModal").classList.remove("open");
    petToEdit = none;
  };

  const submitEditPet = async (): Promise<void> => {
    await matchOptionAsync(petToEdit, {
      none: () => Promise.resolve(),
      some: async previousName => {
        const prevActiveName = activePetName(ctx.state);
        clearModalError("editPetError");
        const payload = validatePetPayload("editPet");
        await matchResultAsync(payload, {
          err: message => {
            modalError("editPetError", message);
            return Promise.resolve();
          },
          ok: async value => {
            const result = await ctx.services.pets.update(previousName, value);
            await matchResultAsync(result, {
              ok: async () => {
                closeEditModal();
                clearActivePet(ctx.state);
                requireAction(ctx, "clearSearch")();
                await requireAction(ctx, "loadPets")();
                const selectName = matchOption(prevActiveName, {
                  some: activeName => activeName === previousName ? some(value.name) : some(activeName),
                  none: () => fromNullable(ctx.state.pets[0]?.name),
                });
                await matchOptionAsync(selectName, {
                  some: name => requireAction(ctx, "selectPet")(name),
                  none: () => Promise.resolve(),
                });
                toast("Saved", "success");
              },
              err: message => toast("Error: " + message, "error"),
            });
          },
        });
      },
    });
  };

  const openDeletePet = (name: string | null | undefined): void => {
    matchOption(fromNullable(name), {
      none: () => undefined,
      some: petName => {
        petToDelete = some(petName);
        el("deleteWarningText").textContent =
          '"Delete from Immich too" removes the person and untags all tagged photos in Immich permanently.';
        el("deleteLocalOnlyText").textContent =
          `"Remove from Pet Tagger only" keeps ${petName} in Immich with all tagged photos intact, but stops auto-tagging new photos. You can re-import it later.`;
        el("resetImmichText").textContent =
          `"Untag all photos in Immich" removes all tags for ${petName} in Immich and creates a fresh person, but keeps your reference images so you can start tagging again right away.`;
        el("deletePetModal").classList.add("open");
      },
    });
  };

  const closeDeleteModal = (): void => {
    el("deletePetModal").classList.remove("open");
    petToDelete = none;
  };

  const confirmDeletePet = async (localOnly: boolean): Promise<void> => {
    await matchOptionAsync(petToDelete, {
      none: () => Promise.resolve(),
      some: async name => {
        closeDeleteModal();
        const result = await ctx.services.pets.delete(name, localOnly);
        await matchResultAsync(result, {
          ok: async () => {
            const deletingActive = matchOption(activePetName(ctx.state), {
              some: activeName => activeName === name,
              none: () => false,
            });
            if (deletingActive) {
              clearActivePet(ctx.state);
              el("refsTitle").textContent = "No pet selected";
              el("refsGrid").innerHTML = '<div class="empty" style="grid-column:1/-1;height:200px;"><div class="empty-sub">Select a pet</div></div>';
            }
            await requireAction(ctx, "refreshState")();
            toast(localOnly ? `Removed ${name} from Pet Tagger` : `Deleted ${name}. Immich will clean up faces in the background.`, "success");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  const confirmResetPet = async (): Promise<void> => {
    await matchOptionAsync(petToDelete, {
      none: () => Promise.resolve(),
      some: async name => {
        closeDeleteModal();
        const result = await ctx.services.pets.resetImmich(name);
        await matchResultAsync(result, {
          ok: async () => {
            await requireAction(ctx, "refreshState")();
            toast(`Reset ${name}: all Immich tags cleared, reference images preserved.`, "success");
          },
          err: message => toast("Error: " + message, "error"),
        });
      },
    });
  };

  const openImportPet = async (): Promise<void> => {
    importSelectedPerson = none;
    allImportPeople = [];
    input("importSearch").value = "";
    el("importPeopleGrid").innerHTML = '<div class="loading">Loading...</div>';
    clearModalError("importPickerError");
    el("importPickerModal").classList.add("open");
    const result = await ctx.services.pets.listImmichPeople();
    matchResult(result, {
      ok: data => {
        allImportPeople = data.people || [];
        renderImportPeople(ctx, allImportPeople);
      },
      err: message => {
        el("importPeopleGrid").innerHTML = `<div class="empty" style="grid-column:1/-1;padding:24px;"><div class="empty-sub">${escapeHtml(message)}</div></div>`;
      },
    });
  };

  const filterImportPeople = (): void => {
    const query = input("importSearch").value.toLowerCase();
    renderImportPeople(ctx, query ? allImportPeople.filter(person => (person.name || "").toLowerCase().includes(query)) : allImportPeople);
  };

  const handlePersonCardClick = (card: HTMLElement): void => {
    const selected = matchOption(fromNullable(card.dataset.pid), {
      none: () => none,
      some: id => fromNullable(allImportPeople.find(person => person.id === id)),
    });
    matchOption(selected, {
      none: () => undefined,
      some: person => {
        importSelectedPerson = some(person);
        el("importPickerModal").classList.remove("open");
        input("importPetName").value = person.name || "";
        input("importPetDescription").value = "";
        input("importPetSince").value = "";
        input("importPetUntil").value = "";
        clearModalError("importDetailError");
        el("importDetailModal").classList.add("open");
        window.setTimeout(() => el("importPetDescription").focus(), 100);
      },
    });
  };

  const closeImportPicker = (): void => {
    el("importPickerModal").classList.remove("open");
  };

  const closeImportDetail = (): void => {
    el("importDetailModal").classList.remove("open");
    importSelectedPerson = none;
  };

  const backToImportPicker = (): void => {
    el("importDetailModal").classList.remove("open");
    el("importPickerModal").classList.add("open");
  };

  const submitImportPet = async (): Promise<void> => {
    await matchOptionAsync(importSelectedPerson, {
      none: () => Promise.resolve(),
      some: async person => {
        clearModalError("importDetailError");
        const payload = validateImportPayload(person);
        await matchResultAsync(payload, {
          err: message => {
            modalError("importDetailError", message);
            return Promise.resolve();
          },
          ok: async value => {
            const result = await ctx.services.pets.importFromImmich(value);
            await matchResultAsync(result, {
              ok: async data => {
                closeImportDetail();
                await requireAction(ctx, "refreshState")();
                await requireAction(ctx, "selectPet")(data.name);
                toast(data.ref_count > 0
                  ? `Imported ${data.name} with ${data.ref_count} refs`
                  : `Imported ${data.name} with 0 refs. No animals were detected in the reference photos. Add refs manually.`,
                data.ref_count > 0 ? "success" : "warn");
              },
              err: message => modalError("importDetailError", message),
            });
          },
        });
      },
    });
  };

  const wireModalBackdrops = (): void => {
    el("addPetModal").addEventListener("click", function(event) {
      if (event.target === this) closeAddPetModal();
    });
    el("editPetModal").addEventListener("click", function(event) {
      if (event.target === this) closeEditModal();
    });
    el("deletePetModal").addEventListener("click", function(event) {
      if (event.target === this) closeDeleteModal();
    });
    el("importPickerModal").addEventListener("click", function(event) {
      if (event.target === this) closeImportPicker();
    });
    el("importDetailModal").addEventListener("click", function(event) {
      if (event.target === this) closeImportDetail();
    });
  };

  return {
    backToImportPicker,
    closeDeleteModal,
    closeEditModal,
    closeImportDetail,
    closeImportPicker,
    closeModal: closeAddPetModal,
    confirmDeletePet,
    confirmResetPet,
    filterImportPeople,
    handlePersonCardClick,
    openAddPet,
    openDeletePet,
    openEditPet,
    openImportPet,
    submitAddPet,
    submitEditPet,
    submitImportPet,
    wireModalBackdrops,
  };
}
