# ABOUTME: Checks reproducible public partitions and strict shared pilot cutoffs.
# ABOUTME: Accounts for all retained observations without treating uncertainty as a label.

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from meal_prediction import datasets, splits
from meal_prediction.records import AuditEntry, Dataset, Exposure, Target, load_snapshot


DATA = Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip"
EXAMPLE = Path(__file__).resolve().parents[3] / "contracts/meal-prediction/pilot-v1.example.json"
T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def pilot_dataset():
    manifest = {
        "startsAt": T0,
        "trainingEndsAt": T0 + timedelta(days=5),
        "developmentEndsAt": T0 + timedelta(days=7),
        "endsAt": T0 + timedelta(days=14),
    }
    cases = [
        ("train-start", timedelta(0), timedelta(seconds=1)),
        ("train-last", timedelta(days=5, seconds=-2), timedelta(days=5, seconds=-1)),
        ("cross-five", timedelta(days=5, seconds=-1), timedelta(days=5)),
        ("development-start", timedelta(days=5), timedelta(days=5, seconds=1)),
        ("cross-seven", timedelta(days=7, seconds=-1), timedelta(days=7)),
        ("test-start", timedelta(days=7), timedelta(days=7, seconds=1)),
        ("test-last", timedelta(days=14, seconds=-2), timedelta(days=14, seconds=-1)),
        ("receipt-at-end", timedelta(days=14, seconds=-1), timedelta(days=14)),
        ("display-at-end", timedelta(days=14), timedelta(days=14, seconds=1)),
        ("before-start", timedelta(seconds=-1), timedelta(0)),
        ("receipt-before-display", timedelta(days=1), timedelta(days=1, seconds=-1)),
        ("receipt-at-display", timedelta(days=1), timedelta(days=1)),
    ]
    events = tuple(
        Exposure(identity, "participant", "item", T0 + display, {}, {})
        for identity, display, _ in cases
    )
    targets = {
        identity: Target(identity, index % 2, T0 + receipt)
        for index, (identity, _, receipt) in enumerate(cases)
    }
    return Dataset("pilot", manifest, events, targets, ())


def assert_disjoint_accounted(dataset, split):
    partitions = [set(split.train_ids), set(split.development_ids), set(split.test_ids)]
    assert not partitions[0] & partitions[1]
    assert not partitions[0] & partitions[2]
    assert not partitions[1] & partitions[2]
    assigned = set.union(*partitions)
    audited = {entry.event_id for entry in split.audit}
    assert assigned | audited == {event.event_id for event in dataset.events}
    assert len(assigned) == sum(map(len, (split.train_ids, split.development_ids, split.test_ids)))


def test_pilot_cutoffs_require_both_timestamps():
    dataset = pilot_dataset()
    result = splits.split_pilot(dataset)
    assert result.train_ids == ("train-start", "train-last")
    assert result.development_ids == ("development-start",)
    assert result.test_ids == ("test-start", "test-last")
    assert {(entry.event_id, entry.reason) for entry in result.audit} == {
        ("cross-five", "crosses_cutoff"),
        ("cross-seven", "crosses_cutoff"),
        ("receipt-at-end", "response_outside_study"),
        ("display-at-end", "display_outside_study"),
        ("before-start", "display_outside_study"),
        ("receipt-before-display", "response_before_display"),
        ("receipt-at-display", "response_before_display"),
    }
    assert_disjoint_accounted(dataset, result)
    assert splits.split_pilot(dataset) == result
    assert len(dataset.events) == 12
    assert len(dataset.targets) == 12


def test_pilot_preserves_uncertain_unanswered_and_imported_audit():
    dataset = load_snapshot(EXAMPLE)
    result = splits.split_pilot(dataset)
    assert result.train_ids == ("e-yes", "e-no")
    assert result.development_ids == result.test_ids == ()
    assert set(result.audit) >= set(dataset.audit)
    assert ("e-unsure", "not_sure") in {(entry.event_id, entry.reason) for entry in result.audit}
    assert ("e-unanswered", "unanswered") in {(entry.event_id, entry.reason) for entry in result.audit}
    assert_disjoint_accounted(dataset, result)


@pytest.mark.parametrize("missing", ["display", "receipt"])
def test_pilot_audits_missing_timestamp(missing):
    event = Exposure("missing-time", "participant", "item", None if missing == "display" else T0, {}, {})
    target = Target(event.event_id, 1, None if missing == "receipt" else T0 + timedelta(seconds=1))
    dataset = Dataset("pilot", pilot_dataset().manifest, (event,), {event.event_id: target}, ())
    result = splits.split_pilot(dataset)
    assert result.train_ids == result.development_ids == result.test_ids == ()
    assert AuditEntry("missing-time", "missing_timestamps") in result.audit
    assert_disjoint_accounted(dataset, result)


def test_uci_splits_are_stratified_reproducible_and_accounted():
    dataset = datasets.load_uci(datasets.fetch_uci(DATA))
    first = splits.split_uci(dataset)
    second = splits.split_uci(dataset)
    assert first == second == splits.split_uci(dataset, seed=42)
    assert first.train_ids[:3] == ("uci:U1013:132875", "uci:U1134:135026", "uci:U1106:135079")
    assert first.development_ids[:3] == ("uci:U1063:132584", "uci:U1125:135063", "uci:U1043:132613")
    assert first.test_ids[:3] == ("uci:U1131:132870", "uci:U1019:135038", "uci:U1006:132572")
    assert [len(first.train_ids), len(first.development_ids), len(first.test_ids)] == [812, 174, 175]
    assert [
        sum(dataset.targets[identity].y for identity in ids)
        for ids in (first.train_ids, first.development_ids, first.test_ids)
    ] == [361, 77, 78]
    assert_disjoint_accounted(dataset, first)
    assert set(first.train_ids + first.development_ids + first.test_ids) == set(dataset.targets)
    assert splits.split_uci(dataset, seed=43) != first
    assert len(dataset.events) == len(dataset.targets) == 1161
    unlabelled = Exposure("uci:unlabelled", "participant", "item", None, {}, {})
    audit = (AuditEntry(unlabelled.event_id, "unanswered"),)
    augmented = replace(dataset, events=(*dataset.events, unlabelled), audit=audit)
    assert splits.split_uci(augmented) == replace(first, audit=audit)
    assert_disjoint_accounted(augmented, splits.split_uci(augmented))


def test_pilot_accounts_for_unlabelled_observation_without_existing_audit():
    event = Exposure("unlabelled", "participant", "item", T0, {}, {})
    dataset = Dataset("pilot", pilot_dataset().manifest, (event,), {}, ())
    result = splits.split_pilot(dataset)
    assert result.train_ids == result.development_ids == result.test_ids == ()
    assert result.audit == (AuditEntry("unlabelled", "no_binary_target"),)
    assert_disjoint_accounted(dataset, result)


@pytest.mark.parametrize("function, source", [("split_uci", "pilot"), ("split_pilot", "uci")])
def test_split_rejects_wrong_source(function, source):
    dataset = replace(pilot_dataset(), source=source)
    with pytest.raises(ValueError, match="source"):
        getattr(splits, function)(dataset)
