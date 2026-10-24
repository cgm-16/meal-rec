// ABOUTME: Exercises the opt-in pilot assessment and recovery through its public UI.
// ABOUTME: Verifies stable retries, explicit skipped labels and prospective settings changes.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from 'next-auth/react';
import PilotStudy from './PilotStudy';
import type { PilotState } from '@/lib/pilot/api';

vi.mock('next-auth/react', () => ({ useSession: vi.fn() }));

const city = { cityId: 'seoul', label: 'Seoul', country: 'South Korea', adminArea: 'Seoul', latitude: 37.57, longitude: 126.98, timezone: 'Asia/Seoul' };
const now = '2026-10-25T12:00:00.000Z';
const meal = { id: 'meal-1', name: 'Saved rice', cuisine: null, primaryIngredients: ['rice', 'carrot'], allergens: [], weather: [], timeOfDay: [], spiciness: 0, heaviness: 1, imageUrl: null as string | null, description: null, flavorTags: [] };
const allocation = { allocationId: 'allocation-1', participantId: 'participant-1', localDate: '2026-10-25', settingsVersion: 1, itemId: meal.id, allocatedAt: now, eligiblePoolSize: 8, selectionProbability: 0.125 };
const visit = { visitId: 'visit-1', participantId: 'participant-1', settingsVersion: 1, startedAt: now, expiresAt: '2026-10-25T12:30:00Z', contextCapturedAt: now, city, hunger: null, weather: null };
const exposure = { eventId: 'event-1', participantId: 'participant-1', visitId: visit.visitId, allocationId: allocation.allocationId, settingsVersion: 1, itemId: meal.id, displayedAt: now, clientDisplayedAt: now, meal };
const enrollment = { participantId: 'participant-1', enrolledAt: now, enrollmentTimezone: city.timezone, settings: [{ version: 1, effectiveAt: now, city, dietaryExclusions: [] as string[] }] };
const ready = (): PilotState => ({ status: 'ready', study: { studyId: 'study-1', startsAt: '2026-10-25T00:00:00Z', endsAt: '2026-11-08T00:00:00Z' }, enrollment, visit, card: { allocation, meal, exposure }, progress: { answered: 0, unanswered: 0, shortage: 0, remaining: 4, total: 5, localDate: '2026-10-25' } });
const fetchMock = vi.fn<typeof fetch>();
function json(value: unknown, status = 200) { return Promise.resolve(new Response(JSON.stringify(value), { status })); }
function requests(path: string) { return fetchMock.mock.calls.filter(([url]) => String(url) === `/api/pilot${path}`); }
function payload(path: string, index = 0) { return JSON.parse(String(requests(path)[index][1]?.body)); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: 'session-user' }, expires: '' }, status: 'authenticated', update: vi.fn() });
  fetchMock.mockImplementation(url => {
    if (String(url) === '/api/pilot') return json(ready());
    if (String(url) === '/api/pilot/exposures') return json({ exposure });
    if (String(url) === '/api/pilot/responses') return json({ ok: true, value: { answer: 'yes' } });
    if (String(url) === '/api/pilot/cards') {
      const skipped = requests('/responses').length > 0 && payload('/responses').action === 'skip';
      return json({ card: null, progress: { localDate: '2026-10-25', total: 5, answered: skipped ? 0 : 1, unanswered: skipped ? 1 : 0, shortage: 4, remaining: 0 } });
    }
    if (String(url) === '/api/pilot/visits') return json({ visit });
    if (String(url).startsWith('/api/pilot/cities?')) return json({ cities: [city] });
    if (String(url) === '/api/pilot/enrollment') return json({ enrollment });
    throw new Error(`Unexpected fetch: ${url}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('PilotStudy', () => {
  it('requires sign-in before fetching or showing an assessment', () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() });
    render(<PilotStudy />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin');
    expect(screen.queryByText('If this meal were ready to eat and available to you now, would you eat it?')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('explains purpose, fourteen-day duration and recorded context before explicit opt-in', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), enrollment: null, visit: null, card: null })));
    render(<PilotStudy />);
    expect(await screen.findByRole('checkbox', { name: /I choose to take part/ })).not.toBeChecked();
    expect(screen.getByText(/immediate meal appeal/i)).toBeInTheDocument();
    expect(screen.getByText(/14 days/)).toBeInTheDocument();
    expect(screen.getByText(/hunger, selected city, local time and weather/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open-Meteo' })).toHaveAttribute('href', 'https://open-meteo.com/');
    expect(screen.getByRole('link', { name: 'GeoNames' })).toHaveAttribute('href', 'https://www.geonames.org/');
    expect(screen.getByRole('button', { name: 'Join pilot' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
    expect(requests('/visits')).toHaveLength(0);
  });
  it('requires an explicit city match and opt-in before enrolling', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), enrollment: null, visit: null, card: null })));
    render(<PilotStudy />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'City search' }), { target: { value: 'Seo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search cities' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Seoul, Seoul, South Korea/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /I choose to take part/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Join pilot' }));
    await waitFor(() => expect(requests('/enrollment')).toHaveLength(1));
    expect(payload('/enrollment')).toEqual({ optIn: true, cityId: 'seoul', cityQuery: 'Seo', dietaryExclusions: [] });
    expect(requests('/visits')).toHaveLength(0);
  });
  it('uses the exact prompt and accessible independent Yes/No/Not sure/Skip actions', async () => {
    render(<PilotStudy />);
    expect(await screen.findByText('If this meal were ready to eat and available to you now, would you eat it?')).toBeInTheDocument();
    for (const name of ['Yes', 'No', 'Not sure', 'Skip']) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByText('Saved rice')).toBeInTheDocument();
    expect(screen.getByText('rice, carrot')).toBeInTheDocument();
    expect(screen.getByText(/0 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/score|probability|rank/i)).not.toBeInTheDocument();
  });
  it('keeps the card and original answer payload after a failed save', async () => {
    let fail = true;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot') return json(ready());
      if (String(url) === '/api/pilot/responses') return fail ? json({ error: { code: 'internal', message: 'Could not save.' } }, 500) : json({ ok: true, value: { answer: 'yes' } });
      if (String(url) === '/api/pilot/cards') {
      const skipped = requests('/responses').length > 0 && payload('/responses').action === 'skip';
      return json({ card: null, progress: { localDate: '2026-10-25', total: 5, answered: skipped ? 0 : 1, unanswered: skipped ? 1 : 0, shortage: 4, remaining: 0 } });
    }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    expect(await screen.findByRole('button', { name: 'Retry save' })).toBeInTheDocument();
    expect(screen.getByText('Saved rice')).toBeInTheDocument();
    expect(requests('/cards')).toHaveLength(0);
    const original = payload('/responses');
    expect(original).toMatchObject({ exposureId: 'event-1', action: 'yes' });
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(requests('/cards')).toHaveLength(1));
    expect(payload('/responses', 1)).toEqual(original);
  });
  it('locks a double click to one pending action and waits for success to advance', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation(url => String(url) === '/api/pilot/responses'
      ? new Promise(resolve => { finish = resolve; })
      : String(url) === '/api/pilot/cards' ? json({ card: null, progress: { ...ready().progress, remaining: 0 } }) : json(ready()));
    render(<PilotStudy />);
    const button = await screen.findByRole('button', { name: 'Yes' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(requests('/responses')).toHaveLength(1);
    expect(requests('/cards')).toHaveLength(0);
    expect(button).toBeDisabled();
    await act(async () => { finish(new Response(JSON.stringify({ ok: true, value: { answer: 'yes' } }))); });
    await waitFor(() => expect(requests('/cards')).toHaveLength(1));
  });
  it.each([['Not sure', 'not_sure'], ['Skip', 'skip']])('submits %s as %s', async (label, action) => {
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(requests('/responses')).toHaveLength(1));
    expect(payload('/responses').action).toBe(action);
  });
  it('keeps the answered count at zero after an explicit skip', async () => {
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByText(/1 left unanswered/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 5 cards answered/)).toBeInTheDocument();
  });
  it('uses one consistent placeholder for absent and failed images', async () => {
    const first = render(<PilotStudy />);
    expect(await screen.findByRole('img', { name: 'Meal image unavailable' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    first.unmount();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), card: { allocation, meal: { ...meal, imageUrl: 'https://example.com/meal.jpg' }, exposure } })));
    render(<PilotStudy />);
    fireEvent.error(await screen.findByRole('img', { name: 'Saved rice' }));
    expect(screen.getAllByRole('img', { name: 'Meal image unavailable' })).toHaveLength(1);
  });
  it('acknowledges only after rendering and keeps display time stable on retry', async () => {
    let fail = true;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot') return json({ ...ready(), card: { allocation, meal, exposure: null } });
      if (String(url) === '/api/pilot/exposures') {
        expect(screen.getByText('Saved rice')).toBeInTheDocument();
        return fail ? json({ error: { code: 'internal', message: 'Display not saved.' } }, 500) : json({ exposure });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry display acknowledgement' }));
    await waitFor(() => expect(requests('/exposures')).toHaveLength(2));
    expect(payload('/exposures', 1)).toEqual(payload('/exposures'));
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    fail = false;
    fireEvent.click(await screen.findByRole('button', { name: 'Retry display acknowledgement' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled());
  });
  it('asks optional hunger on each fresh visit and sends unknown when skipped', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), visit: null, card: null })));
    render(<PilotStudy />);
    expect(await screen.findByRole('combobox', { name: 'How hungry are you? (optional)' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Start visit' }));
    await waitFor(() => expect(requests('/visits')).toHaveLength(1));
    expect(payload('/visits')).toMatchObject({ hunger: null, operationId: expect.any(String) });
  });
  it('retries failed visit and card issuance with the same operation IDs', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), visit: null, card: null })));
    let visits = 0;
    let cards = 0;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot/visits') return ++visits === 1 ? Promise.reject(new Error('offline')) : json({ visit });
      if (String(url) === '/api/pilot/cards') return ++cards === 1 ? Promise.reject(new Error('offline')) : json({ card: null, progress: { ...ready().progress, remaining: 0 } });
      return json(ready());
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start visit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry start visit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry load card' }));
    await waitFor(() => expect(requests('/cards')).toHaveLength(2));
    expect(payload('/visits', 1)).toEqual(payload('/visits'));
    expect(payload('/cards', 1)).toEqual(payload('/cards'));
  });
  it('reloads a retired issuance with a fresh ID after explicit conflict', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), visit, card: null })));
    let cards = 0;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot/cards') return ++cards === 1 ? json({ error: { code: 'conflict', message: 'Reload the card.' } }, 409) : json({ card: null, progress: { ...ready().progress, remaining: 0 } });
      return json({ ...ready(), visit, card: null });
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load card' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload current pilot state' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load card' }));
    await waitFor(() => expect(requests('/cards')).toHaveLength(2));
    expect(payload('/cards', 1).operationId).not.toBe(payload('/cards').operationId);
  });
  it('saves current-version settings before requiring a fresh visit', async () => {
    const updated = { ...enrollment, settings: [...enrollment.settings, { ...enrollment.settings[0], version: 2, dietaryExclusions: ['nuts', 'dairy'] }] };
    let saved = false;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot/enrollment') { saved = true; return json({ enrollment: updated }); }
      return json(saved ? { ...ready(), enrollment: updated, visit: null, card: null } : ready());
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Dietary exclusions (comma separated)' }), { target: { value: 'nuts, dairy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(requests('/enrollment')).toHaveLength(1));
    expect(requests('/enrollment')[0][1]?.method).toBe('PATCH');
    expect(payload('/enrollment')).toMatchObject({ version: 1, dietaryExclusions: ['nuts', 'dairy'], cityId: 'seoul' });
    expect(await screen.findByRole('button', { name: 'Start visit' })).toBeInTheDocument();
    expect(screen.queryByText('Saved rice')).not.toBeInTheDocument();
    expect(requests('/visits')).toHaveLength(0);
  });
  it('accounts for the shown fifth card immediately after a confirmed settings change', async () => {
    const initial = { ...ready(), progress: { ...ready().progress, answered: 4, remaining: 0 } };
    const updated = { ...enrollment, settings: [...enrollment.settings, { ...enrollment.settings[0], version: 2, dietaryExclusions: ['nuts'] }] };
    let saved = false;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot/enrollment') { saved = true; return json({ enrollment: updated }); }
      return json(saved ? { ...initial, enrollment: updated, card: null, visit: null, progress: { ...initial.progress, unanswered: 1 } } : initial);
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Dietary exclusions (comma separated)' }), { target: { value: 'nuts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText(/1 left unanswered/)).toBeInTheDocument();
    expect(screen.getByText(/4 of 5 cards answered/)).toBeInTheDocument();
    expect(screen.queryByText('Saved rice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start visit' })).not.toBeInTheDocument();
    expect(requests('/enrollment')).toHaveLength(1);
  });
  it('retries only the state refresh after settings were saved and hides stale progress meanwhile', async () => {
    const initial = { ...ready(), progress: { ...ready().progress, answered: 4, remaining: 0 } };
    const updated = { ...enrollment, settings: [...enrollment.settings, { ...enrollment.settings[0], version: 2, dietaryExclusions: ['nuts'] }] };
    let reads = 0;
    let finishRefresh!: (value: Response) => void;
    fetchMock.mockImplementation(url => {
      if (String(url) === '/api/pilot/enrollment') return json({ enrollment: updated });
      if (++reads === 1) return json(initial);
      if (reads === 2) return new Promise(resolve => { finishRefresh = resolve; });
      return json({ ...initial, enrollment: updated, card: null, visit: null, progress: { ...initial.progress, answered: 5 } });
    });
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Dietary exclusions (comma separated)' }), { target: { value: 'nuts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(requests('')).toHaveLength(2));
    expect(screen.getByText('Loading pilot…')).toBeInTheDocument();
    expect(screen.queryByText(/4 of 5 cards answered/)).not.toBeInTheDocument();
    expect(screen.queryByText('Saved rice')).not.toBeInTheDocument();
    await act(async () => { finishRefresh(new Response(JSON.stringify({ error: { code: 'internal', message: 'Refresh failed.' } }), { status: 500 })); });
    const retry = await screen.findByRole('button', { name: 'Retry load pilot' });
    expect(screen.queryByRole('button', { name: 'Retry save settings' })).not.toBeInTheDocument();
    expect(screen.queryByText(/4 of 5 cards answered/)).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText(/5 of 5 cards answered/)).toBeInTheDocument();
    expect(screen.getByText(/0 left unanswered/)).toBeInTheDocument();
    expect(requests('/enrollment')).toHaveLength(1);
    expect(requests('')).toHaveLength(3);
  });
  it('keeps the current assessment when settings save returns an unchanged version', async () => {
    render(<PilotStudy />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('button', { name: 'Yes' })).toBeEnabled();
    expect(screen.getByText('Saved rice')).toBeInTheDocument();
    expect(screen.getByText(/0 left unanswered/)).toBeInTheDocument();
    expect(requests('')).toHaveLength(1);
    expect(requests('/enrollment')).toHaveLength(1);
  });
  it.each([['disabled', 'not configured'], ['not_started', 'not started'], ['ended', 'ended']])('explains %s without assessment controls', async (status, text) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), status, visit: null, card: null })));
    render(<PilotStudy />);
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
  });
  it('explains empty-pool shortage without inventing completed assessments', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...ready(), visit: null, card: null, progress: { answered: 0, unanswered: 0, shortage: 5, remaining: 0, total: 5, localDate: '2026-10-25' } })));
    render(<PilotStudy />);
    expect(await screen.findByText(/No eligible meals/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/5 unavailable/)).toBeInTheDocument();
  });
});
