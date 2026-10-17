const { randomUUID } = require('crypto');

const EXPORT_VERSION = 1;
const MAX_NOTE_LENGTH = 2000;

function validationError(message, code = 'INVALID_POSITION') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function optionalText(value, maxLength, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw validationError(`${field} is invalid`);
  }
  const text = value.trim();
  return text || null;
}

function finiteNumber(value, minimum, maximum, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw validationError(`${field} is outside the supported range`);
  }
  return number;
}

function normalizePlace(place) {
  if (place === undefined || place === null) {
    return null;
  }
  if (typeof place !== 'object' || Array.isArray(place)) {
    throw validationError('Airport details are invalid');
  }
  const normalized = {
    icao: optionalText(place.icao, 8, 'ICAO')?.toUpperCase() || null,
    name: optionalText(place.name, 200, 'Airport name'),
    city: optionalText(place.city, 120, 'City'),
    country: optionalText(place.country, 120, 'Country'),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function validatePosition(input, { allowId = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Position record is invalid');
  }
  const id = allowId && typeof input.id === 'string' && input.id.trim()
    ? input.id.trim()
    : randomUUID();
  if (id.length > 80) {
    throw validationError('Position ID is invalid');
  }

  const aircraftKey = optionalText(input.aircraftKey, 256, 'Aircraft key');
  const aircraftTitle = optionalText(input.aircraftTitle, 256, 'Aircraft title');
  const label = optionalText(input.label, 120, 'Label');
  if (!aircraftKey || !aircraftTitle || !label) {
    throw validationError('Aircraft and label are required');
  }

  const createdAt = input.createdAt || new Date().toISOString();
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw validationError('Creation date is invalid');
  }
  const position = input.position;
  const orientation = input.orientation;
  if (!position || !orientation) {
    throw validationError('Position and orientation are required');
  }

  return {
    id,
    aircraftKey,
    aircraftTitle,
    label,
    note: optionalText(input.note, MAX_NOTE_LENGTH, 'Note'),
    createdAt: new Date(createdAt).toISOString(),
    place: normalizePlace(input.place),
    position: {
      latitude: finiteNumber(position.latitude, -90, 90, 'Latitude'),
      longitude: finiteNumber(position.longitude, -180, 180, 'Longitude'),
      altitudeMslMeters: finiteNumber(position.altitudeMslMeters, -1000, 100000, 'Altitude'),
      groundElevationMslMeters: position.groundElevationMslMeters === null || position.groundElevationMslMeters === undefined
        ? null
        : finiteNumber(position.groundElevationMslMeters, -1000, 100000, 'Ground elevation'),
    },
    orientation: {
      headingTrue: finiteNumber(orientation.headingTrue, 0, 360, 'Heading'),
      pitch: finiteNumber(orientation.pitch, -90, 90, 'Pitch'),
      bank: finiteNumber(orientation.bank, -180, 180, 'Bank'),
    },
  };
}

function aircraftKeyFromTitle(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function toDatabaseRow(position) {
  return {
    id: position.id,
    aircraft_key: position.aircraftKey,
    aircraft_title: position.aircraftTitle,
    label: position.label,
    note: position.note,
    created_at: position.createdAt,
    latitude: position.position.latitude,
    longitude: position.position.longitude,
    altitude_msl_meters: position.position.altitudeMslMeters,
    ground_elevation_msl_meters: position.position.groundElevationMslMeters,
    heading_true: position.orientation.headingTrue,
    pitch: position.orientation.pitch,
    bank: position.orientation.bank,
    airport_icao: position.place?.icao || null,
    airport_name: position.place?.name || null,
    airport_city: position.place?.city || null,
    airport_country: position.place?.country || null,
  };
}

function fromDatabaseRow(row) {
  return validatePosition({
    id: row.id,
    aircraftKey: row.aircraft_key,
    aircraftTitle: row.aircraft_title,
    label: row.label,
    note: row.note,
    createdAt: row.created_at,
    position: {
      latitude: row.latitude,
      longitude: row.longitude,
      altitudeMslMeters: row.altitude_msl_meters,
      groundElevationMslMeters: row.ground_elevation_msl_meters,
    },
    orientation: {
      headingTrue: row.heading_true,
      pitch: row.pitch,
      bank: row.bank,
    },
    place: {
      icao: row.airport_icao,
      name: row.airport_name,
      city: row.airport_city,
      country: row.airport_country,
    },
  });
}

function makeExport(positions) {
  return {
    format: 'fsclient-saved-positions',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    positions: positions.map((position) => validatePosition(position)),
  };
}

function parseImport(data) {
  if (!data || data.format !== 'fsclient-saved-positions' || data.version !== EXPORT_VERSION || !Array.isArray(data.positions)) {
    throw validationError('Unsupported saved positions export format', 'INVALID_IMPORT');
  }

  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const [index, item] of data.positions.entries()) {
    try {
      const position = validatePosition(item);
      if (seen.has(position.id)) {
        throw validationError('Duplicate ID in import file', 'DUPLICATE_IMPORT_ID');
      }
      seen.add(position.id);
      valid.push({ index, position });
    } catch (error) {
      invalid.push({ index, message: error.message });
    }
  }
  return { valid, invalid };
}

module.exports = {
  EXPORT_VERSION,
  MAX_NOTE_LENGTH,
  aircraftKeyFromTitle,
  fromDatabaseRow,
  makeExport,
  parseImport,
  toDatabaseRow,
  validatePosition,
};