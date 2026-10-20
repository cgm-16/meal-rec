// ABOUTME: Creates the constructed pilot study for real browser/export verification.
// ABOUTME: Guards the dedicated destructive E2E database before any fixture writes.

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

const PILOT_STUDY_ID = 'constructed-e2e-pilot';

function requireE2EDatabase(uri = process.env.MONGO_URL) {
  if (!uri || new URL(uri).pathname !== '/meal-rec-e2e-test') {
    throw new Error('E2E setup requires an explicit MONGO_URL selecting meal-rec-e2e-test');
  }
  return uri;
}

async function seedPilotStudy(meals) {
  requireE2EDatabase();
  assert.equal(mongoose.connection.db.databaseName, 'meal-rec-e2e-test');
  assert.equal(process.env.PILOT_STUDY_ID, PILOT_STUDY_ID);
  const { createStudy } = require('../../packages/database/dist/pilot/export');
  await createStudy({
    studyId: PILOT_STUDY_ID,
    studyVersion: '1',
    protocolVersion: '1',
    catalogVersion: 'constructed-e2e-three-meals',
    catalogSha256: createHash('sha256').update(JSON.stringify(meals)).digest('hex'),
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    seed: 42,
    cityOptions: [{
      cityId: 'geonames:1835848', label: 'Seoul', country: 'South Korea', adminArea: null,
      latitude: 37.5665, longitude: 126.978, timezone: 'Asia/Seoul',
    }],
  });
  console.log(`Seeded constructed verification study ${PILOT_STUDY_ID}; not genuine pilot evidence`);
}

module.exports = { PILOT_STUDY_ID, requireE2EDatabase, seedPilotStudy };

if (require.main === module) {
  assert.equal(process.argv[2], '--self-check');
  for (const uri of ['', 'mongodb://127.0.0.1:51622/meal-rec', 'mongodb://127.0.0.1:51622/meal-rec-e2e-test-other']) {
    assert.throws(() => requireE2EDatabase(uri), /explicit MONGO_URL selecting meal-rec-e2e-test/);
  }
  assert.equal(requireE2EDatabase('mongodb://127.0.0.1:51622/meal-rec-e2e-test'), 'mongodb://127.0.0.1:51622/meal-rec-e2e-test');
  console.log('E2E database guard self-check passed; invalid names rejected before connection or mutation');
}
