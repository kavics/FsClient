const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createDatabase } = require('./database');
const { aircraftKeyFromTitle, parseImport, validatePosition } = require('./domain');

function samplePosition(overrides = {}) {
  return {
    aircraftKey: 'vision jet',
    aircraftTitle: 'Vision Jet',
    label: 'Ramp 4',
    createdAt: '2026-10-04T12:00:00.000Z',
    position: { latitude: 47.45, longitude: 19.26, altitudeMslMeters: 120, groundElevationMslMeters: 118 },
    orientation: { headingTrue: 120, pitch: 0, bank: 0 },
    ...overrides,
  };
}

test('validates ranges and normalizes editable airport metadata', () => {
  const position = validatePosition(samplePosition({ place: { icao: 'lhbp', name: 'Budapest', city: 'Budapest', country: 'Hungary' } }));
  assert.match(position.id, /^[0-9a-f-]{36}$/);
  assert.equal(position.place.icao, 'LHBP');
  assert.throws(() => validatePosition(samplePosition({ position: { latitude: 91, longitude: 0, altitudeMslMeters: 0 } })), /Latitude/);
  assert.throws(() => validatePosition(samplePosition({ label: 'L'.repeat(121) })), /Label/);
});

test('uses the simulator title, not callsign, as a stable aircraft key', () => {
  assert.equal(aircraftKeyFromTitle('  Vision   Jet '), 'vision jet');
});

test('persists, updates, lists, deletes, and rejects invalid stored values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fsclient-positions-'));
  const databasePath = path.join(directory, 'positions.sqlite');
  const store = createDatabase(databasePath);
  try {
    const saved = store.insert(validatePosition(samplePosition()));
    assert.equal(store.version, 1);
    assert.equal(store.get(saved.id).position.latitude, 47.45);
    assert.equal(store.listByAircraft('vision jet').length, 1);
    assert.throws(() => store.insertMany([
      samplePosition({ id: 'transaction-first' }),
      samplePosition({ id: 'transaction-invalid', position: { latitude: 95, longitude: 0, altitudeMslMeters: 0 } }),
    ]), /Latitude/);
    assert.equal(store.get('transaction-first'), null);
    assert.equal(store.update(saved.id, 'vision jet', { label: 'New label', note: 'Note', place: null }).label, 'New label');
    assert.equal(store.get(saved.id).place, null);
    assert.equal(store.delete(saved.id, 'vision jet'), true);
    assert.equal(store.get(saved.id), null);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reports malformed import rows and duplicate IDs without aborting valid rows', () => {
  const duplicated = samplePosition({ id: 'same-id' });
  const parsed = parseImport({
    format: 'fsclient-saved-positions',
    version: 1,
    positions: [duplicated, duplicated, samplePosition({ position: { latitude: 100, longitude: 0, altitudeMslMeters: 0 } })],
  });
  assert.equal(parsed.valid.length, 1);
  assert.equal(parsed.invalid.length, 2);
});