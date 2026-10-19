// ABOUTME: Presents the opt-in pilot and its immediate-appeal assessments.
// ABOUTME: Keeps displayed cards stable until their action has been saved.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { CitySelection, Hunger, ParticipantView, VisitRecord } from '@meal-rec/database';
import type { PilotCard, PilotProgress, PilotState } from '@/lib/pilot/api';

type Answer = 'yes' | 'no' | 'not_sure' | 'skip';
type Operation =
  | { kind: 'load'; actor: string }
  | { kind: 'cities'; query: string }
  | { kind: 'settings'; version: number | null; cityId: string; cityQuery: string; dietaryExclusions: string[] }
  | { kind: 'visit'; operationId: string; hunger: Hunger }
  | { kind: 'card'; visitId: string; operationId: string }
  | { kind: 'ack'; allocationId: string; visitId: string; settingsVersion: number; clientDisplayedAt: string }
  | { kind: 'response'; exposureId: string; action: Answer; clientActionAt: string; visitId: string };
const retryLabels: Record<Operation['kind'], string> = { load: 'Retry load pilot', cities: 'Retry city search', settings: 'Retry save settings', visit: 'Retry start visit', card: 'Retry load card', ack: 'Retry display acknowledgement', response: 'Retry save' };
const buttonClass = 'rounded-md bg-blue-700 text-white px-4 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

class PilotRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
async function requestJson<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/pilot${path}`, { cache: 'no-store', ...(body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) throw new PilotRequestError(value.error?.message ?? 'The pilot request failed. Please retry.', response.status);
  return value as T;
}

function SettingsForm({ enrollment, busy, cities, search, save }: {
  enrollment: ParticipantView | null;
  busy: boolean;
  cities: CitySelection[];
  search: (query: string) => void;
  save: (operation: Extract<Operation, { kind: 'settings' }>) => void;
}) {
  const current = enrollment?.settings[enrollment.settings.length - 1];
  const [query, setQuery] = useState(current?.city.label ?? '');
  const [selected, setSelected] = useState<CitySelection | null>(current?.city ?? null);
  const [exclusions, setExclusions] = useState(current?.dietaryExclusions.join(', ') ?? '');
  const [optIn, setOptIn] = useState(false);
  return (
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      if (selected && (enrollment || optIn)) save({ kind: 'settings', version: current?.version ?? null, cityId: selected.cityId, cityQuery: query, dietaryExclusions: exclusions.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) });
    }}>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-semibold">{enrollment ? 'Pilot settings' : 'Join the pilot'}</legend>
        <div>
          <label className="block" htmlFor="pilot-city">City search</label>
          <input id="pilot-city" className="border rounded p-2" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} />
          <button type="button" className={`${buttonClass} ml-2`} onClick={() => search(query)}>Search cities</button>
        </div>
        <fieldset className="space-y-1">
          <legend>Select a city match</legend>
          {selected && !cities.some(city => city.cityId === selected.cityId) && <p>Selected: {selected.label}, {selected.adminArea ? `${selected.adminArea}, ` : ''}{selected.country} ({selected.timezone})</p>}
          {cities.map(city => <label key={city.cityId} className="block">
            <input type="radio" name="pilot-city-match" checked={selected?.cityId === city.cityId} onChange={() => setSelected(city)} />{' '}
            {city.label}, {city.adminArea ? `${city.adminArea}, ` : ''}{city.country} ({city.timezone})
          </label>)}
        </fieldset>
        <div>
          <label className="block" htmlFor="pilot-exclusions">Dietary exclusions (comma separated)</label>
          <input id="pilot-exclusions" className="w-full border rounded p-2" value={exclusions} onChange={event => setExclusions(event.target.value)} aria-describedby="pilot-exclusions-help" />
          <p id="pilot-exclusions-help" className="text-sm text-gray-700">Use ingredient or allergen names, for example nuts, dairy or fish.</p>
        </div>
        {!enrollment && <label className="block"><input type="checkbox" checked={optIn} onChange={event => setOptIn(event.target.checked)} /> I choose to take part in this pilot and record the context described above.</label>}
        <button type="submit" className={buttonClass} disabled={busy || !selected || (!enrollment && !optIn)}>{enrollment ? 'Save settings' : 'Join pilot'}</button>
      </fieldset>
    </form>
  );
}

function Assessment({ card, busy, pending, choose }: { card: PilotCard; busy: boolean; pending: boolean; choose: (answer: Answer) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5" aria-label="Meal assessment">
    <div className="relative h-48 bg-gray-100 rounded">
      {card.meal.imageUrl && !imageFailed
        ? <Image src={card.meal.imageUrl} alt={card.meal.name} unoptimized fill className="object-cover rounded" onError={() => setImageFailed(true)} />
        : <div role="img" aria-label="Meal image unavailable" className="h-full flex items-center justify-center text-4xl">🍽️</div>}
    </div>
    <h2 className="text-2xl font-semibold">{card.meal.name}</h2>
    <p><span className="font-semibold">Ingredients: </span>{card.meal.primaryIngredients.join(', ') || 'Not listed'}</p>
    <p className="text-lg">If this meal were ready to eat and available to you now, would you eat it?</p>
    <div className="flex flex-wrap gap-3">
      {([['Yes', 'yes'], ['No', 'no'], ['Not sure', 'not_sure'], ['Skip', 'skip']] as const).map(([label, answer]) => <button key={answer} type="button" className={buttonClass} disabled={busy || pending || !card.exposure} onClick={() => choose(answer)}>{label}</button>)}
    </div>
    <p className="text-sm text-gray-700">Not sure records uncertainty. Skip leaves this meal unanswered. Leaving the page also supplies no answer.</p>
  </section>;
}

export default function PilotStudy() {
  const { data: session, status } = useSession();
  const actor = session?.user?.id ?? '';
  const [data, setData] = useState<PilotState | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<Operation | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [cities, setCities] = useState<CitySelection[]>([]);
  const [editing, setEditing] = useState(false);
  const [hunger, setHunger] = useState<Hunger>(null);
  const [pendingAnswer, setPendingAnswer] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const lock = useRef(false);
  const actorRef = useRef(actor);
  const visitOperation = useRef<string | null>(null);
  const cardOperation = useRef<string | null>(null);
  const acknowledgement = useRef<Extract<Operation, { kind: 'ack' }> | null>(null);
  actorRef.current = actor;

  const execute = useCallback(async function perform(operation: Operation) {
    if (lock.current) return;
    lock.current = true;
    const requestedFor = actorRef.current;
    setBusy(true);
    setError('');
    setRetry(null);
    setReloadRequired(false);
    let next: Operation | null = null;
    try {
      if (operation.kind === 'load') {
        const result = await requestJson<PilotState>('');
        if (requestedFor !== actorRef.current) return;
        setData(result);
        setLoadedFor(operation.actor);
        setPendingAnswer(false);
        setExhausted(false);
        visitOperation.current = null;
        cardOperation.current = null;
        acknowledgement.current = null;
      } else if (operation.kind === 'cities') {
        const result = await requestJson<{ cities: CitySelection[] }>(`/cities?q=${encodeURIComponent(operation.query)}`);
        if (requestedFor !== actorRef.current) return;
        setCities(result.cities);
      } else if (operation.kind === 'settings') {
        const { version, cityId, cityQuery, dietaryExclusions } = operation;
        const result = await requestJson<{ enrollment: ParticipantView }>('/enrollment', version === null ? { optIn: true, cityId, cityQuery, dietaryExclusions } : { version, cityId, cityQuery, dietaryExclusions }, version === null ? 'POST' : 'PATCH');
        if (requestedFor !== actorRef.current) return;
        const changed = result.enrollment.settings[result.enrollment.settings.length - 1].version !== version;
        setData(previous => previous && { ...previous, enrollment: result.enrollment, ...(changed ? { visit: null, card: null } : {}) });
        if (changed) { visitOperation.current = null; cardOperation.current = null; acknowledgement.current = null; setPendingAnswer(false); setExhausted(false); }
        setEditing(false);
        setCities([]);
      } else if (operation.kind === 'visit') {
        const result = await requestJson<{ visit: VisitRecord }>('/visits', { operationId: operation.operationId, hunger: operation.hunger });
        if (requestedFor !== actorRef.current) return;
        setData(previous => previous && { ...previous, visit: result.visit, card: null });
        cardOperation.current = crypto.randomUUID();
        next = { kind: 'card', visitId: result.visit.visitId, operationId: cardOperation.current };
      } else if (operation.kind === 'card') {
        const result = await requestJson<{ card: PilotCard | null; progress: PilotProgress }>('/cards', { visitId: operation.visitId, operationId: operation.operationId });
        if (requestedFor !== actorRef.current) return;
        setData(previous => previous && { ...previous, card: result.card, progress: result.progress });
        setExhausted(result.card === null);
      } else if (operation.kind === 'ack') {
        const { allocationId, visitId, settingsVersion, clientDisplayedAt } = operation;
        const result = await requestJson<{ exposure: NonNullable<PilotCard['exposure']> }>('/exposures', { allocationId, visitId, settingsVersion, clientDisplayedAt });
        if (requestedFor !== actorRef.current) return;
        setData(previous => previous?.card?.allocation.allocationId === allocationId ? { ...previous, card: { ...previous.card, exposure: result.exposure } } : previous);
      } else {
        const { exposureId, action, clientActionAt, visitId } = operation;
        await requestJson('/responses', { exposureId, action, clientActionAt });
        if (requestedFor !== actorRef.current) return;
        setData(previous => previous && { ...previous, card: null, progress: { ...previous.progress, answered: previous.progress.answered + (action === 'skip' ? 0 : 1), unanswered: previous.progress.unanswered + (action === 'skip' ? 1 : 0) } });
        setPendingAnswer(false);
        acknowledgement.current = null;
        cardOperation.current = crypto.randomUUID();
        next = { kind: 'card', visitId, operationId: cardOperation.current };
      }
    } catch (failure) {
      if (requestedFor !== actorRef.current) return;
      setError(failure instanceof Error ? failure.message : 'The pilot request failed. Please retry.');
      const conflict = failure instanceof PilotRequestError && failure.status === 409;
      setReloadRequired(conflict);
      if (!conflict || operation.kind === 'response') setRetry(operation);
    } finally {
      lock.current = false;
      setBusy(false);
    }
    if (next) await perform(next);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !actor) return;
    let active = true;
    setError('');
    requestJson<PilotState>('').then(result => {
      if (!active) return;
      setData(result);
      setLoadedFor(actor);
      setPendingAnswer(false);
      setRetry(null);
      setReloadRequired(false);
      setEditing(false);
      setExhausted(false);
      visitOperation.current = null;
      cardOperation.current = null;
      acknowledgement.current = null;
    }).catch(failure => {
      if (!active) return;
      setError(failure instanceof Error ? failure.message : 'The pilot could not load.');
      setRetry({ kind: 'load', actor });
    });
    return () => { active = false; };
  }, [actor, status]);

  const card = data?.card;
  const currentVisit = data?.visit;
  const visitId = currentVisit?.visitId;
  useEffect(() => {
    if (loadedFor !== actor || !card || card.exposure || !visitId) return;
    if (acknowledgement.current?.allocationId !== card.allocation.allocationId) acknowledgement.current = { kind: 'ack', allocationId: card.allocation.allocationId, visitId, settingsVersion: currentVisit!.settingsVersion, clientDisplayedAt: new Date().toISOString() };
    void execute(acknowledgement.current);
  }, [actor, card, currentVisit, execute, loadedFor, visitId]);

  const errors = <>{error && <p role="alert" className="text-red-800">{error}</p>}{retry && <button type="button" className={buttonClass} disabled={busy} onClick={() => void execute(retry)}>{retryLabels[retry.kind]}</button>}{reloadRequired && <button type="button" className={buttonClass} disabled={busy} onClick={() => void execute({ kind: 'load', actor })}>Reload current pilot state</button>}</>;
  if (status === 'loading') return <p className="p-6">Loading sign-in status…</p>;
  if (status !== 'authenticated') return <main className="max-w-xl mx-auto p-6 space-y-4"><h1 className="text-3xl font-bold">Meal appeal pilot</h1><p>Sign in with your usual username and PIN before choosing whether to take part.</p><Link className="text-blue-700 underline" href="/auth/signin">Sign in</Link></main>;
  if (!data || loadedFor !== actor) return <main className="max-w-xl mx-auto p-6 space-y-4"><p>Loading pilot…</p>{errors}</main>;
  if (data.status !== 'ready') return <main className="max-w-xl mx-auto p-6 space-y-4"><h1 className="text-3xl font-bold">Meal appeal pilot</h1><p>{data.status === 'disabled' ? 'The pilot is not configured.' : data.status === 'not_started' ? `The pilot has not started. It starts ${data.study?.startsAt}.` : 'The pilot has ended. Thank you for taking part.'}</p>{errors}</main>;
  return <main className="max-w-xl mx-auto p-6 space-y-6">
    <h1 className="text-3xl font-bold">Meal appeal pilot</h1>
    <div className="space-y-2 text-gray-800">
      <p>This study compares predictions of immediate meal appeal. It lasts 14 days, with up to five distinct eligible meals per day. Each visit lasts up to 30 minutes.</p>
      <p>We record your answers and unanswered displays, dietary exclusions, optional hunger, selected city, local time and weather. City and exclusion changes apply to a fresh visit. Your enrollment timezone sets your daily quota.</p>
      <p>Weather is model-based and may be unavailable. Sources: <a className="text-blue-700 underline" href="https://open-meteo.com/">Open-Meteo</a> and <a className="text-blue-700 underline" href="https://www.geonames.org/">GeoNames</a>.</p>
      <p>Study window: {data.study?.startsAt} to {data.study?.endsAt}.</p>
    </div>
    {errors}
    {busy && <p role="status">Saving or loading…</p>}
    {!data.enrollment || editing ? <SettingsForm key={data.enrollment?.settings.length ?? 0} enrollment={data.enrollment} busy={busy} cities={cities} search={query => void execute({ kind: 'cities', query })} save={operation => void execute(operation)} /> : <>
      <p aria-live="polite">{data.progress.answered} of 5 cards answered today; {data.progress.shortage} unavailable; {data.progress.unanswered} left unanswered.</p>
      <button type="button" className={buttonClass} disabled={busy || pendingAnswer} onClick={() => { setEditing(true); setCities([]); }}>Change settings</button>
      {card ? <Assessment key={card.allocation.allocationId} card={card} busy={busy} pending={pendingAnswer} choose={answer => {
        if (lock.current || pendingAnswer || !card.exposure || !visitId) return;
        setPendingAnswer(true);
        void execute({ kind: 'response', exposureId: card.exposure.eventId, action: answer, clientActionAt: new Date().toISOString(), visitId });
      }} /> : exhausted || data.progress.remaining === 0 ? <p>{data.progress.shortage === 5 ? 'No eligible meals are available today.' : 'No more cards are available today.'} Come back on your next participant-day.</p> : data.visit ? <button type="button" className={buttonClass} disabled={busy || retry !== null || reloadRequired} onClick={() => {
        cardOperation.current ??= crypto.randomUUID();
        void execute({ kind: 'card', visitId: data.visit!.visitId, operationId: cardOperation.current });
      }}>Load card</button> : <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        visitOperation.current ??= crypto.randomUUID();
        void execute({ kind: 'visit', operationId: visitOperation.current, hunger });
      }}>
        <label className="block" htmlFor="pilot-hunger">How hungry are you? (optional)</label>
        <select id="pilot-hunger" className="border rounded p-2" value={hunger ?? ''} disabled={busy || retry !== null} onChange={event => setHunger((event.target.value || null) as Hunger)}>
          <option value="">Skip hunger question</option><option value="not_hungry">Not hungry</option><option value="somewhat_hungry">Somewhat hungry</option><option value="very_hungry">Very hungry</option>
        </select>
        <button className={`${buttonClass} block`} type="submit" disabled={busy || retry !== null || reloadRequired}>Start visit</button>
      </form>}
    </>}
  </main>;
}
