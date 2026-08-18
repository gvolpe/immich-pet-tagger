import { escapeHtml, fmtDate } from "./dom.js";
import { err, fromNullable, matchOption, matchResult, ok, tryCatchSync, type Result } from "./fp.js";
import type { CropSelection, PhotoAsset, RefAsset } from "./types.js";

function parseOptionalBbox(value: string | undefined): Result<number[] | null, string> {
  return matchOption<string, Result<number[] | null, string>>(fromNullable(value), {
    none: () => ok<number[] | null, string>(null),
    some: json => matchResult(tryCatchSync(
      () => JSON.parse(json) as number[],
      error => `Invalid crop bbox: ${error instanceof Error ? error.message : String(error)}`,
    ), {
      ok: bbox => ok<number[] | null, string>(bbox),
      err: message => err<string, number[] | null>(message),
    }),
  });
}

export function readCropData(thumb: HTMLElement): Result<CropSelection, string> {
  const assetId = fromNullable(thumb.dataset.assetId);
  const cropIdx = thumb.dataset.cropIdx !== undefined && thumb.dataset.cropIdx !== ""
    ? Number.parseInt(thumb.dataset.cropIdx, 10)
    : null;
  const bbox = parseOptionalBbox(thumb.dataset.bbox);
  return matchOption<string, Result<CropSelection, string>>(assetId, {
    none: () => err<string, CropSelection>("Photo thumb is missing its asset id"),
    some: id => matchResult(bbox, {
      ok: value => ok<CropSelection, string>({ asset_id: id, crop_idx: cropIdx, bbox: value }),
      err: message => err<string, CropSelection>(message),
    }),
  });
}

export function getCropData(thumb: HTMLElement): CropSelection {
  return matchResult(readCropData(thumb), {
    ok: crop => crop,
    err: message => { throw new Error(message); },
  });
}

export function cropSelectionKey(crop: CropSelection): string {
  return crop.crop_idx != null ? `${crop.asset_id}_${crop.crop_idx}` : crop.asset_id;
}

export function scanReviewAssetKey(asset: PhotoAsset): string {
  return asset.crop_idx != null ? `${asset.id}_${asset.crop_idx}` : asset.id;
}

export function renderPhotoItems(asset: PhotoAsset, threshold: number, immichUrl: string): string[] {
  const scoreBadge = asset.score != null
    ? `<div class="score-badge ${asset.score < threshold ? "score-low" : "score-ok"}">${Math.round(asset.score * 100)}%</div>`
    : "";
  const details: string[] = [];
  if (asset.score_margin != null) details.push(`margin ${Math.round(asset.score_margin * 100)}%`);
  if (asset.unknown_score != null) details.push(`unknown ${Math.round(asset.unknown_score * 100)}%`);
  if (asset.detection_conf != null) details.push(`YOLO ${Math.round(asset.detection_conf * 100)}%`);
  const detailText = details.length ? ` · ${details.join(" · ")}` : "";
  const title = asset.pet_name
    ? `${fmtDate(asset.date)} · ${Math.round((asset.score ?? 0) * 100)}% ${asset.pet_name}${detailText}`
    : `${asset.filename || ""} · ${fmtDate(asset.date)}`;

  const makeItem = (key: string, src: string, cropIdx: number | null, bbox: number[] | null): string => {
    const cropIdxAttr = cropIdx != null ? `data-crop-idx="${cropIdx}"` : "";
    const bboxAttr = bbox ? `data-bbox='${JSON.stringify(bbox)}'` : "";
    return `<div class="photo-thumb" id="th-${key}" data-asset-id="${asset.id}" ${cropIdxAttr} ${bboxAttr}
      onclick="toggleSelect(event,'${key}')" title="${escapeHtml(title)}">
      <img src="${src}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg/>'">
      <a class="photo-open" href="${immichUrl}/photos/${asset.id}" target="_blank" rel="noopener" onclick="event.stopPropagation()">⤢</a>
      <div class="photo-check">✓</div>
      ${scoreBadge}
    </div>`;
  };

  if (asset.crops && asset.crops.length > 0) {
    return asset.crops.map(crop =>
      makeItem(`${asset.id}_${crop.crop_idx}`, `/api/crop/${asset.id}?bbox=${crop.bbox.join(",")}`, crop.crop_idx, crop.bbox)
    );
  }

  const cropIdx = asset.crop_idx != null ? asset.crop_idx : null;
  const key = cropIdx != null ? `${asset.id}_${cropIdx}` : asset.id;
  return [makeItem(key, asset.thumb, cropIdx, asset.bbox || null)];
}

export function markGridItems(assets: PhotoAsset[], refsItems: RefAsset[], negativeKeys: string[]): void {
  const refKeys = new Set(refsItems.map(ref => ref.crop_idx != null ? `${ref.id}_${ref.crop_idx}` : ref.id));
  const negSet = new Set(negativeKeys);
  assets.forEach(asset => {
    const keys = asset.crops && asset.crops.length > 0
      ? asset.crops.map(crop => `${asset.id}_${crop.crop_idx}`)
      : [asset.crop_idx != null ? `${asset.id}_${asset.crop_idx}` : asset.id];
    keys.forEach(key => {
      const thumb = document.getElementById(`th-${key}`);
      if (!thumb) return;
      if (refKeys.has(key) || refKeys.has(asset.id)) thumb.classList.add("is-ref");
      if (negSet.has(key) || negSet.has(asset.id)) thumb.classList.add("is-neg");
    });
  });
}
