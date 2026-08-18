"""Logistic regression classifier over CLIP embeddings."""

import logging
import os
import random

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

import data
import embedder as emb

log = logging.getLogger("classifier")


def _negative_sample_limit() -> int | None:
    raw = os.environ.get("NEGATIVE_SAMPLE_LIMIT", "").strip()
    if not raw:
        return None
    try:
        limit = int(raw)
    except ValueError:
        log.warning(f"Invalid NEGATIVE_SAMPLE_LIMIT={raw!r}; using all negatives")
        return None
    if limit <= 0:
        return None
    return limit


def build_classifier(
    pet_names: list[str],
    refs_per_pet: dict[str, list[dict]],
    negative_refs: list | None = None,
) -> tuple[list[str], LogisticRegression, StandardScaler] | None:
    all_vecs = []
    all_labels = []
    unknown_idx = len(pet_names)
    names = pet_names + ["unknown"]

    for i, name in enumerate(pet_names):
        refs = refs_per_pet.get(name, [])
        log.info(f"Embedding {len(refs)} refs for '{name}'...")
        for ref in refs:
            asset_id = ref["asset_id"]
            bbox = ref.get("bbox")
            if bbox:
                vec = emb.embed_crop_by_bbox(asset_id, bbox)
                if vec is not None:
                    all_vecs.append(vec)
                    all_labels.append(i)
                else:
                    log.warning(f"  Skipped ref {asset_id} for '{name}' (could not embed crop)")
            else:
                vecs = emb.embed_asset_crops(asset_id, require_animal=True)
                if not vecs:
                    vecs = emb.embed_asset_crops(asset_id, require_animal=False)
                if vecs:
                    all_vecs.extend(vecs)
                    all_labels.extend([i] * len(vecs))
                else:
                    log.warning(f"  Skipped ref {asset_id} for '{name}' (thumbnail unavailable)")

    total_refs = sum(len(refs) for refs in refs_per_pet.values())
    negative_refs = data.merge_crop_refs(negative_refs or [])
    if negative_refs:
        limit = _negative_sample_limit()
        if limit is not None and len(negative_refs) > limit:
            negative_refs = random.Random(0).sample(
                sorted(negative_refs, key=data.crop_ref_key),
                limit,
            )
            log.info(f"Subsampled negatives to {limit} (NEGATIVE_SAMPLE_LIMIT; {total_refs} refs)")
        else:
            log.info(f"Using all {len(negative_refs)} negative samples")

        log.info(f"Embedding {len(negative_refs)} negative samples...")
        for ref in negative_refs:
            aid = ref["asset_id"]
            if ref.get("bbox"):
                vec = emb.embed_crop_by_bbox(aid, ref["bbox"])
                vecs = [vec] if vec is not None else []
            elif ref.get("crop_idx") is not None:
                vecs = [
                    vec
                    for info, vec in emb.get_crops_and_embed(aid)
                    if info.get("crop_idx") == ref["crop_idx"]
                ]
            else:
                vecs = emb.embed_asset_crops(aid)
            for vec in vecs:
                all_vecs.append(vec)
                all_labels.append(unknown_idx)

    if not all_vecs:
        log.warning("No embeddings computed, skipping classifier training.")
        return None

    X = np.array(all_vecs, dtype=np.float64)
    y = np.array(all_labels, dtype=np.intp)

    if unknown_idx not in y:
        X = np.vstack([X, np.zeros((1, X.shape[1]))])
        y = np.append(y, unknown_idx)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    clf = LogisticRegression(max_iter=1000, random_state=0)
    clf.fit(X_scaled, y)
    log.info(f"Classifier trained on {len(y)} samples, classes: {names} ({sum(y==unknown_idx)} unknown)")
    return names, clf, scaler


def score_breakdown(vec, names, clf, scaler) -> list[dict]:
    v = np.asarray(vec, dtype=np.float64).reshape(1, -1)
    probs = clf.predict_proba(scaler.transform(v))[0]
    return [
        {"name": name, "score": float(prob)}
        for name, prob in sorted(zip(names, probs), key=lambda item: -item[1])
    ]


def classify_with_scores(vec, names, clf, scaler) -> tuple[str, float, list[dict]]:
    scores = score_breakdown(vec, names, clf, scaler)
    top = scores[0]
    return top["name"], top["score"], scores


def classify(vec, names, clf, scaler) -> tuple[str, float]:
    scores = score_breakdown(vec, names, clf, scaler)
    top = scores[0]
    return top["name"], top["score"]
