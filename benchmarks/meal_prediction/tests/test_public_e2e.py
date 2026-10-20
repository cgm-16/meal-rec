# ABOUTME: Runs the real official UCI archive through the three-family public CLI.
# ABOUTME: Checks shared saved IDs and explicitly labels CI smoke as verification only.

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def test_public_all_families_share_test_ids(tmp_path):
    output = tmp_path / "uci"
    result = subprocess.run([sys.executable, "-m", "meal_prediction", "public", "--smoke", "--output", str(output)], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stderr == ""
    manifest = json.loads((output / "freeze/manifest.json").read_text())
    report = json.loads((output / "report/report.json").read_text())
    split = json.loads((output / "split.json").read_text())
    assert manifest["run_kind"] == report["run_kind"] == "smoke_verification_only"
    assert len(manifest["grid_results"]) == 3
    assert report["coverage"]["source_observations"] == 1161
    assert report["coverage"]["test_observations"] == 175
    assert report["useful_gain"]["status"] == "not_applicable_public_proxy"
    assert report["controls"]["heuristic"]["status"] == "unavailable_no_faithful_mapping"
    assert report["test_ids"] == split["test_ids"] == manifest["split"]["test_ids"]
    assert set(report["metrics"]) == {"F1/M1/42", "F1/M2/42", "F1/M3/42", "global", "personal"}
    assert all(len(values) == 175 for values in report["probabilities"].values())
    assert len(report["comparisons"]["group"]) == 10
    assert report["comparisons"]["replicates"] == 2000
    assert (output / "report/report.md").is_file()
    rerun = subprocess.run([sys.executable, "-m", "meal_prediction", "public", "--smoke", "--output", str(output)], cwd=ROOT, text=True, capture_output=True)
    assert rerun.returncode != 0
    assert "output" in rerun.stderr


def test_validate_cli_reports_real_snapshot_exclusions():
    snapshot = ROOT.parents[1] / "contracts/meal-prediction/pilot-v1.example.json"
    result = subprocess.run([sys.executable, "-m", "meal_prediction", "validate", "--input", str(snapshot)], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["source"] == "pilot"
    assert data["automated_fixture"] is True
    assert data["exposures"] == 4
    assert data["binary_targets"] == 2
    assert data["partitions"] == {"training": 2, "development": 0, "test": 0}
    assert data["exclusions"] == {"client_closed": 1, "not_sure": 1, "unanswered": 1}


def test_pilot_cli_requires_complete_bundles_before_creating_outputs(tmp_path):
    snapshot = ROOT.parents[1] / "contracts/meal-prediction/pilot-v1.example.json"
    for command in ("fit", "score"):
        output = tmp_path / command
        args = [sys.executable, "-m", "meal_prediction", command, "--input", str(snapshot), "--output", str(output)]
        if command == "score":
            args += ["--freeze", str(tmp_path / "unread-freeze")]
        result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
        assert result.returncode == 2
        assert "bundle" in result.stderr
        assert not output.exists()


def test_pilot_fit_score_cli_produces_frozen_report(tmp_path):
    from test_pilot_replay import bundle, snapshot

    root = snapshot()
    for response in root["responses"]:
        response["answer"] = "no"
    development = bundle(tmp_path / "development", root)
    freeze = tmp_path / "freeze"
    fit = subprocess.run([sys.executable, "-m", "meal_prediction", "fit", "--input", str(development),
                          "--output", str(freeze), "--test-outcomes-inspected"], cwd=ROOT, text=True, capture_output=True)
    assert fit.returncode == 0, fit.stdout + fit.stderr
    assert fit.stderr == ""
    summary = json.loads(fit.stdout)
    assert summary["status"] == "not_estimable" and summary["freeze_timing"]["classification"] == "retrospective"
    manifest = json.loads((freeze / "manifest.json").read_text())
    root = snapshot("final", {**manifest, "digest": summary["freeze_sha256"]})
    for response in root["responses"]:
        if response["eventId"] in manifest["fitting_ids"]:
            response["answer"] = "no"
    final = bundle(tmp_path / "final", root)
    output = tmp_path / "report"
    score = subprocess.run([sys.executable, "-m", "meal_prediction", "score", "--freeze", str(freeze),
                            "--input", str(final), "--output", str(output)], cwd=ROOT, text=True, capture_output=True)
    assert score.returncode == 0, score.stdout + score.stderr
    assert score.stderr == ""
    data = json.loads((output / "report.json").read_text())
    assert data["source"] == "pilot" and data["status"] == "not_estimable"
    assert data["useful_gain"]["status"] == "insufficient_evidence"
    assert data["provenance"]["empirical_pilot_comparison"] == "pending_genuine_study"
    assert data["coverage"]["test_observations"] == 10
    assert data["controls"]["heuristic"]["reason"] == "single_class"
