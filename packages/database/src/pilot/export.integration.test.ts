// ABOUTME: Verifies immutable studies and exact pseudonymous exports using real ephemeral MongoDB.
// ABOUTME: Keeps constructed collection records separate from genuine participant appetite evidence.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { URL } from 'url';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import mongoose from 'mongoose';
import { PilotStudy } from '../models/pilot-study';
import { PilotParticipant } from '../models/pilot-participant';
import type { PilotParticipantRecord } from '../models/pilot-participant';
import { clearTestDb, setupTestDb, teardownTestDb } from '../test-setup';
import type { PilotSnapshot, StudyConfig, StudyRecord } from './types';
import { createStudy, exportPilot } from './export';

const config: StudyConfig = {
  studyId: 'constructed-export-verification', studyVersion: '1', protocolVersion: '1',
  catalogVersion: 'saved-catalog', catalogSha256: 'a'.repeat(64), seed: 42,
  startsAt: '2026-01-01T00:00:00.123456+00:00',
  cityOptions: [{ cityId: 'test-seoul', label: 'Seoul', country: 'South Korea', adminArea: null,
    latitude: 37.5665, longitude: 126.978, timezone: 'asia/seoul' }],
};
const record: StudyRecord = {
  ...config, schemaVersion: 1, quotaTimezoneRule: 'enrollment',
  trainingEndsAt: '2026-01-06T00:00:00.123456+00:00',
  developmentEndsAt: '2026-01-08T00:00:00.123456+00:00',
  endsAt: '2026-01-15T00:00:00.123456+00:00',
  cityOptions: [{ ...config.cityOptions[0], timezone: 'Asia/Seoul' }],
};
const exportedAt = new Date('2026-01-16T00:00:00Z');
let directory: string;

async function fixture(): Promise<PilotParticipantRecord> {
  const source = JSON.parse(await readFile(resolve(__dirname, '../../../../contracts/meal-prediction/pilot-v1.example.json'), 'utf8')) as PilotSnapshot;
  const city = record.cityOptions[0];
  const base = source.visits[0];
  const visit = { ...base, city, operationId: 'PRIVATE-OPERATION', closedAt: null,
    contextCapturedAt: '2026-01-02T12:00:00.123456000+00:00',
    weather: { ...base.weather!, status: 'unavailable' as const, providerHost: null,
      accessMode: 'disabled', validAt: null, retrievedAt: null,
      temperatureC: null, precipitationMm: null, weatherCode: null,
      failureReason: 'access_not_configured' } };
  const skipped = { ...source.exposures[3], eventId: 'e-skipped', allocationId: 'a-skipped', itemId: 'm-skipped',
    meal: { ...source.exposures[3].meal, id: 'm-skipped' } };
  const extra = (suffix: string, at: string, settingsVersion = 1) => ({
    allocation: { ...source.allocations[0], allocationId: `a-${suffix}`, itemId: `m-${suffix}`,
      localDate: at.slice(0, 10), allocatedAt: at, settingsVersion },
    exposure: { ...source.exposures[0], eventId: `e-${suffix}`, allocationId: `a-${suffix}`,
      itemId: `m-${suffix}`, visitId: `v-${suffix}`, displayedAt: at, clientDisplayedAt: at,
      settingsVersion, meal: { ...source.exposures[0].meal, id: `m-${suffix}` } },
  });
  const development = extra('development', '2026-01-07T12:01:00.123456+00:00');
  const crossing = extra('crossing', '2026-01-07T23:59:00.123456+00:00');
  const test = extra('test', '2026-01-09T12:01:00.123456+00:00', 2);
  test.exposure.visitId = 'v-week-two';
  const allocations = [...source.allocations,
    { ...source.allocations[3], allocationId: 'a-skipped', itemId: 'm-skipped' },
    { ...source.allocations[0], allocationId: 'a-retired', itemId: 'm-retired' },
    development.allocation, crossing.allocation, test.allocation].map(allocation => ({
      ...allocation, meal: { ...source.exposures[0].meal, id: allocation.itemId, name: `Saved ${allocation.itemId}` },
    }));
  const visits = [visit,
    { ...visit, visitId: 'v-development', startedAt: '2026-01-07T12:00:00Z', expiresAt: '2026-01-07T12:30:00Z' },
    { ...visit, visitId: 'v-crossing', startedAt: '2026-01-07T23:58:00Z', expiresAt: '2026-01-08T00:28:00Z' },
    { ...visit, visitId: 'v-week-two', settingsVersion: 2, startedAt: '2026-01-09T12:00:00Z',
      expiresAt: '2026-01-09T12:30:00Z', contextCapturedAt: '2026-01-09T12:00:00Z', hunger: 'very_hungry' as const }];
  const exposures = [...source.exposures, skipped, development.exposure, crossing.exposure, test.exposure];
  const responses = [...source.responses,
    { responseId: 'r-development', eventId: 'e-development', participantId: 'p-test', answer: 'yes' as const,
      actionAt: '2026-01-07T12:02:00.123456+00:00', receivedAt: '2026-01-07T12:02:01.123456+00:00' },
    { responseId: 'r-crossing', eventId: 'e-crossing', participantId: 'p-test', answer: 'no' as const,
      actionAt: '2026-01-08T00:00:01.123456+00:00', receivedAt: '2026-01-08T00:00:02.123456+00:00' },
    { responseId: 'r-test', eventId: 'e-test', participantId: 'p-test', answer: 'yes' as const,
      actionAt: '2026-01-09T12:02:00Z', receivedAt: '2026-01-09T12:02:01Z' }];
  return {
    studyId: config.studyId, userId: 'PRIVATE-USER', participantId: 'p-test', version: 7,
    enrolledAt: '2026-01-01T01:00:00.123456+00:00', enrollmentTimezone: 'Asia/Seoul',
    settings: [{ ...source.participants[0].settings[0], city },
      { ...source.participants[0].settings[0], city, version: 2, effectiveAt: '2026-01-09T11:00:00Z', dietaryExclusions: ['WEEK-TWO-ONLY'] }],
    visits, allocations, exposures, responses,
    days: [{ localDate: '2026-01-02', shortage: 0, slots: allocations.slice(0, 5).map((allocation, index) => ({
      slotId: `slot-${index}`, allocationId: allocation.allocationId, visitId: visit.visitId,
      validatedSettingsVersion: 1, status: index < 3 ? 'answered' as const : index === 4 ? 'skipped' as const : 'closed' as const,
    })) }],
    issuances: [{ operationId: 'PRIVATE-ISSUANCE', visitId: visit.visitId, allocationId: allocations[0].allocationId }],
  };
}
async function seed() {
  await PilotStudy.create(record);
  const participant = await fixture();
  await PilotParticipant.create(participant);
  await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, { $set: {
    username: 'PRIVATE-USERNAME', pinHash: 'PRIVATE-PIN', sessionToken: 'PRIVATE-SESSION',
    connection: 'mongodb://PRIVATE-CONNECTION', 'visits.0.weather.apiKey': 'PRIVATE-API-KEY',
    'exposures.0.meal.username': 'PRIVATE-NESTED', 'settings.0.city.token': 'PRIVATE-CITY',
  } });
  return participant;
}
async function snapshot(destination: string): Promise<PilotSnapshot> {
  return JSON.parse(await readFile(join(destination, 'snapshot.json'), 'utf8'));
}

describe('pilot export (real MongoDB; constructed verification only)', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await clearTestDb();
    directory = await mkdtemp(join(tmpdir(), 'meal-rec-task12-'));
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('test_manifest_is_immutable', async () => {
    const saved = await createStudy(config);
    expect(saved).toEqual(record);
    expect(await createStudy(config)).toEqual(record);
    await expect(createStudy({ ...config, startsAt: '2026-02-01T00:00:00Z' })).rejects.toThrow(/immutable/i);
    await expect(createStudy({ ...config, seed: 43 })).rejects.toThrow(/immutable/i);
    expect(await PilotStudy.countDocuments()).toBe(1);
    expect(mongoose.connection.name).toMatch(/^test-/);
  });

  it('test_export_is_exact_and_pseudonymous', async () => {
    const participant = await seed();
    const destination = join(directory, 'final');
    const freezeLink = { freezeManifestSha256: 'b'.repeat(64), frozenAt: '2026-01-07T23:00:00.123456+00:00', developmentSnapshotSha256: 'c'.repeat(64) };
    await exportPilot(config.studyId, 'final', destination, exportedAt, freezeLink);
    const output = await snapshot(destination);
    expect(output.exposures).toEqual(participant.exposures);
    expect(output.responses).toEqual(participant.responses);
    expect(output.visits[0]).toEqual({ visitId: 'v-test', participantId: 'p-test', settingsVersion: 1,
      startedAt: '2026-01-02T12:00:00Z', expiresAt: '2026-01-02T12:30:00Z',
      contextCapturedAt: '2026-01-02T12:00:00.123456000+00:00', city: record.cityOptions[0], hunger: null,
      weather: participant.visits[0].weather });
    expect(output.participants[0].participantId).toBe('p-test');
    expect(output.exposures).toHaveLength(8);
    expect(output.responses).toHaveLength(6);
    expect(output.responses.some(response => response.answer === 'not_sure')).toBe(true);
    expect(output.responses.some(response => response.eventId === 'e-unanswered' || response.eventId === 'e-skipped')).toBe(false);
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE-|username|pinHash|sessionToken|userId|mongodb:\/\//);
    expect(output.manifest.freezeLink).toEqual(freezeLink);
    const again = join(directory, 'again');
    await exportPilot(config.studyId, 'final', again, exportedAt, freezeLink);
    expect((await snapshot(again)).participants).toEqual(output.participants);
  });

  it('test_development_export_never_contains_week_two', async () => {
    await seed();
    const destination = join(directory, 'development');
    await exportPilot(config.studyId, 'development', destination, exportedAt);
    const output = await snapshot(destination);
    expect(output.exposures.map(exposure => exposure.eventId)).toEqual([
      'e-yes', 'e-no', 'e-unsure', 'e-unanswered', 'e-skipped', 'e-development', 'e-crossing',
    ]);
    expect(output.responses.map(response => response.responseId)).toEqual(['r-yes', 'r-no', 'r-unsure', 'r-development']);
    expect(output.participants[0].settings.map(setting => setting.version)).toEqual([1]);
    expect(output.visits.map(visit => visit.visitId)).toEqual(['v-test', 'v-development', 'v-crossing']);
    expect(JSON.stringify(output)).not.toMatch(/WEEK-TWO-ONLY|r-crossing|r-test|very_hungry/);
    expect(output.audit).toContainEqual({ eventId: 'e-crossing', reason: 'crosses_cutoff' });
    await expect(exportPilot(config.studyId, 'development', join(directory, 'invalid'), exportedAt,
      { freezeManifestSha256: 'b'.repeat(64), frozenAt: '2026-01-07T23:00:00Z', developmentSnapshotSha256: 'c'.repeat(64) })).rejects.toThrow(/development/i);
  });

  it('publishes complete checksummed bundles once and preserves final shortages without fabricated exposures', async () => {
    const participant = await seed();
    await PilotParticipant.create({ ...participant, userId: 'PRIVATE-EMPTY', participantId: 'p-empty',
      settings: participant.settings.slice(0, 1), allocations: [], exposures: [], responses: [], visits: [], issuances: [],
      days: [{ localDate: '2026-01-03', shortage: 5, slots: Array.from({ length: 5 }, (_, i) => ({
        slotId: `empty-${i}`, allocationId: null, visitId: null, validatedSettingsVersion: 1, status: 'closed',
      })) }],
    });
    const link = { freezeManifestSha256: 'b'.repeat(64), frozenAt: '2026-01-07T23:00:00Z', developmentSnapshotSha256: 'c'.repeat(64) };
    const destination = join(directory, 'bundle');
    const attempts = await Promise.allSettled([
      exportPilot(config.studyId, 'final', destination, exportedAt, link),
      exportPilot(config.studyId, 'final', destination, exportedAt, link),
    ]);
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    const before = await readFile(join(destination, 'snapshot.json'));
    await expect(exportPilot(config.studyId, 'final', destination, exportedAt, link)).rejects.toThrow();
    expect(await readFile(join(destination, 'snapshot.json'))).toEqual(before);
    expect((await readdir(destination)).sort()).toEqual(['SHA256SUMS', 'collection.json', 'snapshot.json']);
    const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    expect(await readFile(join(destination, 'SHA256SUMS'), 'utf8')).toBe(
      `${checksum(before)}  snapshot.json\n${checksum(await readFile(join(destination, 'collection.json')))}  collection.json\n`);
    const collection = JSON.parse(await readFile(join(destination, 'collection.json'), 'utf8'));
    expect(collection.study).toEqual(record);
    expect(collection.lifecycle.lifecycleAsOf).toBe('2026-01-16T00:00:00.000Z');
    expect(collection.lifecycle.participants.find((p: {participantId: string}) => p.participantId === 'p-empty').days[0].shortage).toBe(5);
    expect(collection.allocationMeals).toContainEqual({ allocationId: 'a-retired', participantId: 'p-test', meal: participant.allocations[5].meal });
    expect(JSON.stringify(collection)).not.toMatch(/PRIVATE-|username|pinHash|sessionToken|userId|mongodb:\/\//);
    expect((await snapshot(destination)).exposures).toHaveLength(8);
    const development = join(directory, 'development');
    await exportPilot(config.studyId, 'development', development, exportedAt);
    const weekOneCollection = JSON.parse(await readFile(join(development, 'collection.json'), 'utf8'));
    expect(weekOneCollection.lifecycle).toMatchObject({ status: 'unavailable', lifecycleAsOf: null, participants: [] });
    expect(weekOneCollection.lifecycle.reason).toMatch(/historical/i);
    expect(JSON.stringify(weekOneCollection)).not.toMatch(/"(?:shortage|slots|closedAt)":|WEEK-TWO-ONLY|m-test/);
    if (process.env.TASK12_EXPORT_ARTIFACT_DIR) {
      await mkdir(process.env.TASK12_EXPORT_ARTIFACT_DIR, { recursive: true });
      const info = await mongoose.connection.db!.admin().serverInfo();
      await writeFile(join(process.env.TASK12_EXPORT_ARTIFACT_DIR, 'conditions.json'), JSON.stringify({
        mongoVersion: info.version, database: mongoose.connection.name, nodeVersion: process.version,
        source: 'Constructed verification fixture, not appetite evidence',
      }, null, 2));
      await exportPilot(config.studyId, 'development', join(process.env.TASK12_EXPORT_ARTIFACT_DIR, 'development'), exportedAt);
      await exportPilot(config.studyId, 'final', join(process.env.TASK12_EXPORT_ARTIFACT_DIR, 'final'), exportedAt, link);
    }
  });

  it.each([
    ['negative seed', { seed: -1 }], ['implicit date', { startsAt: '2026-01-01' }],
    ['non-UTC date', { startsAt: '2026-01-01T00:00:00+09:00' }],
    ['invalid calendar date', { startsAt: '2026-02-30T00:00:00Z' }],
    ['unsupported study precision', { startsAt: '2026-01-01T00:00:00.123456001Z' }],
    ['rewritten cutoff', { trainingEndsAt: '2026-01-05T00:00:00Z' }],
    ['invalid city zone', { cityOptions: [{ ...config.cityOptions[0], timezone: 'PST' }] }],
  ])('rejects malformed study configuration: %s', async (_name, changes) => {
    await expect(createStudy({ ...config, ...changes })).rejects.toThrow();
    expect(await PilotStudy.countDocuments()).toBe(0);
  });

  it.each([
    ['duplicate response', 'responses', (p: PilotParticipantRecord) => [...p.responses, p.responses[0]]],
    ['contradictory response', 'responses', (p: PilotParticipantRecord) => [...p.responses, { ...p.responses[0], responseId: 'conflict', answer: 'no' }]],
    ['unsupported persisted client precision', 'exposures', (p: PilotParticipantRecord) => [{ ...p.exposures[0], clientDisplayedAt: '2026-01-02T12:01:00.123456001Z' }, ...p.exposures.slice(1)]],
    ['unsupported persisted context precision', 'visits', (p: PilotParticipantRecord) => [{ ...p.visits[0], contextCapturedAt: '2026-01-02T12:00:00.123456001Z' }, ...p.visits.slice(1)]],
    ['broken visit', 'exposures', (p: PilotParticipantRecord) => [{ ...p.exposures[0], visitId: 'missing' }, ...p.exposures.slice(1)]],
    ['invalid answer', 'responses', (p: PilotParticipantRecord) => [{ ...p.responses[0], answer: 'skip' }, ...p.responses.slice(1)]],
    ['invalid weather', 'visits', (p: PilotParticipantRecord) => [{ ...p.visits[0], weather: { ...p.visits[0].weather, status: 'bad' } }, ...p.visits.slice(1)]],
    ['week-two weather request', 'visits', (p: PilotParticipantRecord) => [{ ...p.visits[0], weather: { ...p.visits[0].weather, requestedAt: '2026-01-08T00:00:00.123456+00:00' } }, ...p.visits.slice(1)]],
    ['week-two weather retrieval', 'visits', (p: PilotParticipantRecord) => [{ ...p.visits[0], weather: { ...p.visits[0].weather, retrievedAt: '2026-01-08T00:00:00.123456+00:00' } }, ...p.visits.slice(1)]],
  ])('rejects corrupt included records without publishing: %s', async (_name, field, corrupt) => {
    const participant = await seed();
    await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, { $set: { [field]: corrupt(participant) } });
    const destination = join(directory, 'invalid');
    await expect(exportPilot(config.studyId, 'development', destination, exportedAt)).rejects.toThrow();
    await expect(readdir(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects final data without a valid freeze link', async () => {
    await seed();
    await expect(exportPilot(config.studyId, 'final', join(directory, 'missing'), exportedAt)).rejects.toThrow(/freeze/i);
    await expect(exportPilot(config.studyId, 'final', join(directory, 'bad'), exportedAt,
      { freezeManifestSha256: 'invalid', frozenAt: 'yesterday', developmentSnapshotSha256: 'c'.repeat(64) })).rejects.toThrow(/freeze/i);
  });

  it('runs built CLI study/export against real Mongo and accepts only an exact pilot raw-snapshot freeze', async () => {
    const run = promisify(execFile);
    const cli = resolve(__dirname, '../../dist/pilot/cli.js');
    const uri = new URL(inject('MONGO_URI'));
    uri.pathname = `/${mongoose.connection.name}`;
    const env = { ...process.env, MONGO_URL: uri.toString() };
    const path = join(directory, 'study.json');
    await writeFile(path, JSON.stringify(config));
    const created = await run(process.execPath, [cli, 'study', '--config', path], { env });
    expect(created.stderr).toBe('');
    expect(created.stdout).toContain(config.studyId);
    const participant = await fixture();
    await PilotParticipant.create(participant);
    const development = join(directory, 'cli-development');
    const result = await run(process.execPath, [cli, 'export', '--study-id', config.studyId,
      '--phase', 'development', '--destination', development], { env });
    expect(result.stderr).toBe('');
    const developmentManifest = (await snapshot(development)).manifest;
    const freezeDirectory = join(directory, 'freeze');
    await mkdir(freezeDirectory);
    const freezePath = join(freezeDirectory, 'manifest.json');
    const frozen = { schema_version: 1, source: 'pilot', frozen_at: '2026-01-07T23:00:00.123456+00:00',
      development_sha256: 'd'.repeat(64),
      development_snapshot_sha256: createHash('sha256').update(await readFile(join(development, 'snapshot.json'))).digest('hex'),
      source_manifest: developmentManifest };
    async function saveFreeze(value: unknown) {
      const bytes = Buffer.from(JSON.stringify(value));
      await writeFile(freezePath, bytes);
      await writeFile(join(freezeDirectory, 'manifest.sha256'), `${createHash('sha256').update(bytes).digest('hex')}\n`);
      return createHash('sha256').update(bytes).digest('hex');
    }
    const hash = await saveFreeze(frozen);
    const destination = join(directory, 'cli-final');
    const args = ['export', '--study-id', config.studyId, '--phase', 'final', '--destination', destination, '--freeze-manifest', freezePath];
    expect((await run(process.execPath, [cli, ...args], { env })).stderr).toBe('');
    expect((await snapshot(destination)).manifest.freezeLink).toEqual({ freezeManifestSha256: hash,
      developmentSnapshotSha256: frozen.development_snapshot_sha256, frozenAt: frozen.frozen_at });
    for (const invalid of [
      { ...frozen, source: 'uci' },
      { ...frozen, development_snapshot_sha256: undefined },
      { ...frozen, source_manifest: { ...developmentManifest, studyId: 'wrong' } },
      { ...frozen, source_manifest: { ...developmentManifest, developmentEndsAt: '2026-01-08T00:00:00.123455+00:00' } },
      { ...frozen, source_manifest: { ...developmentManifest, catalogSha256: 'f'.repeat(64) } },
      { ...frozen, source_manifest: { ...developmentManifest, seed: 43 } },
    ]) {
      await saveFreeze(invalid);
      await expect(run(process.execPath, [cli, ...args.map((value, index) => index === 6 ? join(directory, 'reject') : value)], { env })).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/pilot: (Requires a schema-1 pilot freeze manifest|Freeze requires exact raw development snapshot SHA-256 and UTC frozen_at|Freeze study identity, versions, catalog, cutoffs, seed or quota mismatch)/) });
    }
    await saveFreeze(frozen);
    await writeFile(join(freezeDirectory, 'manifest.sha256'), `${'0'.repeat(64)}\n`);
    await expect(run(process.execPath, [cli, ...args], { env })).rejects.toMatchObject({ code: 1, stderr: 'pilot: Freeze manifest hash mismatch\n' });
    await expect(run(process.execPath, [cli, 'study', '--config', path], { env: { ...env, MONGO_URL: '' } })).rejects.toMatchObject({ code: 1, stderr: 'pilot: MONGO_URL must be supplied explicitly\n' });
  });


  it('retains already-known future weather validity without treating it as week-two retrieval', async () => {
    const participant = await seed();
    await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, {
      $set: { 'visits.0.weather.validAt': '2026-01-09T00:00:00.123456+00:00' },
    });
    const destination = join(directory, 'forecast');
    await exportPilot(config.studyId, 'development', destination, exportedAt);
    expect((await snapshot(destination)).visits[0].weather!.validAt).toBe('2026-01-09T00:00:00.123456+00:00');
  });

  it.each([
    ['enrollmentTimezone', '+09:00'], ['visits.0.weather.timezone', '+09:00'],
    ['enrollmentTimezone', 'PST'], ['visits.0.weather.timezone', 'PST'],
    ['enrollmentTimezone', 'SystemV/EST5EDT'], ['visits.0.weather.timezone', 'SystemV/EST5EDT'],
    ['enrollmentTimezone', 'asia/seoul'], ['visits.0.weather.timezone', 'asia/seoul'],
    ['enrollmentTimezone', 'Mars/Olympus'], ['visits.0.weather.timezone', 'Mars/Olympus'],
  ])('rejects noncanonical included timezone at %s: %s before publishing', async (field, timezone) => {
    const participant = await seed();
    await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, { $set: { [field]: timezone } });
    const destination = join(directory, 'invalid-zone');
    await expect(exportPilot(config.studyId, 'development', destination, exportedAt)).rejects.toThrow(/IANA timezone/);
    await expect(readdir(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['UTC', 'GMT', 'Asia/Seoul'])('preserves canonical exported timezone %s exactly', async timezone => {
    const participant = await seed();
    await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, { $set: {
      enrollmentTimezone: timezone, 'visits.0.weather.timezone': timezone,
    } });
    const destination = join(directory, 'canonical-zone');
    await exportPilot(config.studyId, 'development', destination, exportedAt);
    const output = await snapshot(destination);
    expect(output.participants[0].enrollmentTimezone).toBe(timezone);
    expect(output.visits[0].weather!.timezone).toBe(timezone);
    expect(output.visits[0].contextCapturedAt).toBe('2026-01-02T12:00:00.123456000+00:00');
  });

  it.each(['visits', 'allocations', 'exposures', 'responses'] as const)(
    'rejects globally coherent %s stored under another participant aggregate', async field => {
      const participant = await seed();
      const otherVisit = { ...participant.visits[0], visitId: 'v-other', participantId: 'p-other' };
      const otherAllocation = { ...participant.allocations[0], allocationId: 'a-other', participantId: 'p-other' };
      const otherUnshown = { ...participant.allocations[3], allocationId: 'a-other-unshown', participantId: 'p-other' };
      const otherExposure = { ...participant.exposures[0], eventId: 'e-other', participantId: 'p-other',
        visitId: otherVisit.visitId, allocationId: otherAllocation.allocationId };
      await PilotParticipant.create({ ...participant, userId: 'PRIVATE-OTHER', participantId: 'p-other',
        days: [], visits: [otherVisit], allocations: [otherAllocation, otherUnshown],
        exposures: [otherExposure], responses: [], issuances: [],
      });
      const validDestination = join(directory, 'valid-two-participants');
      await exportPilot(config.studyId, 'development', validDestination, exportedAt);
      expect((await snapshot(validDestination)).participants.map(row => row.participantId)).toEqual(['p-other', 'p-test']);
      if (field === 'visits') participant.visits.push({ ...otherVisit, visitId: 'v-misattributed' });
      if (field === 'allocations') participant.allocations[5].participantId = 'p-other';
      if (field === 'exposures') participant.exposures[3] = { ...participant.exposures[3], participantId: 'p-other',
        visitId: otherVisit.visitId, allocationId: otherUnshown.allocationId,
        itemId: otherUnshown.itemId, meal: otherUnshown.meal };
      if (field === 'responses') participant.responses[0] = { ...participant.responses[0], participantId: 'p-other', eventId: otherExposure.eventId };
      await PilotParticipant.collection.updateOne({ participantId: participant.participantId }, { $set: { [field]: participant[field] } });
      for (const phase of ['development', 'final'] as const) {
        const destination = join(directory, `invalid-owner-${phase}`);
        const link = phase === 'final' ? { freezeManifestSha256: 'b'.repeat(64), frozenAt: '2026-01-07T23:00:00Z', developmentSnapshotSha256: 'c'.repeat(64) } : undefined;
        await expect(exportPilot(config.studyId, phase, destination, exportedAt, link)).rejects.toThrow(/containing participant aggregate/);
        await expect(readdir(destination)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    });

});
