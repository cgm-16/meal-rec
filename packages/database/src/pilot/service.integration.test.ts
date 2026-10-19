// ABOUTME: Exercises pilot lifecycle, quota and concurrency against a real ephemeral MongoDB.
// ABOUTME: Verifies immutable observations and settings-safe allocation before display.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { PilotStudy } from '../models/pilot-study';
import { PilotParticipant } from '../models/pilot-participant';
import { clearTestDb, setupTestDb, teardownTestDb } from '../test-setup';
import { acknowledgeDisplay, createVisit, enrollParticipant, nextCard, submitAction, updateParticipant } from './service';
import type { EligiblePool, VisitContext } from './service';
import type { CitySelection, EnrollmentSettings, MealSnapshot, StudyRecord } from './types';

const now = new Date('2026-10-25T12:00:00.000Z');
const ny: CitySelection = {
  cityId: 'geonames:5128581', label: 'New York', country: 'United States', adminArea: 'New York',
  latitude: 40.71, longitude: -74.01, timezone: 'America/New_York',
};
const seoul: CitySelection = {
  cityId: 'geonames:1835848', label: 'Seoul', country: 'South Korea', adminArea: null,
  latitude: 37.57, longitude: 126.98, timezone: 'Asia/Seoul',
};
const study: StudyRecord = {
  schemaVersion: 1, studyId: 'pilot-test', studyVersion: '1', protocolVersion: '1', catalogVersion: '1',
  catalogSha256: 'a'.repeat(64), seed: 42, startsAt: '2026-10-24T00:00:00.000Z',
  trainingEndsAt: '2026-10-29T00:00:00.000Z', developmentEndsAt: '2026-10-31T00:00:00.000Z',
  endsAt: '2026-11-07T00:00:00.000Z', quotaTimezoneRule: 'enrollment', cityOptions: [ny, seoul],
};
function settings(overrides: Partial<EnrollmentSettings> = {}): EnrollmentSettings {
  return { version: 1, effectiveAt: now.toISOString(), city: ny, dietaryExclusions: [], ...overrides };
}
function context(at = now, city = ny): VisitContext {
  return {
    contextCapturedAt: at.toISOString(), city, hunger: null,
    weather: {
      provider: 'Open-Meteo', providerHost: null, accessMode: 'disabled', status: 'unavailable',
      requestedLatitude: city.latitude, requestedLongitude: city.longitude, gridLatitude: null, gridLongitude: null,
      validAt: null, sourceIntervalSeconds: null, requestedAt: at.toISOString(), retrievedAt: null,
      temperatureC: null, precipitationMm: null, weatherCode: null,
      units: { temperature: 'celsius', precipitation: 'mm' }, sourceTimeFormat: 'unixtime',
      timezone: null, failureReason: 'access_not_configured',
    },
  };
}
function meal(id: string, primaryIngredients: string[] = ['rice']): MealSnapshot {
  return { id, name: id, cuisine: null, primaryIngredients, allergens: [], weather: [], timeOfDay: [],
    spiciness: 0, heaviness: 1, imageUrl: null, description: null, flavorTags: [] };
}
const meals = Array.from({ length: 9 }, (_, i) => meal(`meal-${i}`));
function pool(version = 1, choices = meals): EligiblePool {
  return { settingsVersion: version, meals: choices };
}
async function begin(userId = 'actor', at = now, chosenSettings = settings()) {
  await enrollParticipant(userId, study.studyId, chosenSettings, at);
  return createVisit(userId, study.studyId, `visit-${at.toISOString()}`, context(at, chosenSettings.city), at);
}
async function displayed(userId = 'actor', operationId = 'card', at = now) {
  const visit = await begin(userId, at);
  const card = await nextCard(userId, study.studyId, visit.visitId, operationId, pool(), at);
  expect(card).not.toBeNull();
  const exposure = await acknowledgeDisplay(userId, study.studyId, card!.allocationId, visit.visitId, 1, at.toISOString(), at);
  return { visit, card: card!, exposure };
}
async function aggregate(userId = 'actor') {
  const record = await PilotParticipant.findOne({ studyId: study.studyId, userId }).lean().exec();
  expect(record).not.toBeNull();
  return record!;
}
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'PilotError', code });
}

describe('pilot lifecycle (real MongoDB)', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await PilotStudy.create(study);
  });

  it('uses an isolated real database and makes concurrent opt-in idempotent without exposing identity', async () => {
    expect(mongoose.connection.name).toMatch(/^test-/);
    const participants = await Promise.all(Array.from({ length: 6 }, () => enrollParticipant('actor', study.studyId, settings(), now)));
    expect(new Set(participants.map(p => p.participantId)).size).toBe(1);
    expect(await PilotParticipant.countDocuments()).toBe(1);
    expect(Object.keys(participants[0]).sort()).toEqual(['enrolledAt', 'enrollmentTimezone', 'participantId', 'settings']);
    expect(JSON.stringify(participants[0])).not.toContain('actor');
    expect((await aggregate()).version).toBe(0);
  });

  it('validates and freezes study configuration, including canonical slash-style city aliases', async () => {
    await expect(PilotStudy.updateOne({ studyId: study.studyId }, { $set: { seed: 99 } })).rejects.toThrow();
    await expect(PilotStudy.create({ ...study, studyId: 'bad', endsAt: study.trainingEndsAt })).rejects.toThrow();
    const alias = await PilotStudy.create({ ...study, studyId: 'alias', cityOptions: [{ ...ny, timezone: 'us/eastern' }] });
    expect(alias.cityOptions[0].timezone).toBe('America/New_York');
    expect((await PilotStudy.findOne({ studyId: study.studyId }).lean().exec())!.seed).toBe(42);
  });

  it.each(['PST', 'CET', 'Japan', '+09:00', 'UTC+9', 'SystemV/EST5EDT', 'Mars/Olympus', 'us/eastern'])('rejects invalid or unnormalized selected zone %s', async timezone => {
    await expectCode(enrollParticipant('actor', study.studyId, settings({ city: { ...ny, timezone } }), now), 'invalid');
    if (timezone !== 'us/eastern') await expect(PilotStudy.create({ ...study, studyId: 'bad-zone', cityOptions: [{ ...ny, timezone }] })).rejects.toThrow();
  });

  it('accepts UTC and GMT choices and rejects malformed settings and context at the boundary', async () => {
    await enrollParticipant('utc', study.studyId, settings({ city: { ...ny, timezone: 'UTC' } }), now);
    await enrollParticipant('gmt', study.studyId, settings({ city: { ...ny, timezone: 'GMT' } }), now);
    await expectCode(enrollParticipant('actor', study.studyId, settings({ dietaryExclusions: [''] }), now), 'invalid');
    await begin();
    await expectCode(createVisit('actor', study.studyId, 'bad-context', context(now, seoul), now), 'conflict');
    await expectCode(createVisit('actor', study.studyId, 'bad-hunger', { ...context(), hunger: 'bad' } as unknown as VisitContext, now), 'invalid');
    await expectCode(createVisit('actor', study.studyId, 'bad-weather', { ...context(), weather: {} } as VisitContext, now), 'invalid');
    await expectCode(createVisit('actor', study.studyId, '', context(), now), 'invalid');
  });

  it('enforces opt-in, study window and actor ownership', async () => {
    await expectCode(createVisit('stranger', study.studyId, 'visit', context(), now), 'not_enrolled');
    await expectCode(enrollParticipant('actor', 'missing', settings(), now), 'not_found');
    await expectCode(enrollParticipant('early', study.studyId, settings(), new Date('2026-10-23T23:59:59Z')), 'closed');
    const { visit, card, exposure } = await displayed();
    await begin('other');
    await expectCode(nextCard('other', study.studyId, visit.visitId, 'foreign', pool(), now), 'not_found');
    await expectCode(acknowledgeDisplay('other', study.studyId, card.allocationId, visit.visitId, 1, now.toISOString(), now), 'not_found');
    await expectCode(submitAction('other', study.studyId, exposure.eventId, 'yes', now.toISOString(), now), 'not_found');
    await expectCode(createVisit('actor', study.studyId, 'late', context(), new Date(study.endsAt)), 'closed');
  });

  it('persists exactly one day and five distinct allocations under concurrent initialization and stable operation retries', async () => {
    const visit = await begin();
    const cards = await Promise.all(Array.from({ length: 8 }, () => nextCard('actor', study.studyId, visit.visitId, 'draw', pool(), now)));
    expect(new Set(cards.map(c => c!.allocationId)).size).toBe(1);
    const record = await aggregate();
    expect(record.days).toHaveLength(1);
    expect(record.allocations).toHaveLength(5);
    expect(new Set(record.allocations.map(a => a.itemId)).size).toBe(5);
    expect(record.allocations.map(a => a.selectionProbability)).toEqual([1 / 9, 1 / 8, 1 / 7, 1 / 6, 1 / 5]);
    expect(record.allocations.every(a => a.eligiblePoolSize === 9)).toBe(true);
    expect(record.exposures).toHaveLength(0);
    await expectCode(submitAction('actor', study.studyId, cards[0]!.allocationId, 'yes', now.toISOString(), now), 'not_found');
    const differentOperations = await Promise.all(Array.from({ length: 5 }, (_, i) => nextCard('actor', study.studyId, visit.visitId, `concurrent-${i}`, pool(), now)));
    expect(differentOperations.every(c => c!.allocationId === cards[0]!.allocationId)).toBe(true);
    expect((await aggregate()).allocations).toHaveLength(5);
    const sameVisit = await createVisit('actor', study.studyId, `visit-${now.toISOString()}`, context(), now);
    expect(sameVisit).toEqual(visit);
    await expectCode(createVisit('actor', study.studyId, `visit-${now.toISOString()}`, { ...context(), hunger: 'very_hungry' }, now), 'conflict');
  });

  it('persists full-pool draw metadata and preserves issued meal snapshots', async () => {
    const visit = await begin();
    const first = await nextCard('actor', study.studyId, visit.visitId, 'first', pool(), now);
    const stored = await aggregate();
    const exposure = await acknowledgeDisplay('actor', study.studyId, first!.allocationId, visit.visitId, 1, now.toISOString(), now);
    expect(exposure.meal).toEqual(meals.find(m => m.id === first!.itemId));
    const retained = stored.allocations.map(a => a.itemId);
    const changedMeals = meals.map(m => ({ ...m, name: 'catalog changed' })).reverse();
    await nextCard('actor', study.studyId, visit.visitId, 'second', pool(1, changedMeals), now);
    expect((await aggregate()).allocations.map(a => a.itemId)).toEqual(retained);
    expect((await aggregate()).exposures[0].meal.name).toBe(first!.itemId);
  });

  it.each([0, 2])('records a %i-meal shortage without redrawing or opening empty visits', async count => {
    const visit = await begin();
    const choices = meals.slice(0, count);
    for (let i = 0; i < count; i++) {
      const card = await nextCard('actor', study.studyId, visit.visitId, `small-${i}`, pool(1, choices), now);
      const exposure = await acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 1, now.toISOString(), now);
      await submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now);
    }
    expect(await nextCard('actor', study.studyId, visit.visitId, 'empty', pool(1, choices), now)).toBeNull();
    expect((await aggregate()).days[0].shortage).toBe(5 - count);
    expect((await aggregate()).allocations).toHaveLength(count);
    await expectCode(createVisit('actor', study.studyId, 'empty-visit', context(), now), 'closed');
  });

  it('requires the current complete eligibility pool, rejects duplicate meals and draws only the app-filtered meals', async () => {
    const visit = await begin('actor', now, settings({ dietaryExclusions: ['nuts'] }));
    const eligible = meals.slice(0, 6);
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'stale', pool(0, eligible), now), 'conflict');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'duplicate', pool(1, [meals[0], meals[0]]), now), 'invalid');
    await nextCard('actor', study.studyId, visit.visitId, 'filtered', pool(1, eligible), now);
    expect((await aggregate()).allocations.every(a => eligible.some(m => m.id === a.itemId))).toBe(true);
    expect((await aggregate()).allocations.every(a => !a.meal.allergens.includes('nuts'))).toBe(true);
  });

  it('replaces only incompatible unshown slots, retaining shown cards and original allocation evidence', async () => {
    const { visit, card, exposure } = await displayed();
    const before = await aggregate();
    const incompatible = before.allocations.find(a => a.itemId !== card.itemId)!;
    const choices = meals.filter(m => m.id !== incompatible.itemId && m.id !== card.itemId);
    const updated = await updateParticipant('actor', study.studyId, settings({ dietaryExclusions: ['nuts'] }), now);
    expect(updated.settings.at(-1)!.version).toBe(2);
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'stale', pool(), now), 'conflict');
    const fresh = await createVisit('actor', study.studyId, 'fresh-settings', context(), now);
    const next = await nextCard('actor', study.studyId, fresh.visitId, 'after-settings', pool(2, choices), now);
    const after = await aggregate();
    expect(next!.itemId).not.toBe(incompatible.itemId);
    expect(after.allocations).toHaveLength(6);
    expect(after.allocations.slice(0, 5)).toEqual(before.allocations);
    expect(after.exposures).toEqual([exposure]);
    expect(after.days[0].slots.find(s => s.allocationId === card.allocationId)!.status).toBe('closed');
    await expectCode(submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now), 'closed');
  });

  it('blocks stale acknowledgements and resolves an exclusion-change/display race without incompatible display', async () => {
    const visit = await begin();
    const card = await nextCard('actor', study.studyId, visit.visitId, 'issued', pool(), now);
    const outcomes = await Promise.allSettled([
      updateParticipant('actor', study.studyId, settings({ dietaryExclusions: ['nuts'] }), now),
      acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 1, now.toISOString(), now),
    ]);
    expect(outcomes[0].status).toBe('fulfilled');
    const record = await aggregate();
    if (outcomes[1].status === 'fulfilled') {
      expect(record.exposures).toHaveLength(1);
      expect(record.exposures[0].settingsVersion).toBe(1);
    } else {
      expect(outcomes[1].reason).toMatchObject({ code: 'conflict' });
      expect(record.exposures).toHaveLength(0);
    }
    await expectCode(acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 2, now.toISOString(), now), 'conflict');
    const eligible = meals.filter(m => m.id !== card!.itemId);
    const fresh = await createVisit('actor', study.studyId, 'fresh-race-settings', context(), now);
    const next = await nextCard('actor', study.studyId, fresh.visitId, 'validated', pool(2, eligible), now);
    expect(next!.itemId).not.toBe(card!.itemId);
    expect((await aggregate()).allocations.some(a => a.allocationId === card!.allocationId)).toBe(true);
  });

  it('versions settings atomically and preserves enrollment timezone when travelling', async () => {
    await enrollParticipant('actor', study.studyId, settings(), now);
    const changes = await Promise.allSettled([
      updateParticipant('actor', study.studyId, settings({ city: seoul }), now),
      updateParticipant('actor', study.studyId, settings({ dietaryExclusions: ['fish'] }), now),
    ]);
    expect(changes.filter(c => c.status === 'fulfilled')).toHaveLength(1);
    expect(changes.filter(c => c.status === 'rejected').map(c => (c as PromiseRejectedResult).reason.code)).toEqual(['conflict']);
    const record = await aggregate();
    expect(record.settings).toHaveLength(2);
    expect(record.enrollmentTimezone).toBe('America/New_York');
    const latest = record.settings[1];
    const updated = await updateParticipant('actor', study.studyId, { ...latest, city: seoul }, now);
    expect(updated.enrollmentTimezone).toBe('America/New_York');
    const travel = new Date('2026-10-25T18:00:00Z');
    const visit = await createVisit('actor', study.studyId, 'travel', context(travel, seoul), travel);
    expect(visit.city.timezone).toBe('Asia/Seoul');
    await nextCard('actor', study.studyId, visit.visitId, 'travel-card', pool(updated.settings.at(-1)!.version), travel);
    expect((await aggregate()).days[0].localDate).toBe('2026-10-25');
  });

  it('uses enrollment-zone midnight across DST and travel without a second repeated-hour quota', async () => {
    const at = new Date('2026-11-01T03:59:00Z');
    const visit = await begin('actor', at);
    await nextCard('actor', study.studyId, visit.visitId, 'oct31', pool(), at);
    const midnight = new Date('2026-11-01T04:01:00Z');
    const v2 = await createVisit('actor', study.studyId, 'midnight', context(midnight), midnight);
    await nextCard('actor', study.studyId, v2.visitId, 'nov1', pool(), midnight);
    const fallback = new Date('2026-11-01T06:30:00Z');
    const v3 = await createVisit('actor', study.studyId, 'fall-back', context(fallback), fallback);
    await nextCard('actor', study.studyId, v3.visitId, 'same-date', pool(), fallback);
    const record = await aggregate();
    expect(record.days.map(d => d.localDate)).toEqual(['2026-10-31', '2026-11-01']);
    expect(record.allocations).toHaveLength(10);
  });

  it('creates one exposure per slot with stable display acknowledgement and immutable context', async () => {
    const { visit, card, exposure } = await displayed();
    const retried = await Promise.all(Array.from({ length: 5 }, () => acknowledgeDisplay('actor', study.studyId, card.allocationId, visit.visitId, 1, '2026-10-25T11:59:59Z', now)));
    expect(retried.every(e => e.eventId === exposure.eventId)).toBe(true);
    expect((await aggregate()).exposures).toEqual([exposure]);
    expect((await aggregate()).visits[0].weather).toEqual(context().weather);
    expect(exposure.clientDisplayedAt).toBe(now.toISOString());
  });

  it('retains concurrent successful responses, Not sure separately, and identical retries after expiry', async () => {
    const { visit, exposure: first } = await displayed();
    const card2 = await nextCard('actor', study.studyId, visit.visitId, 'second', pool(), now);
    expect(card2!.allocationId).not.toBe(first.allocationId);
    const second = await acknowledgeDisplay('actor', study.studyId, card2!.allocationId, visit.visitId, 1, now.toISOString(), now);
    const [a, b] = await Promise.all([
      submitAction('actor', study.studyId, first.eventId, 'yes', now.toISOString(), now),
      submitAction('actor', study.studyId, second.eventId, 'not_sure', now.toISOString(), now),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect((await aggregate()).responses.map(r => r.answer).sort()).toEqual(['not_sure', 'yes']);
    const late = new Date('2026-11-08T00:00:00Z');
    expect(await submitAction('actor', study.studyId, first.eventId, 'yes', late.toISOString(), late)).toEqual(a);
    await expectCode(submitAction('actor', study.studyId, first.eventId, 'no', late.toISOString(), late), 'conflict');
    expect((await aggregate()).responses).toHaveLength(2);
  });

  it('leaves skipped, abandoned and expired displays unlabelled and never reactivates consumed slots', async () => {
    const { visit, exposure } = await displayed();
    expect(await submitAction('actor', study.studyId, exposure.eventId, 'skip', now.toISOString(), now)).toEqual({ ok: true, value: null });
    await expectCode(submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now), 'conflict');
    const abandoned = await nextCard('actor', study.studyId, visit.visitId, 'abandoned', pool(), now);
    const shown = await acknowledgeDisplay('actor', study.studyId, abandoned!.allocationId, visit.visitId, 1, now.toISOString(), now);
    const expiry = new Date('2026-10-25T12:30:00Z');
    await expectCode(submitAction('actor', study.studyId, shown.eventId, 'yes', expiry.toISOString(), expiry), 'expired');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'too-late', pool(), expiry), 'expired');
    const fresh = await createVisit('actor', study.studyId, 'fresh', { ...context(expiry), hunger: 'very_hungry' }, expiry);
    const next = await nextCard('actor', study.studyId, fresh.visitId, 'fresh-card', pool(), expiry);
    expect(next!.allocationId).not.toBe(exposure.allocationId);
    expect(next!.allocationId).not.toBe(abandoned!.allocationId);
    const record = await aggregate();
    expect(record.responses).toHaveLength(0);
    expect(record.exposures).toHaveLength(2);
    expect(record.visits[0].hunger).toBeNull();
    expect(record.visits[1].hunger).toBe('very_hungry');
    expect(record.visits[1].expiresAt).toBe('2026-10-25T13:00:00.000Z');
  });

  it('rejects stale city context after travel and malformed client timestamps without recording evidence', async () => {
    const { visit, card } = await displayed();
    await updateParticipant('actor', study.studyId, settings({ city: seoul }), now);
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'old-city', pool(2), now), 'conflict');
    const fresh = await createVisit('actor', study.studyId, 'new-city', context(now, seoul), now);
    const allocated = await nextCard('actor', study.studyId, fresh.visitId, 'fresh', pool(2), now);
    await expectCode(acknowledgeDisplay('actor', study.studyId, allocated!.allocationId, fresh.visitId, 2, 'bad', now), 'invalid');
    expect((await aggregate()).exposures).toHaveLength(1);
    expect(card.allocationId).not.toBe(allocated!.allocationId);
  });
  it('rejects future capture instants but accepts millisecond-simultaneous fresh captures', async () => {
    await begin();
    const future = new Date('2026-10-25T12:00:00.001Z');
    await expectCode(createVisit('actor', study.studyId, 'future', context(future), now), 'invalid');
    const fresh = await createVisit('actor', study.studyId, 'same-millisecond', context(), now);
    expect(fresh.contextCapturedAt).toBe(now.toISOString());
  });

  it('checks settings versions before identical no-ops and stamps settings with actual server time', async () => {
    await enrollParticipant('actor', study.studyId, settings({ effectiveAt: '2000-01-01T00:00:00Z' }), now);
    const changed = settings({ effectiveAt: '2000-01-01T00:00:00Z', dietaryExclusions: ['fish'] });
    const updated = await updateParticipant('actor', study.studyId, changed, now);
    expect(updated.settings[1]).toMatchObject({ version: 2, effectiveAt: now.toISOString() });
    await expectCode(updateParticipant('actor', study.studyId, changed, now), 'conflict');
    const identical = await updateParticipant('actor', study.studyId, { ...changed, version: 2 }, now);
    expect(identical.settings).toHaveLength(2);
  });

  it('retains compatible original allocations but requires a new settings-version visit for display', async () => {
    const visit = await begin();
    const issued = await nextCard('actor', study.studyId, visit.visitId, 'issued', pool(), now);
    await updateParticipant('actor', study.studyId, settings({ dietaryExclusions: ['nuts'] }), now);
    await expectCode(acknowledgeDisplay('actor', study.studyId, issued!.allocationId, visit.visitId, 1, now.toISOString(), now), 'conflict');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'old', pool(2), now), 'conflict');
    const fresh = await createVisit('actor', study.studyId, 'version-two', context(), now);
    const retained = await nextCard('actor', study.studyId, fresh.visitId, 'retained', pool(2), now);
    expect(retained).toEqual(issued);
    const exposure = await acknowledgeDisplay('actor', study.studyId, retained!.allocationId, fresh.visitId, 2, now.toISOString(), now);
    expect(exposure.settingsVersion).toBe(2);
    expect(retained!.settingsVersion).toBe(1);
    expect((await aggregate()).allocations).toHaveLength(5);
  });

  it('records replacement shortage and never reopens closed slots when the pool later grows', async () => {
    const visit = await begin();
    await nextCard('actor', study.studyId, visit.visitId, 'issued', pool(), now);
    await updateParticipant('actor', study.studyId, settings({ dietaryExclusions: ['nuts'] }), now);
    const fresh = await createVisit('actor', study.studyId, 'smaller', context(), now);
    expect(await nextCard('actor', study.studyId, fresh.visitId, 'no-eligible', pool(2, []), now)).toBeNull();
    expect((await aggregate()).days[0].shortage).toBe(5);
    expect(await nextCard('actor', study.studyId, fresh.visitId, 'larger', pool(2), now)).toBeNull();
    expect((await aggregate()).allocations).toHaveLength(5);
  });

  it('consumes issued but unacknowledged slots on expiry without inventing an exposure', async () => {
    const visit = await begin();
    const issued = await nextCard('actor', study.studyId, visit.visitId, 'unseen', pool(), now);
    const expiry = new Date('2026-10-25T12:30:00Z');
    await expectCode(acknowledgeDisplay('actor', study.studyId, issued!.allocationId, visit.visitId, 1, expiry.toISOString(), expiry), 'expired');
    const fresh = await createVisit('actor', study.studyId, 'after-expiry', context(expiry), expiry);
    const next = await nextCard('actor', study.studyId, fresh.visitId, 'another', pool(), expiry);
    expect(next!.allocationId).not.toBe(issued!.allocationId);
    const record = await aggregate();
    expect(record.exposures).toHaveLength(0);
    expect(record.responses).toHaveLength(0);
    expect(record.days[0].slots.find(slot => slot.allocationId === issued!.allocationId)!.status).toBe('expired');
  });

  it('makes deterministic full-pool draws independent of catalog order', async () => {
    const visit = await begin();
    const initial = await aggregate();
    await nextCard('actor', study.studyId, visit.visitId, 'ordered', pool(), now);
    const ordered = (await aggregate()).allocations.map(a => a.itemId);
    await PilotParticipant.deleteOne({ studyId: study.studyId, userId: 'actor' });
    await PilotParticipant.create({ ...initial, userId: 'actor' });
    await nextCard('actor', study.studyId, visit.visitId, 'reversed', pool(1, [...meals].reverse()), now);
    expect((await aggregate()).allocations.map(a => a.itemId)).toEqual(ordered);
  });

  it('accepts only one concurrent first answer for an exposure without overwriting the winner', async () => {
    const { exposure } = await displayed();
    const outcomes = await Promise.allSettled([
      submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now),
      submitAction('actor', study.studyId, exposure.eventId, 'no', now.toISOString(), now),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(o => o.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    const record = await aggregate();
    expect(record.responses).toHaveLength(1);
    const winner = outcomes.find(o => o.status === 'fulfilled') as PromiseFulfilledResult<unknown>;
    expect(winner.value).toEqual({ ok: true, value: record.responses[0] });
  });

  it.each([
    '2026-10-25T12:00:00',
    '2026-10-25T12:00:00+01:00',
    '2026-02-30T12:00:00Z',
    '2026-10-24T24:00:00Z',
    '2026-10-25T11:59:59.1234567Z',
    '2026-10-25T11:59:59.123456001+00:00',
  ])('rejects invalid UTC, calendar or unsupported precision timestamp %s across lifecycle inputs', async invalidTime => {
    const visit = await begin();
    const card = await nextCard('actor', study.studyId, visit.visitId, 'card', pool(), now);
    await expectCode(acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 1, invalidTime, now), 'invalid');
    expect((await aggregate()).exposures).toHaveLength(0);
    const exposure = await acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 1, now.toISOString(), now);
    await expectCode(submitAction('actor', study.studyId, exposure.eventId, 'yes', invalidTime, now), 'invalid');
    await expectCode(createVisit('actor', study.studyId, 'bad-capture', { ...context(), contextCapturedAt: invalidTime }, now), 'invalid');
    await expectCode(createVisit('actor', study.studyId, 'bad-weather-time', {
      ...context(), weather: { ...context().weather!, requestedAt: invalidTime },
    }, now), 'invalid');
    await expectCode(updateParticipant('actor', study.studyId, settings({ effectiveAt: invalidTime }), now), 'invalid');
    expect((await aggregate()).responses).toHaveLength(0);
  });

  it.each(['2026-10-25T11:59:59.123456+00:00', '2026-10-25T11:59:59.123456000+00:00'])('preserves representable raw zero-offset timestamp %s without changing server time', async raw => {
    await enrollParticipant('actor', study.studyId, settings(), now);
    const visit = await createVisit('actor', study.studyId, 'precise', {
      ...context(), contextCapturedAt: raw, weather: { ...context().weather!, requestedAt: raw },
    }, now);
    expect(visit.contextCapturedAt).toBe(raw);
    expect(visit.weather!.requestedAt).toBe(raw);
    expect(visit.startedAt).toBe(now.toISOString());
    const card = await nextCard('actor', study.studyId, visit.visitId, 'card', pool(), now);
    const exposure = await acknowledgeDisplay('actor', study.studyId, card!.allocationId, visit.visitId, 1, raw, now);
    expect(exposure.clientDisplayedAt).toBe(raw);
    expect(exposure.displayedAt).toBe(now.toISOString());
    const result = await submitAction('actor', study.studyId, exposure.eventId, 'yes', raw, now);
    expect(result).toMatchObject({ ok: true, value: { actionAt: raw, receivedAt: now.toISOString() } });
  });

  it.each(['2026-10-24T01:00:00+01:00', '2026-10-23T24:00:00Z'])('refuses to freeze a non-UTC or rolled-over study timestamp %s', async startsAt => {
    await expect(PilotStudy.create({ ...study, studyId: 'bad-time', startsAt })).rejects.toThrow();
  });

  it('preserves exact study cutoff fractions and compares server boundaries without rounding', async () => {
    const precise = {
      ...study, studyId: 'precise-study', startsAt: '2026-10-24T00:00:00.123456Z',
      trainingEndsAt: '2026-10-29T00:00:00.123456Z', developmentEndsAt: '2026-10-31T00:00:00.123456Z',
      endsAt: '2026-11-07T00:00:00.123456Z',
    };
    await expect(PilotStudy.create({ ...precise, studyId: 'bad-fractions', trainingEndsAt: '2026-10-29T00:00:00.123Z' })).rejects.toThrow();
    const saved = await PilotStudy.create(precise);
    expect(saved.startsAt).toBe(precise.startsAt);
    await expectCode(enrollParticipant('actor', precise.studyId, settings(), new Date('2026-10-24T00:00:00.123Z')), 'closed');
    await enrollParticipant('actor', precise.studyId, settings(), new Date('2026-10-24T00:00:00.124Z'));
    const beforeEnd = new Date('2026-11-07T00:00:00.123Z');
    const visit = await createVisit('actor', precise.studyId, 'last', context(beforeEnd), beforeEnd);
    expect(visit.startedAt).toBe(beforeEnd.toISOString());
    const afterEnd = new Date('2026-11-07T00:00:00.124Z');
    await expectCode(createVisit('actor', precise.studyId, 'ended', context(afterEnd), afterEnd), 'closed');
  });

  it('rejects sub-millisecond future context without rounding or advancing server now', async () => {
    await begin();
    await expectCode(createVisit('actor', study.studyId, 'future-fraction', {
      ...context(), contextCapturedAt: '2026-10-25T12:00:00.000001Z',
    }, now), 'invalid');
  });

  it('invalidates an ineligible issuance retry, preserves its history and never redraws retired receipts', async () => {
    const visit = await begin();
    const original = await nextCard('actor', study.studyId, visit.visitId, 'retry-draw', pool(), now);
    const before = await aggregate();
    const eligible = pool(1, meals.filter(m => m.id !== original!.itemId));
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-draw', eligible, now), 'conflict');
    const replaced = await aggregate();
    expect(replaced.allocations).toHaveLength(6);
    expect(replaced.allocations.slice(0, 5)).toEqual(before.allocations);
    expect(replaced.issuances).toEqual(before.issuances);
    expect(replaced.exposures).toHaveLength(0);
    await expectCode(acknowledgeDisplay('actor', study.studyId, original!.allocationId, visit.visitId, 1, now.toISOString(), now), 'not_found');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-draw', eligible, now), 'conflict');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-draw', pool(), now), 'conflict');
    expect((await aggregate()).allocations).toEqual(replaced.allocations);
    const next = await nextCard('actor', study.studyId, visit.visitId, 'reload-draw', eligible, now);
    expect(next!.allocationId).not.toBe(original!.allocationId);
    expect(next!.itemId).not.toBe(original!.itemId);
    expect(await nextCard('actor', study.studyId, visit.visitId, 'reload-draw', eligible, now)).toEqual(next);
    const exposure = await acknowledgeDisplay('actor', study.studyId, next!.allocationId, visit.visitId, 1, now.toISOString(), now);
    expect(exposure.allocationId).toBe(next!.allocationId);
    expect((await aggregate()).allocations).toHaveLength(6);
  });

  it('closes an ineligible retried slot with no replacement and records shortage without retry consumption', async () => {
    const visit = await begin();
    const original = await nextCard('actor', study.studyId, visit.visitId, 'retry-empty', pool(), now);
    const before = await aggregate();
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-empty', pool(1, []), now), 'conflict');
    const closed = await aggregate();
    expect(closed.allocations).toEqual(before.allocations);
    expect(closed.issuances).toEqual(before.issuances);
    expect(closed.days[0].shortage).toBe(1);
    expect(closed.days[0].slots.find(slot => slot.allocationId === original!.allocationId)!.status).toBe('closed');
    await expectCode(acknowledgeDisplay('actor', study.studyId, original!.allocationId, visit.visitId, 1, now.toISOString(), now), 'not_found');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-empty', pool(1, []), now), 'conflict');
    await expectCode(nextCard('actor', study.studyId, visit.visitId, 'retry-empty', pool(), now), 'conflict');
    expect((await aggregate()).days[0].shortage).toBe(1);
    expect(await nextCard('actor', study.studyId, visit.visitId, 'reload-empty', pool(1, []), now)).toBeNull();
    const exhausted = await aggregate();
    expect(exhausted.days[0].shortage).toBe(5);
    expect(exhausted.allocations).toHaveLength(5);
    expect(exhausted.exposures).toHaveLength(0);
    expect(exhausted.responses).toHaveLength(0);
  });

  it('preserves an acknowledged issuance and its successful answer when later retry pools exclude its meal', async () => {
    const { visit, card, exposure } = await displayed('actor', 'successful-draw');
    const result = await submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now);
    const before = await aggregate();
    const eligible = pool(1, meals.filter(m => m.id !== card.itemId));
    expect(await nextCard('actor', study.studyId, visit.visitId, 'successful-draw', eligible, now)).toEqual(card);
    expect(await acknowledgeDisplay('actor', study.studyId, card.allocationId, visit.visitId, 1, now.toISOString(), now)).toEqual(exposure);
    expect(await submitAction('actor', study.studyId, exposure.eventId, 'yes', now.toISOString(), now)).toEqual(result);
    const after = await aggregate();
    expect(after.allocations).toEqual(before.allocations);
    expect(after.issuances).toEqual(before.issuances);
    expect(after.exposures).toEqual(before.exposures);
    expect(after.responses).toEqual(before.responses);
  });

  it('serializes same-version retry invalidation against acknowledgement without resurrecting the old card', async () => {
    const visit = await begin();
    const original = await nextCard('actor', study.studyId, visit.visitId, 'race-draw', pool(), now);
    const eligible = pool(1, meals.filter(m => m.id !== original!.itemId));
    const [retried, acknowledged] = await Promise.allSettled([
      nextCard('actor', study.studyId, visit.visitId, 'race-draw', eligible, now),
      acknowledgeDisplay('actor', study.studyId, original!.allocationId, visit.visitId, 1, now.toISOString(), now),
    ]);
    const record = await aggregate();
    if (acknowledged.status === 'fulfilled') {
      expect(retried.status).toBe('fulfilled');
      expect(record.exposures).toEqual([acknowledged.value]);
      expect(record.allocations).toHaveLength(5);
      expect(acknowledged.value.allocationId).toBe(original!.allocationId);
    } else {
      expect(acknowledged.reason).toMatchObject({ code: 'not_found' });
      expect(retried.status).toBe('rejected');
      if (retried.status === 'rejected') expect(retried.reason).toMatchObject({ code: 'conflict' });
      expect(record.exposures).toHaveLength(0);
      expect(record.allocations).toHaveLength(6);
      await expectCode(acknowledgeDisplay('actor', study.studyId, original!.allocationId, visit.visitId, 1, now.toISOString(), now), 'not_found');
    }
  });


  it('rejects unsupported study precision rather than freezing rounded cutoffs', async () => {
    await expect(PilotStudy.create({ ...study, studyId: 'unsupported-study',
      startsAt: '2026-10-24T00:00:00.123456001Z', trainingEndsAt: '2026-10-29T00:00:00.123456001Z',
      developmentEndsAt: '2026-10-31T00:00:00.123456001Z', endsAt: '2026-11-07T00:00:00.123456001Z',
    })).rejects.toThrow();
    expect(await PilotStudy.countDocuments({ studyId: 'unsupported-study' })).toBe(0);
  });

});
