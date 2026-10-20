# ABOUTME: Writes measured comparisons with provenance and explicit unsupported evidence.
# ABOUTME: Keeps raw aligned probabilities and secondary analyses beside the main table.

from dataclasses import asdict, dataclass, is_dataclass
from datetime import datetime
import json
from pathlib import Path

from meal_prediction.metrics import IntervalSummary, MetricSummary


def jsonable(value):
    if is_dataclass(value):
        return jsonable(asdict(value))
    if isinstance(value, dict):
        return {str(key): jsonable(child) for key, child in value.items()}
    if isinstance(value, (tuple, list)):
        return [jsonable(child) for child in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def json_bytes(value):
    return (json.dumps(jsonable(value), sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


@dataclass(frozen=True)
class Report:
    status: str
    run_kind: str
    source: str
    freeze_sha256: str
    test_ids: tuple[str, ...]
    probabilities: dict[str, tuple[float, ...]]
    metrics: dict[str, MetricSummary]
    comparisons: IntervalSummary
    coverage: dict
    subgroups: dict
    feature_increments: dict
    seed_variation: dict
    selected_comparison: dict
    useful_gain: dict
    controls: dict
    timings: dict
    provenance: dict
    selection: dict
    grid_results: tuple[dict, ...]
    refit_results: tuple[dict, ...]
    exclusions: tuple[dict, ...]


def _number(value):
    return "unsupported" if value is None else f"{value:.6f}"


def write_report(report: Report, out_dir: Path, predictions) -> None:
    if out_dir.exists() and any(out_dir.iterdir()):
        raise FileExistsError(f"output: refusing to overwrite report evidence in {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_bytes(json_bytes(report))
    with (out_dir / "predictions.jsonl").open("w") as stream:
        for row in predictions:
            stream.write(json.dumps(jsonable(row), sort_keys=True, allow_nan=False) + "\n")
    preset = report.selection["primary_preset"]
    pilot = report.source == "pilot"
    lines = [f"# {'Pilot' if pilot else 'UCI'} three-model comparison ({report.run_kind})", "",
        "Immediate meal appeal replay; F3 is the prespecified primary information set." if pilot else
        "Static observed restaurant food-rating proxy; F1 is the prespecified public main information set.",
        "Constructed verification only; never genuine pilot benchmark evidence." if report.run_kind == "constructed_verification_only" else
        "Pilot collection provenance requires independent review; schema and license do not establish authenticity." if pilot else
        "Smoke runs verify integration only and are not full benchmark results." if report.run_kind != "full_benchmark" else
        "All nine settings per family/preset were attempted; seeds 43/44 measure sensitivity and do not select a winner.", "",
        f"Status: **{report.status}**. Development selected {report.selection['candidate']} / {preset}; "
        f"reference {report.selection['reference']}. No test-based selection.", "",
        "## Primary results", "", "| Model / seed | Participant log loss | Event log loss | Participant Brier |",
        "| --- | ---: | ---: | ---: |"]
    for name, metric in report.metrics.items():
        if name in ("global", "personal", "heuristic") or (name.startswith(preset + "/") and name.endswith("/42")):
            lines.append(f"| {name} | {_number(metric.participant_log_loss)} | {_number(metric.event_log_loss)} | {_number(metric.participant_brier)} |")
    lines += ["", "## All presets and seeds", "", "| Model / seed | Participant log loss | Fit seconds | Score seconds |",
              "| --- | ---: | ---: | ---: |"]
    fits = {row["key"]: row for row in report.refit_results}
    for name, metric in report.metrics.items():
        lines.append(f"| {name} | {_number(metric.participant_log_loss)} | {_number(fits.get(name, {}).get('seconds'))} | {_number(report.timings['scoring_seconds'].get(name))} |")
    lines += ["", "## Paired exploratory differences", "",
              "Differences are first loss minus second loss; negative favors the first. All pairs use identical IDs and shared draws.",
              "2,000 seed-42 participant resamples and common circular two-day date blocks; percentile 95% intervals." if pilot else
              "2,000 seed-42 participant resamples; percentile 95% intervals. UCI has no date/block interval.", "",
              "| First | Second | Difference | 95% interval | Usable / empty |", "| --- | --- | ---: | --- | ---: |"]
    for pair in report.comparisons.group.values():
        lines.append(f"| {pair.first} | {pair.second} | {_number(pair.observed_difference)} | [{_number(pair.lower)}, {_number(pair.upper)}] | {pair.usable} / {pair.empty} |")
    if pilot:
        lines += ["", "### Date-block sensitivity", "", "| First | Second | Difference | 95% interval | Usable / empty |", "| --- | --- | ---: | --- | ---: |"]
        for pair in report.comparisons.time.values():
            lines.append(f"| {pair.first} | {pair.second} | {_number(pair.observed_difference)} | [{_number(pair.lower)}, {_number(pair.upper)}] | {pair.usable} / {pair.empty} |")
        lines += ["", "## Frozen pilot assessment", "", "```json", json.dumps(jsonable({
            "freeze_timing": report.provenance["freeze_timing"], "selected_comparison": report.selected_comparison,
            "useful_gain": report.useful_gain, "controls": report.controls}), indent=2), "```",
            "Freeze classification uses recorded timing and caller declaration; absence of outside inspection is not software-verifiable."]
    lines += ["", "## Feature increments and seed sensitivity", "", "```json",
              json.dumps(jsonable({"feature_increments": report.feature_increments, "seed_variation": report.seed_variation}), indent=2), "```",
              "", "## Coverage", "", "```json", json.dumps(report.coverage, indent=2), "```", "",
              "Warm/unseen user and item subgroup losses, per-participant losses and fixed-bin calibration are in report.json.",
              "Empty subgroups are unsupported, not evidence of cold-start generalization.", "",
              "## Search and fit failures", ""]
    failures = [row for row in report.grid_results + report.refit_results if row["status"] != "ok"]
    lines += ["```json", json.dumps(failures, indent=2), "```"] if failures else ["No failed settings or refits."]
    lines += ["", "## Provenance and limitations", "", "```json", json.dumps(report.provenance, indent=2), "```", "",
              f"Freeze manifest SHA-256: `{report.freeze_sha256}`.",
              "Peak memory is the process high-water mark, normalized to bytes, not isolated per-model memory.",
              "Pilot controls include both frozen rate controls and the pinned calibrated heuristic; unavailable fits are explicit." if pilot else
              "Heuristic control unavailable: no faithful dish-level mapping for UCI. Both rate controls are reported.",
              "Intervals are descriptive. The lowest observed test loss does not establish a reliable winner.",
              "Fewer than five nonempty test dates or a single observed class is insufficient evidence. Solo results are within-person." if pilot else
              "These ratings have no event dates, hunger, weather or immediate appetite labels; no useful appetite/weather gain is claimed.",
              *(["Weather/hunger increments are predictive associations, not causal effects; missing weather cannot establish a lack of value."] if pilot else []),
              "Predictive performance does not show that deploying a model improves acceptance, purchasing or consumption."]
    (out_dir / "report.md").write_text("\n".join(lines) + "\n")
