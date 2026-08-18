"""File I/O helpers. All functions take an explicit data_dir Path."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("data")


def _atomic_write(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config(data_dir: Path) -> dict:
    f = data_dir / "config.json"
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:
        log.error(f"Corrupted {f}, returning empty config: {e}")
        return {}


def save_config(config: dict, data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(data_dir / "config.json", json.dumps(config, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Pet refs
# ---------------------------------------------------------------------------

def load_pet_refs(pet_name: str, data_dir: Path) -> list[dict]:
    """Return list of {asset_id, face_id}. Handles legacy list-of-strings format."""
    ref_file = data_dir / "pets" / pet_name / "refs.json"
    if not ref_file.exists():
        return []
    try:
        data = json.loads(ref_file.read_text(encoding="utf-8"))
    except Exception as e:
        log.error(f"Corrupted {ref_file}, returning empty refs: {e}")
        return []
    if not data:
        return []
    if isinstance(data[0], str):
        return [{"asset_id": aid, "face_id": None} for aid in data]
    return data


def load_pet_asset_ids(pet_name: str, data_dir: Path) -> list[str]:
    seen: set[str] = set()
    result = []
    for r in load_pet_refs(pet_name, data_dir):
        aid = r["asset_id"]
        if aid not in seen:
            seen.add(aid)
            result.append(aid)
    return result


def save_pet_refs(pet_name: str, refs: list[dict], data_dir: Path) -> None:
    pet_dir = data_dir / "pets" / pet_name
    pet_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(pet_dir / "refs.json", json.dumps(refs, indent=2))


# ---------------------------------------------------------------------------
# Negatives / reject samples
# ---------------------------------------------------------------------------

def normalize_crop_ref(ref) -> dict | None:
    """Normalize legacy string refs and crop-centric dict refs.

    Legacy negatives were asset IDs, meaning "reject this whole asset". New scan
    review rejects can include bbox/crop_idx, meaning "reject this crop only".
    """
    if isinstance(ref, str):
        asset_id = ref.strip()
        return {"asset_id": asset_id} if asset_id else None
    if not isinstance(ref, dict):
        return None

    asset_id = ref.get("asset_id") or ref.get("id")
    if not asset_id:
        return None

    out = {"asset_id": str(asset_id)}
    crop_idx = ref.get("crop_idx")
    if crop_idx is not None:
        try:
            out["crop_idx"] = int(crop_idx)
        except (TypeError, ValueError):
            pass

    bbox = ref.get("bbox")
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        try:
            out["bbox"] = [float(v) for v in bbox]
        except (TypeError, ValueError):
            pass

    face_id = ref.get("face_id")
    if face_id:
        out["face_id"] = str(face_id)
    return out


def is_asset_level_ref(ref: dict) -> bool:
    return ref.get("crop_idx") is None and not ref.get("bbox")


def crop_key(asset_id: str, crop_idx=None, bbox=None) -> str:
    """Stable key for one crop ref. Prefer bbox over crop_idx because YOLO crop
    ordering can shift between runs, while the normalized box identifies the crop."""
    if bbox:
        return f"{asset_id}#bbox:" + ",".join(f"{float(v):.6f}" for v in bbox)
    if crop_idx is not None:
        return f"{asset_id}#{int(crop_idx)}"
    return asset_id


def crop_ref_key(ref: dict) -> str:
    return crop_key(ref["asset_id"], ref.get("crop_idx"), ref.get("bbox"))


def crop_ref_match_keys(ref: dict) -> set[str]:
    if is_asset_level_ref(ref):
        return {ref["asset_id"]}
    keys = {crop_ref_key(ref)}
    if ref.get("bbox"):
        keys.add(crop_key(ref["asset_id"], bbox=ref["bbox"]))
    if ref.get("crop_idx") is not None:
        keys.add(crop_key(ref["asset_id"], crop_idx=ref["crop_idx"]))
    return keys


def merge_crop_refs(refs: list) -> list[dict]:
    normalized = [r for r in (normalize_crop_ref(ref) for ref in refs) if r is not None]
    asset_level_ids = {r["asset_id"] for r in normalized if is_asset_level_ref(r)}
    result: list[dict] = []
    seen: set[str] = set()
    for ref in normalized:
        if ref["asset_id"] in asset_level_ids and not is_asset_level_ref(ref):
            continue
        key = crop_ref_key(ref)
        if key in seen:
            continue
        seen.add(key)
        result.append(ref)
    return result


def load_negative_refs(data_dir: Path) -> list[dict]:
    path = data_dir / "negatives.json"
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.error(f"Corrupted {path}, returning empty negatives: {e}")
        return []
    if not isinstance(raw, list):
        log.error(f"Corrupted {path}, expected a list, returning empty negatives")
        return []
    return merge_crop_refs(raw)


def save_negative_refs(refs: list[dict], data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(data_dir / "negatives.json", json.dumps(merge_crop_refs(refs), indent=2))


def load_negative_ids(data_dir: Path) -> list[str]:
    seen: set[str] = set()
    ids = []
    for ref in load_negative_refs(data_dir):
        aid = ref["asset_id"]
        if aid not in seen:
            seen.add(aid)
            ids.append(aid)
    return ids


def load_negative_asset_ids(data_dir: Path) -> list[str]:
    return [ref["asset_id"] for ref in load_negative_refs(data_dir) if is_asset_level_ref(ref)]


def save_negative_ids(ids: list[str], data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(data_dir / "negatives.json", json.dumps(ids, indent=2))


# ---------------------------------------------------------------------------
# Skipped
# ---------------------------------------------------------------------------

def load_skipped_ids(data_dir: Path) -> list[str]:
    path = data_dir / "skipped.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.error(f"Corrupted {path}, returning empty skipped list: {e}")
        return []


def save_skipped_ids(ids: list[str], data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(data_dir / "skipped.json", json.dumps(ids, indent=2))


# ---------------------------------------------------------------------------
# Scan timestamp
# ---------------------------------------------------------------------------

def load_last_timestamp(data_dir: Path) -> str:
    path = data_dir / "last_scan_timestamp.txt"
    default = datetime.now(timezone.utc).date().isoformat() + "T00:00:00.000Z"
    if not path.exists():
        path.write_text(default + "\n", encoding="utf-8")
        return default
    val = path.read_text(encoding="utf-8").strip()
    return val if val else default


def save_last_timestamp(ts: str, data_dir: Path) -> None:
    _atomic_write(data_dir / "last_scan_timestamp.txt", ts.strip() + "\n")


# ---------------------------------------------------------------------------
# Poll status
# ---------------------------------------------------------------------------

def load_poll_status(data_dir: Path) -> dict:
    path = data_dir / "last_poll_status.json"
    if not path.exists():
        return {"status": "never"}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.error(f"Corrupted {path}, returning default status: {e}")
        return {"status": "never"}


def write_poll_status(data_dir: Path, payload: dict) -> None:
    try:
        _atomic_write(data_dir / "last_poll_status.json", json.dumps(payload))
    except Exception:
        pass
