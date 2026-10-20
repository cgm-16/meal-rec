# ABOUTME: Selects public and pilot models using development data and freezes fitted state.
# ABOUTME: Verifies artifacts before label-isolated scoring and preserves complete search evidence.

from collections import Counter
from copy import deepcopy
from dataclasses import fields
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import logging
from pathlib import Path
import pickle
import platform
import resource
import re
import subprocess
import sys
from time import perf_counter

import numpy as np

from meal_prediction.controls import fit_heuristic_control, fit_rate_control
from meal_prediction.datasets import fetch_uci, load_uci
from meal_prediction.features import FeatureState, _weather_usable, fit_features, transform_features
from meal_prediction.heuristic import HEURISTIC_INPUT_MAPPING, HEURISTIC_VERSION
from meal_prediction.metrics import Prediction, evaluate, paired_intervals, pilot_gain
from meal_prediction.models import FAMILIES, FitError, load_fitted
from meal_prediction.records import Dataset, FeatureBatch, Split, _fields, _instant, _manifest, events_for, labels_for, load_snapshot
from meal_prediction.report import Report, json_bytes, jsonable, write_report
from meal_prediction.splits import split_pilot, split_uci


CONTROL_ORDER = ("global", "personal", "heuristic")
SEEDS = (42, 43, 44)
LOGGER = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[1]
FreezeManifest = dict


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _hash(value):
    return _sha(json_bytes(value))


def _peak_bytes():
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def _runtime():
    implementation = {str(path.relative_to(ROOT)): _sha(path.read_bytes())
                      for path in sorted((ROOT / "meal_prediction").rglob("*.py"))}
    return {"python": platform.python_version(), "dependencies": {name: version(name) for name in
            ("numpy", "scipy", "scikit-learn", "catboost", "river")}, "lock_sha256": _sha((ROOT / "uv.lock").read_bytes()),
            "implementation_sha256": _hash(implementation), "platform": platform.platform(), "machine": platform.machine(),
            "cpu_only": True}


def _git():
    def command(*args):
        return subprocess.run(["git", *args], cwd=ROOT, check=True, text=True, capture_output=True).stdout.rstrip("\n")
    return {"revision": command("rev-parse", "HEAD"), "dirty": bool(command("status", "--porcelain")),
            "dirty_paths": command("status", "--porcelain").splitlines()}


def _empty_output(out_dir):
    out_dir = Path(out_dir)
    if out_dir.exists() and (not out_dir.is_dir() or any(out_dir.iterdir())):
        raise FileExistsError(f"output: refusing to overwrite existing evidence in {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def development_only(dataset: Dataset, split: Split) -> Dataset:
    ids = split.train_ids + split.development_ids
    allowed = set(ids)
    return Dataset(dataset.source, dict(dataset.manifest), events_for(dataset, ids),
                   {key: dataset.targets[key] for key in ids}, tuple(row for row in dataset.audit if row.event_id in allowed))


def _validate_fit(data, split, pilot_input=None):
    if data.source == "pilot":
        if data.manifest.get("phase") != "development":
            raise ValueError("pilot fit: requires a development-phase export")
        if pilot_input is None:
            raise ValueError("pilot fit: use fit_pilot with a complete development bundle")
        expected = split_pilot(data)
        if split.test_ids or (split.train_ids, split.development_ids) != (expected.train_ids, expected.development_ids):
            raise ValueError("pilot fit: incompatible week-one split or future test IDs")
    elif data.source != "uci":
        raise ValueError("source: expected uci or pilot")
    all_ids = split.train_ids + split.development_ids + split.test_ids
    if len(set(all_ids)) != len(all_ids):
        raise ValueError("split: duplicate or overlapping IDs")
    allowed = set(split.train_ids + split.development_ids)
    event_ids = [event.event_id for event in data.events]
    if len(set(event_ids)) != len(event_ids) or set(event_ids) != allowed or set(data.targets) != allowed:
        raise ValueError("fitting partition: provide only exact train/development events and targets; test inputs are forbidden")
    if any(identity != target.event_id for identity, target in data.targets.items()):
        raise ValueError("targets: IDs must match their mapping keys")


def _control_order(source):
    if source not in ("pilot", "uci"):
        raise ValueError("source: expected pilot or uci")
    return CONTROL_ORDER if source == "pilot" else CONTROL_ORDER[:2]


def _protocol(source, smoke=False):
    return {"presets": ["F1"] if smoke else ["F0", "F1", "F2", "F3"] if source == "pilot" else ["F0", "F1"],
        "primary_preset": "F3" if source == "pilot" else "F1", "tuning_seed": 42, "refit_seeds": [42] if smoke else list(SEEDS),
        "grids": {family: list(grid[:1] if smoke else grid) for family, grid, _ in FAMILIES},
        "training_weights": "unit", "log_loss_clip": [1e-6, 1 - 1e-6], "calibration_bin_edges": [0, .2, .4, .6, .8, 1],
        "bootstrap_replicates": 2000, "bootstrap_seed": 42, "primary_metric": "participant_balanced_log_loss"}


def select_settings(grid_results, *, primary_preset, control_losses, source="uci"):
    if set(control_losses) != set(_control_order(source)):
        raise ValueError("control_losses: require every source control and no unavailable controls")
    selected = {}
    for row in grid_results:
        if row["status"] != "ok":
            continue
        key = f"{row['preset']}/{row['family']}"
        if key not in selected or (row["development_loss"], row["grid_index"]) < (
                selected[key]["development_loss"], selected[key]["grid_index"]):
            selected[key] = dict(row)
    candidates = [(selected[f"{primary_preset}/{name}"]["development_loss"], order, name)
                  for order, (name, _, _) in enumerate(FAMILIES) if f"{primary_preset}/{name}" in selected]
    controls = [(control_losses[name], order, name) for order, name in enumerate(_control_order(source))
                if control_losses.get(name) is not None and np.isfinite(control_losses[name])]
    return {"primary_preset": primary_preset, "candidate": min(candidates)[2] if candidates else None,
            "reference": min(controls)[2] if controls else None, "settings": selected, "control_development_losses": control_losses,
            "tie_order": {"families": [row[0] for row in FAMILIES], "controls": list(_control_order(source)), "grid": "ascending index"}}


def _control_batch(events):
    return FeatureBatch(tuple(row.event_id for row in events), tuple(row.participant_id for row in events),
                        tuple({} for _ in events), events)


def _fit_control(kind, events, targets):
    if kind == "heuristic":
        return fit_heuristic_control(events, targets)
    return fit_rate_control(kind, events, targets)


def _save_state(out_dir, name, state):
    path = out_dir / f"{name}-features.json"
    path.write_bytes(json_bytes(state))
    return {"path": path.name, "sha256": _sha(path.read_bytes())}


def _save_model(out_dir, key, model, **metadata):
    path = out_dir / (key.replace("/", "-") + ".pkl")
    model.save(path)
    return dict(path=path.name, sha256=_sha(path.read_bytes()), **metadata)


def fit_experiment(development_data: Dataset, split: Split, out_dir: Path, *, smoke=False, pilot_input=None,
                   test_outcomes_inspected=False) -> FreezeManifest:
    _validate_fit(development_data, split, pilot_input)
    source = development_data.source
    if source == "pilot" and smoke:
        raise ValueError("pilot fit: all four presets and the full fixed budget are required")
    out_dir = _empty_output(out_dir)
    started = perf_counter()
    protocol = _protocol(source, smoke)
    presets, seeds, primary = protocol["presets"], protocol["refit_seeds"], protocol["primary_preset"]
    controls = _control_order(development_data.source)
    fit_ids = split.train_ids + split.development_ids
    train_events, dev_events = events_for(development_data, split.train_ids), events_for(development_data, split.development_ids)
    train_targets = {key: development_data.targets[key] for key in split.train_ids}
    fit_targets = {key: development_data.targets[key] for key in fit_ids}
    y, dev_y = labels_for(development_data, split.train_ids), labels_for(development_data, split.development_ids)
    control_losses, grid_results, feature_hashes, fitting_hashes, artifacts, refits, feature_seconds = {}, [], {}, {}, {}, [], {}
    control_results = {}
    for kind in controls:
        control_losses[kind] = None
        try:
            model = _fit_control(kind, train_events, train_targets)
            values = model.predict_proba(_control_batch(dev_events))
            control_losses[kind] = evaluate(split.development_ids, tuple(row.participant_id for row in dev_events), dev_y, values).participant_log_loss
            control_results[kind] = {"status": "available", "development": {"status": "ok"}}
        except FitError as error:
            outcome = {"status": "not_estimable" if error.reason in ("empty_fit", "single_class", "no_features") else "failed",
                       "reason": error.reason, "detail": error.detail}
            control_results[kind] = {**outcome, "development": dict(outcome)}
    if source == "pilot":
        control_results["heuristic"].update(version=HEURISTIC_VERSION, input_mapping=dict(HEURISTIC_INPUT_MAPPING),
            calibration={"C": 1, "solver": "lbfgs", "max_iter": 2000, "tol": 1e-6},
            histories={"development": "frozen_at_day_five", "test": "frozen_at_day_seven"})
    for preset in presets:
        tick = perf_counter()
        state, train_batch = fit_features(train_events, train_targets, preset=preset, source=source) if train_events else (None, _control_batch(()))
        dev_batch = transform_features(state, dev_events) if state is not None else _control_batch(dev_events)
        feature_seconds[f"selection/{preset}"] = perf_counter() - tick
        fitting_hashes[f"selection/{preset}"] = _hash(train_batch.rows)
        for family, grid, fit in FAMILIES:
            for index, params in enumerate(grid[:1] if smoke else grid):
                tick = perf_counter()
                row = {"family": family, "preset": preset, "grid_index": index, "params": dict(params), "seed": 42,
                       "status": "ok", "development_loss": None}
                try:
                    model = fit(train_batch, y, params, 42)
                    try:
                        values = model.predict_proba(dev_batch)
                        loss = evaluate(dev_batch.ids, dev_batch.participant_ids, dev_y, values).participant_log_loss
                        if loss is None:
                            row.update(status="not_estimable", reason="empty_development")
                        else:
                            row["development_loss"] = loss
                    except (ValueError, FloatingPointError, OverflowError) as error:
                        row.update(status="failed", reason="invalid_development_prediction", detail=str(error))
                except FitError as error:
                    row.update(status="not_estimable" if error.reason in ("empty_fit", "single_class", "no_features") else "failed",
                               reason=error.reason, detail=error.detail)
                row.update(seconds=perf_counter() - tick, peak_process_bytes=_peak_bytes())
                grid_results.append(row)
                LOGGER.info("%s/%s setting %d: %s loss=%s", preset, family, index, row["status"], row["development_loss"])
    selection = select_settings(grid_results, primary_preset=primary, control_losses=control_losses, source=development_data.source)
    # Timing is provenance, never part of development selection or fitted state.
    selection["settings"] = {key: {field: value for field, value in row.items() if field not in ("seconds", "peak_process_bytes")}
                             for key, row in selection["settings"].items()}
    selected_at = datetime.now(timezone.utc).isoformat()
    fit_events = events_for(development_data, fit_ids)
    fit_y = labels_for(development_data, fit_ids)
    for preset in presets:
        if not fit_events:
            continue
        tick = perf_counter()
        state, batch = fit_features(fit_events, fit_targets, preset=preset, source=source)
        feature_seconds[f"refit/{preset}"] = perf_counter() - tick
        feature_hashes[preset] = _save_state(out_dir, preset, state)
        fitting_hashes[f"refit/{preset}"] = _hash(batch.rows)
        for family, _, fit in FAMILIES:
            chosen = selection["settings"].get(f"{preset}/{family}")
            if chosen is None:
                continue
            for seed in seeds:
                key, tick = f"{preset}/{family}/{seed}", perf_counter()
                result = {"key": key, "status": "ok", "params": chosen["params"], "seed": seed}
                try:
                    model = fit(batch, fit_y, chosen["params"], seed)
                    artifacts[key] = _save_model(out_dir, key, model, preset=preset, family=family, seed=seed, params=chosen["params"])
                except FitError as error:
                    result.update(status="failed", reason=error.reason, detail=error.detail)
                result.update(seconds=perf_counter() - tick, peak_process_bytes=_peak_bytes())
                refits.append(result)
                LOGGER.info("Refit %s: %s", key, result["status"])
    for kind in controls:
        tick = perf_counter()
        result = {"key": kind, "status": "ok"}
        try:
            artifacts[kind] = _save_model(out_dir, kind, _fit_control(kind, fit_events, fit_targets), preset=None, family=kind, seed=None, params={})
            control_results[kind]["refit"] = {"status": "ok"}
            control_results[kind]["status"] = "available"
            control_results[kind].pop("reason", None)
            control_results[kind].pop("detail", None)
        except FitError as error:
            outcome = {"status": "not_estimable" if error.reason in ("empty_fit", "single_class", "no_features") else "failed",
                       "reason": error.reason, "detail": error.detail}
            result.update(outcome)
            control_results[kind].update(outcome, refit=dict(outcome))
        result.update(seconds=perf_counter() - tick, peak_process_bytes=_peak_bytes())
        refits.append(result)
    required = len(presets) * len(FAMILIES) * len(seeds) + len(controls)
    status = "complete" if len(artifacts) == required else "not_estimable" if len(np.unique(y)) < 2 or not len(dev_y) else "incomplete"
    manifest = {"schema_version": 1, "source": development_data.source, "status": status,
        "run_kind": ("constructed_verification_only" if pilot_input["source_manifest"]["sourceProvenance"]["license"] == "test-only" else "pilot_replay")
            if source == "pilot" else "smoke_verification_only" if smoke else "full_benchmark", "selection": selection,
        "selected_at": selected_at, "frozen_at": datetime.now(timezone.utc).isoformat(),
        "development_sha256": _hash(development_data),
        "source_manifest": pilot_input["source_manifest"] if source == "pilot" else jsonable(development_data.manifest),
        "controls": control_results,
        "split": jsonable(split), "split_sha256": _hash(split), "fitting_ids": list(fit_ids),
        "known_participants": sorted({row.participant_id for row in fit_events}), "known_items": sorted({row.item_id for row in fit_events}),
        "feature_hashes": feature_hashes, "fitting_rows_sha256": fitting_hashes, "artifacts": artifacts,
        "settings_sha256": _hash(selection), "grid_results": grid_results, "refit_results": refits,
        "protocol": _protocol(source, smoke),
        "timings": {"fit_total_seconds": perf_counter() - started, "feature_seconds": feature_seconds,
                    "peak_process_bytes": _peak_bytes()}, "runtime": _runtime(), "git": _git(),
        "artifact_trust": "Trusted local freezes only. Hashes detect corruption, not an authenticated source; pickle can execute code."}
    if source == "pilot":
        manifest.update({key: value for key, value in pilot_input.items() if key != "source_manifest"})
        manifest["fitting_inputs_sha256"] = _hash({"events": fit_events, "targets": fit_targets})
        manifest["freeze_timing"] = _freeze_timing(manifest, test_outcomes_inspected)
    (out_dir / "manifest.json").write_bytes(json_bytes(manifest))
    (out_dir / "manifest.sha256").write_text(_sha((out_dir / "manifest.json").read_bytes()) + "\n")
    return manifest


STUDY_FIELDS = ("schemaVersion studyId studyVersion protocolVersion catalogVersion catalogSha256 startsAt "
                "trainingEndsAt developmentEndsAt endsAt quotaTimezoneRule seed").split()
BASE_FREEZE_FIELDS = ("schema_version source status run_kind selection selected_at frozen_at development_sha256 source_manifest "
    "controls split split_sha256 fitting_ids known_participants known_items feature_hashes fitting_rows_sha256 artifacts "
    "settings_sha256 grid_results refit_results protocol timings runtime git artifact_trust")
PILOT_FREEZE_FIELDS = ("development_snapshot_sha256 week_one_events_sha256 fitting_inputs_sha256 development_bundle freeze_timing partition_support")


def _freeze_timing(manifest, inspected):
    if type(inspected) is not bool:
        raise ValueError("freeze: test inspection declaration must be boolean")
    selected = _instant(manifest["selected_at"], "freeze.selected_at")
    frozen = _instant(manifest["frozen_at"], "freeze.frozen_at")
    source = manifest["source_manifest"]
    if frozen < selected or selected < _instant(source["exportedAt"], "freeze.source_manifest.exportedAt"):
        raise ValueError("freeze: incompatible export/selection/freeze chronology")
    boundary = _instant(source["developmentEndsAt"], "freeze.source_manifest.developmentEndsAt")
    reasons = []
    if selected > boundary or frozen > boundary:
        reasons.append("late_freeze")
    if inspected:
        reasons.append("declared_test_inspection")
    return {"classification": "retrospective" if reasons else "prospective", "reasons": reasons,
            "test_outcomes_inspected": inspected,
            "basis": "Recorded selection/freeze timing and caller declaration; absence of outside inspection is not software-verifiable."}


def _collection_summary(collection, source):
    _fields(collection, "collection", "schemaVersion study phase exportedAt allocationMeals lifecycle")
    if type(collection["schemaVersion"]) is not int or collection["schemaVersion"] != 1 or collection["phase"] != source["phase"] or collection["exportedAt"] != source["exportedAt"]:
        raise ValueError("collection: incompatible schema, phase or export time")
    _fields(collection["study"], "collection.study", " ".join(STUDY_FIELDS) + " cityOptions")
    if any(collection["study"][key] != source[key] for key in STUDY_FIELDS):
        raise ValueError("collection: incompatible study identity")
    if not isinstance(collection["allocationMeals"], list):
        raise ValueError("collection: allocationMeals must be an array")
    lifecycle = _fields(collection["lifecycle"], "collection.lifecycle", "status reason lifecycleAsOf participants")
    expected = "unavailable" if source["phase"] == "development" else "available"
    if lifecycle["status"] != expected or not isinstance(lifecycle["participants"], list):
        raise ValueError("collection: incompatible lifecycle availability")
    if expected == "unavailable":
        if lifecycle["participants"] or lifecycle["lifecycleAsOf"] is not None or not isinstance(lifecycle["reason"], str) or not lifecycle["reason"]:
            raise ValueError("collection: development lifecycle must be explicitly unavailable")
    elif lifecycle["lifecycleAsOf"] != source["exportedAt"] or lifecycle["reason"] is not None:
        raise ValueError("collection: final lifecycle requires its as-of export time")
    summary = {"allocation_meals": len(collection["allocationMeals"]), "lifecycle": {
        "status": expected, "reason": lifecycle["reason"], "as_of": lifecycle["lifecycleAsOf"]}}
    if expected == "unavailable":
        return summary
    days, visits, states = [], [], Counter()
    for person in lifecycle["participants"]:
        _fields(person, "collection.lifecycle.participant", "participantId days visits")
        if not isinstance(person["days"], list) or not isinstance(person["visits"], list):
            raise ValueError("collection: lifecycle days and visits must be arrays")
        for day in person["days"]:
            _fields(day, "collection.lifecycle.day", "localDate shortage slots")
            if type(day["shortage"]) is not int or not 0 <= day["shortage"] <= 5 or not isinstance(day["slots"], list) or len(day["slots"]) != 5:
                raise ValueError("collection: invalid daily shortage/slots")
            for slot in day["slots"]:
                _fields(slot, "collection.lifecycle.slot", "slotId allocationId visitId validatedSettingsVersion status")
                if slot["status"] not in ("unshown", "shown", "answered", "skipped", "expired", "closed"):
                    raise ValueError("collection: invalid slot state")
                states[slot["status"]] += 1
        for visit in person["visits"]:
            _fields(visit, "collection.lifecycle.visit", "visitId closedAt")
            if visit["closedAt"] is not None:
                _instant(visit["closedAt"], "collection.lifecycle.visit.closedAt")
        days.extend(person["days"])
        visits.extend(person["visits"])
    summary["lifecycle"].update(participants=len(lifecycle["participants"]), days=len(days), shortage=sum(row["shortage"] for row in days),
        slot_states=dict(states), visits=len(visits), closed_visits=sum(row["closedAt"] is not None for row in visits))
    return summary


def _load_pilot_bundle(path, phase):
    path = Path(path)
    if not path.is_dir() or path.is_symlink():
        raise ValueError("pilot bundle: input must be a complete export directory")
    names = ("snapshot.json", "collection.json", "SHA256SUMS")
    if any((path / name).is_symlink() or not (path / name).is_file() for name in names):
        raise ValueError("pilot bundle: missing regular files or SHA256SUMS completion marker")
    raw = {name: (path / name).read_bytes() for name in names}
    expected = "".join(f"{_sha(raw[name])}  {name}\n" for name in names[:2]).encode()
    if raw["SHA256SUMS"] != expected:
        raise ValueError("pilot bundle: snapshot/collection checksum hash mismatch")
    root = json.loads(raw["snapshot.json"])
    data = load_snapshot(path / "snapshot.json")
    source = root["manifest"]
    if source["phase"] != phase:
        raise ValueError(f"pilot bundle: requires a {phase}-phase export")
    collection = _collection_summary(json.loads(raw["collection.json"]), source)
    if phase == "development":
        boundary = data.manifest["developmentEndsAt"]
        timed = [(person["enrolledAt"], "enrollment") for person in root["participants"]]
        timed += [(setting["effectiveAt"], "settings") for person in root["participants"] for setting in person["settings"]]
        timed += [(row["allocatedAt"], "allocation") for row in root["allocations"]]
        timed += [(row[key], "context") for row in root["visits"] for key in ("startedAt", "contextCapturedAt")]
        timed += [(row["weather"][key], "weather context") for row in root["visits"] if row["weather"] is not None
                  for key in ("requestedAt", "retrievedAt") if row["weather"][key] is not None]
        if any(_instant(value, f"development.{kind}") >= boundary for value, kind in timed):
            raise ValueError("pilot bundle: test-week enrollment/settings/allocation/context is forbidden in development")
    if any((path / name).read_bytes() != raw[name] for name in names):
        raise ValueError("pilot bundle: files changed during validation")
    return data, source, {"sha256": {name: _sha(value) for name, value in raw.items()}, "collection": collection}


def _pilot_support(data, split):
    support = {}
    for name, ids in (("training", split.train_ids), ("development", split.development_ids), ("test", split.test_ids)):
        events = events_for(data, ids)
        support[name] = {"observations": len(events), "participants": len({row.participant_id for row in events}),
            "meals": len({row.item_id for row in events}), "labels": dict(Counter(str(data.targets[key].y) for key in ids)),
            "study_days": dict(Counter(str((row.displayed_at - data.manifest["startsAt"]).days) for row in events)),
            "missing_hunger": sum(row.context.get("hunger") is None for row in events),
            "unusable_weather": sum(not _weather_usable(row, row.context.get("weather") or {}) for row in events)}
    return support


def fit_pilot(input_dir, out_dir, *, test_outcomes_inspected=False):
    data, source, bundle = _load_pilot_bundle(input_dir, "development")
    if type(test_outcomes_inspected) is not bool:
        raise ValueError("pilot fit: test inspection declaration must be boolean")
    if datetime.now(timezone.utc) < data.manifest["exportedAt"]:
        raise ValueError("pilot fit: development export time is in the future")
    split = split_pilot(data)
    metadata = {"source_manifest": source, "development_snapshot_sha256": bundle["sha256"]["snapshot.json"],
                "development_bundle": bundle, "week_one_events_sha256": _hash(sorted(data.events, key=lambda row: row.event_id)),
                "partition_support": _pilot_support(data, split)}
    return fit_experiment(development_only(data, split), split, Path(out_dir), pilot_input=metadata,
                          test_outcomes_inspected=test_outcomes_inspected)


def score_pilot(freeze_dir, input_dir, out_dir):
    data, source, bundle = _load_pilot_bundle(input_dir, "final")
    manifest, digest = _verified_manifest(freeze_dir)
    if manifest["source"] != "pilot":
        raise ValueError("pilot score: incompatible public freeze")
    previous = manifest["source_manifest"]
    if any(source[key] != previous[key] for key in STUDY_FIELDS + ["sourceProvenance"]):
        raise ValueError("pilot score: incompatible study/source manifest")
    link = {"freezeManifestSha256": digest, "frozenAt": manifest["frozen_at"],
            "developmentSnapshotSha256": manifest["development_snapshot_sha256"]}
    if source["freezeLink"] != link:
        raise ValueError("pilot score: final freeze link does not match exact raw freeze/development hashes and time")
    split = split_pilot(data)
    fit_ids = split.train_ids + split.development_ids
    weekone = sorted((row for row in data.events if row.displayed_at < data.manifest["developmentEndsAt"]), key=lambda row: row.event_id)
    if list(fit_ids) != manifest["fitting_ids"] or _hash(weekone) != manifest["week_one_events_sha256"]:
        raise ValueError("pilot score: incompatible week-one exposures/partitions")
    fitting = {"events": events_for(data, fit_ids), "targets": {key: data.targets[key] for key in fit_ids}}
    if _hash(fitting) != manifest["fitting_inputs_sha256"]:
        raise ValueError("pilot score: incompatible week-one fitting events/targets")
    return score_experiment(freeze_dir, events_for(data, split.test_ids),
        {key: data.targets[key] for key in split.test_ids}, out_dir,
        pilot_input={"test_ids": split.test_ids, "audit": jsonable(split.audit), "bundle": bundle,
                     "exposures": len(data.events), "binary_targets": len(data.targets), "source_manifest": source,
                     "partition_support": _pilot_support(data, split)})


def _verified_manifest(freeze_dir):
    freeze_dir = Path(freeze_dir)
    path = freeze_dir / "manifest.json"
    digest = _sha(path.read_bytes())
    if digest != (freeze_dir / "manifest.sha256").read_text().strip():
        raise ValueError("freeze: manifest hash mismatch")
    manifest = json.loads(path.read_text())
    if not isinstance(manifest, dict) or type(manifest.get("schema_version")) is not int or manifest.get("schema_version") != 1 or manifest.get("source") not in ("uci", "pilot"):
        raise ValueError("freeze: incompatible manifest schema/source")
    source = manifest["source"]
    _fields(manifest, "freeze", BASE_FREEZE_FIELDS + (" " + PILOT_FREEZE_FIELDS if source == "pilot" else ""))
    try:
        if manifest["status"] not in ("complete", "incomplete", "not_estimable"):
            raise ValueError("freeze: invalid fit status")
        _fields(manifest["controls"], "freeze.controls", " ".join(_control_order(source)))
        for kind, control in manifest["controls"].items():
            if (control["status"] not in ("available", "failed", "not_estimable")
                    or (control["status"] == "available") != (kind in manifest["artifacts"])):
                raise ValueError("freeze: incompatible control availability/artifact")
        split = _fields(manifest["split"], "freeze.split", "train_ids development_ids test_ids audit")
        ids = []
        for name in ("train_ids", "development_ids", "test_ids"):
            if not isinstance(split[name], list) or any(not isinstance(key, str) or not key for key in split[name]):
                raise ValueError("freeze: invalid split IDs")
            ids.extend(split[name])
        if len(ids) != len(set(ids)) or manifest["fitting_ids"] != split["train_ids"] + split["development_ids"]:
            raise ValueError("freeze: overlapping split or incompatible fitting IDs")
        protocol = manifest["protocol"]
        smoke = manifest["run_kind"] == "smoke_verification_only"
        if source == "pilot" and manifest["run_kind"] not in ("constructed_verification_only", "pilot_replay"):
            raise ValueError("freeze: incompatible pilot run kind")
        if protocol != jsonable(_protocol(source, smoke)):
            raise ValueError("freeze: incompatible fixed selection protocol")
        presets, seeds = protocol["presets"], protocol["refit_seeds"]
        if manifest["selection"]["primary_preset"] != protocol["primary_preset"]:
            raise ValueError("freeze: incompatible primary selection")
        selection = _fields(manifest["selection"], "freeze.selection",
            "primary_preset candidate reference settings control_development_losses tie_order")
        expected_selection = select_settings(manifest["grid_results"], primary_preset=protocol["primary_preset"],
            control_losses=selection["control_development_losses"], source=source)
        expected_selection["settings"] = {key: {field: value for field, value in row.items() if field not in ("seconds", "peak_process_bytes")}
                                          for key, row in expected_selection["settings"].items()}
        if selection != expected_selection:
            raise ValueError("freeze: incompatible development selection")
        metadata = {}
        for preset in presets:
            for family, _, _ in FAMILIES:
                chosen = selection["settings"].get(f"{preset}/{family}")
                if chosen is not None:
                    for seed in seeds:
                        metadata[f"{preset}/{family}/{seed}"] = {"preset": preset, "family": family, "seed": seed, "params": chosen["params"]}
        metadata.update({kind: {"preset": None, "family": kind, "seed": None, "params": {}} for kind in _control_order(source)})
        if (not isinstance(manifest["feature_hashes"], dict) or not set(manifest["feature_hashes"]) <= set(presets)
                or not isinstance(manifest["artifacts"], dict) or not set(manifest["artifacts"]) <= set(metadata)):
            raise ValueError("freeze: incompatible feature/model artifact identities")
        for key, entry in manifest["artifacts"].items():
            _fields(entry, "freeze.artifact", "path sha256 preset family seed params")
            if {name: entry[name] for name in metadata[key]} != metadata[key]:
                raise ValueError("freeze: incompatible artifact metadata")
        if manifest["status"] == "complete" and (len(manifest["artifacts"]) != len(presets) * len(FAMILIES) * len(seeds) + len(_control_order(source))
                or set(manifest["feature_hashes"]) != set(presets)):
            raise ValueError("freeze: complete status requires every candidate and control")
        if source == "pilot":
            parsed = deepcopy(manifest["source_manifest"])
            _manifest(parsed)
            if parsed["phase"] != "development" or split["test_ids"]:
                raise ValueError("freeze: pilot requires week-one source and no future test IDs")
            for name in ("development_snapshot_sha256", "week_one_events_sha256", "fitting_inputs_sha256"):
                if not isinstance(manifest[name], str) or re.fullmatch(r"[a-f0-9]{64}", manifest[name]) is None:
                    raise ValueError("freeze: invalid pilot input hash")
            if manifest["development_bundle"]["sha256"]["snapshot.json"] != manifest["development_snapshot_sha256"]:
                raise ValueError("freeze: incompatible raw development hash")
            if manifest["freeze_timing"] != _freeze_timing(manifest, manifest["freeze_timing"]["test_outcomes_inspected"]):
                raise ValueError("freeze: incompatible freeze timing")
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("freeze: malformed manifest/protocol") from error
    if manifest["runtime"] != _runtime():
        raise ValueError("freeze: incompatible runtime, dependencies, implementation or lock hash")
    if _hash(manifest["split"]) != manifest["split_sha256"] or _hash(manifest["selection"]) != manifest["settings_sha256"]:
        raise ValueError("freeze: split/settings hash mismatch")
    for entry in list(manifest["feature_hashes"].values()) + list(manifest["artifacts"].values()):
        _fields(entry, "freeze.artifact", "path sha256" if entry in manifest["feature_hashes"].values() else "path sha256 preset family seed params")
        name = entry["path"]
        if not isinstance(name, str) or not isinstance(entry["sha256"], str):
            raise ValueError("freeze: invalid artifact path/hash")
        artifact = freeze_dir / name
        if Path(name).name != name or artifact.is_symlink() or not artifact.is_file():
            raise ValueError("freeze: unsafe or missing artifact path")
        if _sha(artifact.read_bytes()) != entry["sha256"]:
            raise ValueError(f"freeze: artifact hash mismatch: {name}")
    for preset, entry in manifest["feature_hashes"].items():
        state = _read_state(freeze_dir / entry["path"])
        if (state.source, state.preset) != (source, preset):
            raise ValueError("freeze: incompatible feature source/preset")
    return manifest, digest


def _read_state(path):
    value = json.loads(path.read_text())
    if set(value) != {field.name for field in fields(FeatureState)}:
        raise ValueError("freeze: incompatible feature state")
    def tuples(child):
        return tuple(tuples(item) for item in child) if isinstance(child, list) else child
    return FeatureState(**{key: tuples(child) for key, child in value.items()})


def _coverage(events, batches, manifest, pilot_input=None):
    people, items = set(manifest["known_participants"]), set(manifest["known_items"])
    coverage = {"source_observations": manifest["source_manifest"].get("sourceObservationCount", len(manifest["fitting_ids"]) + len(events)),
        "fitting_observations": len(manifest["fitting_ids"]), "test_observations": len(events),
        "test_participants": len({row.participant_id for row in events}), "test_items": len({row.item_id for row in events}),
        "warm_user": sum(row.participant_id in people for row in events), "unseen_user": sum(row.participant_id not in people for row in events),
        "warm_item": sum(row.item_id in items for row in events), "unseen_item": sum(row.item_id not in items for row in events),
        "missing_cuisine": sum(not row.meal.get("cuisine" if manifest["source"] == "pilot" else "cuisines") for row in events),
        "clock": "unavailable_static_source", "hunger": "unavailable_static_source", "weather": "unavailable_static_source",
        "feature_missing_fraction": {preset: {name: float(np.mean([row.get(name, 0) for row in batch.rows])) if batch.rows else None
            for name in sorted({key for row in batch.rows for key in row if key.endswith(".missing")})} for preset, batch in batches.items()}}
    if pilot_input is not None:
        coverage.update(source_observations=pilot_input["exposures"], binary_targets=pilot_input["binary_targets"],
            clock={"available": sum(row.displayed_at is not None for row in events)},
            hunger={"available": sum(row.context.get("hunger") is not None for row in events)},
            weather={"usable": sum(_weather_usable(row, row.context.get("weather") or {}) for row in events),
                     "missing_or_unusable": sum(not _weather_usable(row, row.context.get("weather") or {}) for row in events)},
            partition_support=pilot_input["partition_support"],
            study_days=pilot_input["partition_support"]["test"]["study_days"],
            labels=dict(Counter(str(target) for target in pilot_input["labels"])),
            exclusions=dict(Counter(row["reason"] for row in pilot_input["audit"])),
            collection=pilot_input["bundle"]["collection"],
            development_collection=manifest["development_bundle"]["collection"])
    return coverage


def _find_pair(intervals, first, second, kind="group"):
    for pair in getattr(intervals, kind).values():
        if (pair.first, pair.second) == (first, second):
            return jsonable(pair)
        if (pair.first, pair.second) == (second, first):
            result = jsonable(pair)
            result.update(first=first, second=second, observed_difference=-pair.observed_difference,
                          lower=-pair.upper if pair.upper is not None else None, upper=-pair.lower if pair.lower is not None else None)
            return result
    return None


def score_experiment(freeze_dir, events, targets, out_dir, *, pilot_input=None) -> Report:
    started = perf_counter()
    freeze_dir = Path(freeze_dir)
    manifest, digest = _verified_manifest(freeze_dir)
    source = manifest["source"]
    if source == "pilot" and pilot_input is None:
        raise ValueError("pilot score: use score_pilot with a compatible complete final bundle")
    ids = tuple(pilot_input["test_ids"] if source == "pilot" else manifest["split"]["test_ids"])
    indexed = {row.event_id: row for row in events}
    if len(indexed) != len(events) or set(indexed) != set(ids):
        raise ValueError("score: events must match exact frozen test IDs")
    if any(key not in targets or targets[key].event_id != key for key in ids):
        raise ValueError("score: test IDs require aligned definite targets")
    events = tuple(indexed[key] for key in ids)
    people, labels = tuple(row.participant_id for row in events), [targets[key].y for key in ids]
    batches = {preset: transform_features(_read_state(freeze_dir / entry["path"]), events)
               for preset, entry in manifest["feature_hashes"].items()}
    probabilities, metrics, scoring_seconds = {}, {}, {}
    for key, entry in manifest["artifacts"].items():
        model = load_fitted(freeze_dir / entry["path"])
        before = pickle.dumps(model)
        tick = perf_counter()
        batch = batches[entry["preset"]] if entry["preset"] is not None else _control_batch(events)
        values = model.predict_proba(batch)
        scoring_seconds[key] = perf_counter() - tick
        if pickle.dumps(model) != before:
            raise ValueError(f"score: fitted state mutated during prediction: {key}")
        probabilities[key] = tuple(float(value) for value in values)
        metrics[key] = evaluate(ids, people, labels, values)
    predictions = tuple(Prediction(key, people[index], labels[index], {name: values[index] for name, values in probabilities.items()},
                                   events[index].displayed_at) for index, key in enumerate(ids))
    intervals = paired_intervals(predictions, source=source,
        study_start=_instant(manifest["source_manifest"]["startsAt"], "freeze.startsAt") if source == "pilot" else None)
    feature_increments = {family: _find_pair(intervals, f"F0/{family}/42", f"F1/{family}/42") for family, _, _ in FAMILIES}
    if source == "pilot":
        feature_increments = {f"{first}->{second}": {family: {kind: _find_pair(intervals, f"{first}/{family}/42", f"{second}/{family}/42", kind)
            for kind in ("group", "time")} for family, _, _ in FAMILIES}
            for first, second in zip(manifest["protocol"]["presets"], manifest["protocol"]["presets"][1:])}
    seed_variation = {}
    for preset in manifest["protocol"]["presets"]:
        for family, _, _ in FAMILIES:
            losses = {str(seed): metrics[f"{preset}/{family}/{seed}"].participant_log_loss for seed in SEEDS if f"{preset}/{family}/{seed}" in metrics}
            seed_variation[f"{preset}/{family}"] = {"participant_log_loss": losses,
                "range": max(losses.values()) - min(losses.values()) if losses and all(value is not None for value in losses.values()) else None,
                "status": "sensitivity" if len(losses) == 3 else "smoke_primary_only"}
    known_people, known_items = set(manifest["known_participants"]), set(manifest["known_items"])
    subgroup_masks = {"warm_user": [row.participant_id in known_people for row in events],
        "unseen_user": [row.participant_id not in known_people for row in events],
        "warm_item": [row.item_id in known_items for row in events], "unseen_item": [row.item_id not in known_items for row in events],
        "warm_user_and_item": [row.participant_id in known_people and row.item_id in known_items for row in events]}
    subgroups = {name: {"status": "supported" if any(mask) else "unsupported", "observations": sum(mask),
        "metrics": {key: evaluate([ids[i] for i, retain in enumerate(mask) if retain], [people[i] for i, retain in enumerate(mask) if retain],
            [labels[i] for i, retain in enumerate(mask) if retain], [values[i] for i, retain in enumerate(mask) if retain])
            for key, values in probabilities.items()}} for name, mask in subgroup_masks.items()}
    selected = manifest["selection"]
    candidate, reference = f"{selected['primary_preset']}/{selected['candidate']}/42", selected["reference"]
    observed = _find_pair(intervals, reference, candidate)
    relative = ((metrics[reference].participant_log_loss - metrics[candidate].participant_log_loss) / metrics[reference].participant_log_loss
                if reference in metrics and candidate in metrics and metrics[reference].participant_log_loss is not None else None)
    _, after_digest = _verified_manifest(freeze_dir)
    if digest != after_digest:
        raise ValueError("score: freeze changed during scoring")
    gain = (pilot_gain(predictions, intervals, candidate=candidate, reference=reference)
            if source == "uci" or candidate in metrics and reference in metrics else
            {"status": "insufficient_evidence", "useful_gain": False, "relative_gain": None})
    controls = dict(manifest["controls"])
    extra_provenance = {}
    if source == "pilot":
        pilot_input = {**pilot_input, "labels": labels}
        if manifest["freeze_timing"]["classification"] != "prospective" or manifest["run_kind"] == "constructed_verification_only":
            if gain["useful_gain"]:
                gain.update(status="verification_or_retrospective_only", observed_provisional_gain=True)
            gain["useful_gain"] = False
        gain["freeze_classification"] = manifest["freeze_timing"]["classification"]
        extra_provenance = {"freeze_timing": manifest["freeze_timing"], "development_snapshot_sha256": manifest["development_snapshot_sha256"],
            "development_bundle": manifest["development_bundle"], "final_bundle": pilot_input["bundle"],
            "final_source_manifest": pilot_input["source_manifest"], "empirical_pilot_comparison": "pending_genuine_study",
            "authenticity": "Schema, checksums and source license do not establish genuine collection.",
            "test_ids_sha256": _hash(ids)}
    else:
        controls["heuristic"] = {"status": "unavailable_no_faithful_mapping"}
    report = Report(manifest["status"], manifest["run_kind"], source, digest, ids, probabilities, metrics, intervals,
        _coverage(events, batches, manifest, pilot_input), subgroups, feature_increments, seed_variation,
        {"candidate": candidate if candidate in metrics else None, "reference": reference, "relative_gain": relative, "paired_interval": observed,
         **({"time_interval": _find_pair(intervals, reference, candidate, "time")} if source == "pilot" else {})},
        gain, controls,
        {**manifest["timings"], "scoring_seconds": scoring_seconds, "score_total_seconds": perf_counter() - started, "peak_process_bytes": _peak_bytes()},
        {"git": manifest["git"], "scoring_git": _git(), "runtime": manifest["runtime"], "source_manifest": manifest["source_manifest"],
         "development_sha256": manifest["development_sha256"], "split_sha256": manifest["split_sha256"],
         "scoring_inputs_sha256": _hash(events), "scoring_targets_sha256": _hash({key: targets[key] for key in ids}),
         "settings_sha256": manifest["settings_sha256"], "feature_hashes": manifest["feature_hashes"],
         "artifact_hashes": {key: row["sha256"] for key, row in manifest["artifacts"].items()}, **extra_provenance},
        selected, tuple(manifest["grid_results"]), tuple(manifest["refit_results"]),
        tuple(pilot_input["audit"] if source == "pilot" else manifest["split"]["audit"]))
    write_report(report, Path(out_dir), predictions)
    return report


def public_experiment(out_dir: Path, *, smoke=False, data_dir=ROOT / "data") -> Report:
    out_dir, data_dir = _empty_output(out_dir), Path(data_dir)
    dataset = load_uci(fetch_uci(data_dir / "uci-restaurant-consumer.zip"))
    if len(dataset.events) != 1161 or len(dataset.targets) != 1161:
        raise ValueError("UCI: all 1,161 source observations must survive the joins")
    split = split_uci(dataset, seed=42)
    saved = data_dir / "uci-split-seed-42.json"
    value = {"seed": 42, "sourceSha256": dataset.manifest["sourceSha256"], "split": jsonable(split)}
    if saved.exists():
        previous = json.loads(saved.read_text())
        if any(previous.get(key) != item for key, item in value.items()):
            raise ValueError("UCI: incompatible saved split/source hashes; refusing to replace evidence")
    else:
        saved.write_bytes(json_bytes(value))
    (out_dir / "split.json").write_bytes(json_bytes(split))
    dataset.manifest["sourceObservationCount"] = len(dataset.events)
    manifest = fit_experiment(development_only(dataset, split), split, out_dir / "freeze", smoke=smoke)
    report = score_experiment(out_dir / "freeze", events_for(dataset, split.test_ids),
                              {key: dataset.targets[key] for key in split.test_ids}, out_dir / "report")
    if manifest["status"] != "complete":
        raise RuntimeError(f"public comparison incomplete: {manifest['status']}; see grid/refit evidence in {out_dir}")
    return report
