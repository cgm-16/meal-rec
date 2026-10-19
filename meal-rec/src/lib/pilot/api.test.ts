// ABOUTME: Tests authenticated pilot route boundaries and owned snapshot recovery.
// ABOUTME: Keeps database, authentication and weather external to the route unit tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PilotParticipantRecord, StudyRecord, MealSnapshot } from '@meal-rec/database';
import { getServerSession } from 'next-auth';
import { acknowledgeDisplay, createVisit, enrollParticipant, nextCard, PilotError, submitAction, updateParticipant } from '@meal-rec/database';
import { captureWeather, searchCities } from './weather';
import { pilotApi } from './api';
import { GET as getPilot } from '@/app/api/pilot/route';
import { POST as enroll, PATCH as updateEnrollment } from '@/app/api/pilot/enrollment/route';
import { GET as getCities } from '@/app/api/pilot/cities/route';
import { POST as startVisit } from '@/app/api/pilot/visits/route';
import { POST as getCard } from '@/app/api/pilot/cards/route';
import { POST as acknowledge } from '@/app/api/pilot/exposures/route';
import { POST as respond } from '@/app/api/pilot/responses/route';
import * as stateRoutes from '@/app/api/pilot/route';
import * as enrollmentRoutes from '@/app/api/pilot/enrollment/route';
import * as cityRoutes from '@/app/api/pilot/cities/route';
import * as visitRoutes from '@/app/api/pilot/visits/route';
import * as cardRoutes from '@/app/api/pilot/cards/route';
import * as exposureRoutes from '@/app/api/pilot/exposures/route';
import * as responseRoutes from '@/app/api/pilot/responses/route';

const store = vi.hoisted(() => ({
  study: null as StudyRecord | null,
  participant: null as PilotParticipantRecord | null,
  catalog: [] as Record<string, unknown>[],
  actorQueries: [] as unknown[],
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: { providers: [] } }));
vi.mock('./weather', () => ({ captureWeather: vi.fn(), searchCities: vi.fn() }));
vi.mock('@meal-rec/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@meal-rec/database')>();
  return {
    ...actual, connect: vi.fn(),
    PilotStudy: { findOne: () => ({ lean: () => ({ exec: async () => store.study }) }) },
    PilotParticipant: { findOne: (query: unknown) => {
      store.actorQueries.push(query);
      return { lean: () => ({ exec: async () => store.participant }) };
    } },
    Meal: { find: () => ({ lean: () => ({ exec: async () => store.catalog }) }) },
    enrollParticipant: vi.fn(), updateParticipant: vi.fn(), createVisit: vi.fn(),
    nextCard: vi.fn(), acknowledgeDisplay: vi.fn(), submitAction: vi.fn(),
  };
});

const city = { cityId: 'seoul', label: 'Seoul', country: 'South Korea', adminArea: 'Seoul', latitude: 37.57, longitude: 126.98, timezone: 'Asia/Seoul' };
const otherCity = { ...city, cityId: 'tokyo', label: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' };
const now = '2026-10-25T12:00:00.000Z';
const meal: MealSnapshot = { id: 'meal-1', name: 'Saved rice', cuisine: null, primaryIngredients: ['rice'], allergens: [], weather: [], timeOfDay: [], spiciness: 0, heaviness: 1, imageUrl: null, description: null, flavorTags: [] };
const weather = { provider: 'Open-Meteo', providerHost: null, accessMode: 'disabled', status: 'unavailable' as const, requestedLatitude: city.latitude, requestedLongitude: city.longitude, gridLatitude: null, gridLongitude: null, validAt: null, sourceIntervalSeconds: null, requestedAt: now, retrievedAt: null, temperatureC: null, precipitationMm: null, weatherCode: null, units: { temperature: 'celsius' as const, precipitation: 'mm' as const }, sourceTimeFormat: 'unixtime' as const, timezone: null, failureReason: 'access_disabled' };
const visit = { visitId: 'visit-1', participantId: 'participant-1', settingsVersion: 1, startedAt: now, expiresAt: '2026-10-25T12:30:00.000Z', contextCapturedAt: now, city, hunger: null, weather };
const allocation = { allocationId: 'allocation-1', participantId: 'participant-1', localDate: '2026-10-25', settingsVersion: 1, itemId: meal.id, allocatedAt: now, eligiblePoolSize: 8, selectionProbability: 0.125 };
const exposure = { eventId: 'event-1', participantId: 'participant-1', visitId: visit.visitId, allocationId: allocation.allocationId, settingsVersion: 1, itemId: meal.id, displayedAt: now, clientDisplayedAt: now, meal };

function request(path: string, body?: unknown, method = 'POST') {
  return new Request(`http://localhost/api/pilot${path}`, body === undefined ? { method: 'GET' } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}
async function call(endpoint: Parameters<typeof pilotApi>[0], body?: unknown, method = 'POST') {
  const response = await pilotApi(endpoint, request(endpoint === 'state' ? '' : `/${endpoint}`, body, method));
  expect(response.headers.get('cache-control')).toContain('no-store');
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.stubEnv('PILOT_STUDY_ID', 'study-1');
  store.actorQueries = [];
  store.study = { studyId: 'study-1', schemaVersion: 1, studyVersion: '1', protocolVersion: '1', catalogVersion: '1', catalogSha256: 'a'.repeat(64), startsAt: '2026-10-25T00:00:00Z', trainingEndsAt: '2026-10-30T00:00:00Z', developmentEndsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-08T00:00:00Z', seed: 42, quotaTimezoneRule: 'enrollment', cityOptions: [city, otherCity] };
  store.participant = { studyId: 'study-1', userId: 'private-user', participantId: 'participant-1', enrolledAt: now, enrollmentTimezone: city.timezone, version: 0, settings: [{ version: 1, effectiveAt: now, city, dietaryExclusions: [] }], days: [], visits: [], allocations: [], exposures: [], responses: [], issuances: [] };
  store.catalog = [{ ...meal, _id: meal.id, name: 'Current rice', userId: 'secret', score: 999 }];
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'session-user' }, expires: '' });
  vi.mocked(searchCities).mockResolvedValue([city, otherCity]);
  vi.mocked(captureWeather).mockResolvedValue(weather);
  vi.mocked(createVisit).mockResolvedValue(visit);
  vi.mocked(nextCard).mockResolvedValue(allocation);
  vi.mocked(acknowledgeDisplay).mockResolvedValue(exposure);
  vi.mocked(submitAction).mockResolvedValue({ ok: true, value: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function assigned(shown = false) {
  store.participant!.visits = [{ ...visit, operationId: 'visit-operation', closedAt: null }];
  store.participant!.allocations = [{ ...allocation, meal }];
  store.participant!.days = [{ localDate: allocation.localDate, shortage: 1, slots: [{ slotId: 'slot-1', allocationId: allocation.allocationId, visitId: visit.visitId, validatedSettingsVersion: 1, status: shown ? 'shown' : 'unshown' }, { slotId: 'shortage', allocationId: null, visitId: null, validatedSettingsVersion: 1, status: 'closed' }] }];
  store.participant!.issuances = [{ operationId: 'card-operation', visitId: visit.visitId, allocationId: allocation.allocationId }];
  if (shown) store.participant!.exposures = [exposure];
}

describe('pilot API', () => {
  it.each([
    ['state', stateRoutes, 'GET, HEAD, OPTIONS'],
    ['cities', cityRoutes, 'GET, HEAD, OPTIONS'],
    ['enrollment', enrollmentRoutes, 'POST, PATCH, OPTIONS'],
    ['visits', visitRoutes, 'POST, OPTIONS'], ['cards', cardRoutes, 'POST, OPTIONS'],
    ['exposures', exposureRoutes, 'POST, OPTIONS'], ['responses', responseRoutes, 'POST, OPTIONS'],
  ])('returns no-store method errors and OPTIONS for the %s route', async (_name, route, allow) => {
    const methods = route as unknown as Record<string, () => Response>;
    expect(methods.DELETE).toBeTypeOf('function');
    const unsupported = methods.DELETE();
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('allow')).toBe(allow);
    expect(unsupported.headers.get('cache-control')).toContain('no-store');
    expect(methods.OPTIONS).toBeTypeOf('function');
    const options = methods.OPTIONS();
    expect(options.status).toBe(204);
    expect(options.headers.get('allow')).toBe(allow);
    expect(options.headers.get('cache-control')).toContain('no-store');
    expect(await options.text()).toBe('');
  });
  it('keeps the allowed GET response and corresponding body-free HEAD response', async () => {
    const response = await getPilot(request(''));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('ready');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const methods = stateRoutes as unknown as Record<string, (request: Request) => Promise<Response>>;
    expect(methods.HEAD).toBeTypeOf('function');
    const head = await methods.HEAD(new Request('http://localhost/api/pilot', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(head.headers.get('cache-control')).toContain('no-store');
    expect(await head.text()).toBe('');
  });

  it.each([
    ['state', getPilot], ['enrollment POST', enroll], ['enrollment PATCH', updateEnrollment],
    ['cities', getCities], ['visits', startVisit], ['cards', getCard], ['exposures', acknowledge], ['responses', respond],
  ])('protects the actual %s route entry point with no-store authentication errors', async (_name, handler) => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const response = await handler(request(''));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('requires the normal session before returning any pilot record', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const result = await call('state');
    expect(result.response.status).toBe(401);
    expect(result.body.error.code).toBe('unauthenticated');
    expect(store.actorQueries).toEqual([]);
  });
  it('is disabled without a selected study and distinguishes an absent configured study', async () => {
    vi.stubEnv('PILOT_STUDY_ID', '');
    expect((await call('state')).body.status).toBe('disabled');
    vi.stubEnv('PILOT_STUDY_ID', 'study-1');
    store.study = null;
    expect((await call('state')).response.status).toBe(404);
  });
  it.each([['2026-10-24T12:00:00Z', 'not_started'], ['2026-11-08T00:00:00Z', 'ended']])('shows study state at %s without offering a card', async (instant, status) => {
    assigned();
    vi.setSystemTime(new Date(instant));
    const result = await call('state');
    expect(result.body).toMatchObject({ status, card: null, visit: null });
  });
  it('requires explicit opt-in and resolves city selection on the server', async () => {
    const missing = await call('enrollment', { cityId: 'seoul', cityQuery: 'Seoul', dietaryExclusions: [] });
    expect(missing.response.status).toBe(400);
    expect(enrollParticipant).not.toHaveBeenCalled();
    vi.mocked(enrollParticipant).mockResolvedValue(store.participant!);
    const result = await call('enrollment', { optIn: true, userId: 'forged-user', cityId: 'seoul', cityQuery: 'Seoul', city: otherCity, dietaryExclusions: ['nuts'] });
    expect(result.response.status).toBe(200);
    expect(enrollParticipant).toHaveBeenCalledWith('session-user', 'study-1', { version: 1, effectiveAt: now, city, dietaryExclusions: ['nuts'] }, new Date(now));
    expect(JSON.stringify(result.body)).not.toContain('private-user');
  });
  it('rejects forged city IDs and invalid exclusion types before saving', async () => {
    expect((await call('enrollment', { optIn: true, cityId: 'forged', cityQuery: 'Seoul', dietaryExclusions: [] })).response.status).toBe(400);
    expect((await call('enrollment', { optIn: true, cityId: 'seoul', cityQuery: 'Seoul', dietaryExclusions: [12] })).response.status).toBe(400);
    expect(enrollParticipant).not.toHaveBeenCalled();
  });
  it('uses the current settings version for prospective city and exclusion changes', async () => {
    const updated = { ...store.participant!, settings: [...store.participant!.settings, { version: 2, effectiveAt: now, city: otherCity, dietaryExclusions: ['nuts'] }] };
    vi.mocked(updateParticipant).mockResolvedValue(updated);
    const result = await call('enrollment', { version: 1, cityId: 'tokyo', cityQuery: 'Tokyo', dietaryExclusions: ['nuts'] }, 'PATCH');
    expect(result.response.status).toBe(200);
    expect(updateParticipant).toHaveBeenCalledWith('session-user', 'study-1', { version: 1, effectiveAt: now, city: otherCity, dietaryExclusions: ['nuts'] }, new Date(now));
  });
  it('returns matching city/country/administrative-area choices', async () => {
    const response = await pilotApi('cities', new Request('http://localhost/api/pilot/cities?q=Seo'));
    expect(await response.json()).toEqual({ cities: [city, otherCity] });
    expect(searchCities).toHaveBeenCalledWith('Seo', [city, otherCity]);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('recovers only owned saved meal content and counts shortage separately', async () => {
    assigned(true);
    const result = await call('state');
    expect(store.actorQueries.every(query => JSON.stringify(query) === JSON.stringify({ studyId: 'study-1', userId: 'session-user' }))).toBe(true);
    expect(result.body.card.meal).toEqual(meal);
    expect(result.body.card.exposure.eventId).toBe('event-1');
    expect(result.body.progress).toMatchObject({ answered: 0, shortage: 1, total: 5 });
    expect(JSON.stringify(result.body)).not.toMatch(/private-user|userId|operationId|score|catalogSha256|seed/);
  });
  it.each(['closed', 'expired', 'retired', 'settings'])('does not recover a %s card', async state => {
    assigned();
    if (state === 'closed') store.participant!.visits[0].closedAt = now;
    if (state === 'expired') store.participant!.visits[0].expiresAt = now;
    if (state === 'retired') store.participant!.days[0].slots[0].allocationId = 'replacement';
    if (state === 'settings') store.participant!.settings.push({ ...store.participant!.settings[0], version: 2 });
    expect((await call('state')).body.card).toBeNull();
  });
  it('counts explicit skips as unanswered rather than answered', async () => {
    assigned(true);
    store.participant!.days[0].slots[0].status = 'skipped';
    expect((await call('state')).body.progress).toMatchObject({ answered: 0, unanswered: 1, shortage: 1, remaining: 0 });
  });
  it('projects expired issued slots as unanswered before a write persists expiry', async () => {
    assigned();
    store.participant!.visits[0].expiresAt = now;
    const result = await call('state');
    expect(result.body.progress).toMatchObject({ answered: 0, shortage: 1, unanswered: 1, remaining: 0 });
  });
  it('rejects missing or stale-shaped settings versions before calling the update boundary', async () => {
    const result = await call('enrollment', { cityId: 'seoul', cityQuery: 'Seoul', dietaryExclusions: [] }, 'PATCH');
    expect(result.response.status).toBe(400);
    expect(updateParticipant).not.toHaveBeenCalled();
  });
  it('does not capture weather outside the study window', async () => {
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    const result = await call('visits', { operationId: 'after-study', hunger: null });
    expect(result.response.status).toBe(409);
    expect(captureWeather).not.toHaveBeenCalled();
  });
  it('keeps raw fractional study boundaries rather than truncating to milliseconds', async () => {
    store.study!.startsAt = '2026-10-25T12:00:00.000000001Z';
    expect((await call('state')).body.status).toBe('not_started');
    store.study!.startsAt = '2026-10-25T00:00:00Z';
    store.study!.endsAt = '2026-10-25T12:00:00.000000001Z';
    expect((await call('state')).body.status).toBe('ready');
  });
  it('does not recover a saved unshown meal made ineligible by its own ingredients', async () => {
    assigned();
    store.participant!.allocations[0].meal = { ...meal, primaryIngredients: ['peanuts'] };
    store.participant!.settings[0].dietaryExclusions = ['nuts'];
    expect((await call('state')).body.card).toBeNull();
  });
  it('keeps acknowledged successes retryable after study end without a current pool', async () => {
    assigned(true);
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    store.catalog = [];
    const result = await call('exposures', { allocationId: allocation.allocationId, visitId: visit.visitId, settingsVersion: 1, clientDisplayedAt: now });
    expect(result.response.status).toBe(200);
    expect(result.body.exposure).toEqual(exposure);
    expect(nextCard).not.toHaveBeenCalled();
  });
  it('preserves original response retries after study end and whitelists the result', async () => {
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    vi.mocked(submitAction).mockResolvedValue({ ok: true, value: Object.assign({ responseId: 'response-1', eventId: 'event-1', participantId: 'participant-1', answer: 'yes' as const, actionAt: now, receivedAt: now }, { userId: 'private' }) });
    const result = await call('responses', { exposureId: 'event-1', action: 'yes', clientActionAt: '2026-11-08T00:00:00Z' });
    expect(result.response.status).toBe(200);
    expect(result.body.value).toEqual({ responseId: 'response-1', eventId: 'event-1', participantId: 'participant-1', answer: 'yes', actionAt: now, receivedAt: now });
  });
  it('captures new server context, ignoring public weather/city/context identity', async () => {
    const result = await call('visits', { operationId: 'new-operation', hunger: 'very_hungry', contextCapturedAt: '2000-01-01T00:00:00Z', city: otherCity, weather: { status: 'ok' }, userId: 'forged' });
    expect(result.response.status).toBe(200);
    expect(captureWeather).toHaveBeenCalledWith(city, new Date(now));
    expect(createVisit).toHaveBeenCalledWith('session-user', 'study-1', 'new-operation', { contextCapturedAt: now, city, hunger: 'very_hungry', weather }, new Date(now));
  });
  it('uses new settings for the next fresh visit', async () => {
    store.participant!.settings.push({ version: 2, effectiveAt: now, city: otherCity, dietaryExclusions: ['nuts'] });
    await call('visits', { operationId: 'travel', hunger: null });
    expect(captureWeather).toHaveBeenCalledWith(otherCity, new Date(now));
  });
  it('reuses a ready operation context without refetching weather', async () => {
    assigned();
    vi.setSystemTime(new Date('2026-10-25T12:01:00Z'));
    await call('visits', { operationId: 'visit-operation', hunger: null });
    expect(captureWeather).not.toHaveBeenCalled();
    expect(createVisit).toHaveBeenCalledWith('session-user', 'study-1', 'visit-operation', { contextCapturedAt: now, city, hunger: null, weather }, new Date('2026-10-25T12:01:00Z'));
  });
  it.each(['expired', 'closed', 'settings', 'hunger'])('rejects a %s retry without backfilling context', async state => {
    assigned();
    if (state === 'expired') store.participant!.visits[0].expiresAt = now;
    if (state === 'closed') store.participant!.visits[0].closedAt = now;
    if (state === 'settings') store.participant!.settings.push({ ...store.participant!.settings[0], version: 2 });
    const result = await call('visits', { operationId: 'visit-operation', hunger: state === 'hunger' ? 'very_hungry' : null });
    expect(result.response.status).toBe(409);
    expect(captureWeather).not.toHaveBeenCalled();
    expect(createVisit).not.toHaveBeenCalled();
  });
  it('passes the full eligible catalog and revalidates saved ingredients for an unchanged ID', async () => {
    assigned();
    store.participant!.allocations[0].meal = { ...meal, primaryIngredients: ['peanuts'] };
    store.participant!.settings[0].dietaryExclusions = ['nuts'];
    store.catalog = Array.from({ length: 9 }, (_, i) => ({ ...meal, _id: `meal-${i + 1}`, primaryIngredients: ['rice'] }));
    vi.mocked(nextCard).mockResolvedValue(null);
    await call('cards', { visitId: visit.visitId, operationId: 'reload-operation' });
    const pool = vi.mocked(nextCard).mock.calls[0][4];
    expect(pool.settingsVersion).toBe(1);
    expect(pool.meals.map(item => item.id)).toEqual(['meal-2', 'meal-3', 'meal-4', 'meal-5', 'meal-6', 'meal-7', 'meal-8', 'meal-9']);
  });
  it('returns issued saved content rather than the mutable same-ID catalog', async () => {
    assigned();
    const result = await call('cards', { visitId: visit.visitId, operationId: 'card-operation' });
    expect(result.body.card.meal).toEqual(meal);
    expect(result.body.card.allocation.allocationId).toBe('allocation-1');
  });
  it('revalidates unacknowledged issuance before exposure creation', async () => {
    assigned();
    vi.mocked(nextCard).mockRejectedValue(new PilotError('conflict'));
    const result = await call('exposures', { allocationId: allocation.allocationId, visitId: visit.visitId, settingsVersion: 1, clientDisplayedAt: now });
    expect(result.response.status).toBe(409);
    expect(acknowledgeDisplay).not.toHaveBeenCalled();
    expect(nextCard).toHaveBeenCalledWith('session-user', 'study-1', visit.visitId, 'card-operation', expect.anything(), new Date(now));
  });
  it('preserves acknowledged display retries without rerandomizing against a changed pool', async () => {
    assigned(true);
    await call('exposures', { allocationId: allocation.allocationId, visitId: visit.visitId, settingsVersion: 1, clientDisplayedAt: now });
    expect(nextCard).not.toHaveBeenCalled();
    expect(acknowledgeDisplay).toHaveBeenCalledWith('session-user', 'study-1', allocation.allocationId, visit.visitId, 1, now, new Date(now));
  });
  it.each([['invalid', 400], ['not_enrolled', 403], ['not_found', 404], ['expired', 409], ['closed', 409], ['conflict', 409]] as const)('maps %s explicitly and never advances a failed response', async (code, status) => {
    vi.mocked(submitAction).mockRejectedValue(new PilotError(code));
    const result = await call('responses', { exposureId: 'event-1', action: 'yes', clientActionAt: now, userId: 'forged' });
    expect(result.response.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(submitAction).toHaveBeenCalledWith('session-user', 'study-1', 'event-1', 'yes', now, new Date(now));
  });
  it('maps a declared service failure without exposing its private message', async () => {
    vi.mocked(submitAction).mockResolvedValue({ ok: false, error: { code: 'invalid', message: 'private service detail' } });
    const result = await call('responses', { exposureId: 'event-1', action: 'yes', clientActionAt: now });
    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe('invalid');
    expect(JSON.stringify(result.body)).not.toContain('private');
  });
  it('keeps skip distinct from an uncertain answer', async () => {
    for (const action of ['skip', 'not_sure']) await call('responses', { exposureId: 'event-1', action, clientActionAt: now });
    expect(vi.mocked(submitAction).mock.calls.map(args => args[3])).toEqual(['skip', 'not_sure']);
  });
  it('rejects malformed JSON and invalid hunger with no-store errors', async () => {
    const response = await pilotApi('visits', new Request('http://localhost/api/pilot/visits', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await call('visits', { operationId: 'op', hunger: 'hungry' })).response.status).toBe(400);
  });
  it('returns a no-store generic error without leaking internal errors', async () => {
    vi.mocked(submitAction).mockRejectedValue(new Error('private DB credentials'));
    const result = await call('responses', { exposureId: 'event-1', action: 'yes', clientActionAt: now });
    expect(result.response.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('credentials');
  });
});
