// ABOUTME: Creates immutable pilot studies and exports exact credential-free observation bundles.
// ABOUTME: Keeps week-two data sealed and publishes checksums only after every bundle file is ready.

import { createHash } from 'crypto';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { PilotParticipant } from '../models/pilot-participant';
import type { PilotParticipantRecord } from '../models/pilot-participant';
import { comparePilotTimestamps, isPilotCity, isPilotTimestamp, normalizePilotCity, PilotStudy } from '../models/pilot-study';
import type { CardAllocation, CitySelection, EnrollmentSettings, ExportManifest, ExposureRecord, FreezeLink, MealSnapshot, ParticipantView, PilotSnapshot, ResponseRecord, StudyConfig, StudyRecord, VisitRecord, WeatherSnapshot } from './types';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Pilot export: ${message}`);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function timestamp(value: unknown): string {
  requireValue(isPilotTimestamp(value), 'expected a valid UTC timestamp');
  return value;
}
function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function strings(value: unknown): string[] {
  requireValue(Array.isArray(value) && value.every(text), 'expected nonempty strings');
  return [...value];
}
function zone(value: unknown): string {
  requireValue(text(value), 'expected an IANA timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }); }
  catch { throw new Error('Pilot export: expected an IANA timezone'); }
  return value;
}
function city(value: CitySelection): CitySelection {
  requireValue(isPilotCity(value), 'expected a canonical selected city');
  return { ...normalizePilotCity(value)!, timezone: value.timezone };
}
function meal(value: MealSnapshot): MealSnapshot {
  requireValue(value && text(value.id) && text(value.name), 'invalid meal identity');
  for (const key of ['cuisine', 'imageUrl', 'description'] as const) {
    requireValue(value[key] === null || typeof value[key] === 'string', 'invalid optional meal text');
  }
  requireValue(finite(value.spiciness) && value.spiciness >= 0 && value.spiciness <= 5
    && finite(value.heaviness) && value.heaviness >= 0 && value.heaviness <= 5, 'invalid meal scale');
  return {
    id: value.id, name: value.name, cuisine: value.cuisine, primaryIngredients: strings(value.primaryIngredients),
    allergens: strings(value.allergens), weather: strings(value.weather), timeOfDay: strings(value.timeOfDay),
    spiciness: value.spiciness, heaviness: value.heaviness, imageUrl: value.imageUrl,
    description: value.description, flavorTags: strings(value.flavorTags),
  };
}
function weather(value: WeatherSnapshot | null): WeatherSnapshot | null {
  if (value === null) return null;
  requireValue(value && ['ok', 'partial', 'unavailable'].includes(value.status), 'invalid weather status');
  for (const key of ['provider', 'providerHost', 'accessMode', 'failureReason'] as const) {
    requireValue(value[key] === null || text(value[key]), 'invalid weather text');
  }
  for (const [key, bound] of [['requestedLatitude', 90], ['requestedLongitude', 180], ['gridLatitude', 90], ['gridLongitude', 180]] as const) {
    requireValue((key.startsWith('grid') && value[key] === null)
      || (finite(value[key]) && Math.abs(value[key] as number) <= bound), 'invalid weather coordinates');
  }
  for (const key of ['temperatureC', 'precipitationMm'] as const) requireValue(value[key] === null || finite(value[key]), 'invalid weather measurement');
  for (const key of ['sourceIntervalSeconds', 'weatherCode'] as const) requireValue(value[key] === null || Number.isSafeInteger(value[key]), 'invalid weather integer');
  requireValue(value.units?.temperature === 'celsius' && value.units.precipitation === 'mm'
    && value.sourceTimeFormat === 'unixtime', 'invalid weather units');
  return {
    provider: value.provider, providerHost: value.providerHost, accessMode: value.accessMode, status: value.status,
    requestedLatitude: value.requestedLatitude, requestedLongitude: value.requestedLongitude,
    gridLatitude: value.gridLatitude, gridLongitude: value.gridLongitude,
    validAt: value.validAt === null ? null : timestamp(value.validAt), sourceIntervalSeconds: value.sourceIntervalSeconds,
    requestedAt: timestamp(value.requestedAt), retrievedAt: value.retrievedAt === null ? null : timestamp(value.retrievedAt),
    temperatureC: value.temperatureC, precipitationMm: value.precipitationMm, weatherCode: value.weatherCode,
    units: { temperature: 'celsius', precipitation: 'mm' }, sourceTimeFormat: 'unixtime',
    timezone: value.timezone === null ? null : zone(value.timezone), failureReason: value.failureReason,
  };
}
function setting(value: EnrollmentSettings): EnrollmentSettings {
  requireValue(value && integer(value.version, 1), 'invalid settings version');
  return { version: value.version, effectiveAt: timestamp(value.effectiveAt), city: city(value.city), dietaryExclusions: strings(value.dietaryExclusions) };
}
function studyView(value: StudyRecord): StudyRecord {
  for (const key of ['studyId', 'studyVersion', 'protocolVersion', 'catalogVersion'] as const) requireValue(text(value[key]), 'invalid study identity/version');
  requireValue(value.schemaVersion === 1 && value.quotaTimezoneRule === 'enrollment', 'incompatible study schema');
  requireValue(/^[a-f0-9]{64}$/.test(value.catalogSha256) && integer(value.seed, 0), 'invalid catalog hash/seed');
  requireValue(Array.isArray(value.cityOptions), 'invalid study cities');
  return {
    studyId: value.studyId, schemaVersion: 1, studyVersion: value.studyVersion, protocolVersion: value.protocolVersion,
    catalogVersion: value.catalogVersion, catalogSha256: value.catalogSha256, startsAt: timestamp(value.startsAt),
    trainingEndsAt: timestamp(value.trainingEndsAt), developmentEndsAt: timestamp(value.developmentEndsAt), endsAt: timestamp(value.endsAt),
    seed: value.seed, quotaTimezoneRule: 'enrollment', cityOptions: value.cityOptions.map(city),
  };
}
function shiftTimestamp(start: string, milliseconds: number): string {
  return new Date(Date.parse(start) + milliseconds).toISOString().slice(0, 19) + start.slice(19);
}

export async function createStudy(config: StudyConfig): Promise<StudyRecord> {
  const keys = ['studyId', 'studyVersion', 'protocolVersion', 'catalogVersion', 'catalogSha256', 'startsAt', 'seed', 'cityOptions'];
  requireValue(config && typeof config === 'object' && Object.keys(config).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(config, key)), 'expected exactly the study configuration fields');
  timestamp(config.startsAt);
  requireValue(Array.isArray(config.cityOptions), 'invalid configured cities');
  const cityOptions = config.cityOptions.map(value => {
    const normalized = normalizePilotCity(value);
    requireValue(normalized, 'invalid configured city');
    return normalized;
  });
  const desired = studyView({ ...config, cityOptions, schemaVersion: 1, quotaTimezoneRule: 'enrollment',
    trainingEndsAt: shiftTimestamp(config.startsAt, 5 * 86400000), developmentEndsAt: shiftTimestamp(config.startsAt, 7 * 86400000), endsAt: shiftTimestamp(config.startsAt, 14 * 86400000) });
  await new PilotStudy(desired).validate();
  const existing = await PilotStudy.findOne({ studyId: desired.studyId }).lean().exec();
  if (existing) {
    requireValue(JSON.stringify(studyView(existing)) === JSON.stringify(desired), 'study configuration is immutable');
    return studyView(existing);
  }
  try {
    return studyView((await PilotStudy.create(desired)).toObject());
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const concurrent = await PilotStudy.findOne({ studyId: desired.studyId }).lean().exec();
      requireValue(concurrent && JSON.stringify(studyView(concurrent)) === JSON.stringify(desired), 'study configuration is immutable');
      return studyView(concurrent);
    }
    throw error;
  }
}

function visit(value: VisitRecord): VisitRecord {
  requireValue(value && text(value.visitId) && text(value.participantId) && integer(value.settingsVersion, 1), 'invalid visit');
  requireValue(value.hunger === null || ['not_hungry', 'somewhat_hungry', 'very_hungry'].includes(value.hunger), 'invalid hunger');
  return { visitId: value.visitId, participantId: value.participantId, settingsVersion: value.settingsVersion,
    startedAt: timestamp(value.startedAt), expiresAt: timestamp(value.expiresAt), contextCapturedAt: timestamp(value.contextCapturedAt),
    city: city(value.city), hunger: value.hunger, weather: weather(value.weather) };
}
function allocation(value: CardAllocation): CardAllocation {
  requireValue(value && text(value.allocationId) && text(value.participantId) && text(value.itemId)
    && integer(value.settingsVersion, 1) && integer(value.eligiblePoolSize, 1)
    && finite(value.selectionProbability) && value.selectionProbability > 0 && value.selectionProbability <= 1, 'invalid allocation');
  requireValue(typeof value.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.localDate)
    && isPilotTimestamp(`${value.localDate}T00:00:00Z`), 'invalid allocation date');
  return { allocationId: value.allocationId, participantId: value.participantId, localDate: value.localDate,
    settingsVersion: value.settingsVersion, itemId: value.itemId, allocatedAt: timestamp(value.allocatedAt),
    eligiblePoolSize: value.eligiblePoolSize, selectionProbability: value.selectionProbability };
}
function exposure(value: ExposureRecord): ExposureRecord {
  requireValue(value && [value.eventId, value.participantId, value.visitId, value.allocationId, value.itemId].every(text)
    && integer(value.settingsVersion, 1), 'invalid exposure');
  return { eventId: value.eventId, participantId: value.participantId, visitId: value.visitId,
    allocationId: value.allocationId, settingsVersion: value.settingsVersion, itemId: value.itemId,
    displayedAt: timestamp(value.displayedAt), clientDisplayedAt: timestamp(value.clientDisplayedAt), meal: meal(value.meal) };
}
function response(value: ResponseRecord): ResponseRecord {
  requireValue(value && [value.responseId, value.eventId, value.participantId].every(text)
    && ['yes', 'no', 'not_sure'].includes(value.answer), 'invalid immutable response');
  return { responseId: value.responseId, eventId: value.eventId, participantId: value.participantId,
    answer: value.answer, actionAt: timestamp(value.actionAt), receivedAt: timestamp(value.receivedAt) };
}
function indexed<T>(rows: T[], identity: (row: T) => string, entity: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = identity(row);
    requireValue(!result.has(id), `duplicate ${entity} ID`);
    result.set(id, row);
  }
  return result;
}
function settingsFor(participant: ParticipantView, version: number): EnrollmentSettings {
  const result = participant.settings.find(value => value.version === version);
  requireValue(result, 'broken settings reference');
  return result;
}
function interval(instant: string, study: StudyRecord): number {
  const boundaries = [study.startsAt, study.trainingEndsAt, study.developmentEndsAt, study.endsAt];
  return boundaries.slice(0, -1).findIndex((boundary, index) => comparePilotTimestamps(instant, boundary) >= 0
    && comparePilotTimestamps(instant, boundaries[index + 1]) < 0);
}
function validateSnapshot(snapshot: PilotSnapshot, study: StudyRecord): void {
  const participants = indexed(snapshot.participants, row => row.participantId, 'participant');
  const visits = indexed(snapshot.visits, row => row.visitId, 'visit');
  const allocations = indexed(snapshot.allocations, row => row.allocationId, 'allocation');
  const exposures = indexed(snapshot.exposures, row => row.eventId, 'exposure');
  indexed(snapshot.responses, row => row.responseId, 'response');
  for (const participant of participants.values()) indexed(participant.settings, row => String(row.version), 'settings version');
  for (const row of [...snapshot.visits, ...snapshot.allocations, ...snapshot.exposures]) {
    const owner = participants.get(row.participantId);
    requireValue(owner, 'broken participant reference');
    settingsFor(owner, row.settingsVersion);
  }
  for (const row of visits.values()) requireValue(JSON.stringify(row.city) === JSON.stringify(settingsFor(participants.get(row.participantId)!, row.settingsVersion).city), 'visit city/settings mismatch');
  const shown = new Set<string>();
  for (const row of exposures.values()) {
    const savedVisit = visits.get(row.visitId);
    const savedAllocation = allocations.get(row.allocationId);
    requireValue(savedVisit && savedAllocation, 'broken visit/allocation reference');
    requireValue(savedVisit.participantId === row.participantId && savedAllocation.participantId === row.participantId
      && savedVisit.settingsVersion === row.settingsVersion, 'exposure ownership/settings mismatch');
    requireValue(savedAllocation.itemId === row.itemId && row.meal.id === row.itemId, 'exposure meal/allocation mismatch');
    requireValue(!shown.has(row.allocationId), 'multiple exposures for one allocation');
    shown.add(row.allocationId);
  }
  const answered = new Set<string>();
  for (const row of snapshot.responses) {
    const savedExposure = exposures.get(row.eventId);
    requireValue(savedExposure && savedExposure.participantId === row.participantId, 'broken response ownership/reference');
    requireValue(!answered.has(row.eventId), 'multiple immutable responses for one exposure');
    answered.add(row.eventId);
  }
  const responses = new Map(snapshot.responses.map(row => [row.eventId, row]));
  for (const row of exposures.values()) {
    const savedVisit = visits.get(row.visitId)!;
    const savedResponse = responses.get(row.eventId);
    const audit = (reason: string) => snapshot.audit.push({ eventId: row.eventId, reason });
    if (comparePilotTimestamps(savedVisit.expiresAt, savedVisit.startedAt) <= 0
      || comparePilotTimestamps(savedVisit.expiresAt, shiftTimestamp(savedVisit.startedAt, 1800000)) > 0) audit('invalid_visit_interval');
    if (comparePilotTimestamps(row.displayedAt, savedVisit.startedAt) < 0 || comparePilotTimestamps(row.displayedAt, savedVisit.expiresAt) >= 0) audit('display_outside_visit');
    const displayInterval = interval(row.displayedAt, study);
    if (displayInterval === -1) audit('display_outside_study');
    if (savedResponse) {
      if (comparePilotTimestamps(savedResponse.receivedAt, row.displayedAt) <= 0) audit('response_before_display');
      if (comparePilotTimestamps(savedResponse.receivedAt, savedVisit.expiresAt) >= 0) audit('response_after_visit');
      const receiptInterval = interval(savedResponse.receivedAt, study);
      if (receiptInterval === -1) audit('response_outside_study');
      else if (displayInterval !== -1 && displayInterval !== receiptInterval) audit('crosses_cutoff');
    }
  }
}
function lifecycle(participants: PilotParticipantRecord[], snapshot: PilotSnapshot, exportedAt: string) {
  if (snapshot.manifest.phase === 'development') return {
    status: 'unavailable', reason: 'Historical lifecycle is unavailable: mutable day/slot/shortage/closure state has no timestamped history.',
    lifecycleAsOf: null, participants: [],
  };
  const result = participants.map(participant => ({
    participantId: participant.participantId,
    days: participant.days.map(day => {
      requireValue(/^\d{4}-\d{2}-\d{2}$/.test(day.localDate) && isPilotTimestamp(`${day.localDate}T00:00:00Z`)
        && integer(day.shortage, 0) && day.shortage <= 5 && Array.isArray(day.slots) && day.slots.length === 5, 'invalid persisted day');
      return { localDate: day.localDate, shortage: day.shortage, slots: day.slots.map(slot => {
        requireValue(text(slot.slotId) && integer(slot.validatedSettingsVersion, 1)
          && ['unshown', 'shown', 'answered', 'skipped', 'expired', 'closed'].includes(slot.status), 'invalid persisted slot');
        requireValue(slot.allocationId === null || participant.allocations.some(row => row.allocationId === slot.allocationId), 'broken slot allocation reference');
        requireValue(slot.visitId === null || participant.visits.some(row => row.visitId === slot.visitId), 'broken slot visit reference');
        settingsFor(snapshot.participants.find(row => row.participantId === participant.participantId)!, slot.validatedSettingsVersion);
        return { slotId: slot.slotId, allocationId: slot.allocationId, visitId: slot.visitId,
          validatedSettingsVersion: slot.validatedSettingsVersion, status: slot.status };
      }) };
    }),
    visits: participant.visits.map(row => ({ visitId: row.visitId, closedAt: row.closedAt === null ? null : timestamp(row.closedAt) })),
  }));
  return { status: 'available', reason: null, lifecycleAsOf: exportedAt, participants: result };
}

export async function exportPilot(studyId: string, phase: 'development' | 'final', destination: string, now: Date, freezeLink?: FreezeLink): Promise<ExportManifest> {
  requireValue(text(studyId) && text(destination) && ['development', 'final'].includes(phase)
    && now instanceof Date && Number.isFinite(now.getTime()), 'invalid export request');
  requireValue(phase === 'final' ? freezeLink !== undefined : freezeLink === undefined, 'final requires a freeze link; development forbids it');
  if (freezeLink !== undefined) requireValue(freezeLink && /^[a-f0-9]{64}$/.test(freezeLink.freezeManifestSha256)
    && /^[a-f0-9]{64}$/.test(freezeLink.developmentSnapshotSha256) && isPilotTimestamp(freezeLink.frozenAt), 'invalid freeze link');
  const loaded = await PilotStudy.findOne({ studyId }).lean().exec();
  requireValue(loaded, 'study not found');
  const study = studyView(loaded);
  await new PilotStudy(study).validate();
  const manifest: ExportManifest = {
    schemaVersion: 1, studyId: study.studyId, studyVersion: study.studyVersion, protocolVersion: study.protocolVersion,
    catalogVersion: study.catalogVersion, catalogSha256: study.catalogSha256, startsAt: study.startsAt,
    trainingEndsAt: study.trainingEndsAt, developmentEndsAt: study.developmentEndsAt, endsAt: study.endsAt,
    seed: study.seed, quotaTimezoneRule: study.quotaTimezoneRule, phase, exportedAt: now.toISOString(),
    sourceProvenance: { name: 'Opt-in meal appeal pilot', url: null, license: 'Private study data; no redistribution license granted',
      attribution: 'cgm-16; weather: Open-Meteo (CC BY 4.0); city data: GeoNames (CC BY 4.0)' },
    freezeLink: freezeLink === undefined ? null : { freezeManifestSha256: freezeLink.freezeManifestSha256,
      developmentSnapshotSha256: freezeLink.developmentSnapshotSha256, frozenAt: freezeLink.frozenAt },
  };
  const include = (instant: unknown) => phase === 'final' || comparePilotTimestamps(timestamp(instant), study.developmentEndsAt) < 0;
  const stored = await PilotParticipant.find({ studyId }).sort({ participantId: 1 }).lean().exec();
  const participants = stored.filter(row => include(row.enrolledAt));
  const snapshot: PilotSnapshot = { schemaVersion: 1, source: 'pilot', manifest, participants: [], visits: [], allocations: [], exposures: [], responses: [], audit: [] };
  const allocationMeals: { allocationId: string; participantId: string; meal: MealSnapshot }[] = [];
  for (const participant of participants) {
    requireValue(text(participant.participantId) && Array.isArray(participant.settings), 'invalid participant');
    const settings = participant.settings.filter(row => include(row.effectiveAt)).map(setting);
    requireValue(settings.length > 0, 'participant needs included settings');
    snapshot.participants.push({ participantId: participant.participantId, enrolledAt: timestamp(participant.enrolledAt),
      enrollmentTimezone: zone(participant.enrollmentTimezone), settings });
    for (const key of ['visits', 'allocations', 'exposures', 'responses'] as const) requireValue(Array.isArray(participant[key]), `invalid ${key} array`);
    for (const row of participant.visits.filter(row => include(row.startedAt) && include(row.contextCapturedAt))) {
      const saved = visit(row);
      requireValue(phase === 'final' || saved.weather === null || (include(saved.weather.requestedAt)
        && (saved.weather.retrievedAt === null || include(saved.weather.retrievedAt))), 'development visit contains week-two weather retrieval');
      snapshot.visits.push(saved);
    }
    for (const row of participant.allocations.filter(row => include(row.allocatedAt))) {
      const saved = allocation(row);
      snapshot.allocations.push(saved);
      const savedMeal = meal(row.meal);
      requireValue(savedMeal.id === saved.itemId, 'saved allocation meal mismatch');
      allocationMeals.push({ allocationId: saved.allocationId, participantId: saved.participantId, meal: savedMeal });
    }
    const exposures = participant.exposures.filter(row => include(row.displayedAt)).map(exposure);
    snapshot.exposures.push(...exposures);
    for (const row of participant.responses) {
      if (include(row.receivedAt)) snapshot.responses.push(response(row));
      else if (exposures.some(saved => saved.eventId === row.eventId)) {
        // The withheld answer and its clocks/ID never enter a development artifact.
        const display = exposures.find(saved => saved.eventId === row.eventId)!;
        if (interval(display.displayedAt, study) !== interval(timestamp(row.receivedAt), study)) {
          snapshot.audit.push({ eventId: display.eventId, reason: 'crosses_cutoff' });
        }
      }
    }
  }
  validateSnapshot(snapshot, study);
  const collection = { schemaVersion: 1, study, phase, exportedAt: manifest.exportedAt, allocationMeals,
    lifecycle: lifecycle(participants, snapshot, manifest.exportedAt) };
  const files = [['snapshot.json', snapshot], ['collection.json', collection]] as const;
  await mkdir(destination, { mode: 0o700 });
  try {
    let checksums = '';
    for (const [name, value] of files) {
      const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      await writeFile(join(destination, `${name}.tmp`), bytes, { flag: 'wx', mode: 0o600 });
      checksums += `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;
    }
    await writeFile(join(destination, 'SHA256SUMS.tmp'), checksums, { flag: 'wx', mode: 0o600 });
    for (const [name] of files) await rename(join(destination, `${name}.tmp`), join(destination, name));
    // SHA256SUMS is the completion marker; consumers must require and verify it.
    await rename(join(destination, 'SHA256SUMS.tmp'), join(destination, 'SHA256SUMS'));
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}
