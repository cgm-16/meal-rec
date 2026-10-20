// ABOUTME: Verifies normal pilot collection against real MongoDB and the export CLI.
// ABOUTME: Checks ownership, offline retry and service-worker isolation without intercepted APIs.

import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import mongoose from 'mongoose';
import type { PilotParticipantRecord, PilotSnapshot } from '@meal-rec/database';
import type { PilotState } from '../src/lib/pilot/api';

const root = resolve(__dirname, '../..');
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl || new URL(mongoUrl).pathname !== '/meal-rec-e2e-test') throw new Error('Pilot E2E requires explicit meal-rec-e2e-test MONGO_URL');
const studyId = 'constructed-e2e-pilot';
type BrowserError = { offline: boolean; text: string };

function captureBrowserEvents(page: Page, errors: BrowserError[], uploads: string[], isOffline: () => boolean) {
  page.on('request', request => { if (/\/envelope\/?$/.test(new URL(request.url()).pathname)) uploads.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error') errors.push({ offline: isOffline(), text: message.text() }); });
  page.on('pageerror', error => errors.push({ offline: isOffline(), text: error.message }));
}

function assertErrors(errors: BrowserError[], browserName: string) {
  const expectedOfflineErrors: Record<string, string> = {
    chromium: 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED',
    webkit: 'Failed to load resource: WebKit encountered an internal error',
  };
  expect(errors.filter(error => !error.offline)).toEqual([]);
  expect(errors.filter(error => error.text !== expectedOfflineErrors[browserName])).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, MONGO_URL: mongoUrl! }, encoding: 'utf8' });
  expect(result.error, `${command}: ${result.stdout}\n${result.stderr}`).toBeUndefined();
  expect(result.status, `${command}: ${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stderr).toBe('');
  return result.stdout;
}

async function signUpAndIn(page: Page) {
  const username = `pilot-${randomUUID()}`;
  await page.goto('/auth/signup');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL('/auth/signin?message=Account%20created%20successfully');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  return username;
}

async function enroll(page: Page, exclusions = '') {
  await page.goto('/pilot');
  await page.getByLabel('City search').fill('Seoul');
  await page.getByRole('button', { name: 'Search cities', exact: true }).click();
  await page.getByRole('radio', { name: 'Seoul, South Korea (Asia/Seoul)', exact: true }).check();
  await page.getByLabel('Dietary exclusions (comma separated)').fill(exclusions);
  await page.getByLabel('I choose to take part in this pilot').check();
  await page.getByRole('button', { name: 'Join pilot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start visit', exact: true })).toBeEnabled();
  await page.getByLabel('How hungry are you? (optional)').selectOption('very_hungry');
  await page.getByRole('button', { name: 'Start visit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
}

async function state(page: Page): Promise<PilotState> {
  const response = await page.request.get('/api/pilot');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  return response.json();
}

async function shown(page: Page) {
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
  const value = await state(page);
  expect(value.card?.exposure).toBeTruthy();
  await expect(page.getByRole('region', { name: 'Meal assessment' }).getByRole('heading')).toHaveText(value.card!.meal.name);
  await expect(page.getByText(`Ingredients: ${value.card!.meal.primaryIngredients.join(', ')}`, { exact: true })).toBeVisible();
  return value;
}

async function choose(page: Page, name: string) {
  const saved = page.waitForResponse(response => response.url().endsWith('/api/pilot/responses') && response.request().method() === 'POST');
  await page.getByRole('button', { name, exact: true }).click();
  expect((await saved).status()).toBe(200);
}

test('normal UI preserves collection IDs and exact MongoDB/export values, labels and ownership', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(180000);
  const artifact = await mkdtemp(join(tmpdir(), `meal-rec-pilot-${testInfo.project.name}-`));
  const connection = await mongoose.createConnection(mongoUrl!).asPromise();
  const secondContext = await browser.newContext({ baseURL: 'http://localhost:3000', viewport: { width: 1280, height: 720 } });
  let offline = false;
  const errors: BrowserError[] = [];
  const uploads: string[] = [];
  const attempts: unknown[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/pilot/responses') && request.method() === 'POST') attempts.push(request.postDataJSON()); });
  captureBrowserEvents(page, errors, uploads, () => offline);
  try {
    const guest = await page.request.post('/api/pilot/visits', { data: { operationId: randomUUID(), hunger: null } });
    expect(guest.status()).toBe(401);
    const username = await signUpAndIn(page);
    const notEnrolled = await page.request.post('/api/pilot/visits', { data: { operationId: randomUUID(), hunger: null } });
    expect(notEnrolled.status()).toBe(403);
    await enroll(page, 'gluten');
    const first = await shown(page);
    await page.screenshot({ path: join(artifact, 'first-collector-card.png'), fullPage: true });
    await testInfo.attach('first-collector-card', { path: join(artifact, 'first-collector-card.png'), contentType: 'image/png' });
    expect(first.card!.meal.allergens).not.toContain('gluten');
    expect(first.card!.allocation.eligiblePoolSize).toBe(2);
    expect(first.progress.shortage).toBe(3);
    expect(first.visit!.hunger).toBe('very_hungry');
    expect(first.visit!.city.cityId).toBe('geonames:1835848');
    expect(first.visit!.weather).toMatchObject({ status: 'unavailable', accessMode: 'disabled', failureReason: 'access_disabled' });
    expect(Date.parse(first.visit!.expiresAt) - Date.parse(first.visit!.startedAt)).toBe(30 * 60000);
    await page.reload();
    expect((await shown(page)).card).toEqual(first.card);
    const owned = async () => {
      const user = await connection.collection('users').findOne({ username });
      expect(user).toBeTruthy();
      const participant = await connection.collection<PilotParticipantRecord>('pilotparticipants').findOne({ studyId, userId: String(user!._id) });
      expect(participant?.participantId).toBe(first.enrollment!.participantId);
      return participant!;
    };
    expect((await owned()).exposures).toEqual([first.card!.exposure]);
    offline = true;
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Meal assessment' }).getByRole('heading')).toHaveText(first.card!.meal.name);
    expect((await owned()).responses).toEqual([]);
    await context.setOffline(false);
    const retried = page.waitForResponse(response => response.url().endsWith('/api/pilot/responses'));
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    const retryResponse = await retried;
    expect(retryResponse.status()).toBe(200);
    const retryBody = retryResponse.request().postDataJSON();
    expect(retryBody).toMatchObject({ exposureId: first.card!.exposure!.eventId, action: 'yes' });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    offline = false;
    const second = await shown(page);
    expect(second.card!.allocation.itemId).not.toBe(first.card!.allocation.itemId);
    expect(second.card!.meal.allergens).not.toContain('gluten');
    await choose(page, 'No');
    await expect(page.getByText('No more cards are available today.', { exact: false })).toBeVisible();
    const completed = await state(page);
    expect(completed.progress).toMatchObject({ answered: 2, unanswered: 0, shortage: 3, remaining: 0, total: 5 });
    const owner = await owned();
    expect(owner.responses.map(response => response.answer)).toEqual(['yes', 'no']);
    expect(owner.responses[0].eventId).toBe(first.card!.exposure!.eventId);
    expect(owner.responses[0].actionAt).toBe(retryBody.clientActionAt);
    expect(owner.exposures).toEqual([first.card!.exposure, second.card!.exposure]);
    expect(owner.visits[0]).toMatchObject({ ...first.visit! });

    const other = await secondContext.newPage();
    captureBrowserEvents(other, errors, uploads, () => false);
    const otherUsername = await signUpAndIn(other);
    await enroll(other);
    const third = await shown(other);
    expect(third.enrollment!.participantId).not.toBe(owner.participantId);
    const stolen = await other.request.post('/api/pilot/responses', { data: { exposureId: first.card!.exposure!.eventId, action: 'yes', clientActionAt: new Date().toISOString() } });
    expect(stolen.status()).toBe(404);
    expect((await state(other)).card).toEqual(third.card);
    await choose(other, 'Not sure');
    const fourth = await shown(other);
    await choose(other, 'Skip');
    const fifth = await shown(other);
    expect(new Set([third, fourth, fifth].map(value => value.card!.meal.id)).size).toBe(3);
    await other.reload();
    expect((await shown(other)).card).toEqual(fifth.card);
    const otherParticipant = await connection.collection<PilotParticipantRecord>('pilotparticipants').findOne({ participantId: third.enrollment!.participantId });
    expect(otherParticipant!.responses.map(response => response.answer)).toEqual(['not_sure']);
    expect(otherParticipant!.days[0].slots.filter(slot => slot.status === 'skipped')).toHaveLength(1);
    expect(otherParticipant!.exposures).toHaveLength(3);
    expect(otherParticipant!.days[0].shortage).toBe(2);
    const destination = join(artifact, 'development-bundle');
    const exportOutput = run(process.execPath, [resolve(root, 'packages/database/dist/pilot/cli.js'), 'export', '--study-id', studyId, '--phase', 'development', '--destination', destination], root);
    const snapshot: PilotSnapshot = JSON.parse(await readFile(join(destination, 'snapshot.json'), 'utf8'));
    const checksums = await readFile(join(destination, 'SHA256SUMS'), 'utf8');
    for (const file of ['snapshot.json', 'collection.json']) {
      expect(checksums).toContain(`${createHash('sha256').update(await readFile(join(destination, file))).digest('hex')}  ${file}\n`);
    }
    expect(snapshot.participants.find(p => p.participantId === owner.participantId)).toMatchObject({ ...first.enrollment! });
    expect(snapshot.exposures.filter(e => e.participantId === owner.participantId)).toEqual(owner.exposures);
    expect(snapshot.responses.filter(r => r.participantId === owner.participantId)).toEqual(owner.responses);
    expect(snapshot.responses.filter(r => r.participantId === otherParticipant!.participantId)).toEqual(otherParticipant!.responses);
    expect(snapshot.visits.find(v => v.visitId === first.visit!.visitId)).toEqual(first.visit);
    expect(JSON.stringify(snapshot)).not.toContain(username);
    expect(JSON.stringify(snapshot)).not.toContain(otherUsername);
    expect(JSON.stringify(snapshot)).not.toContain('hashedPin');
    expect(JSON.stringify(snapshot)).not.toContain('userId');
    const validation = run('uv', ['run', '--frozen', 'python', '-m', 'meal_prediction', 'validate', '--input', join(destination, 'snapshot.json')], resolve(root, 'benchmarks/meal_prediction'));
    const binaryTargets = snapshot.responses.filter(response => response.answer !== 'not_sure').length;
    expect(JSON.parse(validation)).toMatchObject({ status: 'valid', source: 'pilot', phase: 'development', exposures: snapshot.exposures.length, binary_targets: binaryTargets, partitions: { training: binaryTargets, development: 0, test: 0 }, exclusions: { not_sure: snapshot.responses.length - binaryTargets, unanswered: snapshot.exposures.length - snapshot.responses.length } });
    const targets = JSON.parse(run('uv', ['run', '--frozen', 'python', '-c', 'import json,sys; from pathlib import Path; from meal_prediction.records import load_snapshot; print(json.dumps({key: target.y for key, target in load_snapshot(Path(sys.argv[1])).targets.items()}))', join(destination, 'snapshot.json')], resolve(root, 'benchmarks/meal_prediction')));
    expect(targets[first.card!.exposure!.eventId]).toBe(1);
    expect(targets[second.card!.exposure!.eventId]).toBe(0);
    for (const value of [third, fourth, fifth]) expect(targets).not.toHaveProperty(value.card!.exposure!.eventId);
    await writeFile(join(artifact, 'VERIFICATION.txt'), `CONSTRUCTED verification; not genuine pilot evidence.\n${exportOutput}\n${validation}\n${checksums}`);
    await testInfo.attach('constructed-export-proof', { body: JSON.stringify({ artifact, exportOutput, validation, checksums, runtime: { node: process.version, browser: browser.version(), viewport: page.viewportSize(), database: mongoUrl } }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: join(artifact, 'completed-collector.png'), fullPage: true });
    await testInfo.attach('completed-collector', { path: join(artifact, 'completed-collector.png'), contentType: 'image/png' });
    await testInfo.attach('expected-offline-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
    assertErrors(errors, browser.browserType().name());
    expect(uploads, 'Explicit empty monitoring DSN must prevent all envelope uploads').toEqual([]);
  } finally {
    await context.setOffline(false);
    await secondContext.close();
    await connection.close();
  }
});

test('pilot responses and navigation never come from a service-worker cache while offline', async ({ page, context }, testInfo) => {
  let isOffline = false;
  const errors: BrowserError[] = [];
  const uploads: string[] = [];
  captureBrowserEvents(page, errors, uploads, () => isOffline);
  await signUpAndIn(page);
  await enroll(page);
  await shown(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  const paths = ['/api/pilot', '/api/pilot/cities?q=Seoul', '/pilot'];
  expect(await page.evaluate(async paths => Promise.all(paths.map(async path => (await fetch(path, { cache: 'no-store' })).status)), paths)).toEqual([200, 200, 200]);
  isOffline = true;
  await context.setOffline(true);
  try {
    const offline = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      try { const response = await fetch(path, { cache: 'no-store' }); return { path, status: response.status }; }
      catch { return { path, status: null }; }
    })), paths);
    const cached = await page.evaluate(async () => {
      const requests = await Promise.all((await caches.keys()).map(async key => (await caches.open(key)).keys()));
      return requests.flat().map(request => request.url).filter(url => /^\/(?:api\/pilot|pilot)(?:\/|$)/.test(new URL(url).pathname));
    });
    await testInfo.attach('offline-cache-proof', { body: JSON.stringify({ offline, cached }, null, 2), contentType: 'application/json' });
    expect(offline).toEqual(paths.map(path => ({ path, status: null })));
    expect(cached).toEqual([]);
    await testInfo.attach('expected-offline-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
    const expectedOfflineErrors = new Set([
      'Failed to load resource: net::ERR_FAILED',
      ...paths.flatMap(path => {
        const url = new URL(path, page.url());
        const noResponse = `no-response: no-response :: [{"url":"${url.href}","error":{}}]`;
        return [noResponse, `/${url.host}${url.pathname}${url.search}.`,
          `Failed to load resource: FetchEvent.respondWith received an error: ${noResponse}`];
      }),
    ]);
    expect(errors.filter(error => !error.offline)).toEqual([]);
    expect(errors.filter(error => !expectedOfflineErrors.has(error.text))).toEqual([]);
    expect(uploads, 'Explicit empty monitoring DSN must prevent all envelope uploads').toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
