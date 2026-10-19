# ABOUTME: Checks fit-only selection, complete search accounting and immutable freezes.
# ABOUTME: Exercises actual adapters and rejects corrupt or incompatible owned artifacts.

from dataclasses import replace
from pathlib import Path
import json

import pytest

from meal_prediction import experiment
from meal_prediction.records import Dataset, Exposure, Split, Target


def tiny_dataset():
    events = tuple(Exposure(str(i), str(i % 3), str(i % 4), None,
        {"cuisines": ("Mexican" if i % 2 else "Korean",), "price": "low" if i % 3 else "high"},
        {"cuisine_preferences": ("Mexican",)}) for i in range(18))
    targets = {event.event_id: Target(event.event_id, int(i % 3 == 0 or i % 4 == 0), None) for i, event in enumerate(events)}
    data = Dataset("uci", {"sourceSha256": "a" * 64}, events, targets, ())
    return data, Split(tuple(map(str, range(8))), tuple(map(str, range(8, 12))), tuple(map(str, range(12, 18))), ())


def test_test_inputs_cannot_change_freeze(tmp_path):
    data, split = tiny_dataset()
    changed_events = tuple(replace(event, meal={"cuisines": ("test-secret",)}) if event.event_id in split.test_ids else event for event in data.events)
    changed = replace(data, events=changed_events, targets={key: replace(value, y=1-value.y) if key in split.test_ids else value for key, value in data.targets.items()})
    before = experiment.fit_experiment(experiment.development_only(data, split), split, tmp_path / "before", smoke=True)
    after = experiment.fit_experiment(experiment.development_only(changed, split), split, tmp_path / "after", smoke=True)
    for key in ("selection", "fitting_ids", "development_sha256", "feature_hashes", "fitting_rows_sha256"):
        assert before[key] == after[key]
    assert before["fitting_ids"] == list(split.train_ids + split.development_ids)
    assert before["selection"]["primary_preset"] == "F1"
    report = experiment.score_experiment(tmp_path / "before", tuple(e for e in data.events if e.event_id in split.test_ids), data.targets, tmp_path / "report")
    report_changed = experiment.score_experiment(tmp_path / "before", tuple(e for e in changed.events if e.event_id in split.test_ids), changed.targets, tmp_path / "changed-report")
    assert report.freeze_sha256 == report_changed.freeze_sha256
    assert json.loads((tmp_path / "before/manifest.json").read_text()) == before
    assert set(report.metrics) == {"F1/M1/42", "F1/M2/42", "F1/M3/42", "global", "personal"}
    with pytest.raises(ValueError, match="test|partition"):
        experiment.fit_experiment(data, split, tmp_path / "leaked", smoke=True)


def test_empty_or_one_class_fit_is_not_estimable(tmp_path):
    data, split = tiny_dataset()
    development = experiment.development_only(data, split)
    empty_split = replace(split, train_ids=(), development_ids=split.train_ids + split.development_ids)
    manifest = experiment.fit_experiment(development, empty_split, tmp_path / "empty", smoke=True)
    assert manifest["status"] == "not_estimable"
    assert manifest["selection"]["candidate"] is None
    assert len(manifest["grid_results"]) == 3
    assert all(row["reason"] == "empty_fit" for row in manifest["grid_results"])
    one = replace(development, targets={key: replace(target, y=0) for key, target in development.targets.items()})
    manifest = experiment.fit_experiment(one, split, tmp_path / "one", smoke=True)
    assert manifest["status"] == "not_estimable"
    assert all(row["reason"] == "single_class" for row in manifest["grid_results"])
    assert set(manifest["artifacts"]) == {"global", "personal"}


def test_selection_ties_and_failed_settings_do_not_expand_grid():
    rows = [
        {"family": "M2", "preset": "F1", "grid_index": 0, "status": "ok", "development_loss": 0.4},
        {"family": "M1", "preset": "F1", "grid_index": 1, "status": "ok", "development_loss": 0.4},
        {"family": "M1", "preset": "F1", "grid_index": 0, "status": "failed", "development_loss": None},
        {"family": "M3", "preset": "F1", "grid_index": 0, "status": "ok", "development_loss": 0.6},
    ]
    selected = experiment.select_settings(rows, primary_preset="F1", control_losses={"personal": 0.5, "global": 0.5})
    assert selected["candidate"] == "M1" and selected["reference"] == "global"
    assert selected["settings"]["F1/M1"]["grid_index"] == 1
    assert selected["settings"]["F1/M2"]["grid_index"] == 0


def test_all_nine_settings_and_selected_seeds_are_recorded(tmp_path):
    data, split = tiny_dataset()
    manifest = experiment.fit_experiment(experiment.development_only(data, split), split, tmp_path / "full")
    assert len(manifest["grid_results"]) == 54
    for preset in ("F0", "F1"):
        for family in ("M1", "M2", "M3"):
            rows = [row for row in manifest["grid_results"] if row["preset"] == preset and row["family"] == family]
            assert [row["grid_index"] for row in rows] == list(range(9))
            assert all(row["seed"] == 42 for row in rows)
            assert all(f"{preset}/{family}/{seed}" in manifest["artifacts"] for seed in (42, 43, 44))
    assert manifest["status"] == "complete"
    assert manifest["selection"]["reference"] in ("global", "personal")


def test_score_verifies_all_hashes_and_runtime_before_loading(tmp_path):
    data, split = tiny_dataset()
    freeze = tmp_path / "freeze"
    manifest = experiment.fit_experiment(experiment.development_only(data, split), split, freeze, smoke=True)
    events = tuple(event for event in data.events if event.event_id in split.test_ids)
    artifact = freeze / manifest["artifacts"]["F1/M1/42"]["path"]
    artifact.write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="hash"):
        experiment.score_experiment(freeze, events, data.targets, tmp_path / "bad")
    with pytest.raises(FileExistsError):
        experiment.fit_experiment(experiment.development_only(data, split), split, freeze, smoke=True)


def test_score_changes_labels_only_in_metrics_and_requires_exact_ids(tmp_path):
    data, split = tiny_dataset()
    freeze = tmp_path / "freeze"
    manifest = experiment.fit_experiment(experiment.development_only(data, split), split, freeze, smoke=True)
    events = tuple(event for event in data.events if event.event_id in split.test_ids)
    before = experiment.score_experiment(freeze, events, data.targets, tmp_path / "a")
    changed = {key: replace(target, y=1-target.y) for key, target in data.targets.items()}
    after = experiment.score_experiment(freeze, events[::-1], changed, tmp_path / "b")
    assert before.probabilities == after.probabilities
    assert before.metrics != after.metrics
    assert before.freeze_sha256 == after.freeze_sha256
    assert before.test_ids == split.test_ids
    assert json.loads((freeze / "manifest.json").read_text()) == manifest
    with pytest.raises(ValueError, match="test.*IDs|IDs"):
        experiment.score_experiment(freeze, events[:-1], data.targets, tmp_path / "missing")


def test_pilot_requires_development_phase_and_pending_required_controls(tmp_path):
    data, split = tiny_dataset()
    with pytest.raises(ValueError, match="development"):
        experiment.fit_experiment(replace(data, source="pilot", manifest={"phase": "final"}), split, tmp_path / "pilot")
    with pytest.raises(NotImplementedError, match="heuristic|Task"):
        experiment.fit_experiment(replace(data, source="pilot", manifest={"phase": "development"}), split, tmp_path / "pilot")


def test_invalid_candidate_predictions_are_failed_grid_slots(tmp_path, monkeypatch):
    import numpy as np
    from meal_prediction.models import FAMILIES
    from meal_prediction.models.base import FittedModel

    class InvalidProbability(FittedModel):
        def predict_proba(self, batch):
            return np.full(len(batch.ids), np.nan)

    # Unit-boundary double for invalid library output; other two adapters remain real.
    monkeypatch.setattr(experiment, "FAMILIES", (("M1", FAMILIES[0][1], lambda *args: InvalidProbability()),) + FAMILIES[1:])
    data, split = tiny_dataset()
    manifest = experiment.fit_experiment(experiment.development_only(data, split), split, tmp_path / "invalid", smoke=True)
    invalid = [row for row in manifest["grid_results"] if row["family"] == "M1"]
    assert len(invalid) == 1 and invalid[0]["status"] == "failed"
    assert invalid[0]["reason"] == "invalid_development_prediction"
    assert "F1/M1" not in manifest["selection"]["settings"]
    assert manifest["status"] == "incomplete"


@pytest.mark.parametrize("incompatibility", ["runtime", "other_artifact", "split", "path"])
def test_incompatible_freeze_is_rejected_before_any_pickle_execution(tmp_path, incompatibility):
    import hashlib
    import pickle
    from meal_prediction.report import json_bytes

    data, split = tiny_dataset()
    freeze = tmp_path / "freeze"
    manifest = experiment.fit_experiment(experiment.development_only(data, split), split, freeze, smoke=True)
    marker = tmp_path / "pickle-was-executed"

    class Payload:
        def __reduce__(self):
            return Path.touch, (marker,)

    entry = manifest["artifacts"]["F1/M1/42"]
    payload = pickle.dumps(Payload())
    (freeze / entry["path"]).write_bytes(payload)
    entry["sha256"] = hashlib.sha256(payload).hexdigest()
    if incompatibility == "runtime":
        manifest["runtime"]["python"] = "0.0.0"
    elif incompatibility == "other_artifact":
        (freeze / manifest["artifacts"]["personal"]["path"]).write_bytes(b"corrupt later artifact")
    elif incompatibility == "split":
        manifest["split"]["test_ids"] = []
    else:
        manifest["feature_hashes"]["F1"]["path"] = "../outside.json"
    contents = json_bytes(manifest)
    (freeze / "manifest.json").write_bytes(contents)
    (freeze / "manifest.sha256").write_text(hashlib.sha256(contents).hexdigest() + "\n")
    events = tuple(event for event in data.events if event.event_id in split.test_ids)
    with pytest.raises(ValueError, match="runtime|hash|unsafe"):
        experiment.score_experiment(freeze, events, data.targets, tmp_path / "report")
    assert not marker.exists()
    assert not (tmp_path / "report").exists()


def test_not_estimable_freeze_still_reports_available_baselines(tmp_path):
    data, split = tiny_dataset()
    one = replace(data, targets={key: replace(target, y=0) for key, target in data.targets.items()})
    freeze = tmp_path / "one"
    experiment.fit_experiment(experiment.development_only(one, split), split, freeze, smoke=True)
    events = tuple(event for event in data.events if event.event_id in split.test_ids)
    report = experiment.score_experiment(freeze, events, one.targets, tmp_path / "report")
    assert report.status == "not_estimable" and set(report.metrics) == {"global", "personal"}
    assert report.selected_comparison["candidate"] is None
    assert all(metric.status == "single_class" for metric in report.metrics.values())


def test_pilot_internal_control_order_requires_real_calibrated_heuristic(tmp_path):
    from datetime import datetime, timedelta, timezone
    import numpy as np
    from meal_prediction.models.base import load_fitted

    instant = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events = tuple(Exposure(str(i), f"p{i}", "meal", instant+timedelta(hours=i),
        {"spiciness": i % 5, "heaviness": 2, "primaryIngredients": [], "allergens": [], "weather": []}, {}) for i in range(6))
    targets = {row.event_id: Target(row.event_id, i % 2, row.displayed_at+timedelta(seconds=1)) for i, row in enumerate(events)}
    assert experiment._control_order("pilot") == ("global", "personal", "heuristic")
    assert experiment._control_order("uci") == ("global", "personal")
    with pytest.raises(ValueError, match="control"):
        experiment.select_settings([], primary_preset="F3", control_losses={"global": .5, "personal": .5}, source="pilot")
    with pytest.raises(ValueError, match="control"):
        experiment.select_settings([], primary_preset="F1", control_losses={"global": .5, "personal": .5, "heuristic": .4}, source="uci")
    models = {kind: experiment._fit_control(kind, events, targets) for kind in experiment._control_order("pilot")}
    scored = (replace(events[0], event_id="score", participant_id="new", displayed_at=instant+timedelta(days=8)),)
    values = {kind: fitted.predict_proba(experiment._control_batch(scored))[0] for kind, fitted in models.items()}
    assert set(values) == {"global", "personal", "heuristic"} and np.isfinite(tuple(values.values())).all()
    selected = experiment.select_settings([], primary_preset="F3", control_losses={"global": .5, "personal": .5, "heuristic": .4}, source="pilot")
    assert selected["reference"] == "heuristic" and selected["tie_order"]["controls"] == ["global", "personal", "heuristic"]
    selected = experiment.select_settings([], primary_preset="F3", control_losses={"global": .5, "personal": .5, "heuristic": .5}, source="pilot")
    assert selected["reference"] == "global"
    saved = experiment._save_model(tmp_path, "heuristic", models["heuristic"], preset=None, family="heuristic", seed=None, params={})
    np.testing.assert_array_equal(load_fitted(tmp_path / saved["path"]).predict_proba(experiment._control_batch(scored)), [values["heuristic"]])
