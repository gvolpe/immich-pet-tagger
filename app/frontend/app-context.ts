import {
  isSome,
  mapOption,
  none,
  some,
  type Option,
  type Result,
} from "./fp.js";
import type { BackendServices } from "./services.js";
import type {
  AddRefsResponse,
  CropSelection,
  NegativeAssetsResponse,
  Pet,
  PhotoAsset,
  RefAsset,
  ScanReviewBusyAction,
} from "./types.js";

export interface AppState {
  pets: Pet[];
  activePet: Option<Pet>;
  selectedCrops: Map<string, CropSelection>;
  refsItems: RefAsset[];
  negatives: NegativeAssetsResponse;
  immichUrl: string;
  negCandidateMode: boolean;
  scanReviewMode: boolean;
  scanLowConfMode: boolean;
  lastClickedKey: Option<string>;
  negGeneration: number;
  negPollTimer: Option<number>;
  blGeneration: number;
  blPollTimer: Option<number>;
  scanRunning: boolean;
  scanReviewBusyAction: Option<ScanReviewBusyAction>;
  scanReviewBusyCount: number;
  scanReviewAssets: PhotoAsset[];
  scanReviewThreshold: number;
  scanReviewFilter: Option<string>;
  scanReviewSelectedPets: Set<string>;
}

export interface AppActions {
  addCropsToPetRefs(petName: string, crops: CropSelection[], refs: Option<RefAsset[]>): Promise<Result<AddRefsResponse, string>>;
  clearSearch(): void;
  loadNegatives(): Promise<void>;
  loadPets(): Promise<void>;
  loadRefs(name: string): Promise<void>;
  refreshState(): Promise<void>;
  removeSelectedScanReviewItems(keys: Set<string>): void;
  renderScanReviewPetBtns(): void;
  renderSidebar(): void;
  selectPet(name: string | null | undefined): Promise<void>;
  showGuide(): void;
  updateNegStatus(): void;
  updateScanReviewSelectAllBtn(): void;
  updateSelUI(): void;
  viewBorderline(): Promise<void>;
  viewScanReview(): Promise<void>;
  viewSuggestions(): Promise<void>;
}

export interface AppContext {
  readonly services: BackendServices;
  readonly state: AppState;
  readonly actions: Partial<AppActions>;
}

export function createAppState(): AppState {
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

export function requireAction<K extends keyof AppActions>(ctx: AppContext, key: K): AppActions[K] {
  const action = ctx.actions[key];
  if (!action) throw new Error(`App action is not wired: ${String(key)}`);
  return action as AppActions[K];
}

export function isScanReviewBusy(state: AppState): boolean {
  return isSome(state.scanReviewBusyAction);
}

export function activePetName(state: AppState): Option<string> {
  return mapOption(state.activePet, pet => pet.name);
}

export function resetSelection(state: AppState): void {
  state.selectedCrops.clear();
  state.lastClickedKey = none;
}

export function resetModes(state: AppState): void {
  state.negCandidateMode = false;
  state.scanReviewMode = false;
  state.scanLowConfMode = false;
  state.scanReviewSelectedPets.clear();
}

export function setActivePet(state: AppState, pet: Pet): void {
  state.activePet = some(pet);
}

export function clearActivePet(state: AppState): void {
  state.activePet = none;
}

export function negativeKeys(state: AppState): string[] {
  return state.negatives.assets.map(asset => asset.key || asset.id);
}
