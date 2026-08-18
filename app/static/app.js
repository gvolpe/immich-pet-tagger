// Generated browser asset: app/static/app.js. Edit this TypeScript source instead.
import { createAppState, isScanReviewBusy } from "./app-context.js";
import { createBackendServices } from "./services.js";
import { wireConfirmDialog } from "./confirm-dialog.js";
import { createCoreController } from "./core-controller.js";
import { initials } from "./dom.js";
import { isNone } from "./fp.js";
import { createNegativesController } from "./negatives-controller.js";
import { createPetDialogsController } from "./pet-dialogs-controller.js";
import { createReferencesController } from "./references-controller.js";
import { createScanController } from "./scan-controller.js";
import { createSelectionController } from "./selection-controller.js";
import { initVersionLabel } from "./version.js";
const ctx = {
    services: createBackendServices(),
    state: createAppState(),
    actions: {},
};
const selection = createSelectionController(ctx);
const core = createCoreController(ctx);
const references = createReferencesController(ctx);
const negatives = createNegativesController(ctx);
const scan = createScanController(ctx);
const dialogs = createPetDialogsController(ctx);
Object.assign(ctx.actions, {
    addCropsToPetRefs: references.addCropsToPetRefs,
    clearSearch: core.clearSearch,
    loadNegatives: negatives.loadNegatives,
    loadPets: core.loadPets,
    loadRefs: references.loadRefs,
    refreshState: core.refreshState,
    removeSelectedScanReviewItems: scan.removeSelectedScanReviewItems,
    renderScanReviewPetBtns: scan.renderScanReviewPetBtns,
    renderSidebar: core.renderSidebar,
    selectPet: core.selectPet,
    showGuide: core.showGuide,
    updateNegStatus: negatives.updateNegStatus,
    updateScanReviewSelectAllBtn: scan.updateScanReviewSelectAllBtn,
    updateSelUI: selection.updateSelUI,
    viewBorderline: references.viewBorderline,
    viewScanReview: scan.viewScanReview,
    viewSuggestions: references.viewSuggestions,
});
dialogs.wireModalBackdrops();
wireConfirmDialog();
void (async () => {
    await core.refreshState();
    if (isNone(ctx.state.activePet) && ctx.state.pets.length > 0)
        core.showGuide();
    scan.prefillScanUntil();
    await scan.loadScanResult();
    void initVersionLabel();
})();
Object.assign(window, {
    addSelectedAsNegatives: negatives.addSelectedAsNegatives,
    applyTimestamp: scan.applyTimestamp,
    assignSelected: references.assignSelected,
    backToImportPicker: dialogs.backToImportPicker,
    clearAllNegatives: negatives.clearAllNegatives,
    clearAllRefs: references.clearAllRefs,
    closeAddById: references.closeAddById,
    closeDeleteModal: dialogs.closeDeleteModal,
    closeEditModal: dialogs.closeEditModal,
    closeImportPicker: dialogs.closeImportPicker,
    closeModal: dialogs.closeModal,
    confirmDeletePet: dialogs.confirmDeletePet,
    confirmResetPet: dialogs.confirmResetPet,
    filterImportPeople: dialogs.filterImportPeople,
    handlePersonCardClick: dialogs.handlePersonCardClick,
    initials,
    openAddById: references.openAddById,
    openAddNegById: references.openAddNegById,
    openAddPet: dialogs.openAddPet,
    openDeletePet: dialogs.openDeletePet,
    openEditPet: dialogs.openEditPet,
    openImportPet: dialogs.openImportPet,
    removeNegative: negatives.removeNegative,
    removeRef: references.removeRef,
    selectPet: core.selectPet,
    showGuide: core.showGuide,
    skipSelected: negatives.skipSelected,
    stopScan: scan.stopScan,
    submitAddById: references.submitAddById,
    submitAddPet: dialogs.submitAddPet,
    submitEditPet: dialogs.submitEditPet,
    submitImportPet: dialogs.submitImportPet,
    toggleSelect: selection.toggleSelect,
    viewFindRefs: references.viewFindRefs,
    viewNegCandidates: negatives.viewNegCandidates,
    viewScanReview: scan.viewScanReview,
});
export function hasBlockingUiWork() {
    return isScanReviewBusy(ctx.state) || ctx.state.scanRunning;
}
