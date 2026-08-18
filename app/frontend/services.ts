import { apiResult, type ApiResult } from "./api-client.js";
import type {
  AddRefsResponse,
  ApplyReviewResponse,
  AssetCropsResponse,
  AssetsResponse,
  ConfigResponse,
  CropSelection,
  ImportPeopleResponse,
  ImportPetPayload,
  ImportPetResponse,
  NegativeAssetsResponse,
  PetSavePayload,
  PetsResponse,
  PhotoAsset,
  ProgressResponse,
  RefAsset,
  ScanResult,
  ScanReviewResponse,
  ScanStartPayload,
} from "./types.js";

export interface ConfigService {
  load(): ApiResult<ConfigResponse>;
}

export interface PetService {
  list(): ApiResult<PetsResponse>;
  create(payload: PetSavePayload): ApiResult<{ ok: boolean }>;
  update(previousName: string, payload: PetSavePayload): ApiResult<{ ok: boolean }>;
  delete(name: string, localOnly: boolean): ApiResult<{ ok: boolean }>;
  resetImmich(name: string): ApiResult<{ ok: boolean }>;
  listImmichPeople(): ApiResult<ImportPeopleResponse>;
  importFromImmich(payload: ImportPetPayload): ApiResult<ImportPetResponse>;
}

export interface ReferenceService {
  list(petName: string): ApiResult<AssetsResponse<RefAsset>>;
  save(petName: string, assets: CropSelection[]): ApiResult<AddRefsResponse>;
  remove(petName: string, assetId: string, cropIdx: number | null): ApiResult<unknown>;
  clear(petName: string): ApiResult<{ ok: boolean }>;
  assetCrops(assetId: string): ApiResult<AssetCropsResponse>;
}

export interface NegativeService {
  list(): ApiResult<NegativeAssetsResponse>;
  add(assetIds: string[]): ApiResult<{ ok: boolean; count: number }>;
  remove(assetId: string): ApiResult<{ ok: boolean }>;
  clear(): ApiResult<{ ok: boolean }>;
}

export interface SuggestionService {
  refs(petName: string): ApiResult<AssetsResponse<PhotoAsset>>;
  borderline(petName: string): ApiResult<AssetsResponse<PhotoAsset>>;
  borderlineProgress(petName: string): ApiResult<ProgressResponse>;
  negatives(): ApiResult<AssetsResponse<PhotoAsset>>;
  negativesProgress(): ApiResult<ProgressResponse>;
}

export interface ScanService {
  result(): ApiResult<ScanResult>;
  start(payload: ScanStartPayload): ApiResult<{ status: string }>;
  stop(): ApiResult<{ status: string }>;
  review(): ApiResult<ScanReviewResponse>;
  applyReview(payload: { assets: CropSelection[]; pet_names?: string[]; reject?: boolean }): ApiResult<ApplyReviewResponse>;
  skip(assetIds: string[]): ApiResult<{ count?: number }>;
}

export interface BackendServices {
  readonly config: ConfigService;
  readonly pets: PetService;
  readonly refs: ReferenceService;
  readonly negatives: NegativeService;
  readonly suggestions: SuggestionService;
  readonly scan: ScanService;
}

const enc = encodeURIComponent;

export function createBackendServices(): BackendServices {
  return {
    config: {
      load: () => apiResult<ConfigResponse>("/api/config"),
    },
    pets: {
      list: () => apiResult<PetsResponse>("/api/pets"),
      create: payload => apiResult<{ ok: boolean }>("/api/pets", { method: "POST", body: payload }),
      update: (previousName, payload) => apiResult<{ ok: boolean }>(`/api/pets/${enc(previousName)}`, { method: "PATCH", body: payload }),
      delete: (name, localOnly) => {
        const suffix = localOnly ? "?local_only=true" : "";
        return apiResult<{ ok: boolean }>(`/api/pets/${enc(name)}${suffix}`, { method: "DELETE" });
      },
      resetImmich: name => apiResult<{ ok: boolean }>(`/api/pets/${enc(name)}/reset-immich`, { method: "POST" }),
      listImmichPeople: () => apiResult<ImportPeopleResponse>("/api/immich-people"),
      importFromImmich: payload => apiResult<ImportPetResponse>("/api/pets/import", { method: "POST", body: payload }),
    },
    refs: {
      list: petName => apiResult<AssetsResponse<RefAsset>>(`/api/pets/${enc(petName)}/assets`),
      save: (petName, assets) => apiResult<AddRefsResponse>(`/api/pets/${enc(petName)}/assets`, { method: "POST", body: { assets } }),
      remove: (petName, assetId, cropIdx) => {
        const suffix = cropIdx == null ? "" : `?crop_idx=${cropIdx}`;
        return apiResult<unknown>(`/api/pets/${enc(petName)}/assets/${assetId}${suffix}`, { method: "DELETE" });
      },
      clear: petName => apiResult<{ ok: boolean }>(`/api/pets/${enc(petName)}/refs`, { method: "DELETE" }),
      assetCrops: assetId => apiResult<AssetCropsResponse>(`/api/asset/${assetId}/crops`),
    },
    negatives: {
      list: () => apiResult<NegativeAssetsResponse>("/api/negatives"),
      add: assetIds => apiResult<{ ok: boolean; count: number }>("/api/negatives", { method: "POST", body: { asset_ids: assetIds } }),
      remove: assetId => apiResult<{ ok: boolean }>(`/api/negatives/${assetId}`, { method: "DELETE" }),
      clear: () => apiResult<{ ok: boolean }>("/api/negatives/all", { method: "DELETE" }),
    },
    suggestions: {
      refs: petName => apiResult<AssetsResponse<PhotoAsset>>(`/api/pets/${enc(petName)}/suggestions`),
      borderline: petName => apiResult<AssetsResponse<PhotoAsset>>(`/api/pets/${enc(petName)}/borderline`),
      borderlineProgress: petName => apiResult<ProgressResponse>(`/api/pets/${enc(petName)}/borderline/progress`),
      negatives: () => apiResult<AssetsResponse<PhotoAsset>>("/api/suggestions/negatives"),
      negativesProgress: () => apiResult<ProgressResponse>("/api/suggestions/negatives/progress"),
    },
    scan: {
      result: () => apiResult<ScanResult>("/api/scan/result"),
      start: payload => apiResult<{ status: string }>("/api/scan", { method: "POST", body: payload }),
      stop: () => apiResult<{ status: string }>("/api/scan/stop", { method: "POST" }),
      review: () => apiResult<ScanReviewResponse>("/api/scan/review"),
      applyReview: payload => apiResult<ApplyReviewResponse>("/api/scan/review/apply", { method: "POST", body: payload }),
      skip: assetIds => apiResult<{ count?: number }>("/api/skipped", { method: "POST", body: { asset_ids: assetIds } }),
    },
  };
}
