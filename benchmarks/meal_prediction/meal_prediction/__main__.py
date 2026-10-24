# ABOUTME: Runs the real public benchmark and validates version-one pilot snapshots.
# ABOUTME: Requires complete pilot bundles and immutable linked freezes for fit and score.

import argparse
from collections import Counter
import json
import logging
from pathlib import Path
import sys

from meal_prediction.experiment import fit_pilot, public_experiment, score_pilot
from meal_prediction.records import load_snapshot
from meal_prediction.splits import split_pilot


def main(argv=None):
    parser = argparse.ArgumentParser(description="CPU-only meal-prediction benchmark; score only trusted local freezes.")
    commands = parser.add_subparsers(dest="command", required=True)
    public = commands.add_parser("public", help="Run the verified official UCI static-rating comparison")
    public.add_argument("--output", type=Path, default=Path("runs/uci"))
    public.add_argument("--smoke", action="store_true", help="Verification only: one preset/config/seed per family; not full results")
    validate = commands.add_parser("validate", help="Validate a pilot export and report exclusions")
    validate.add_argument("--input", type=Path, required=True)
    fit = commands.add_parser("fit", help="Select and freeze all pilot families using a complete development bundle")
    fit.add_argument("--input", type=Path, required=True)
    fit.add_argument("--output", type=Path, required=True)
    fit.add_argument("--test-outcomes-inspected", action="store_true", help="Declare prior inspection; classify the freeze as retrospective")
    score = commands.add_parser("score", help="Score a compatible complete final bundle using a trusted local freeze")
    score.add_argument("--freeze", type=Path, required=True)
    score.add_argument("--input", type=Path, required=True)
    score.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "public":
            logging.basicConfig(level=logging.INFO, stream=sys.stdout, format="%(message)s")
            report = public_experiment(args.output, smoke=args.smoke)
            print(json.dumps({"status": report.status, "run_kind": report.run_kind,
                              "report": str(args.output / "report/report.md"), "freeze_sha256": report.freeze_sha256}))
        elif args.command == "fit":
            manifest = fit_pilot(args.input, args.output, test_outcomes_inspected=args.test_outcomes_inspected)
            print(json.dumps({"status": manifest["status"], "run_kind": manifest["run_kind"], "freeze": str(args.output),
                              "freeze_sha256": (args.output / "manifest.sha256").read_text().strip(), "freeze_timing": manifest["freeze_timing"]}))
        elif args.command == "score":
            report = score_pilot(args.freeze, args.input, args.output)
            print(json.dumps({"status": report.status, "run_kind": report.run_kind, "report": str(args.output / "report.md"),
                              "freeze_sha256": report.freeze_sha256, "useful_gain": report.useful_gain}))
        else:
            data = load_snapshot(args.input)
            split = split_pilot(data)
            print(json.dumps({"status": "valid", "source": data.source, "phase": data.manifest["phase"],
                "automated_fixture": data.manifest["sourceProvenance"]["license"] == "test-only",
                "exposures": len(data.events), "binary_targets": len(data.targets),
                "partitions": {"training": len(split.train_ids), "development": len(split.development_ids), "test": len(split.test_ids)},
                "exclusions": dict(Counter(row.reason for row in split.audit))}, sort_keys=True))
    except (OSError, ValueError, RuntimeError, NotImplementedError) as error:
        print(f"{args.command}: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
