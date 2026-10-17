const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { fromDatabaseRow, toDatabaseRow, validatePosition } = require('./domain');

const SCHEMA_VERSION = 1;

function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion > SCHEMA_VERSION) {
    db.close();
    throw new Error(`Saved positions database version ${currentVersion} is newer than supported`);
  }
  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE saved_positions (
          id TEXT PRIMARY KEY,
          aircraft_key TEXT NOT NULL,
          aircraft_title TEXT NOT NULL,
          label TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          altitude_msl_meters REAL NOT NULL,
          ground_elevation_msl_meters REAL,
          heading_true REAL NOT NULL,
          pitch REAL NOT NULL,
          bank REAL NOT NULL,
          airport_icao TEXT,
          airport_name TEXT,
          airport_city TEXT,
          airport_country TEXT
        );
        CREATE INDEX saved_positions_aircraft_created
          ON saved_positions (aircraft_key, created_at DESC);
        CREATE INDEX saved_positions_created
          ON saved_positions (created_at DESC);
      `);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
  }

  const insertStatement = db.prepare(`
    INSERT INTO saved_positions (
      id, aircraft_key, aircraft_title, label, note, created_at,
      latitude, longitude, altitude_msl_meters, ground_elevation_msl_meters,
      heading_true, pitch, bank, airport_icao, airport_name, airport_city, airport_country
    ) VALUES (
      @id, @aircraft_key, @aircraft_title, @label, @note, @created_at,
      @latitude, @longitude, @altitude_msl_meters, @ground_elevation_msl_meters,
      @heading_true, @pitch, @bank, @airport_icao, @airport_name, @airport_city, @airport_country
    )
  `);

  function insert(position) {
    const validated = validatePosition(position);
    insertStatement.run(toDatabaseRow(validated));
    return validated;
  }

  const insertMany = db.transaction((positions) => positions.map(insert));
  const selectById = db.prepare('SELECT * FROM saved_positions WHERE id = ?');
  const selectByAircraft = db.prepare('SELECT * FROM saved_positions WHERE aircraft_key = ? ORDER BY created_at DESC');
  const deleteStatement = db.prepare('DELETE FROM saved_positions WHERE id = ? AND aircraft_key = ?');
  const updateStatement = db.prepare(`
    UPDATE saved_positions SET label = @label, note = @note,
      airport_icao = @airport_icao, airport_name = @airport_name,
      airport_city = @airport_city, airport_country = @airport_country
    WHERE id = @id AND aircraft_key = @aircraft_key
  `);
  const deleteRecord = db.transaction((id, aircraftKey) => deleteStatement.run(id, aircraftKey).changes > 0);
  const updateRecord = db.transaction((id, aircraftKey, changes) => {
    const existing = selectById.get(id);
    if (!existing || existing.aircraft_key !== aircraftKey) {
      return null;
    }
    const updated = validatePosition({
      ...fromDatabaseRow(existing),
      label: changes.label,
      note: changes.note,
      place: changes.place,
    });
    updateStatement.run(toDatabaseRow(updated));
    return updated;
  });

  return {
    close: () => db.close(),
    delete: (id, aircraftKey) => deleteRecord(id, aircraftKey),
    get: (id) => {
      const row = selectById.get(id);
      return row ? fromDatabaseRow(row) : null;
    },
    insert: (position) => db.transaction(() => insert(position))(),
    insertMany: (positions) => insertMany(positions),
    listByAircraft: (aircraftKey) => selectByAircraft.all(aircraftKey).map(fromDatabaseRow),
    update: (id, aircraftKey, changes) => updateRecord(id, aircraftKey, changes),
    hasId: (id) => Boolean(selectById.get(id)),
    version: SCHEMA_VERSION,
  };
}

module.exports = { createDatabase, SCHEMA_VERSION };