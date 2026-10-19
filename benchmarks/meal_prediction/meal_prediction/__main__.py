# ABOUTME: Runs the real public benchmark and validates version-one pilot snapshots.
# ABOUTME: Exposes staged pilot commands without omitting their required pending controls.

import argparse
from collections import Counter
import json
import logging
from pathlib import Path
import sys

from meal_prediction.experiment import public_experiment
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
    fit = commands.add_parser("fit", help="Pilot freeze (pending required heuristic and Task13 guards)")
    fit.add_argument("--input", type=Path, required=True)
    fit.add_argument("--output", type=Path, required=True)
    score = commands.add_parser("score", help="Pilot report (pending Task13 guarded final export workflow)")
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
        else:
            data = load_snapshot(args.input)
            split = split_pilot(data)
            if args.command != "validate":
                if args.command == "fit" and data.manifest["phase"] != "development":
                    raise ValueError("pilot fit: requires a development-phase export")
                raise NotImplementedError("Pilot fit/score pending the required calibrated heuristic (Task8) and guarded export/freeze workflow (Task13)")
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
