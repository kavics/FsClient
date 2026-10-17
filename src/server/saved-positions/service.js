const { randomUUID } = require('crypto');
const path = require('path');
const { AirportCatalog } = require('./airport-catalog');
const { createDatabase } = require('./database');
const { aircraftKeyFromTitle, makeExport, parseImport, validatePosition } = require('./domain');
const { SimConnectAdapter } = require('./simconnect-adapter');

const MAX_IMPORT_RECORDS = 5000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

function createSavedPositionsFeature(io, { dataDirectory, getAircraftTitle }) {
  const store = createDatabase(
    process.env.SAVED_POSITIONS_DB || path.join(dataDirectory, 'saved-positions.sqlite')
  );
  const adapter = new SimConnectAdapter();
  const airportCatalog = new AirportCatalog(path.join(dataDirectory, 'airports.csv'));
  const importPreviews = new Map();

  function getActiveAircraft() {
    const title = getAircraftTitle();
    if (!title || title === 'Unknown aircraft') {
      return { title: null, key: null };
    }
    return { title, key: aircraftKeyFromTitle(title) };
  }

  function status() {
    const aircraft = getActiveAircraft();
    const current = adapter.getCurrent(aircraft.title);
    return { ...current, aircraftKey: aircraft.key };
  }

  function sendStatus(socket) {
    socket.emit('savedPositions:status', status());
  }

  function sendList(socket) {
    const { key } = getActiveAircraft();
    socket.emit('savedPositions:list', key ? store.listByAircraft(key) : []);
  }

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function requireAircraft() {
    const aircraft = getActiveAircraft();
    if (!aircraft.key) {
      throw fail('AIRCRAFT_UNAVAILABLE', 'The active aircraft is not available');
    }
    return aircraft;
  }

  function requireStatus(condition) {
    const current = status();
    if (!current.simConnected || !current.fresh) {
      throw fail('SIMCONNECT_UNAVAILABLE', 'Fresh simulator data is not available');
    }
    if (!current[condition]) {
      throw fail(condition === 'canSave' ? 'SAVE_PRECONDITIONS_NOT_MET' : 'LOAD_PRECONDITIONS_NOT_MET',
        condition === 'canSave'
          ? 'The aircraft must be stationary on the ground, with parking brake set and engines off'
          : 'The aircraft must be stationary on the ground before loading');
    }
  }

  function bind(socket, eventName, operation) {
    socket.on(eventName, (payload = {}, acknowledge = () => {}) => {
      Promise.resolve()
        .then(() => operation(payload || {}))
        .then((result) => acknowledge({ ok: true, ...result }))
        .catch((error) => acknowledge({
          ok: false,
          error: {
            code: error.code || 'SAVED_POSITIONS_ERROR',
            message: error.message || 'Saved position operation failed',
          },
        }));
    });
  }

  io.on('connection', (socket) => {
    sendStatus(socket);
    sendList(socket);

    bind(socket, 'savedPositions:list', () => ({ positions: activeList() }));

    bind(socket, 'savedPositions:lookup', async () => {
      requireStatus('canSave');
      const current = status();
      try {
        const candidates = await airportCatalog.findNearby(current.position.latitude, current.position.longitude);
        return { candidates };
      } catch {
        return { candidates: [], warning: { code: 'AIRPORT_DATA_UNAVAILABLE', message: 'Airport suggestions are unavailable; a custom label can still be used.' } };
      }
    });

    bind(socket, 'savedPositions:save', (payload) => {
      const aircraft = requireAircraft();
      requireStatus('canSave');
      const snapshot = adapter.saveSnapshot(aircraft.title);
      const position = validatePosition({
        ...snapshot,
        label: payload.label,
        note: payload.note,
        place: payload.place,
      }, { allowId: false });
      const saved = store.insert(position);
      socket.emit('savedPositions:list', activeList());
      return { position: saved };
    });

    bind(socket, 'savedPositions:update', (payload) => {
      const aircraft = requireAircraft();
      if (typeof payload.id !== 'string') {
        throw fail('INVALID_REQUEST', 'A saved position ID is required');
      }
      const updated = store.update(payload.id, aircraft.key, {
        label: payload.label,
        note: payload.note,
        place: payload.place,
      });
      if (!updated) {
        throw fail('POSITION_NOT_FOUND', 'The saved position was not found for the active aircraft');
      }
      socket.emit('savedPositions:list', activeList());
      return { position: updated };
    });

    bind(socket, 'savedPositions:delete', (payload) => {
      const aircraft = requireAircraft();
      if (typeof payload.id !== 'string' || !store.delete(payload.id, aircraft.key)) {
        throw fail('POSITION_NOT_FOUND', 'The saved position was not found for the active aircraft');
      }
      socket.emit('savedPositions:list', activeList());
      return { deleted: true };
    });

    bind(socket, 'savedPositions:load', async (payload) => {
      const aircraft = requireAircraft();
      requireStatus('canLoad');
      if (typeof payload.id !== 'string' || payload.id.length > 80) {
        throw fail('INVALID_REQUEST', 'A saved position ID is required');
      }
      const saved = store.get(payload.id);
      if (!saved || saved.aircraftKey !== aircraft.key) {
        throw fail('POSITION_NOT_FOUND', 'The saved position does not belong to the active aircraft');
      }
      const verification = await adapter.load(saved, aircraft.title);
      return { position: saved, verification };
    });

    bind(socket, 'savedPositions:export', (payload) => {
      const aircraft = requireAircraft();
      const positions = activeList();
      if (Array.isArray(payload.ids)) {
        const requested = new Set(payload.ids);
        const selected = positions.filter((position) => requested.has(position.id));
        if (requested.size !== payload.ids.length || selected.length !== requested.size) {
          throw fail('INVALID_REQUEST', 'Export selection is invalid');
        }
        return { data: makeExport(selected) };
      }
      if (!aircraft.key) {
        throw fail('AIRCRAFT_UNAVAILABLE', 'The active aircraft is not available');
      }
      return { data: makeExport(positions) };
    });

    bind(socket, 'savedPositions:importPreview', (payload) => {
      const parsed = parseImport(payload.data);
      if (parsed.valid.length + parsed.invalid.length > MAX_IMPORT_RECORDS) {
        throw fail('IMPORT_TOO_LARGE', `Imports are limited to ${MAX_IMPORT_RECORDS} records`);
      }
      const conflicts = parsed.valid
        .filter(({ position }) => store.hasId(position.id))
        .map(({ position }) => ({ id: position.id, label: position.label }));
      const token = randomUUID();
      importPreviews.set(token, {
        positions: parsed.valid.map(({ position }) => position),
        conflicts: new Set(conflicts.map((conflict) => conflict.id)),
        expiresAt: Date.now() + PREVIEW_TTL_MS,
      });
      return {
        token,
        count: parsed.valid.length + parsed.invalid.length,
        validCount: parsed.valid.length,
        invalid: parsed.invalid,
        conflicts,
      };
    });

    bind(socket, 'savedPositions:import', (payload) => {
      const preview = importPreviews.get(payload.token);
      importPreviews.delete(payload.token);
      if (!preview || preview.expiresAt < Date.now()) {
        throw fail('IMPORT_PREVIEW_EXPIRED', 'Import preview expired; select the file again');
      }
      if (!payload.choices || typeof payload.choices !== 'object' || Array.isArray(payload.choices)) {
        throw fail('INVALID_REQUEST', 'Import conflict choices are required');
      }
      const toInsert = [];
      let skipped = 0;
      for (const position of preview.positions) {
        const conflict = preview.conflicts.has(position.id) || store.hasId(position.id);
        if (!conflict) {
          toInsert.push(position);
          continue;
        }
        const choice = payload.choices[position.id];
        if (choice === 'skip') {
          skipped += 1;
        } else if (choice === 'new') {
          toInsert.push(validatePosition({ ...position, id: undefined }));
        } else {
          throw fail('IMPORT_CONFLICT_CHOICE_REQUIRED', `Choose whether to skip or import as a new record: ${position.label}`);
        }
      }
      const imported = store.insertMany(toInsert);
      return { importedCount: imported.length, skippedCount: skipped };
    });
  });

  function activeList() {
    const { key } = getActiveAircraft();
    return key ? store.listByAircraft(key) : [];
  }

  const statusTimer = setInterval(() => {
    io.emit('savedPositions:status', status());
  }, 1000);
  statusTimer.unref?.();

  return {
    adapter,
    close() {
      clearInterval(statusTimer);
      store.close();
    },
    detach() {
      adapter.detach();
    },
    findAirportByCode(code) {
      return airportCatalog.findByCode(code);
    },
    attach(handle) {
      adapter.attach(handle);
    },
  };
}

module.exports = { createSavedPositionsFeature };