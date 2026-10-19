// ABOUTME: Serves authenticated pilot requests with owned immutable snapshots.
// ABOUTME: Resolves settings, fresh visit context and full catalog eligibility on the server.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isMealEligible } from '@meal-rec/core';
import {
  acknowledgeDisplay, connect, createVisit, enrollParticipant, Meal, nextCard,
  PilotError, PilotParticipant, PilotStudy, submitAction, updateParticipant,
} from '@meal-rec/database';
import type {
  CardAllocation, CitySelection, EligiblePool, ExposureRecord, Hunger, MealSnapshot,
  ParticipantView, PilotErrorCode, PilotParticipantRecord, ResponseRecord, StoredAllocation, StoredVisit,
  StudyRecord, VisitRecord,
} from '@meal-rec/database';
import { comparePilotTimestamps } from '../../../../packages/database/src/models/pilot-study';
import { captureWeather, searchCities } from './weather';

export interface PilotCard {
  allocation: CardAllocation;
  meal: MealSnapshot;
  exposure: ExposureRecord | null;
}
export interface PilotProgress {
  localDate: string | null;
  answered: number;
  unanswered: number;
  shortage: number;
  remaining: number;
  total: number;
}
export interface PilotState {
  status: 'disabled' | 'not_started' | 'ended' | 'ready';
  study: Pick<StudyRecord, 'studyId' | 'startsAt' | 'endsAt'> | null;
  enrollment: ParticipantView | null;
  visit: VisitRecord | null;
  card: PilotCard | null;
  progress: PilotProgress;
}
type Endpoint = 'state' | 'enrollment' | 'cities' | 'visits' | 'cards' | 'exposures' | 'responses';
const emptyProgress: PilotProgress = { localDate: null, answered: 0, unanswered: 0, shortage: 0, remaining: 5, total: 5 };
const statuses = { invalid: 400, not_enrolled: 403, not_found: 404, closed: 409, expired: 409, conflict: 409 };
const messages = {
  invalid: 'Check the submitted pilot information.',
  not_enrolled: 'Opt in before starting a pilot assessment.',
  not_found: 'This pilot record was not found.',
  closed: 'This study or visit is closed. Reload the pilot to continue.',
  expired: 'This visit expired. Reload the pilot and start a fresh visit.',
  conflict: 'The pilot changed. Reload the current pilot state before continuing.',
};
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function pilotMethodResponse(allow: string, status: 204 | 405): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store', Allow: allow } });
}
function requireValue(condition: unknown, code: PilotErrorCode = 'invalid'): asserts condition {
  if (!condition) throw new PilotError(code);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new PilotError('invalid'); }
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function cityView(city: CitySelection): CitySelection {
  return { cityId: city.cityId, label: city.label, country: city.country, adminArea: city.adminArea, latitude: city.latitude, longitude: city.longitude, timezone: city.timezone };
}
function enrollmentView(p: ParticipantView): ParticipantView {
  return {
    participantId: p.participantId, enrolledAt: p.enrolledAt, enrollmentTimezone: p.enrollmentTimezone,
    settings: p.settings.map(s => ({ version: s.version, effectiveAt: s.effectiveAt, city: cityView(s.city), dietaryExclusions: [...s.dietaryExclusions] })),
  };
}
function visitView(v: VisitRecord): VisitRecord {
  return { visitId: v.visitId, participantId: v.participantId, settingsVersion: v.settingsVersion, startedAt: v.startedAt, expiresAt: v.expiresAt, contextCapturedAt: v.contextCapturedAt, city: cityView(v.city), hunger: v.hunger, weather: v.weather };
}
function mealView(meal: MealSnapshot): MealSnapshot {
  return {
    id: meal.id, name: meal.name, cuisine: meal.cuisine, primaryIngredients: [...meal.primaryIngredients],
    allergens: [...meal.allergens], weather: [...meal.weather], timeOfDay: [...meal.timeOfDay],
    spiciness: meal.spiciness, heaviness: meal.heaviness, imageUrl: meal.imageUrl,
    description: meal.description, flavorTags: [...meal.flavorTags],
  };
}
function exposureView(e: ExposureRecord): ExposureRecord {
  return { eventId: e.eventId, participantId: e.participantId, visitId: e.visitId, allocationId: e.allocationId, settingsVersion: e.settingsVersion, itemId: e.itemId, displayedAt: e.displayedAt, clientDisplayedAt: e.clientDisplayedAt, meal: mealView(e.meal) };
}
function cardView(a: StoredAllocation, exposure?: ExposureRecord): PilotCard {
  return {
    allocation: { allocationId: a.allocationId, participantId: a.participantId, localDate: a.localDate, settingsVersion: a.settingsVersion, itemId: a.itemId, allocatedAt: a.allocatedAt, eligiblePoolSize: a.eligiblePoolSize, selectionProbability: a.selectionProbability },
    meal: mealView(a.meal), exposure: exposure ? exposureView(exposure) : null,
  };
}
async function participant(userId: string, studyId: string, required = true): Promise<PilotParticipantRecord | null> {
  const record = await PilotParticipant.findOne({ studyId, userId }).lean().exec();
  if (required) requireValue(record, 'not_enrolled');
  return record;
}
function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
function progress(p: PilotParticipantRecord | null, now: Date): PilotProgress {
  if (!p) return { ...emptyProgress };
  const date = localDate(now, p.enrollmentTimezone);
  const day = p.days.find(d => d.localDate === date);
  const slots = day?.slots.map(slot => ({ ...slot, status: (slot.status === 'shown' || slot.status === 'unshown')
    && p.visits.some(v => v.visitId === slot.visitId && Date.parse(v.expiresAt) <= now.getTime()) ? 'expired' : slot.status }));
  return {
    localDate: date, total: 5, shortage: day?.shortage ?? 0,
    answered: slots?.filter(s => s.status === 'answered').length ?? 0,
    unanswered: slots?.filter(s => s.allocationId !== null && (s.status === 'skipped' || s.status === 'closed' || s.status === 'expired')).length ?? 0,
    remaining: slots ? slots.filter(s => s.status === 'unshown').length : 5,
  };
}
async function eligiblePool(p: PilotParticipantRecord, now: Date): Promise<EligiblePool> {
  const current = p.settings[p.settings.length - 1];
  const records = await Meal.find({}).lean().exec();
  const snapshots: MealSnapshot[] = records.map(record => ({
    id: String(record._id), name: record.name, cuisine: record.cuisine ?? null,
    primaryIngredients: record.primaryIngredients, allergens: record.allergens, weather: record.weather,
    timeOfDay: record.timeOfDay, spiciness: record.spiciness, heaviness: record.heaviness,
    imageUrl: record.imageUrl ?? null, description: record.description ?? null, flavorTags: record.flavorTags,
  }));
  const day = p.days.find(d => d.localDate === localDate(now, p.enrollmentTimezone));
  const incompatible = new Set(day?.slots.flatMap(slot => {
    if (slot.status !== 'unshown') return [];
    const saved = p.allocations.find(a => a.allocationId === slot.allocationId);
    return saved && !isMealEligible(saved.meal, current.dietaryExclusions) ? [saved.itemId] : [];
  }));
  return { settingsVersion: current.version, meals: snapshots.filter(m => !incompatible.has(m.id) && isMealEligible(m, current.dietaryExclusions)) };
}
function readyVisit(v: StoredVisit, p: PilotParticipantRecord, now: Date): boolean {
  return v.closedAt === null && Date.parse(v.expiresAt) > now.getTime() && v.settingsVersion === p.settings[p.settings.length - 1].version;
}
async function state(study: StudyRecord, p: PilotParticipantRecord | null, now: Date): Promise<PilotState> {
  const status = comparePilotTimestamps(now.toISOString(), study.startsAt) < 0 ? 'not_started'
    : comparePilotTimestamps(now.toISOString(), study.endsAt) >= 0 ? 'ended' : 'ready';
  const current = status === 'ready' && p ? [...p.visits].reverse().find(v => readyVisit(v, p, now)) : undefined;
  let card: PilotCard | null = null;
  if (current && p) {
    const slot = p.days.flatMap(d => d.slots).find(s => s.visitId === current.visitId && (s.status === 'shown' || s.status === 'unshown'));
    const saved = slot && p.allocations.find(a => a.allocationId === slot.allocationId);
    if (saved) {
      const shown = p.exposures.find(e => e.allocationId === saved.allocationId);
      if (shown || (await eligiblePool(p, now)).meals.some(m => m.id === saved.itemId)) card = cardView(saved, shown);
    }
  }
  return { status, study: { studyId: study.studyId, startsAt: study.startsAt, endsAt: study.endsAt }, enrollment: p ? enrollmentView(p) : null, visit: current ? visitView(current) : null, card, progress: progress(p, now) };
}

export async function pilotApi(endpoint: Endpoint, request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!text(userId)) return json({ error: { code: 'unauthenticated', message: 'Sign in to use the pilot.' } }, 401);
    const studyId = process.env.PILOT_STUDY_ID?.trim();
    if (!studyId) return endpoint === 'state'
      ? json({ status: 'disabled', study: null, enrollment: null, visit: null, card: null, progress: emptyProgress } satisfies PilotState)
      : json({ error: { code: 'not_found', message: 'The pilot is not configured.' } }, 404);
    await connect();
    const study = await PilotStudy.findOne({ studyId }).lean().exec();
    requireValue(study, 'not_found');
    if (endpoint === 'state') return json(await state(study, await participant(userId, studyId, false), new Date()));
    if (endpoint === 'cities') {
      const cities = await searchCities(new URL(request.url).searchParams.get('q') ?? '', study.cityOptions);
      return json({ cities: cities.map(cityView) });
    }
    const body = await bodyOf(request);
    if (endpoint === 'enrollment') {
      requireValue(request.method === 'POST' || request.method === 'PATCH');
      requireValue(text(body.cityId) && typeof body.cityQuery === 'string'
        && Array.isArray(body.dietaryExclusions) && body.dietaryExclusions.every(text));
      if (request.method === 'POST') requireValue(body.optIn === true);
      else requireValue(Number.isSafeInteger(body.version) && (body.version as number) >= 1);
      const choices = await searchCities(body.cityQuery, study.cityOptions);
      const city = choices.find(c => c.cityId === body.cityId);
      requireValue(city);
      const now = new Date();
      const settings = { version: request.method === 'POST' ? 1 : body.version as number, effectiveAt: now.toISOString(), city, dietaryExclusions: [...new Set((body.dietaryExclusions as string[]).map(value => value.trim().toLowerCase()))] };
      const enrolled = request.method === 'POST'
        ? await enrollParticipant(userId, studyId, settings, now)
        : await updateParticipant(userId, studyId, settings, now);
      return json({ enrollment: enrollmentView(enrolled) });
    }
    requireValue(request.method === 'POST');
    if (endpoint === 'responses') {
      requireValue(text(body.exposureId) && typeof body.clientActionAt === 'string' && ['yes', 'no', 'not_sure', 'skip'].includes(body.action as string));
      const result = await submitAction(userId, studyId, body.exposureId, body.action as 'yes' | 'no' | 'not_sure' | 'skip', body.clientActionAt, new Date());
      if (!result.ok) {
        if (Object.prototype.hasOwnProperty.call(statuses, result.error.code)) throw new PilotError(result.error.code as PilotErrorCode);
        throw new Error('Unexpected pilot service failure');
      }
      const r: ResponseRecord | null = result.value;
      return json({ ok: true, value: r ? { responseId: r.responseId, eventId: r.eventId, participantId: r.participantId, answer: r.answer, actionAt: r.actionAt, receivedAt: r.receivedAt } : null });
    }
    const p = (await participant(userId, studyId))!;
    const current = p.settings[p.settings.length - 1];
    if (endpoint === 'visits') {
      requireValue(text(body.operationId));
      const hunger = body.hunger === undefined ? null : body.hunger;
      requireValue(hunger === null || ['not_hungry', 'somewhat_hungry', 'very_hungry'].includes(hunger as string));
      const capturedAt = new Date();
      requireValue(comparePilotTimestamps(capturedAt.toISOString(), study.startsAt) >= 0
        && comparePilotTimestamps(capturedAt.toISOString(), study.endsAt) < 0, 'closed');
      const saved = p.visits.find(v => v.operationId === body.operationId);
      if (saved) {
        requireValue(Date.parse(saved.expiresAt) > Date.now(), 'expired');
        requireValue(saved.closedAt === null, 'closed');
        requireValue(saved.settingsVersion === current.version && saved.hunger === hunger, 'conflict');
      }
      const context = saved
        ? { contextCapturedAt: saved.contextCapturedAt, city: saved.city, hunger: saved.hunger, weather: saved.weather }
        : { contextCapturedAt: capturedAt.toISOString(), city: current.city, hunger: hunger as Hunger, weather: await captureWeather(current.city, capturedAt) };
      const visit = await createVisit(userId, studyId, body.operationId, context, new Date());
      return json({ visit: visitView(visit) });
    }
    if (endpoint === 'cards') {
      requireValue(text(body.visitId) && text(body.operationId));
      const now = new Date();
      const allocation = await nextCard(userId, studyId, body.visitId, body.operationId, await eligiblePool(p, now), now);
      const saved = await participant(userId, studyId);
      const owned = allocation && saved!.allocations.find(a => a.allocationId === allocation.allocationId);
      requireValue(allocation === null || owned, 'not_found');
      return json({ card: owned ? cardView(owned, saved!.exposures.find(e => e.allocationId === owned.allocationId)) : null, progress: progress(saved, now) });
    }
    requireValue(text(body.allocationId) && text(body.visitId) && Number.isSafeInteger(body.settingsVersion) && typeof body.clientDisplayedAt === 'string');
    if (!p.exposures.some(e => e.allocationId === body.allocationId)) {
      const issuance = p.issuances.find(i => i.allocationId === body.allocationId && i.visitId === body.visitId);
      requireValue(issuance, 'not_found');
      const now = new Date();
      const allocation = await nextCard(userId, studyId, body.visitId, issuance.operationId, await eligiblePool(p, now), now);
      requireValue(allocation?.allocationId === body.allocationId, 'conflict');
    }
    const exposure = await acknowledgeDisplay(userId, studyId, body.allocationId, body.visitId, body.settingsVersion as number, body.clientDisplayedAt, new Date());
    return json({ exposure: exposureView(exposure) });
  } catch (error) {
    if (error instanceof PilotError) return json({ error: { code: error.code, message: messages[error.code] } }, statuses[error.code]);
    return json({ error: { code: 'internal', message: 'The pilot could not save or load. Please retry.' } }, 500);
  }
}
