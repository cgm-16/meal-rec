// ABOUTME: Applies pilot enrollment and assessment transitions to one participant aggregate.
// ABOUTME: Uses explicit server time and versioned compare-and-swap to preserve concurrent writes.

import { createHash, randomUUID } from 'crypto';
import { PilotStudy, isPilotCity, normalizePilotCity, isPilotTimestamp, comparePilotTimestamps } from '../models/pilot-study';
import { PilotParticipant } from '../models/pilot-participant';
import type { PilotDay, PilotParticipantRecord, PilotSlot, StoredAllocation, StoredVisit } from '../models/pilot-participant';
import type { ActionResult, AppealAnswer, CardAllocation, CitySelection, EnrollmentSettings, ExposureRecord, MealSnapshot, ParticipantView, ResponseRecord, StudyRecord, VisitRecord, WeatherSnapshot } from './types';

export interface EligiblePool {
  settingsVersion: number;
  meals: MealSnapshot[];
}
export type VisitContext = Pick<VisitRecord, 'contextCapturedAt' | 'city' | 'hunger' | 'weather'>;
export type PilotErrorCode = 'invalid' | 'not_enrolled' | 'not_found' | 'closed' | 'expired' | 'conflict';
export class PilotError extends Error {
  constructor(public readonly code: PilotErrorCode) {
    super(code);
    this.name = 'PilotError';
  }
}

function requireValue(condition: unknown, code: PilotErrorCode = 'invalid'): asserts condition {
  if (!condition) throw new PilotError(code);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): string {
  requireValue(isPilotTimestamp(value));
  return value;
}
function strings(value: unknown): string[] {
  requireValue(Array.isArray(value) && value.every(text));
  return [...value];
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}
function city(value: unknown): CitySelection {
  requireValue(isPilotCity(value));
  return { ...normalizePilotCity(value)!, timezone: value.timezone };
}
function enrollmentSettings(value: EnrollmentSettings, now: Date): EnrollmentSettings {
  const input = object(value);
  requireValue(Number.isSafeInteger(input.version) && (input.version as number) >= 1);
  timestamp(input.effectiveAt);
  return { version: input.version as number, effectiveAt: now.toISOString(), city: city(input.city), dietaryExclusions: strings(input.dietaryExclusions) };
}
function sameSettings(a: EnrollmentSettings, b: EnrollmentSettings): boolean {
  return JSON.stringify(a.city) === JSON.stringify(b.city)
    && JSON.stringify(a.dietaryExclusions) === JSON.stringify(b.dietaryExclusions);
}
function weather(value: unknown, selected: CitySelection): WeatherSnapshot | null {
  if (value === null) return null;
  const input = object(value);
  requireValue(['ok', 'partial', 'unavailable'].includes(input.status as string));
  for (const key of ['provider', 'providerHost', 'accessMode', 'timezone', 'failureReason']) requireValue(nullableText(input[key]));
  requireValue(input.requestedLatitude === selected.latitude && input.requestedLongitude === selected.longitude);
  for (const key of ['gridLatitude', 'gridLongitude', 'sourceIntervalSeconds', 'temperatureC', 'precipitationMm', 'weatherCode']) {
    requireValue(input[key] === null || finite(input[key]));
  }
  const units = object(input.units);
  requireValue(units.temperature === 'celsius' && units.precipitation === 'mm' && input.sourceTimeFormat === 'unixtime');
  const requestedAt = timestamp(input.requestedAt);
  const retrievedAt = input.retrievedAt === null ? null : timestamp(input.retrievedAt);
  const validAt = input.validAt === null ? null : timestamp(input.validAt);
  return {
    provider: input.provider as string | null, providerHost: input.providerHost as string | null,
    accessMode: input.accessMode as string | null, status: input.status as WeatherSnapshot['status'],
    requestedLatitude: selected.latitude, requestedLongitude: selected.longitude,
    gridLatitude: input.gridLatitude as number | null, gridLongitude: input.gridLongitude as number | null,
    validAt, sourceIntervalSeconds: input.sourceIntervalSeconds as number | null, requestedAt, retrievedAt,
    temperatureC: input.temperatureC as number | null, precipitationMm: input.precipitationMm as number | null,
    weatherCode: input.weatherCode as number | null, units: { temperature: 'celsius', precipitation: 'mm' },
    sourceTimeFormat: 'unixtime', timezone: input.timezone as string | null, failureReason: input.failureReason as string | null,
  };
}
function visitContext(value: VisitContext): VisitContext {
  const input = object(value);
  const selected = city(input.city);
  requireValue(input.hunger === null || ['not_hungry', 'somewhat_hungry', 'very_hungry'].includes(input.hunger as string));
  return { contextCapturedAt: timestamp(input.contextCapturedAt), city: selected, hunger: input.hunger as VisitContext['hunger'], weather: weather(input.weather, selected) };
}
function meal(value: unknown): MealSnapshot {
  const input = object(value);
  requireValue(text(input.id) && text(input.name) && nullableText(input.cuisine)
    && nullableText(input.imageUrl) && nullableText(input.description) && finite(input.spiciness) && finite(input.heaviness));
  return {
    id: input.id, name: input.name, cuisine: input.cuisine,
    primaryIngredients: strings(input.primaryIngredients), allergens: strings(input.allergens),
    weather: strings(input.weather), timeOfDay: strings(input.timeOfDay), spiciness: input.spiciness,
    heaviness: input.heaviness, imageUrl: input.imageUrl, description: input.description, flavorTags: strings(input.flavorTags),
  };
}
function eligiblePool(value: EligiblePool): EligiblePool {
  const input = object(value);
  requireValue(Number.isSafeInteger(input.settingsVersion) && Array.isArray(input.meals));
  const meals = input.meals.map(meal);
  requireValue(new Set(meals.map(m => m.id)).size === meals.length);
  return { settingsVersion: input.settingsVersion as number, meals };
}
function call(userId: string, studyId: string, now: Date): void {
  requireValue(text(userId) && text(studyId) && now instanceof Date && Number.isFinite(now.getTime()));
}
async function studyRecord(studyId: string): Promise<StudyRecord> {
  const study = await PilotStudy.findOne({ studyId }).lean().exec();
  requireValue(study, 'not_found');
  return study;
}
function withinStudy(study: StudyRecord, now: Date): void {
  const instant = now.toISOString();
  requireValue(comparePilotTimestamps(instant, study.startsAt) >= 0 && comparePilotTimestamps(instant, study.endsAt) < 0, 'closed');
}
function currentSettings(p: PilotParticipantRecord): EnrollmentSettings {
  return p.settings[p.settings.length - 1];
}
function participantView(p: ParticipantView): ParticipantView {
  return { participantId: p.participantId, enrolledAt: p.enrolledAt, enrollmentTimezone: p.enrollmentTimezone, settings: global.structuredClone(p.settings) };
}
function visitView(v: StoredVisit): VisitRecord {
  return {
    visitId: v.visitId, participantId: v.participantId, settingsVersion: v.settingsVersion,
    startedAt: v.startedAt, expiresAt: v.expiresAt, contextCapturedAt: v.contextCapturedAt,
    city: global.structuredClone(v.city), hunger: v.hunger, weather: global.structuredClone(v.weather),
  };
}
function allocationView(a: StoredAllocation): CardAllocation {
  return {
    allocationId: a.allocationId, participantId: a.participantId, localDate: a.localDate, settingsVersion: a.settingsVersion,
    itemId: a.itemId, allocatedAt: a.allocatedAt, eligiblePoolSize: a.eligiblePoolSize, selectionProbability: a.selectionProbability,
  };
}
function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
function slotFor(p: PilotParticipantRecord, allocationId: string): PilotSlot | undefined {
  return p.days.flatMap(day => day.slots).find(slot => slot.allocationId === allocationId);
}
function closeVisit(p: PilotParticipantRecord, visit: StoredVisit, at: string, expired: boolean): void {
  if (visit.closedAt !== null) return;
  visit.closedAt = at;
  for (const slot of p.days.flatMap(day => day.slots)) {
    if (slot.visitId !== visit.visitId) continue;
    if (slot.status === 'shown') slot.status = expired ? 'expired' : 'closed';
    if (slot.status === 'unshown') {
      if (expired) slot.status = 'expired';
      else slot.visitId = null;
    }
  }
}
function expireVisits(p: PilotParticipantRecord, now: Date): void {
  for (const visit of p.visits) {
    if (Date.parse(visit.expiresAt) <= now.getTime()) closeVisit(p, visit, visit.expiresAt, true);
  }
}
function activeVisit(p: PilotParticipantRecord, visitId: string, now: Date): StoredVisit {
  const visit = p.visits.find(v => v.visitId === visitId);
  requireValue(visit, 'not_found');
  requireValue(now.getTime() < Date.parse(visit.expiresAt), 'expired');
  requireValue(visit.closedAt === null, 'closed');
  return visit;
}
function state(p: PilotParticipantRecord) {
  return { settings: p.settings, days: p.days, visits: p.visits, allocations: p.allocations, exposures: p.exposures, responses: p.responses, issuances: p.issuances };
}
async function transition<T>(userId: string, studyId: string, now: Date, operation: (p: PilotParticipantRecord, study: StudyRecord) => T): Promise<T> {
  call(userId, studyId, now);
  const study = await studyRecord(studyId);
  for (;;) {
    const loaded = await PilotParticipant.findOne({ studyId, userId }).lean().exec();
    requireValue(loaded, 'not_enrolled');
    const next = { ...loaded, ...global.structuredClone(state(loaded)) };
    expireVisits(next, now);
    const expiredState = global.structuredClone(state(next));
    let result: T | undefined;
    let failure: unknown;
    try {
      result = operation(next, study);
    } catch (error) {
      failure = error;
      Object.assign(next, expiredState);
    }
    if (JSON.stringify(state(loaded)) !== JSON.stringify(state(next))) {
      const written = await PilotParticipant.updateOne({ _id: loaded._id, version: loaded.version }, { $set: state(next), $inc: { version: 1 } }).exec();
      if (written.modifiedCount === 0) continue;
    }
    if (failure) throw failure;
    return global.structuredClone(result as T);
  }
}

export async function enrollParticipant(userId: string, studyId: string, settings: EnrollmentSettings, now: Date): Promise<ParticipantView> {
  call(userId, studyId, now);
  const chosen = enrollmentSettings(settings, now);
  requireValue(chosen.version === 1);
  const study = await studyRecord(studyId);
  withinStudy(study, now);
  const existing = await PilotParticipant.findOne({ studyId, userId }).lean().exec();
  if (existing) return participantView(existing);
  try {
    const created = await PilotParticipant.create({
      studyId, userId, participantId: randomUUID(), enrolledAt: now.toISOString(), enrollmentTimezone: chosen.city.timezone,
      version: 0, settings: [chosen], days: [], visits: [], allocations: [], exposures: [], responses: [], issuances: [],
    });
    return participantView(created.toObject());
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const concurrent = await PilotParticipant.findOne({ studyId, userId }).lean().exec();
      if (concurrent) return participantView(concurrent);
    }
    throw error;
  }
}

export async function updateParticipant(userId: string, studyId: string, settings: EnrollmentSettings, now: Date): Promise<ParticipantView> {
  call(userId, studyId, now);
  const chosen = enrollmentSettings(settings, now);
  return transition(userId, studyId, now, (p, study) => {
    withinStudy(study, now);
    const current = currentSettings(p);
    requireValue(chosen.version === current.version, 'conflict');
    if (!sameSettings(current, chosen)) p.settings.push({ ...chosen, version: current.version + 1 });
    return participantView(p);
  });
}

export async function createVisit(userId: string, studyId: string, operationId: string, context: VisitContext, now: Date): Promise<VisitRecord> {
  call(userId, studyId, now);
  requireValue(text(operationId));
  const captured = visitContext(context);
  requireValue(comparePilotTimestamps(captured.contextCapturedAt, now.toISOString()) <= 0);
  return transition(userId, studyId, now, (p, study) => {
    withinStudy(study, now);
    const existing = p.visits.find(v => v.operationId === operationId);
    if (existing) {
      const original = { contextCapturedAt: existing.contextCapturedAt, city: existing.city, hunger: existing.hunger, weather: existing.weather };
      requireValue(JSON.stringify(original) === JSON.stringify(captured), 'conflict');
      return visitView(existing);
    }
    const current = currentSettings(p);
    requireValue(JSON.stringify(current.city) === JSON.stringify(captured.city), 'conflict');
    const day = p.days.find(d => d.localDate === localDate(now, p.enrollmentTimezone));
    requireValue(!day || day.slots.some(s => s.status === 'unshown'), 'closed');
    for (const visit of p.visits) closeVisit(p, visit, now.toISOString(), false);
    const visit: StoredVisit = {
      visitId: randomUUID(), participantId: p.participantId, operationId, closedAt: null,
      settingsVersion: current.version, startedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60000).toISOString(), ...captured,
    };
    p.visits.push(visit);
    return visitView(visit);
  });
}

function shuffled(choices: MealSnapshot[], seed: string): MealSnapshot[] {
  const result = [...choices].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let counter = 0;
  for (let i = result.length - 1; i > 0; i--) {
    const bound = i + 1;
    const limit = 4294967296 - (4294967296 % bound);
    let sample: number;
    do {
      sample = createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0);
    } while (sample >= limit);
    const selected = sample % bound;
    [result[i], result[selected]] = [result[selected], result[i]];
  }
  return result;
}
function allocate(p: PilotParticipantRecord, study: StudyRecord, day: PilotDay, pool: EligiblePool, slots: PilotSlot[], now: Date): void {
  const used = new Set(p.allocations.filter(a => a.localDate === day.localDate).map(a => a.itemId));
  const candidates = shuffled(pool.meals.filter(m => !used.has(m.id)), `${study.seed}:${study.studyId}:${p.participantId}:${day.localDate}:${p.allocations.length}`);
  slots.forEach((slot, i) => {
    const selected = candidates[i];
    if (!selected) {
      day.shortage++;
      slot.status = 'closed';
      slot.visitId = null;
      return;
    }
    const allocation: StoredAllocation = {
      allocationId: randomUUID(), participantId: p.participantId, localDate: day.localDate, settingsVersion: pool.settingsVersion,
      itemId: selected.id, allocatedAt: now.toISOString(), eligiblePoolSize: pool.meals.length,
      selectionProbability: 1 / (candidates.length - i), meal: global.structuredClone(selected),
    };
    p.allocations.push(allocation);
    slot.allocationId = allocation.allocationId;
    slot.validatedSettingsVersion = pool.settingsVersion;
    slot.visitId = null;
  });
}

export async function nextCard(userId: string, studyId: string, visitId: string, operationId: string, pool: EligiblePool, now: Date): Promise<CardAllocation | null> {
  requireValue(text(visitId) && text(operationId));
  const eligible = eligiblePool(pool);
  const card = await transition<CardAllocation | null | undefined>(userId, studyId, now, (p, study) => {
    withinStudy(study, now);
    const visit = activeVisit(p, visitId, now);
    const current = currentSettings(p);
    requireValue(eligible.settingsVersion === current.version && visit.settingsVersion === current.version, 'conflict');
    const issued = p.issuances.find(i => i.operationId === operationId);
    if (issued) {
      requireValue(issued.visitId === visitId, 'conflict');
      if (issued.allocationId === null) return null;
      const allocation = p.allocations.find(a => a.allocationId === issued.allocationId)!;
      if (!p.exposures.some(e => e.allocationId === allocation.allocationId)) {
        const slot = slotFor(p, allocation.allocationId);
        if (!slot || slot.status !== 'unshown') return undefined;
        if (!eligible.meals.some(m => m.id === allocation.itemId)) {
          const day = p.days.find(d => d.localDate === allocation.localDate)!;
          allocate(p, study, day, eligible, [slot], now);
          return undefined;
        }
      }
      return allocationView(allocation);
    }
    const date = localDate(now, p.enrollmentTimezone);
    let day = p.days.find(d => d.localDate === date);
    if (!day) {
      day = { localDate: date, shortage: 0, slots: Array.from({ length: 5 }, () => ({ slotId: randomUUID(), allocationId: null, visitId: null, validatedSettingsVersion: current.version, status: 'unshown' })) };
      allocate(p, study, day, eligible, day.slots, now);
      p.days.push(day);
    } else {
      const eligibleIds = new Set(eligible.meals.map(m => m.id));
      const incompatible = day.slots.filter(s => s.status === 'unshown' && !eligibleIds.has(p.allocations.find(a => a.allocationId === s.allocationId)!.itemId));
      allocate(p, study, day, eligible, incompatible, now);
      for (const slot of day.slots) if (slot.status === 'unshown') slot.validatedSettingsVersion = current.version;
    }
    const slot = day.slots.find(s => s.status === 'unshown' && s.visitId === visitId)
      ?? day.slots.find(s => s.status === 'unshown' && s.visitId === null);
    if (slot) slot.visitId = visitId;
    p.issuances.push({ operationId, visitId, allocationId: slot?.allocationId ?? null });
    return slot ? allocationView(p.allocations.find(a => a.allocationId === slot.allocationId)!) : null;
  });
  // Commit invalidation before reporting a reload; thrown transitions roll back operation changes.
  requireValue(card !== undefined, 'conflict');
  return card;
}

export async function acknowledgeDisplay(userId: string, studyId: string, allocationId: string, visitId: string, settingsVersion: number, clientTime: string, now: Date): Promise<ExposureRecord> {
  requireValue(text(allocationId) && text(visitId) && Number.isSafeInteger(settingsVersion));
  const clientDisplayedAt = timestamp(clientTime);
  return transition(userId, studyId, now, (p, study) => {
    const existing = p.exposures.find(e => e.allocationId === allocationId);
    if (existing) {
      requireValue(existing.visitId === visitId && existing.settingsVersion === settingsVersion, 'conflict');
      return existing;
    }
    withinStudy(study, now);
    const visit = activeVisit(p, visitId, now);
    requireValue(settingsVersion === currentSettings(p).version && visit.settingsVersion === settingsVersion, 'conflict');
    const slot = slotFor(p, allocationId);
    requireValue(slot && slot.visitId === visitId, 'not_found');
    requireValue(slot.status === 'unshown' && slot.validatedSettingsVersion === settingsVersion, 'conflict');
    const allocation = p.allocations.find(a => a.allocationId === allocationId)!;
    const exposure: ExposureRecord = {
      eventId: randomUUID(), participantId: p.participantId, visitId, allocationId, settingsVersion,
      itemId: allocation.itemId, displayedAt: now.toISOString(), clientDisplayedAt, meal: global.structuredClone(allocation.meal),
    };
    slot.status = 'shown';
    p.exposures.push(exposure);
    return exposure;
  });
}

export async function submitAction(userId: string, studyId: string, exposureId: string, action: AppealAnswer | 'skip', clientTime: string, now: Date): Promise<ActionResult<ResponseRecord | null>> {
  requireValue(text(exposureId) && ['yes', 'no', 'not_sure', 'skip'].includes(action));
  const actionAt = timestamp(clientTime);
  return transition(userId, studyId, now, (p, study) => {
    const exposure = p.exposures.find(e => e.eventId === exposureId);
    requireValue(exposure, 'not_found');
    const original = p.responses.find(r => r.eventId === exposureId);
    if (original) {
      requireValue(original.answer === action, 'conflict');
      return { ok: true, value: original };
    }
    const slot = slotFor(p, exposure.allocationId)!;
    if (slot.status === 'skipped' && action === 'skip') return { ok: true, value: null };
    requireValue(slot.status !== 'skipped', 'conflict');
    withinStudy(study, now);
    activeVisit(p, exposure.visitId, now);
    requireValue(slot.status === 'shown', 'conflict');
    if (action === 'skip') {
      slot.status = 'skipped';
      return { ok: true, value: null };
    }
    const response: ResponseRecord = { responseId: randomUUID(), eventId: exposureId, participantId: p.participantId, answer: action, actionAt, receivedAt: now.toISOString() };
    p.responses.push(response);
    slot.status = 'answered';
    return { ok: true, value: response };
  });
}
