import { isSome, mapOption, none, some, } from "./fp.js";
export function createAppState() {
    return {
        pets: [],
        activePet: none,
        selectedCrops: new Map(),
        refsItems: [],
        negatives: { assets: [], count: 0 },
        immichUrl: "http://127.0.0.1:2283",
        negCandidateMode: false,
        scanReviewMode: false,
        scanLowConfMode: false,
        lastClickedKey: none,
        negGeneration: 0,
        negPollTimer: none,
        blGeneration: 0,
        blPollTimer: none,
        scanRunning: false,
        scanReviewBusyAction: none,
        scanReviewBusyCount: 0,
        scanReviewAssets: [],
        scanReviewThreshold: 0.8,
        scanReviewFilter: none,
        scanReviewSelectedPets: new Set(),
    };
}
export function requireAction(ctx, key) {
    const action = ctx.actions[key];
    if (!action)
        throw new Error(`App action is not wired: ${String(key)}`);
    return action;
}
export function isScanReviewBusy(state) {
    return isSome(state.scanReviewBusyAction);
}
export function activePetName(state) {
    return mapOption(state.activePet, pet => pet.name);
}
export function resetSelection(state) {
    state.selectedCrops.clear();
    state.lastClickedKey = none;
}
export function resetModes(state) {
    state.negCandidateMode = false;
    state.scanReviewMode = false;
    state.scanLowConfMode = false;
    state.scanReviewSelectedPets.clear();
}
export function setActivePet(state, pet) {
    state.activePet = some(pet);
}
export function clearActivePet(state) {
    state.activePet = none;
}
export function negativeKeys(state) {
    return state.negatives.assets.map(asset => asset.key || asset.id);
}
