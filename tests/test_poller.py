"""Tests for poller helpers, in particular the poll cursor advance logic."""
import poller
import data


def test_advance_ms_increments_millisecond():
    assert poller._advance_ms("2026-07-25T14:35:03.549Z") == "2026-07-25T14:35:03.550Z"


def test_advance_ms_rolls_over_second():
    assert poller._advance_ms("2026-07-25T14:35:03.999Z") == "2026-07-25T14:35:04.000Z"


def test_advance_ms_rolls_over_day():
    assert poller._advance_ms("2026-07-25T23:59:59.999Z") == "2026-07-26T00:00:00.000Z"


def test_advance_ms_result_excludes_source_asset():
    """The whole point: an inclusive createdAfter/takenAfter filter using the
    advanced cursor must not match an asset with the original timestamp."""
    original = "2026-07-25T14:35:03.549Z"
    advanced = poller._advance_ms(original)
    assert advanced > original


# ---------------------------------------------------------------------------
# classify_outcome
# ---------------------------------------------------------------------------

def test_classify_outcome_unknown():
    assert poller.classify_outcome("unknown", 0.99, "2026-06-01T00:00:00Z", {}) == "unknown"


def test_classify_outcome_out_of_range_beats_low_confidence():
    """A low-confidence guess for a pet who was not even in range on that date must
    be dropped as out_of_range, not surfaced as a low-confidence review candidate."""
    cfg = {"since": "2025-01-01", "until": "2025-12-31"}
    outcome = poller.classify_outcome("Dobby", 0.67, "2026-06-01T00:00:00Z", cfg, threshold=0.8)
    assert outcome == "out_of_range"


def test_classify_outcome_out_of_range_beats_confident():
    cfg = {"since": "2025-01-01", "until": "2025-12-31"}
    outcome = poller.classify_outcome("Dobby", 0.95, "2026-06-01T00:00:00Z", cfg, threshold=0.8)
    assert outcome == "out_of_range"


def test_classify_outcome_low_confidence_when_in_range():
    cfg = {"since": "2025-01-01", "until": "2027-12-31"}
    outcome = poller.classify_outcome("Dobby", 0.67, "2026-06-01T00:00:00Z", cfg, threshold=0.8)
    assert outcome == "low_confidence"


def test_classify_outcome_confident_when_in_range():
    cfg = {"since": "2025-01-01", "until": "2027-12-31"}
    outcome = poller.classify_outcome("Dobby", 0.95, "2026-06-01T00:00:00Z", cfg, threshold=0.8)
    assert outcome == "confident"


def test_classify_outcome_no_date_bounds_never_out_of_range():
    outcome = poller.classify_outcome("Dobby", 0.67, "2026-06-01T00:00:00Z", {}, threshold=0.8)
    assert outcome == "low_confidence"


def test_run_poll_cycle_skips_explicit_negative_assets(tmp_path, monkeypatch):
    data.save_config({"Czela": {"person_id": "person-czela"}}, tmp_path)
    data.save_pet_refs("person-czela", [{"asset_id": "ref-czela"}], tmp_path)
    data.save_negative_ids(["wrong-photo"], tmp_path)

    posted = []

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "unknown"], object(), object()),
    )
    monkeypatch.setattr(poller.clf_mod, "classify", lambda vec, names, clf, scaler: ("Czela", 1.0))
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [
            ("wrong-photo", "2026-08-09T12:00:00.000Z"),
            ("good-photo", "2026-08-09T12:01:00.000Z"),
        ],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: set())
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: posted.append(aid) or f"face-{aid}",
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(poller.emb, "crop_animals", lambda img, conf=None: [])
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: [1.0, 0.0])
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
    )

    assert posted == ["good-photo"]
    assert counts["excluded"] == 1
    assert counts["added"] == 1


def test_run_poll_cycle_skips_only_matching_negative_crop(tmp_path, monkeypatch):
    class ImageStub:
        size = (100, 100)

    data.save_config({"Czela": {"person_id": "person-czela"}}, tmp_path)
    data.save_pet_refs("person-czela", [{"asset_id": "ref-czela"}], tmp_path)
    data.save_negative_refs([
        {"asset_id": "two-crops", "crop_idx": 0, "bbox": [0.0, 0.0, 0.5, 0.5]},
    ], tmp_path)

    posted = []

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_refs: (["Czela", "unknown"], object(), object()),
    )
    monkeypatch.setattr(poller.clf_mod, "classify", lambda vec, names, clf, scaler: ("Czela", 1.0))
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [("two-crops", "2026-08-09T12:00:00.000Z")],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: set())
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: posted.append((aid, bbox)) or f"face-{aid}",
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: ImageStub())
    monkeypatch.setattr(
        poller.emb,
        "crop_animals",
        lambda img, conf=None: [
            ([0.0, 0.0, 0.5, 0.5], "rejected-crop"),
            ([0.5, 0.0, 1.0, 0.5], "valid-crop"),
        ],
    )
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: img)
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
    )

    assert posted == [("two-crops", [0.5, 0.0, 1.0, 0.5])]
    assert counts["excluded"] == 1
    assert counts["added"] == 1


def test_run_poll_cycle_does_not_cross_tag_reference_assets(tmp_path, monkeypatch):
    data.save_config(
        {
            "Czela": {"person_id": "person-czela"},
            "Rysiaczek": {"person_id": "person-rys"},
        },
        tmp_path,
    )
    data.save_pet_refs("person-czela", [{"asset_id": "czela-ref"}], tmp_path)
    data.save_pet_refs("person-rys", [{"asset_id": "rys-ref"}], tmp_path)

    posted = []

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "Rysiaczek", "unknown"], object(), object()),
    )
    monkeypatch.setattr(poller.clf_mod, "classify", lambda vec, names, clf, scaler: ("Rysiaczek", 1.0))
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [
            ("czela-ref", "2026-08-09T12:00:00.000Z"),
            ("new-photo", "2026-08-09T12:01:00.000Z"),
        ],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: set())
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: posted.append((aid, person_id)) or f"face-{aid}",
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(poller.emb, "crop_animals", lambda img, conf=None: [])
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: [1.0, 0.0])
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
    )

    assert posted == [("new-photo", "person-rys")]
    assert counts["already_tagged"] == 1
    assert counts["added"] == 1


def test_run_poll_cycle_does_not_add_different_pet_when_asset_already_has_known_pet(tmp_path, monkeypatch):
    data.save_config(
        {
            "Czela": {"person_id": "person-czela"},
            "Rysiaczek": {"person_id": "person-rys"},
        },
        tmp_path,
    )
    data.save_pet_refs("person-czela", [{"asset_id": "czela-ref"}], tmp_path)
    data.save_pet_refs("person-rys", [{"asset_id": "rys-ref"}], tmp_path)

    posted = []

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "Rysiaczek", "unknown"], object(), object()),
    )
    monkeypatch.setattr(poller.clf_mod, "classify", lambda vec, names, clf, scaler: ("Rysiaczek", 1.0))
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [("tagged-czela", "2026-08-09T12:00:00.000Z")],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: {"person-czela"})
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: posted.append((aid, person_id)) or f"face-{aid}",
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(poller.emb, "crop_animals", lambda img, conf=None: [])
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: [1.0, 0.0])
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
    )

    assert posted == []
    assert counts["already_tagged"] == 1
    assert counts["added"] == 0


def test_review_scan_collects_confident_crop_candidates_without_tagging(tmp_path, monkeypatch):
    data.save_config(
        {
            "Czela": {"person_id": "person-czela"},
            "Rysiaczek": {"person_id": "person-rys"},
        },
        tmp_path,
    )
    data.save_pet_refs("person-czela", [{"asset_id": "czela-ref"}], tmp_path)
    data.save_pet_refs("person-rys", [{"asset_id": "rys-ref"}], tmp_path)

    posted = []

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "Rysiaczek", "unknown"], object(), object()),
    )
    monkeypatch.setattr(
        poller.clf_mod,
        "classify",
        lambda vec, names, clf, scaler: ("Czela", 0.98) if vec == "czela-crop" else ("Rysiaczek", 0.96),
    )
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [("two-pets", "2026-08-09T12:00:00.000Z")],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: set())
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: posted.append((aid, person_id)) or f"face-{aid}",
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(
        poller.emb,
        "crop_animals",
        lambda img, conf=None: [
            ([0.0, 0.0, 0.5, 0.5], "czela-crop"),
            ([0.5, 0.0, 1.0, 0.5], "rys-crop"),
        ],
    )
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: img)
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    review = []
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        review_out=review,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
        review_only=True,
    )

    assert posted == []
    assert counts["review"] == 2
    assert counts["added"] == 0
    assert [(r["asset_id"], r["pet_name"], r["crop_idx"]) for r in review] == [
        ("two-pets", "Czela", 0),
        ("two-pets", "Rysiaczek", 1),
    ]


def test_review_scan_surfaces_different_pet_even_when_asset_already_has_known_pet(tmp_path, monkeypatch):
    data.save_config(
        {
            "Czela": {"person_id": "person-czela"},
            "Rysiaczek": {"person_id": "person-rys"},
        },
        tmp_path,
    )
    data.save_pet_refs("person-czela", [{"asset_id": "czela-ref"}], tmp_path)
    data.save_pet_refs("person-rys", [{"asset_id": "rys-ref"}], tmp_path)

    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "Rysiaczek", "unknown"], object(), object()),
    )
    monkeypatch.setattr(poller.clf_mod, "classify", lambda vec, names, clf, scaler: ("Rysiaczek", 1.0))
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [("tagged-czela", "2026-08-09T12:00:00.000Z")],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: {"person-czela"})
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: (_ for _ in ()).throw(AssertionError("must not tag in review mode")),
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(poller.emb, "crop_animals", lambda img, conf=None: [])
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: [1.0, 0.0])
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    review = []
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        review_out=review,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
        review_only=True,
    )

    assert counts["review"] == 1
    assert counts["added"] == 0
    assert review[0]["asset_id"] == "tagged-czela"
    assert review[0]["pet_name"] == "Rysiaczek"


def test_run_poll_cycle_can_disable_whole_image_fallback(tmp_path, monkeypatch):
    data.save_config({"Czela": {"person_id": "person-czela"}}, tmp_path)
    data.save_pet_refs("person-czela", [{"asset_id": "czela-ref"}], tmp_path)

    monkeypatch.setattr(poller, "FALLBACK_ENABLE", False)
    monkeypatch.setattr(
        poller.clf_mod,
        "build_classifier",
        lambda pet_names, refs_per_pet, negative_ids: (["Czela", "unknown"], object(), object()),
    )
    monkeypatch.setattr(
        poller.clf_mod,
        "classify",
        lambda vec, names, clf, scaler: (_ for _ in ()).throw(AssertionError("must not classify fallback image")),
    )
    monkeypatch.setattr(
        poller.imm,
        "fetch_assets_taken_after",
        lambda since, taken_before=None: [("beer-photo", "2026-08-09T12:00:00.000Z")],
    )
    monkeypatch.setattr(poller.imm, "fetch_asset_face_person_ids", lambda aid: set())
    monkeypatch.setattr(
        poller.imm,
        "post_face_sync",
        lambda aid, person_id, bbox, img_size: (_ for _ in ()).throw(AssertionError("must not tag fallback image")),
    )
    monkeypatch.setattr(poller.emb, "fetch_thumbnail", lambda aid: object())
    monkeypatch.setattr(poller.emb, "crop_animals", lambda img, conf=None: [])
    monkeypatch.setattr(poller.emb, "embed_image", lambda img: (_ for _ in ()).throw(AssertionError("must not embed fallback image")))
    monkeypatch.setattr(poller.emb, "store_crops", lambda aid, pairs: None)
    monkeypatch.setattr(poller.emb, "reset_batch_stats", lambda: None)
    monkeypatch.setattr(poller.emb, "get_avg_batch_size", lambda: 1.0)
    monkeypatch.setattr(poller.emb, "save_embed_cache", lambda: None)

    counts = {}
    review = []
    poller.run_poll_cycle(
        str(tmp_path),
        live_counts=counts,
        review_out=review,
        manual=True,
        scan_since="2026-08-09T00:00:00.000Z",
        review_only=True,
    )

    assert review == []
    assert counts["review"] == 0
    assert counts["no_animal"] == 1
