const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const AIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const MAX_CATALOG_BYTES = 40 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_RADIUS_KM = 50;

class AirportCatalog {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.airports = null;
    this.loading = null;
  }

  async findNearby(latitude, longitude) {
    await this.load();
    return this.airports
      .map((airport) => ({ ...airport, distanceKm: distanceKm(latitude, longitude, airport.latitude, airport.longitude) }))
      .filter((airport) => airport.distanceKm <= SEARCH_RADIUS_KM)
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, 5)
      .map((airport) => ({
        place: airport.place,
        distanceKm: Math.round(airport.distanceKm * 100) / 100,
        confidence: airport.distanceKm <= 1 ? 'high' : airport.distanceKm <= 10 ? 'medium' : 'low',
      }));
  }

  async load() {
    if (this.airports) {
      return;
    }
    if (!this.loading) {
      this.loading = this.loadFromCacheOrNetwork().finally(() => {
        this.loading = null;
      });
    }
    this.airports = await this.loading;
  }

  async loadFromCacheOrNetwork() {
    let csv;
    try {
      const cache = await fs.promises.stat(this.cachePath);
      if (cache.size <= MAX_CATALOG_BYTES && Date.now() - cache.mtimeMs <= CACHE_MAX_AGE_MS) {
        csv = await fs.promises.readFile(this.cachePath, 'utf8');
      }
    } catch {}

    if (!csv) {
      const response = await fetch(AIRPORTS_URL, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        throw new Error(`Airport data request failed (${response.status})`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_CATALOG_BYTES) {
        throw new Error('Airport data is too large');
      }
      csv = bytes.toString('utf8');
      await fs.promises.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.promises.writeFile(this.cachePath, csv, 'utf8');
    }

    const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true });
    return rows.flatMap((row) => {
      if (!['large_airport', 'medium_airport', 'small_airport', 'seaplane_base'].includes(row.type)) {
        return [];
      }
      const latitude = Number(row.latitude_deg);
      const longitude = Number(row.longitude_deg);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }
      const code = /^[A-Z]{4}$/.test(row.gps_code || '') ? row.gps_code : /^[A-Z]{4}$/.test(row.ident || '') ? row.ident : null;
      const country = row.iso_country && /^[A-Z]{2}$/.test(row.iso_country)
        ? new Intl.DisplayNames(['en'], { type: 'region' }).of(row.iso_country)
        : null;
      return [{
        latitude,
        longitude,
        place: {
          icao: code,
          name: row.name || null,
          city: row.municipality || null,
          country: country || row.iso_country || null,
        },
      }];
    });
  }
}

function distanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

module.exports = { AirportCatalog, distanceKm };