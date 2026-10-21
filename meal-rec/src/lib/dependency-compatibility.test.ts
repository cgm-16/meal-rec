// ABOUTME: Exercises the released dependency callers used by performance tools and runtime telemetry.
// ABOUTME: Guards the scoped CSV, YAML, UUID and OpenTelemetry dependency upgrades with real local behavior.
// @vitest-environment node

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const artillery = path.dirname(require.resolve('artillery/package.json'));
const lhciRequire = createRequire(require.resolve('@lhci/cli/package.json'));
const artilleryModule = (file: string) => JSON.stringify(pathToFileURL(path.join(artillery, file)).href);
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'meal-rec-dependencies-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function runNode(args: string[]) {
  const result = await execFileAsync(process.execPath, args, {
    cwd: directory,
    timeout: 20000,
    env: { ...process.env, ARTILLERY_DISABLE_TELEMETRY: 'true' },
  });
  expect(result.stderr).toBe('');
  return result.stdout;
}

async function node(source: string) {
  return runNode(['--input-type=module', '--eval', source]);
}

async function payloadScript(target: string) {
  await writeFile(path.join(directory, 'meals.csv'), 'meal,servings\n"rice,curry",2\n\n');
  const filename = path.join(directory, 'script.json');
  await writeFile(filename, JSON.stringify({
    config: {
      target,
      phases: [{ duration: 1, arrivalCount: 1 }],
      payload: { path: 'meals.csv', fields: ['meal', 'servings'], skipHeader: true },
    },
    scenarios: [{ flow: [{ get: { url: '/{{ meal }}?servings={{ servings }}' } }] }],
  }));
  return filename;
}

describe('dependency compatibility', () => {
  it('Artillery prepares quoted CSV payloads with headers and numeric values', async () => {
    const filename = await payloadScript('http://127.0.0.1');
    const output = await node(`
      import { createGlobalObject } from ${artilleryModule('dist/lib/artillery-global.js')};
      import prepare from ${artilleryModule('dist/lib/util/prepare-test-execution-plan.js')};
      await createGlobalObject();
      const plan = await prepare([${JSON.stringify(filename)}], {}, {});
      console.log(JSON.stringify(plan.config.payload[0].data));
    `);
    expect(JSON.parse(output)).toEqual([['rice,curry', 2]]);
  });

  it('Artillery run loads its CSV import and sends the parsed payload to a real HTTP server', async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url!);
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing local HTTP address');
      const filename = await payloadScript(`http://127.0.0.1:${address.port}`);
      const report = path.join(directory, 'report.json');
      const output = await runNode([path.join(artillery, 'bin/run'), 'run', filename, '--quiet', '--output', report]);
      expect(output).toContain('Test run id:');
      expect(requests).toEqual(['/rice,curry?servings=2']);
      expect(JSON.parse(await readFile(report, 'utf8')).aggregate.counters['http.codes.200']).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('Artillery parses YAML load scripts through its released parser', async () => {
    const yaml = 'config:\n  target: http://127.0.0.1\nscenarios: []\n';
    const output = await node(`
      import { parseScript } from ${artilleryModule('dist/lib/util.js')};
      console.log(JSON.stringify(await parseScript(${JSON.stringify(yaml)})));
    `);
    expect(JSON.parse(output)).toEqual({ config: { target: 'http://127.0.0.1' }, scenarios: [] });
  });

  it('Artillery ping parses a YAML header and sends it in a real HTTP request', async () => {
    const headers: string[] = [];
    const server = createServer((request, response) => {
      headers.push(String(request.headers['x-meal']));
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing local HTTP address');
      const output = await runNode([path.join(artillery, 'bin/run'), 'ping', `http://127.0.0.1:${address.port}`, '--h1', '--headers', '{x-meal: "rice, curry"}']);
      expect(output).toContain('HTTP/1.1 200 OK');
      expect(headers).toEqual(['rice, curry']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('LHCI loads a YAML configuration and converts assertion keys', async () => {
    const filename = path.join(directory, 'lighthouserc.yaml');
    await writeFile(filename, 'ci:\n  collect:\n    numberOfRuns: 1\n  assert:\n    assertions:\n      categories.performance: [error, {minScore: 0.8}]\n');
    const output = await node(`
      import { createRequire } from 'node:module';
      const require = createRequire(${JSON.stringify(lhciRequire.resolve('@lhci/utils/package.json'))});
      const { loadAndParseRcFile } = require('./src/lighthouserc.js');
      console.log(JSON.stringify(loadAndParseRcFile(${JSON.stringify(filename)})));
    `);
    expect(JSON.parse(output)).toEqual({
      numberOfRuns: 1,
      assertions: { 'categories:performance': ['error', { minScore: 0.8 }] },
    });
  });

  it('LHCI uses CommonJS UUID to write unique flags files and cleans them up', async () => {
    const output = await node(`
      import { createRequire } from 'node:module';
      import fs from 'node:fs';
      const require = createRequire(${JSON.stringify(require.resolve('@lhci/cli/package.json'))});
      const Runner = require('./src/collect/node-runner.js');
      const first = Runner.computeArgumentsAndCleanup('http://127.0.0.1', { settings: { formFactor: 'desktop' } });
      const second = Runner.computeArgumentsAndCleanup('http://127.0.0.1', { settings: { formFactor: 'desktop' } });
      const filename = first.args.at(-1);
      const settings = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const unique = filename !== second.args.at(-1);
      first.cleanupFn();
      second.cleanupFn();
      console.log(JSON.stringify({ settings, unique, removed: !fs.existsSync(filename), filename }));
    `);
    expect(JSON.parse(output)).toMatchObject({
      settings: { formFactor: 'desktop', chromeFlags: ' --headless=new' },
      unique: true,
      removed: true,
      filename: expect.stringMatching(/flags-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/),
    });
  });

  it('Sentry initializes its real OpenTelemetry graph and records a scoped span without sending events', async () => {
    const output = await node(`
      import { createRequire } from 'node:module';
      const require = createRequire(${JSON.stringify(import.meta.url)});
      const Sentry = require('@sentry/nextjs');
      // Discard events before transport; keep real initialization and tracing enabled.
      Sentry.init({ dsn: 'https://public@127.0.0.1:1/1', tracesSampleRate: 1, beforeSend: () => null, beforeSendTransaction: () => null, sendClientReports: false });
      let context;
      Sentry.startSpan({ name: 'dependency-compatibility' }, span => {
        context = { recording: span.isRecording(), active: Sentry.getActiveSpan() === span, ...span.spanContext() };
      });
      console.log(JSON.stringify({ initialized: !!Sentry.getClient(), ...context, closed: await Sentry.close(1000) }));
    `);
    expect(JSON.parse(output)).toEqual({
      initialized: true,
      recording: true,
      active: true,
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      traceFlags: 1,
      closed: true,
    });
  });
});
