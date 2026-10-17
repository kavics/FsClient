const {
  InitPosition,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} = require('node-simconnect');
const { aircraftKeyFromTitle } = require('./domain');

const REQUEST_ID = 700;
const DEFINITION_ID = 700;
const SET_DEFINITION_ID = 701;
const MAX_ENGINES = 16;
const MAX_SAMPLE_AGE_MS = 2500;
const STATIONARY_WINDOW_MS = 3000;
const SPEED_LIMIT_METERS_PER_SECOND = 0.3;
const METERS_TO_FEET = 3.280839895;

function conditionStatus(sample, history, now = Date.now()) {
  const fresh = sample && now - sample.receivedAt <= MAX_SAMPLE_AGE_MS;
  const onGround = fresh && typeof sample.onGround === 'boolean' ? sample.onGround : null;
  const parkingBrake = fresh && typeof sample.parkingBrake === 'boolean' ? sample.parkingBrake : null;
  const engineCount = sample?.engineCount;
  const enginesOff = fresh && Number.isInteger(engineCount) && engineCount >= 0 && engineCount <= MAX_ENGINES
    && Array.isArray(sample.engines) && sample.engines.length >= engineCount
    ? sample.engines.slice(0, engineCount).every((running) => typeof running === 'boolean' && !running)
    : null;

  let stationary = null;
  if (fresh && Number.isFinite(sample.groundSpeedMetersPerSecond)) {
    const recent = history.filter((entry) => now - entry.receivedAt <= STATIONARY_WINDOW_MS);
    const coversWindow = recent.length >= 3
      && recent[0].receivedAt <= now - STATIONARY_WINDOW_MS + 1000
      && recent.every((entry) => entry.groundSpeedMetersPerSecond <= SPEED_LIMIT_METERS_PER_SECOND)
      && recent.every((entry, index) => index === 0 || entry.receivedAt - recent[index - 1].receivedAt <= 1500);
    stationary = sample.groundSpeedMetersPerSecond <= SPEED_LIMIT_METERS_PER_SECOND && coversWindow;
  }

  return {
    connected: Boolean(fresh),
    fresh: Boolean(fresh),
    conditions: { onGround, stationary, parkingBrake, enginesOff },
    canSave: Boolean(fresh && onGround === true && stationary === true && parkingBrake === true && enginesOff === true),
    canLoad: Boolean(fresh && onGround === true && stationary === true),
  };
}

function toInitPosition(snapshot) {
  const initPosition = new InitPosition();
  initPosition.latitude = snapshot.position.latitude;
  initPosition.longitude = snapshot.position.longitude;
  initPosition.altitude = snapshot.position.altitudeMslMeters * METERS_TO_FEET;
  initPosition.pitch = snapshot.orientation.pitch;
  initPosition.bank = snapshot.orientation.bank;
  initPosition.heading = snapshot.orientation.headingTrue;
  initPosition.onGround = true;
  initPosition.airspeed = 0;
  return initPosition;
}

class SimConnectAdapter {
  constructor() {
    this.handle = null;
    this.sample = null;
    this.history = [];
    this.pendingReadback = null;
    this.onData = this.onData.bind(this);
  }

  attach(handle) {
    this.detach();
    this.handle = handle;
    const definitions = [
      ['PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64],
      ['PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64],
      ['PLANE ALTITUDE', 'meters', SimConnectDataType.FLOAT64],
      ['PLANE PITCH DEGREES', 'degrees', SimConnectDataType.FLOAT64],
      ['PLANE BANK DEGREES', 'degrees', SimConnectDataType.FLOAT64],
      ['PLANE HEADING DEGREES TRUE', 'degrees', SimConnectDataType.FLOAT64],
      ['GROUND ALTITUDE', 'meters', SimConnectDataType.FLOAT64],
      ['GROUND VELOCITY', 'meters per second', SimConnectDataType.FLOAT64],
      ['NUMBER OF ENGINES', 'Number', SimConnectDataType.INT32],
      ['SIM ON GROUND', 'Bool', SimConnectDataType.INT32],
      ['BRAKE PARKING POSITION', 'Bool', SimConnectDataType.INT32],
    ];
    definitions.forEach(([name, units, dataType]) => {
      handle.addToDataDefinition(DEFINITION_ID, name, units, dataType);
    });
    for (let index = 1; index <= MAX_ENGINES; index += 1) {
      handle.addToDataDefinition(
        DEFINITION_ID,
        `GENERAL ENG COMBUSTION:${index}`,
        'Bool',
        SimConnectDataType.INT32
      );
    }
    handle.addToDataDefinition(DEFINITION_ID, 'TITLE', '', SimConnectDataType.STRING256);
    handle.addToDataDefinition(SET_DEFINITION_ID, 'Initial Position', null, SimConnectDataType.INITPOSITION);
    handle.on('simObjectData', this.onData);
    handle.requestDataOnSimObject(
      REQUEST_ID,
      DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND
    );
  }

  detach() {
    if (this.handle) {
      this.handle.off('simObjectData', this.onData);
    }
    this.handle = null;
    this.sample = null;
    this.history = [];
    this.pendingReadback?.reject(new Error('SimConnect connection closed'));
    this.pendingReadback = null;
  }

  onData(received) {
    if (received.requestID !== REQUEST_ID) {
      return;
    }
    const data = received.data;
    const next = {
      latitude: data.readFloat64(),
      longitude: data.readFloat64(),
      altitudeMslMeters: data.readFloat64(),
      pitch: data.readFloat64(),
      bank: data.readFloat64(),
      headingTrue: data.readFloat64(),
      groundElevationMslMeters: readOptionalNumber(data.readFloat64()),
      groundSpeedMetersPerSecond: data.readFloat64(),
      engineCount: data.readInt32(),
      onGround: readBoolean(data.readInt32()),
      parkingBrake: readBoolean(data.readInt32()),
      engines: Array.from({ length: MAX_ENGINES }, () => readBoolean(data.readInt32())),
      aircraftTitle: data.readString256().trim(),
      receivedAt: Date.now(),
    };
    if (!isValidSample(next)) {
      return;
    }
    next.aircraftKey = aircraftKeyFromTitle(next.aircraftTitle);
    if (this.sample && this.sample.aircraftKey !== next.aircraftKey) {
      this.history = [];
    }
    this.sample = next;
    this.history.push(next);
    this.history = this.history.filter((entry) => next.receivedAt - entry.receivedAt <= STATIONARY_WINDOW_MS + 1000);
    this.checkReadback(next);
  }

  getCurrent(aircraftTitle) {
    const status = conditionStatus(this.sample, this.history);
    const aircraftKey = aircraftKeyFromTitle(aircraftTitle);
    const matchesAircraft = Boolean(status.fresh && aircraftKey && this.sample.aircraftKey === aircraftKey);
    return {
      ...status,
      simConnected: Boolean(this.handle),
      connected: Boolean(this.handle),
      aircraftTitle: aircraftTitle || null,
      aircraftKey,
      fresh: matchesAircraft,
      conditions: matchesAircraft ? status.conditions : { onGround: null, stationary: null, parkingBrake: null, enginesOff: null },
      canSave: matchesAircraft && status.canSave,
      canLoad: matchesAircraft && status.canLoad,
      sampleAt: matchesAircraft ? new Date(this.sample.receivedAt).toISOString() : null,
      position: matchesAircraft ? {
        latitude: this.sample.latitude,
        longitude: this.sample.longitude,
        altitudeMslMeters: this.sample.altitudeMslMeters,
        groundElevationMslMeters: this.sample.groundElevationMslMeters,
      } : null,
      orientation: matchesAircraft ? {
        headingTrue: normalizeHeading(this.sample.headingTrue),
        pitch: this.sample.pitch,
        bank: this.sample.bank,
      } : null,
    };
  }

  saveSnapshot(aircraftTitle) {
    const current = this.getCurrent(aircraftTitle);
    if (!this.handle || !current.canSave || !current.aircraftKey) {
      const error = new Error('The aircraft is not ready to save');
      error.code = 'SAVE_PRECONDITIONS_NOT_MET';
      throw error;
    }
    return {
      aircraftKey: current.aircraftKey,
      aircraftTitle,
      createdAt: new Date().toISOString(),
      position: current.position,
      orientation: current.orientation,
    };
  }

  async load(snapshot, aircraftTitle) {
    const current = this.getCurrent(aircraftTitle);
    if (!this.handle || !current.canLoad) {
      const error = new Error('The aircraft must be stationary on the ground before loading');
      error.code = 'LOAD_PRECONDITIONS_NOT_MET';
      throw error;
    }
    if (snapshot.aircraftKey !== current.aircraftKey) {
      const error = new Error('The saved position belongs to a different aircraft');
      error.code = 'AIRCRAFT_MISMATCH';
      throw error;
    }

    const requested = toInitPosition(snapshot);
    const sendId = this.handle.setDataOnSimObject(
      SET_DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      [requested]
    );
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingReadback = null;
        const error = new Error('The simulator did not confirm the restored position');
        error.code = 'POSITION_READBACK_TIMEOUT';
        reject(error);
      }, 15000);
      this.pendingReadback = {
        sentAt: Date.now(),
        snapshot,
        sendId,
        resolve: (result) => {
          clearTimeout(timeout);
          this.pendingReadback = null;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
    });
  }

  checkReadback(sample) {
    const pending = this.pendingReadback;
    if (!pending || sample.receivedAt <= pending.sentAt) {
      return;
    }
    const target = pending.snapshot;
    const matches = Math.abs(sample.latitude - target.position.latitude) <= 0.0001
      && Math.abs(sample.longitude - target.position.longitude) <= 0.0001
      && Math.abs(sample.altitudeMslMeters - target.position.altitudeMslMeters) <= 5
      && angleDifference(sample.headingTrue, target.orientation.headingTrue) <= 2
      && Math.abs(sample.pitch - target.orientation.pitch) <= 2
      && Math.abs(sample.bank - target.orientation.bank) <= 2;
    if (matches) {
      pending.resolve({ verified: true, sampleAt: new Date(sample.receivedAt).toISOString() });
    } else if (Date.now() - pending.sentAt > 8000) {
      const error = new Error('The simulator position did not match the saved position after loading');
      error.code = 'POSITION_READBACK_MISMATCH';
      pending.reject(error);
    }
  }
}

function readBoolean(value) {
  return value === 0 || value === 1 ? value === 1 : null;
}

function readOptionalNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function isValidSample(sample) {
  return [sample.latitude, sample.longitude, sample.altitudeMslMeters, sample.pitch, sample.bank,
    sample.headingTrue, sample.groundSpeedMetersPerSecond]
    .every(Number.isFinite)
    && sample.latitude >= -90 && sample.latitude <= 90
    && sample.longitude >= -180 && sample.longitude <= 180
    && typeof sample.aircraftTitle === 'string' && sample.aircraftTitle.trim().length > 0
    && Number.isInteger(sample.engineCount) && sample.engineCount >= 0 && sample.engineCount <= MAX_ENGINES;
}

function normalizeHeading(value) {
  return ((value % 360) + 360) % 360;
}

function angleDifference(first, second) {
  return Math.abs(((first - second + 540) % 360) - 180);
}

module.exports = {
  MAX_SAMPLE_AGE_MS,
  SimConnectAdapter,
  SPEED_LIMIT_METERS_PER_SECOND,
  STATIONARY_WINDOW_MS,
  conditionStatus,
  toInitPosition,
};