# ABOUTME: Selects public models using development data and freezes owned fitted state.
# ABOUTME: Verifies artifacts before label-isolated scoring and preserves complete search evidence.

from dataclasses import asdict, fields
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import logging
from pathlib import Path
import pickle
import platform
import resource
import subprocess
import sys
from time import perf_counter

import numpy as np

from meal_prediction.controls import fit_heuristic_control, fit_rate_control
from meal_prediction.datasets import fetch_uci, load_uci
from meal_prediction.features import FeatureState, fit_features, transform_features
from meal_prediction.metrics import Prediction, evaluate, paired_intervals, pilot_gain
from meal_prediction.models import FAMILIES, FitError, load_fitted
from meal_prediction.records import Dataset, FeatureBatch, Split, events_for, labels_for
from meal_prediction.report import Report, json_bytes, jsonable, write_report
from meal_prediction.splits import split_uci


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


def _validate_fit(data, split):
    if data.source == "pilot":
        if data.manifest.get("phase") != "development":
            raise ValueError("pilot fit: requires a development-phase export")
        raise NotImplementedError("Pilot fitting awaits the guarded export/freeze workflow (Task13)")
    if data.source != "uci":
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


def fit_experiment(development_data: Dataset, split: Split, out_dir: Path, *, smoke=False) -> FreezeManifest:
    _validate_fit(development_data, split)
    out_dir = _empty_output(out_dir)
    started = perf_counter()
    presets, seeds = (("F1",), (42,)) if smoke else (("F0", "F1"), SEEDS)
    controls = _control_order(development_data.source)
    fit_ids = split.train_ids + split.development_ids
    train_events, dev_events = events_for(development_data, split.train_ids), events_for(development_data, split.development_ids)
    train_targets = {key: development_data.targets[key] for key in split.train_ids}
    fit_targets = {key: development_data.targets[key] for key in fit_ids}
    y, dev_y = labels_for(development_data, split.train_ids), labels_for(development_data, split.development_ids)
    control_losses, grid_results, feature_hashes, fitting_hashes, artifacts, refits, feature_seconds = {}, [], {}, {}, {}, [], {}
    for kind in controls:
        model = _fit_control(kind, train_events, train_targets)
        values = model.predict_proba(_control_batch(dev_events))
        control_losses[kind] = evaluate(split.development_ids, tuple(row.participant_id for row in dev_events), dev_y, values).participant_log_loss
    for preset in presets:
        tick = perf_counter()
        state, train_batch = fit_features(train_events, train_targets, preset=preset, source="uci") if train_events else (None, _control_batch(()))
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
    selection = select_settings(grid_results, primary_preset="F1", control_losses=control_losses, source=development_data.source)
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
        state, batch = fit_features(fit_events, fit_targets, preset=preset, source="uci")
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
        artifacts[kind] = _save_model(out_dir, kind, _fit_control(kind, fit_events, fit_targets), preset=None, family=kind, seed=None, params={})
        refits.append({"key": kind, "status": "ok", "seconds": perf_counter() - tick, "peak_process_bytes": _peak_bytes()})
    required = len(presets) * len(FAMILIES) * len(seeds) + len(controls)
    status = "complete" if len(artifacts) == required else "not_estimable" if len(np.unique(y)) < 2 else "incomplete"
    manifest = {"schema_version": 1, "source": development_data.source, "status": status,
        "run_kind": "smoke_verification_only" if smoke else "full_benchmark", "selection": selection,
        "selected_at": selected_at, "frozen_at": datetime.now(timezone.utc).isoformat(),
        "development_sha256": _hash(development_data), "source_manifest": jsonable(development_data.manifest),
        "split": jsonable(split), "split_sha256": _hash(split), "fitting_ids": list(fit_ids),
        "known_participants": sorted({row.participant_id for row in fit_events}), "known_items": sorted({row.item_id for row in fit_events}),
        "feature_hashes": feature_hashes, "fitting_rows_sha256": fitting_hashes, "artifacts": artifacts,
        "settings_sha256": _hash(selection), "grid_results": grid_results, "refit_results": refits,
        "protocol": {"presets": list(presets), "primary_preset": "F1", "tuning_seed": 42, "refit_seeds": list(seeds),
            "grids": {family: list(grid[:1] if smoke else grid) for family, grid, _ in FAMILIES},
            "training_weights": "unit", "log_loss_clip": [1e-6, 1 - 1e-6], "calibration_bin_edges": [0, .2, .4, .6, .8, 1],
            "bootstrap_replicates": 2000, "bootstrap_seed": 42, "primary_metric": "participant_balanced_log_loss"},
        "timings": {"fit_total_seconds": perf_counter() - started, "feature_seconds": feature_seconds,
                    "peak_process_bytes": _peak_bytes()}, "runtime": _runtime(), "git": _git(),
        "artifact_trust": "Trusted local freezes only. Hashes detect corruption, not an authenticated source; pickle can execute code."}
    (out_dir / "manifest.json").write_bytes(json_bytes(manifest))
    (out_dir / "manifest.sha256").write_text(_sha((out_dir / "manifest.json").read_bytes()) + "\n")
    return manifest


def _verified_manifest(freeze_dir):
    freeze_dir = Path(freeze_dir)
    path = freeze_dir / "manifest.json"
    digest = _sha(path.read_bytes())
    if digest != (freeze_dir / "manifest.sha256").read_text().strip():
        raise ValueError("freeze: manifest hash mismatch")
    manifest = json.loads(path.read_text())
    if manifest.get("schema_version") != 1 or manifest.get("source") != "uci":
        raise ValueError("freeze: incompatible manifest schema/source")
    if manifest["runtime"] != _runtime():
        raise ValueError("freeze: incompatible runtime, dependencies, implementation or lock hash")
    if _hash(manifest["split"]) != manifest["split_sha256"] or _hash(manifest["selection"]) != manifest["settings_sha256"]:
        raise ValueError("freeze: split/settings hash mismatch")
    for entry in list(manifest["feature_hashes"].values()) + list(manifest["artifacts"].values()):
        name = entry["path"]
        artifact = freeze_dir / name
        if Path(name).name != name or artifact.is_symlink() or not artifact.is_file():
            raise ValueError("freeze: unsafe or missing artifact path")
        if _sha(artifact.read_bytes()) != entry["sha256"]:
            raise ValueError(f"freeze: artifact hash mismatch: {name}")
    return manifest, digest


def _read_state(path):
    value = json.loads(path.read_text())
    if set(value) != {field.name for field in fields(FeatureState)}:
        raise ValueError("freeze: incompatible feature state")
    def tuples(child):
        return tuple(tuples(item) for item in child) if isinstance(child, list) else child
    return FeatureState(**{key: tuples(child) for key, child in value.items()})


def _coverage(events, batches, manifest):
    people, items = set(manifest["known_participants"]), set(manifest["known_items"])
    return {"source_observations": manifest["source_manifest"].get("sourceObservationCount", len(manifest["fitting_ids"]) + len(events)),
        "fitting_observations": len(manifest["fitting_ids"]), "test_observations": len(events),
        "test_participants": len({row.participant_id for row in events}), "test_items": len({row.item_id for row in events}),
        "warm_user": sum(row.participant_id in people for row in events), "unseen_user": sum(row.participant_id not in people for row in events),
        "warm_item": sum(row.item_id in items for row in events), "unseen_item": sum(row.item_id not in items for row in events),
        "missing_cuisine": sum(not row.meal.get("cuisines") for row in events),
        "clock": "unavailable_static_source", "hunger": "unavailable_static_source", "weather": "unavailable_static_source",
        "feature_missing_fraction": {preset: {name: float(np.mean([row.get(name, 0) for row in batch.rows])) if batch.rows else None
            for name in sorted({key for row in batch.rows for key in row if key.endswith(".missing")})} for preset, batch in batches.items()}}


def _find_pair(intervals, first, second):
    for pair in intervals.group.values():
        if (pair.first, pair.second) == (first, second):
            return jsonable(pair)
        if (pair.first, pair.second) == (second, first):
            result = jsonable(pair)
            result.update(first=first, second=second, observed_difference=-pair.observed_difference,
                          lower=-pair.upper if pair.upper is not None else None, upper=-pair.lower if pair.lower is not None else None)
            return result
    return None


def score_experiment(freeze_dir, events, targets, out_dir) -> Report:
    started = perf_counter()
    freeze_dir = Path(freeze_dir)
    manifest, digest = _verified_manifest(freeze_dir)
    ids = tuple(manifest["split"]["test_ids"])
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
    predictions = tuple(Prediction(key, people[index], labels[index], {name: values[index] for name, values in probabilities.items()})
                        for index, key in enumerate(ids))
    intervals = paired_intervals(predictions, source="uci", study_start=None)
    feature_increments = {family: _find_pair(intervals, f"F0/{family}/42", f"F1/{family}/42") for family, _, _ in FAMILIES}
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
    candidate, reference = f"F1/{selected['candidate']}/42", selected["reference"]
    observed = _find_pair(intervals, reference, candidate)
    relative = ((metrics[reference].participant_log_loss - metrics[candidate].participant_log_loss) / metrics[reference].participant_log_loss
                if reference in metrics and candidate in metrics and metrics[reference].participant_log_loss is not None else None)
    _, after_digest = _verified_manifest(freeze_dir)
    if digest != after_digest:
        raise ValueError("score: freeze changed during scoring")
    report = Report(manifest["status"], manifest["run_kind"], "uci", digest, ids, probabilities, metrics, intervals,
        _coverage(events, batches, manifest), subgroups, feature_increments, seed_variation,
        {"candidate": candidate if candidate in metrics else None, "reference": reference, "relative_gain": relative, "paired_interval": observed},
        pilot_gain(predictions, intervals, candidate=candidate, reference=reference),
        {"global": {"status": "available"}, "personal": {"status": "available"}, "heuristic": {"status": "unavailable_no_faithful_mapping"}},
        {**manifest["timings"], "scoring_seconds": scoring_seconds, "score_total_seconds": perf_counter() - started, "peak_process_bytes": _peak_bytes()},
        {"git": manifest["git"], "scoring_git": _git(), "runtime": manifest["runtime"], "source_manifest": manifest["source_manifest"],
         "development_sha256": manifest["development_sha256"], "split_sha256": manifest["split_sha256"],
         "scoring_inputs_sha256": _hash(events), "scoring_targets_sha256": _hash({key: targets[key] for key in ids}),
         "settings_sha256": manifest["settings_sha256"], "feature_hashes": manifest["feature_hashes"],
         "artifact_hashes": {key: row["sha256"] for key, row in manifest["artifacts"].items()}},
        selected, tuple(manifest["grid_results"]), tuple(manifest["refit_results"]), tuple(manifest["split"]["audit"]))
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
