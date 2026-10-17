const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createSavedPositionsFeature } = require('./service');

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.sent = [];
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
  }

  emit(eventName, payload) {
    this.sent.push({ eventName, payload });
  }

  request(eventName, payload) {
    return new Promise((resolve) => this.handlers.get(eventName)(payload, resolve));
  }
}

class FakeIo {
  on(eventName, handler) {
    if (eventName === 'connection') this.connect = handler;
  }

  emit() {}
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fsclient-service-'));
  const io = new FakeIo();
  let aircraftTitle = 'Vision Jet';
  const feature = createSavedPositionsFeature(io, {
    dataDirectory: directory,
    getAircraftTitle: () => aircraftTitle,
  });
  const socket = new FakeSocket();
  io.connect(socket);
  return {
    socket,
    feature,
    directory,
    setAircraftTitle(value) { aircraftTitle = value; },
    close() {
      feature.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function exportData(id = 'imported-position') {
  return {
    format: 'fsclient-saved-positions',
    version: 1,
    positions: [{
      id,
      aircraftKey: 'vision jet',
      aircraftTitle: 'Vision Jet',
      label: 'Imported ramp',
      note: null,
      createdAt: '2026-10-04T12:00:00.000Z',
      place: null,
      position: { latitude: 47.45, longitude: 19.26, altitudeMslMeters: 120, groundElevationMslMeters: null },
      orientation: { headingTrue: 120, pitch: 0, bank: 0 },
    }],
  };
}

test('rejects client-supplied coordinates when fresh simulator data is unavailable', async () => {
  const fixture = createFixture();
  try {
    const response = await fixture.socket.request('savedPositions:save', {
      label: 'Forged position',
      position: { latitude: 0, longitude: 0, altitudeMslMeters: 0 },
      orientation: { headingTrue: 0, pitch: 0, bank: 0 },
    });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'SIMCONNECT_UNAVAILABLE');
    const list = await fixture.socket.request('savedPositions:list', {});
    assert.equal(list.positions.length, 0);
  } finally {
    fixture.close();
  }
});

test('saves only the current simulator snapshot and ignores client coordinates', async () => {
  const fixture = createFixture();
  try {
    const now = Date.now();
    const sample = {
      aircraftTitle: 'Vision Jet',
      aircraftKey: 'vision jet',
      latitude: 47.45,
      longitude: 19.26,
      altitudeMslMeters: 120,
      groundElevationMslMeters: 118,
      headingTrue: 120,
      pitch: 0,
      bank: 0,
      groundSpeedMetersPerSecond: 0,
      engineCount: 1,
      engines: [false],
      onGround: true,
      parkingBrake: true,
      receivedAt: now,
    };
    fixture.feature.adapter.handle = { off() {} };
    fixture.feature.adapter.sample = sample;
    fixture.feature.adapter.history = [
      { ...sample, receivedAt: now - 3000 },
      { ...sample, receivedAt: now - 2000 },
      { ...sample, receivedAt: now - 1000 },
      sample,
    ];

    const response = await fixture.socket.request('savedPositions:save', {
      label: 'Verified simulator save',
      position: { latitude: 0, longitude: 0, altitudeMslMeters: 0 },
      orientation: { headingTrue: 0, pitch: 0, bank: 0 },
    });
    assert.equal(response.ok, true);
    assert.equal(response.position.position.latitude, 47.45);
    assert.equal(response.position.position.longitude, 19.26);
    assert.equal(response.position.orientation.headingTrue, 120);
  } finally {
    fixture.close();
  }
});

test('previews imports, requires explicit conflict choices, and isolates aircraft lists', async () => {
  const fixture = createFixture();
  try {
    const firstPreview = await fixture.socket.request('savedPositions:importPreview', { data: exportData() });
    assert.equal(firstPreview.ok, true);
    assert.equal(firstPreview.validCount, 1);
    const firstImport = await fixture.socket.request('savedPositions:import', {
      token: firstPreview.token,
      choices: {},
    });
    assert.equal(firstImport.importedCount, 1);

    const conflictPreview = await fixture.socket.request('savedPositions:importPreview', { data: exportData() });
    assert.equal(conflictPreview.conflicts.length, 1);
    const missingChoice = await fixture.socket.request('savedPositions:import', {
      token: conflictPreview.token,
      choices: {},
    });
    assert.equal(missingChoice.ok, false);
    assert.equal(missingChoice.error.code, 'IMPORT_CONFLICT_CHOICE_REQUIRED');

    const newPreview = await fixture.socket.request('savedPositions:importPreview', { data: exportData() });
    const importedAsNew = await fixture.socket.request('savedPositions:import', {
      token: newPreview.token,
      choices: { 'imported-position': 'new' },
    });
    assert.equal(importedAsNew.importedCount, 1);

    const list = await fixture.socket.request('savedPositions:list', {});
    assert.equal(list.positions.length, 2);
    const exported = await fixture.socket.request('savedPositions:export', {});
    assert.equal(exported.data.format, 'fsclient-saved-positions');
    assert.equal(exported.data.version, 1);
    assert.equal(exported.data.positions.length, 2);
    fixture.setAircraftTitle('Another aircraft');
    const otherAircraftList = await fixture.socket.request('savedPositions:list', {});
    assert.equal(otherAircraftList.positions.length, 0);
  } finally {
    fixture.close();
  }
});