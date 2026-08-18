export type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };
export type ScanReviewBusyAction = "tag" | "refs";
export type AddByIdMode = "ref" | "neg";
export type ToastKind = "" | "success" | "error" | "warn";

export interface Pet {
  name: string;
  description?: string | null;
  ref_count: number;
  person_id?: string | null;
  since?: string | null;
  until?: string | null;
}

export interface CropSelection {
  asset_id: string;
  crop_idx?: number | null;
  bbox?: number[] | null;
}

export interface RefAsset {
  id: string;
  thumb: string;
  key?: string | null;
  crop_idx?: number | null;
  bbox?: number[] | null;
}

export interface PhotoCrop {
  crop_idx: number;
  bbox: number[];
}

export interface PhotoAsset {
  id: string;
  thumb: string;
  filename?: string | null;
  date?: string | null;
  score?: number | null;
  score_margin?: number | null;
  unknown_score?: number | null;
  detection_conf?: number | null;
  pet_name?: string | null;
  crops?: PhotoCrop[];
  crop_idx?: number | null;
  bbox?: number[] | null;
}

export interface ImmichPerson {
  id: string;
  name?: string | null;
}

export interface ConfigResponse {
  immich_external_url: string;
  models_error?: string | null;
}

export interface PetsResponse {
  pets: Pet[];
}

export interface AssetsResponse<TAsset = PhotoAsset> {
  assets: TAsset[];
  threshold?: number;
}

export interface NegativeAssetsResponse {
  assets: RefAsset[];
  count: number;
}

export interface AssetCropsResponse extends PhotoAsset {
  crops?: PhotoCrop[];
}

export interface ScanCounts {
  review?: number;
  low_confidence?: number;
  unknown?: number;
  out_of_range?: number;
  already_tagged?: number;
  failed?: number;
  no_thumb?: number;
  excluded?: number;
}

export interface ScanResult {
  status?: "none" | "running" | "stopped" | "error" | "idle" | string;
  current_date?: string | null;
  counts?: ScanCounts;
  error?: string | null;
}

export interface ScanReviewResponse extends AssetsResponse<PhotoAsset> {
  pets?: string[];
}

export interface ApplyReviewResponse {
  ok?: boolean;
  added: number;
  already_tagged?: number;
  failed?: number;
  negative?: number;
}

export interface AddRefsResponse {
  ok?: boolean;
  count?: number;
  faces_failed?: number;
}

export interface ProgressResponse {
  running?: boolean;
  current?: number;
  total?: number;
}

export interface ImportPeopleResponse {
  people: ImmichPerson[];
}

export interface ImportPetResponse {
  name: string;
  ref_count: number;
}

export interface VersionResponse {
  version: string;
}

export interface PetSavePayload {
  name: string;
  description: string;
  since: string | null;
  until: string | null;
}

export interface ImportPetPayload {
  person_id: string;
  name?: string | null;
  description: string;
  since: string | null;
  until: string | null;
}

export interface ScanStartPayload {
  scan_since: string;
  scan_until: string | null;
  review: true;
}
