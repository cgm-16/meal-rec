# ABOUTME: Defines reproducible public splits and shared half-open pilot partitions.
# ABOUTME: Stores actual event IDs and retains audit records independently of binary targets.

from sklearn.model_selection import train_test_split

from meal_prediction.records import AuditEntry, Dataset, Split, labels_for


def _eligible(dataset: Dataset):
    ids = []
    audit = list(dataset.audit)
    audited = {entry.event_id for entry in audit}
    for event in dataset.events:
        if event.event_id in dataset.targets:
            ids.append(event.event_id)
        elif event.event_id not in audited:
            audit.append(AuditEntry(event.event_id, "no_binary_target"))
    return ids, audit


def split_uci(dataset: Dataset, seed=42) -> Split:
    if dataset.source != "uci":
        raise ValueError("source: expected uci")
    ids, audit = _eligible(dataset)
    remaining, test = train_test_split(ids, test_size=0.15, random_state=seed,
                                       stratify=labels_for(dataset, ids))
    train, development = train_test_split(remaining, test_size=0.15 / 0.85, random_state=seed,
                                          stratify=labels_for(dataset, remaining))
    return Split(tuple(train), tuple(development), tuple(test), tuple(audit))


def split_pilot(dataset: Dataset) -> Split:
    if dataset.source != "pilot":
        raise ValueError("source: expected pilot")
    _, audit = _eligible(dataset)
    boundaries = [dataset.manifest[key] for key in
                  ("startsAt", "trainingEndsAt", "developmentEndsAt", "endsAt")]
    partitions = [[], [], []]
    for event in dataset.events:
        target = dataset.targets.get(event.event_id)
        if target is None:
            continue
        display, receipt = event.displayed_at, target.received_at
        if display is None or receipt is None:
            reason = "missing_timestamps"
        elif not boundaries[0] <= display < boundaries[-1]:
            reason = "display_outside_study"
        elif receipt <= display:
            reason = "response_before_display"
        elif not boundaries[0] <= receipt < boundaries[-1]:
            reason = "response_outside_study"
        else:
            for index in range(3):
                if boundaries[index] <= display < receipt < boundaries[index + 1]:
                    partitions[index].append(event.event_id)
                    break
            else:
                audit.append(AuditEntry(event.event_id, "crosses_cutoff"))
            continue
        audit.append(AuditEntry(event.event_id, reason))
    return Split(*(tuple(ids) for ids in partitions), tuple(dict.fromkeys(audit)))
