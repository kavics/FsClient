const assert = require('node:assert/strict');
const test = require('node:test');
const { SimConnectAdapter, conditionStatus, toInitPosition } = require('./simconnect-adapter');

function makeSample(receivedAt) {
  return {
    receivedAt,
    onGround: true,
    parkingBrake: true,
    engineCount: 2,
    engines: [false, false],
    groundSpeedMetersPerSecond: 0,
  };
}

test('requires a fresh three-second stationary window and all four save conditions', () => {
  const now = 10000;
  const history = [makeSample(7000), makeSample(8000), makeSample(9000), makeSample(now)];
  const status = conditionStatus(history.at(-1), history, now);
  assert.equal(status.canSave, true);
  assert.equal(status.canLoad, true);

  const moving = [...history.slice(0, -1), { ...makeSample(now), groundSpeedMetersPerSecond: 2 }];
  assert.equal(conditionStatus(moving.at(-1), moving, now).canLoad, false);

  const engineRunning = { ...history.at(-1), engines: [true, false] };
  assert.equal(conditionStatus(engineRunning, history, now).canSave, false);
  assert.equal(conditionStatus(engineRunning, history, now).canLoad, true);

  const stale = makeSample(now - 3000);
  assert.equal(conditionStatus(stale, [stale], now).conditions.onGround, null);
  assert.equal(conditionStatus(stale, [stale], now).canLoad, false);
});

test('converts MSL meters and forces a parked zero-airspeed INITPOSITION', () => {
  const initPosition = toInitPosition({
    position: { latitude: 47.45, longitude: 19.26, altitudeMslMeters: 100 },
    orientation: { headingTrue: 270, pitch: 1, bank: -2 },
  });
  assert.equal(initPosition.latitude, 47.45);
  assert.ok(Math.abs(initPosition.altitude - 328.0839895) < 1e-9);
  assert.equal(initPosition.heading, 270);
  assert.equal(initPosition.onGround, true);
  assert.equal(initPosition.airspeed, 0);
});

test('does not use a fresh sample from a different aircraft title', () => {
  const adapter = new SimConnectAdapter();
  const now = Date.now();
  const history = [makeSample(now - 3000), makeSample(now - 2000), makeSample(now - 1000), makeSample(now)];
  adapter.sample = { ...history.at(-1), aircraftKey: 'old aircraft' };
  adapter.history = history;
  adapter.handle = { off() {} };
  const status = adapter.getCurrent('New aircraft');
  assert.equal(status.simConnected, true);
  assert.equal(status.fresh, false);
  assert.equal(status.conditions.onGround, null);
  assert.equal(status.canSave, false);
  adapter.detach();
});

test('registers aircraft TITLE after the engine fields read before it', () => {
  const adapter = new SimConnectAdapter();
  const definitions = [];
  const handle = {
    addToDataDefinition(...definition) { definitions.push(definition); },
    on() {},
    off() {},
    requestDataOnSimObject() {},
  };
  adapter.attach(handle);
  const positionFields = definitions.filter(([definitionId]) => definitionId === 700);
  assert.equal(positionFields.at(-2)[1], 'GENERAL ENG COMBUSTION:16');
  assert.equal(positionFields.at(-1)[1], 'TITLE');
  adapter.detach();
});