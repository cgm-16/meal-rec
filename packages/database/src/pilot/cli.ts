// ABOUTME: Configures immutable pilot studies and writes local pseudonymous export bundles.
// ABOUTME: Requires explicit MongoDB access and a byte-verified pilot freeze before final export.

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { parseArgs } from 'util';
import { connect, disconnect } from '../connect';
import { PilotStudy } from '../models/pilot-study';
import { isPilotTimestamp } from '../models/pilot-study';
import { createStudy, exportPilot } from './export';
import type { FreezeLink, StudyConfig } from './types';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a manifest object');
  return value as Record<string, unknown>;
}
async function freezeLink(path: string, studyId: string): Promise<FreezeLink> {
  const bytes = await readFile(path);
  const freezeManifestSha256 = createHash('sha256').update(bytes).digest('hex');
  requireValue((await readFile(join(dirname(path), 'manifest.sha256'), 'utf8')).trim() === freezeManifestSha256, 'Freeze manifest hash mismatch');
  const manifest = object(JSON.parse(bytes.toString('utf8')));
  requireValue(manifest.schema_version === 1 && manifest.source === 'pilot', 'Requires a schema-1 pilot freeze manifest');
  requireValue(typeof manifest.development_snapshot_sha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.development_snapshot_sha256)
    && isPilotTimestamp(manifest.frozen_at), 'Freeze requires exact raw development snapshot SHA-256 and UTC frozen_at');
  const source = object(manifest.source_manifest);
  const study = await PilotStudy.findOne({ studyId }).lean().exec();
  requireValue(study, 'Study not found');
  const keys = ['schemaVersion', 'studyId', 'studyVersion', 'protocolVersion', 'catalogVersion', 'catalogSha256',
    'startsAt', 'trainingEndsAt', 'developmentEndsAt', 'endsAt', 'seed', 'quotaTimezoneRule'] as const;
  requireValue(source.phase === 'development' && source.freezeLink === null
    && keys.every(key => source[key] === study[key]), 'Freeze study identity, versions, catalog, cutoffs, seed or quota mismatch');
  return { freezeManifestSha256, frozenAt: manifest.frozen_at, developmentSnapshotSha256: manifest.development_snapshot_sha256 };
}
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  requireValue(command === 'study' || command === 'export', 'Use study --config FILE or export --study-id ID --phase development|final --destination DIRECTORY [--freeze-manifest FILE]');
  const options: Record<string, { type: 'string' }> = command === 'study' ? { config: { type: 'string' as const } } : {
    'study-id': { type: 'string' as const }, phase: { type: 'string' as const },
    destination: { type: 'string' as const }, 'freeze-manifest': { type: 'string' as const },
  };
  const { values } = parseArgs({ args, options, strict: true, allowPositionals: false });
  requireValue(typeof process.env.MONGO_URL === 'string' && process.env.MONGO_URL.trim().length > 0, 'MONGO_URL must be supplied explicitly');
  if (command === 'study') {
    requireValue(typeof values.config === 'string' && values.config.length > 0, 'study requires --config FILE');
    const config: StudyConfig = JSON.parse(await readFile(values.config, 'utf8'));
    await connect();
    try { console.log(JSON.stringify(await createStudy(config))); }
    finally { await disconnect(); }
    return;
  }
  const studyId = values['study-id'];
  const phase = values.phase;
  const destination = values.destination;
  const freezePath = values['freeze-manifest'];
  requireValue(typeof studyId === 'string' && studyId.trim().length > 0 && typeof destination === 'string' && destination.trim().length > 0
    && (phase === 'development' || phase === 'final'), 'export requires --study-id ID --phase development|final --destination DIRECTORY');
  requireValue(phase === 'final' ? typeof freezePath === 'string' && freezePath.length > 0 : freezePath === undefined,
    'Final exports require --freeze-manifest FILE; development exports forbid it');
  await connect();
  try {
    const link = typeof freezePath === 'string' ? await freezeLink(freezePath, studyId) : undefined;
    console.log(JSON.stringify(await exportPilot(studyId, phase, destination, new Date(), link)));
  } finally { await disconnect(); }
}

if (require.main === module) main().catch(error => {
  console.error(`pilot: ${error instanceof Error ? error.message : 'Unknown failure'}`);
  process.exitCode = 1;
});
