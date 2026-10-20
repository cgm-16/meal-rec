# ABOUTME: Replays constructed schema-one bundles through all three native model families.
# ABOUTME: Protects immutable week-one selection, receipt boundaries and guarded final evaluation.

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import pickle
import shutil

import numpy as np
import pytest

from meal_prediction import experiment
from meal_prediction.controls import fit_heuristic_control
from meal_prediction.features import fit_features, transform_features
from meal_prediction.models import load_fitted
from meal_prediction.records import events_for, labels_for, load_snapshot
from meal_prediction.report import json_bytes
from meal_prediction.splits import split_pilot


EXAMPLE = Path(__file__).resolve().parents[3] / 'contracts/meal-prediction/pilot-v1.example.json'
T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def stamp(instant):
    return instant.isoformat().replace('+00:00', 'Z')


def snapshot(phase='development', manifest=None):
    """Constructed verification only: no people, Mongo, or provider calls."""
    template = json.loads(EXAMPLE.read_text())
    root = deepcopy(template)
    root['manifest'].update(phase=phase, exportedAt=stamp(T0 + timedelta(days=7 if phase == 'development' else 14)))
    for key in ('participants', 'visits', 'allocations', 'exposures', 'responses', 'audit'):
        root[key] = []
    for person in ('p0', 'p1'):
        participant = deepcopy(template['participants'][0])
        participant['participantId'] = person
        root['participants'].append(participant)
    days = (0, 1, 2, 3, 5, 6) if phase == 'development' else (0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11)
    for day in days:
        for person in range(2):
            identity = f'd{day}-p{person}'
            when = T0 + timedelta(days=day, hours=12, minutes=person)
            visit = deepcopy(template['visits'][0])
            visit.update(visitId='v-' + identity, participantId=f'p{person}', startedAt=stamp(when),
                         expiresAt=stamp(when + timedelta(minutes=30)), contextCapturedAt=stamp(when),
                         hunger=('not_hungry', 'very_hungry')[(day + person) % 2])
            visit['weather'].update(requestedAt=stamp(when), retrievedAt=stamp(when), validAt=stamp(when),
                                    temperatureC=8 + day, precipitationMm=person, weatherCode=61 if person else 0)
            allocation = deepcopy(template['allocations'][0])
            allocation.update(allocationId='a-' + identity, participantId=f'p{person}', itemId='m0',
                              localDate=when.date().isoformat(), allocatedAt=stamp(when))
            exposure = deepcopy(template['exposures'][0])
            exposure.update(eventId=identity, participantId=f'p{person}', visitId=visit['visitId'],
                            allocationId=allocation['allocationId'], itemId='m0',
                            displayedAt=stamp(when + timedelta(seconds=1)), clientDisplayedAt=stamp(when + timedelta(seconds=1)))
            exposure['meal']['id'] = 'm0'
            response = deepcopy(template['responses'][0])
            response.update(responseId='r-' + identity, eventId=identity, participantId=f'p{person}',
                            answer='yes' if (day + person) % 2 else 'no',
                            actionAt=stamp(when + timedelta(seconds=2)), receivedAt=stamp(when + timedelta(seconds=3)))
            for key, row in (('visits', visit), ('allocations', allocation), ('exposures', exposure), ('responses', response)):
                root[key].append(row)
    # A display before day7 with a receipt exactly on day7 must never enter either partition.
    when = T0 + timedelta(days=7, seconds=-10)
    for key, id_key in (('visits', 'visitId'), ('allocations', 'allocationId'), ('exposures', 'eventId')):
        row = deepcopy(root[key][-2])
        row[id_key] = {'visits': 'v-cross', 'allocations': 'a-cross', 'exposures': 'cross'}[key]
        if key == 'visits':
            row.update(startedAt=stamp(when), expiresAt=stamp(when + timedelta(minutes=30)), contextCapturedAt=stamp(when), hunger="not_hungry", weather=None)
        elif key == 'allocations':
            row.update(allocatedAt=stamp(when), localDate=when.date().isoformat())
        else:
            row.update(visitId='v-cross', allocationId='a-cross', displayedAt=stamp(when + timedelta(seconds=1)),
                       clientDisplayedAt=stamp(when + timedelta(seconds=1)))
        root[key].append(row)
    root['audit'] = [{'eventId': 'cross', 'reason': 'crosses_cutoff'}]
    if phase == 'final':
        response = deepcopy(root['responses'][-2])
        response.update(responseId='r-cross', eventId='cross', answer='yes',
                        actionAt=stamp(T0 + timedelta(days=7)), receivedAt=stamp(T0 + timedelta(days=7)))
        root['responses'].append(response)
        root['manifest']['freezeLink'] = {'freezeManifestSha256': 'a' * 64, 'frozenAt': stamp(T0 + timedelta(days=7)),
                                           'developmentSnapshotSha256': 'b' * 64}
        if manifest is not None:
            root['manifest']['freezeLink'].update(freezeManifestSha256=manifest['digest'], frozenAt=manifest['frozen_at'],
                                                 developmentSnapshotSha256=manifest['development_snapshot_sha256'])
    return root


def bundle(path, root):
    path.mkdir()
    (path / 'snapshot.json').write_bytes(json_bytes(root))
    source = root['manifest']
    study = {key: value for key, value in source.items() if key not in ('phase', 'exportedAt', 'sourceProvenance', 'freezeLink')}
    study['cityOptions'] = [root['participants'][0]['settings'][0]['city']]
    collection = {'schemaVersion': 1, 'study': study, 'phase': source['phase'], 'exportedAt': source['exportedAt'],
                  'allocationMeals': [], 'lifecycle': {'status': 'unavailable' if source['phase'] == 'development' else 'available',
                      'reason': 'Mutable lifecycle unavailable in development' if source['phase'] == 'development' else None,
                      'lifecycleAsOf': None if source['phase'] == 'development' else source['exportedAt'], 'participants': []}}
    (path / 'collection.json').write_bytes(json_bytes(collection))
    rehash_bundle(path)
    return path


def rehash_bundle(path):
    (path / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((path / name).read_bytes()).hexdigest()}  {name}\n'
                                           for name in ('snapshot.json', 'collection.json')))


def rewrite_manifest(freeze, value):
    raw = json_bytes(value)
    (freeze / 'manifest.json').write_bytes(raw)
    (freeze / 'manifest.sha256').write_text(hashlib.sha256(raw).hexdigest() + '\n')


@pytest.fixture(scope='module')
def replay(tmp_path_factory):
    directory = tmp_path_factory.mktemp('constructed-pilot-replay')
    development = bundle(directory / 'development', snapshot())
    freeze = directory / 'freeze'
    manifest = experiment.fit_pilot(development, freeze)
    linked = {**manifest, 'digest': (freeze / 'manifest.sha256').read_text().strip()}
    final = bundle(directory / 'final', snapshot('final', linked))
    report = experiment.score_pilot(freeze, final, directory / 'report')
    return directory, development, freeze, manifest, final, report


def test_frozen_replay_never_learns_week_two(replay, tmp_path):
    directory, development, freeze, manifest, final, before = replay
    frozen_bytes = {path.name: path.read_bytes() for path in freeze.iterdir()}
    changed = json.loads((final / 'snapshot.json').read_text())
    for row in changed['responses']:
        if row['eventId'].startswith(('d7-', 'd8-', 'd9-', 'd10-', 'd11-')):
            row['answer'] = 'no' if row['answer'] == 'yes' else 'yes'
    altered = bundle(tmp_path / 'changed', changed)
    after = experiment.score_pilot(freeze, altered, tmp_path / 'report')
    assert before.probabilities == after.probabilities
    assert before.metrics != after.metrics
    assert before.freeze_sha256 == after.freeze_sha256
    assert frozen_bytes == {path.name: path.read_bytes() for path in freeze.iterdir()}
    assert manifest['split']['test_ids'] == []
    assert len(before.test_ids) == 10 and len(set(before.test_ids)) == 10
    assert manifest['source_manifest'] == json.loads((development / 'snapshot.json').read_text())['manifest']
    assert manifest['development_snapshot_sha256'] == hashlib.sha256((development / 'snapshot.json').read_bytes()).hexdigest()
    assert manifest['development_sha256'] != manifest['development_snapshot_sha256']
    assert manifest['protocol']['primary_preset'] == before.selection['primary_preset'] == 'F3'
    assert len(manifest['grid_results']) == 108
    for preset in ('F0', 'F1', 'F2', 'F3'):
        for family in ('M1', 'M2', 'M3'):
            rows = [row for row in manifest['grid_results'] if row['preset'] == preset and row['family'] == family]
            assert [row['grid_index'] for row in rows] == list(range(9))
            assert all(row['seed'] == 42 for row in rows)
            assert all(f'{preset}/{family}/{seed}' in before.metrics for seed in (42, 43, 44))
    assert len(before.metrics) == 39
    assert before.controls['heuristic']['status'] == 'available'
    assert before.comparisons.source == 'pilot' and before.comparisons.date_support == 5
    assert len(before.comparisons.group) == len(before.comparisons.time) == 741
    assert set(before.feature_increments) == {'F0->F1', 'F1->F2', 'F2->F3'}
    assert before.coverage['weather']['usable'] == 10
    assert before.coverage['partition_support']['training'] == {
        'observations': 8, 'participants': 2, 'meals': 1, 'labels': {'0': 4, '1': 4},
        'study_days': {'0': 2, '1': 2, '2': 2, '3': 2},
        'missing_hunger': 0, 'unusable_weather': 0}
    assert before.coverage['partition_support']['development']['observations'] == 4
    assert before.coverage['partition_support']['test']['study_days'] == {'7': 2, '8': 2, '9': 2, '10': 2, '11': 2}
    assert before.coverage['collection']['lifecycle']['status'] == 'available'
    assert before.provenance['empirical_pilot_comparison'] == 'pending_genuine_study'
    assert 'Constructed verification' in (directory / 'report/report.md').read_text()


def test_late_freeze_is_retrospective(replay):
    _, _, _, manifest, _, report = replay
    assert manifest['freeze_timing']['classification'] == 'retrospective'
    assert 'late_freeze' in manifest['freeze_timing']['reasons']
    assert report.provenance['freeze_timing'] == manifest['freeze_timing']
    assert report.useful_gain['useful_gain'] is False


def test_cross_cutoff_response_is_quarantined(replay):
    _, development, freeze, manifest, final, report = replay
    data = load_snapshot(final / 'snapshot.json')
    assert 'cross' not in data.targets
    assert 'cross' not in manifest['fitting_ids'] and 'cross' not in report.test_ids
    assert {'event_id': 'cross', 'reason': 'crosses_cutoff'} in report.exclusions
    assert report.coverage['exclusions']['crosses_cutoff'] == 1
    assert len(manifest['fitting_ids']) == 12
    assert manifest['fitting_ids'] == list(split_pilot(load_snapshot(development / 'snapshot.json')).train_ids +
                                           split_pilot(load_snapshot(development / 'snapshot.json')).development_ids)


def test_calibration_and_profiles_freeze_at_day_five_then_day_seven(replay):
    _, development, freeze, manifest, final, report = replay
    data = load_snapshot(development / 'snapshot.json')
    split = split_pilot(data)
    train = events_for(data, split.train_ids)
    train_targets = {key: data.targets[key] for key in split.train_ids}
    dev = events_for(data, split.development_ids)
    fitted = fit_heuristic_control(train, train_targets)
    expected = experiment.evaluate(split.development_ids, tuple(row.participant_id for row in dev),
                                   labels_for(data, split.development_ids), fitted.predict_proba(experiment._control_batch(dev)))
    assert manifest['selection']['control_development_losses']['heuristic'] == expected.participant_log_loss
    restored = load_fitted(freeze / manifest['artifacts']['heuristic']['path'])
    assert set(restored.fit_targets) == set(manifest['fitting_ids'])
    assert all(row.received_at < T0 + timedelta(days=7) for row in restored.fit_targets.values())
    scored_data = load_snapshot(final / 'snapshot.json')
    test_events = events_for(scored_data, report.test_ids)
    np.testing.assert_array_equal(restored.predict_proba(experiment._control_batch(test_events)), report.probabilities['heuristic'])
    state, _ = fit_features(train, train_targets, preset='F1', source='pilot')
    development_rows = transform_features(state, dev).rows
    assert [row['profile.user.count'] for row in development_rows] == [4.0] * 4
    final_state = experiment._read_state(freeze / manifest['feature_hashes']['F1']['path'])
    assert [row['profile.user.count'] for row in transform_features(final_state, test_events).rows] == [6.0] * 10


@pytest.mark.parametrize('damage', ['missing_marker', 'snapshot_hash', 'collection_hash', 'standalone', 'future_context', 'final_phase'])
def test_fit_requires_complete_development_bundle(tmp_path, damage):
    root = snapshot('final') if damage == 'final_phase' else snapshot()
    if damage == 'future_context':
        root['visits'][0]['weather']['retrievedAt'] = stamp(T0 + timedelta(days=7))
    path = bundle(tmp_path / 'input', root)
    if damage == 'missing_marker':
        (path / 'SHA256SUMS').unlink()
    elif damage in ('snapshot_hash', 'collection_hash'):
        target = path / ('snapshot.json' if damage == 'snapshot_hash' else 'collection.json')
        target.write_bytes(target.read_bytes() + b' ')
    elif damage == 'standalone':
        path = path / 'snapshot.json'
    with pytest.raises((ValueError, OSError), match='bundle|hash|development|week|context'):
        experiment.fit_pilot(path, tmp_path / 'freeze')
    assert not (tmp_path / 'freeze').exists()


@pytest.mark.parametrize('damage', ['study', 'raw_cutoff', 'raw_hash', 'freeze_hash', 'freeze_time', 'weekone_label', 'weekone_context', 'phase', 'collection'])
def test_final_requires_compatible_study_week_one_and_exact_link(replay, tmp_path, damage):
    _, _, freeze, _, final, _ = replay
    root = json.loads((final / 'snapshot.json').read_text())
    if damage == 'study':
        root['manifest']['studyId'] = 'other-study'
    elif damage == 'raw_cutoff':
        root['manifest']['startsAt'] = '2026-01-01T00:00:00+00:00'
    elif damage in ('raw_hash', 'freeze_hash', 'freeze_time'):
        key = {'raw_hash': 'developmentSnapshotSha256', 'freeze_hash': 'freezeManifestSha256', 'freeze_time': 'frozenAt'}[damage]
        root['manifest']['freezeLink'][key] = stamp(T0) if damage == 'freeze_time' else '0' * 64
    elif damage == 'weekone_label':
        root['responses'][0]['answer'] = 'yes' if root['responses'][0]['answer'] == 'no' else 'no'
    elif damage == 'weekone_context':
        root['visits'][0]['hunger'] = 'somewhat_hungry'
    elif damage == 'phase':
        root = snapshot()
    path = bundle(tmp_path / 'input', root)
    if damage == 'collection':
        (path / 'collection.json').write_bytes(b'{}')
        rehash_bundle(path)
    with pytest.raises(ValueError, match='study|compatible|week.one|link|final|collection'):
        experiment.score_pilot(freeze, path, tmp_path / 'report')
    assert not (tmp_path / 'report').exists()


@pytest.mark.parametrize('damage', ['protocol', 'training_weights', 'calibration_bins', 'schema_boolean', 'artifact_metadata', 'invalid_status', 'missing_control', 'feature_source', 'future_test_ids', 'source_manifest', 'missing_field'])
def test_pilot_freeze_schema_is_checked_before_unpickle(replay, tmp_path, damage):
    _, _, original, manifest, final, _ = replay
    freeze = tmp_path / 'freeze'
    shutil.copytree(original, freeze)
    value = deepcopy(manifest)
    marker = tmp_path / 'unpickled'

    class Payload:
        def __reduce__(self):
            return Path.touch, (marker,)

    entry = value['artifacts']['F3/M1/42']
    raw = pickle.dumps(Payload())
    (freeze / entry['path']).write_bytes(raw)
    entry['sha256'] = hashlib.sha256(raw).hexdigest()
    if damage == 'protocol':
        value['protocol']['presets'] = ['F3']
    elif damage == 'training_weights':
        value['protocol']['training_weights'] = 'participant'
    elif damage == 'calibration_bins':
        value['protocol']['calibration_bin_edges'] = [0, 1]
    elif damage == 'schema_boolean':
        value['schema_version'] = True
    elif damage == 'artifact_metadata':
        entry['preset'] = 'F0'
    elif damage == 'invalid_status':
        value['status'] = 'success-ish'
    elif damage == 'missing_control':
        del value['controls']['heuristic']
    elif damage == 'feature_source':
        feature = value['feature_hashes']['F3']
        state = json.loads((freeze / feature['path']).read_text())
        state['source'] = 'uci'
        raw_state = json_bytes(state)
        (freeze / feature['path']).write_bytes(raw_state)
        feature['sha256'] = hashlib.sha256(raw_state).hexdigest()
    elif damage == 'future_test_ids':
        value['split']['test_ids'] = ['future']
        value['split_sha256'] = hashlib.sha256(json_bytes(value['split'])).hexdigest()
    elif damage == 'source_manifest':
        value['source_manifest']['freezeLink'] = {}
    else:
        del value['development_snapshot_sha256']
    rewrite_manifest(freeze, value)
    root = json.loads((final / 'snapshot.json').read_text())
    root['manifest']['freezeLink']['freezeManifestSha256'] = (freeze / 'manifest.sha256').read_text().strip()
    relinked = bundle(tmp_path / 'relinked-final', root)
    with pytest.raises(ValueError, match='freeze|manifest|protocol'):
        experiment.score_pilot(freeze, relinked, tmp_path / 'report')
    assert not marker.exists()


def test_one_class_pilot_retains_baselines_and_explicit_heuristic_failure(tmp_path):
    root = snapshot()
    for row in root['responses']:
        row['answer'] = 'no'
    development = bundle(tmp_path / 'development', root)
    freeze = tmp_path / 'freeze'
    manifest = experiment.fit_pilot(development, freeze, test_outcomes_inspected=True)
    assert manifest['status'] == 'not_estimable'
    assert manifest['selection']['candidate'] is None
    assert manifest['controls']['heuristic']['status'] == 'not_estimable'
    assert manifest['controls']['heuristic']['reason'] == 'single_class'
    assert manifest['freeze_timing']['test_outcomes_inspected'] is True
    assert 'declared_test_inspection' in manifest['freeze_timing']['reasons']
    final_root = snapshot('final', {**manifest, 'digest': (freeze / 'manifest.sha256').read_text().strip()})
    for row in final_root['responses']:
        if row['eventId'] in set(manifest['fitting_ids']):
            row['answer'] = 'no'
    final = bundle(tmp_path / 'final', final_root)
    report = experiment.score_pilot(freeze, final, tmp_path / 'report')
    assert report.status == 'not_estimable' and set(report.metrics) == {'global', 'personal'}
    assert report.useful_gain['status'] == 'insufficient_evidence'
    assert report.controls['heuristic']['reason'] == 'single_class'


@pytest.mark.parametrize('offset,inspected,classification', [(0, False, 'prospective'), (0, True, 'retrospective'),
                                                           (1, False, 'retrospective')])
def test_freeze_classification_uses_both_recorded_times_and_inspection(offset, inspected, classification):
    value = {'source_manifest': snapshot()['manifest'], 'selected_at': stamp(T0 + timedelta(days=7)),
             'frozen_at': stamp(T0 + timedelta(days=7, seconds=offset))}
    value['source_manifest']['exportedAt'] = stamp(T0 + timedelta(days=6, hours=13))
    result = experiment._freeze_timing(value, inspected)
    assert result['classification'] == classification
    assert result['test_outcomes_inspected'] is inspected
    value['selected_at'] = stamp(T0 + timedelta(days=7, seconds=-1))
    assert experiment._freeze_timing(value, inspected)['classification'] == classification


def test_empty_final_and_cold_start_keep_fitted_states_frozen(replay, tmp_path):
    _, _, freeze, manifest, final, _ = replay
    root = json.loads((final / 'snapshot.json').read_text())
    cold = deepcopy(root['participants'][0])
    cold['participantId'] = 'test-only-person'
    cold['enrolledAt'] = stamp(T0 + timedelta(days=7))
    cold['settings'][0]['effectiveAt'] = cold['enrolledAt']
    root['participants'].append(cold)
    identity = 'd8-p0'
    for key, id_key in (('visits', 'visitId'), ('allocations', 'allocationId'), ('exposures', 'eventId'), ('responses', 'eventId')):
        row = next(row for row in root[key] if row[id_key] == ({'visits': 'v-', 'allocations': 'a-'}.get(key, '') + identity))
        row['participantId'] = 'test-only-person'
        if key in ('allocations', 'exposures'):
            row['itemId'] = 'test-only-meal'
        if key == 'exposures':
            row['meal'].update(id='test-only-meal', cuisine='test-only-cuisine', primaryIngredients=['test-only-ingredient'])
    cold_final = bundle(tmp_path / 'cold', root)
    before = {path.name: path.read_bytes() for path in freeze.iterdir()}
    report = experiment.score_pilot(freeze, cold_final, tmp_path / 'cold-report')
    assert report.coverage['unseen_user'] == report.coverage['unseen_item'] == 1
    assert report.subgroups['unseen_user']['observations'] == 1
    assert before == {path.name: path.read_bytes() for path in freeze.iterdir()}
    assert 'test-only-person' not in manifest['known_participants']
    for entry in manifest['feature_hashes'].values():
        assert 'test-only-person' not in (freeze / entry['path']).read_text()
        assert 'test-only-ingredient' not in (freeze / entry['path']).read_text()
    root = json.loads((final / 'snapshot.json').read_text())
    for key, time_key in (('visits', 'startedAt'), ('allocations', 'allocatedAt'), ('exposures', 'displayedAt')):
        root[key] = [row for row in root[key] if datetime.fromisoformat(row[time_key]) < T0 + timedelta(days=7)]
    retained = {row['eventId'] for row in root['exposures']}
    root['responses'] = [row for row in root['responses'] if row['eventId'] in retained]
    empty = bundle(tmp_path / 'empty', root)
    report = experiment.score_pilot(freeze, empty, tmp_path / 'empty-report')
    assert report.test_ids == () and report.useful_gain['status'] == 'insufficient_evidence'
    assert len(report.metrics) == 39 and all(row.status == 'empty' for row in report.metrics.values())
    assert before == {path.name: path.read_bytes() for path in freeze.iterdir()}


def test_control_development_failure_does_not_mislabel_successful_week_one_refit(tmp_path):
    root = snapshot()
    for response in root['responses']:
        if response['eventId'].startswith(('d0-', 'd1-', 'd2-', 'd3-')):
            response['answer'] = 'no'
    manifest = experiment.fit_pilot(bundle(tmp_path / 'development', root), tmp_path / 'freeze')
    assert manifest['status'] == 'not_estimable'
    heuristic = manifest['controls']['heuristic']
    assert heuristic['development']['status'] == 'not_estimable'
    assert heuristic['development']['reason'] == 'single_class'
    assert heuristic['refit']['status'] == 'ok' and heuristic['status'] == 'available'
    assert 'reason' not in heuristic and 'detail' not in heuristic


def test_unavailable_lifecycle_never_reports_mutable_counts(tmp_path):
    path = bundle(tmp_path / 'development', snapshot())
    _, _, info = experiment._load_pilot_bundle(path, 'development')
    assert info['collection']['lifecycle'] == {
        'status': 'unavailable', 'reason': 'Mutable lifecycle unavailable in development', 'as_of': None}
