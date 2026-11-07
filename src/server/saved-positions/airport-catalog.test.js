const test = require('node:test');
const assert = require('node:assert/strict');
const { AirportCatalog } = require('./airport-catalog');

test('looks up an airport by its ICAO code without changing the stored airport', async () => {
  const catalog = new AirportCatalog('unused.csv');
  const airport = {
    latitude: 37.6213,
    longitude: -122.379,
    place: { icao: 'KSFO', name: 'San Francisco International Airport' },
  };
  catalog.airports = [airport];

  assert.equal(await catalog.findByCode('KSFO'), airport);
  assert.equal(await catalog.findByCode('KLAX'), null);
});

test('looks up an airport by its FAA local code, including 4K5', async () => {
  const catalog = new AirportCatalog('unused.csv');
  const airport = {
    latitude: 57.942094,
    longitude: -152.464314,
    place: { icao: null, ident: '4K5', localCode: '4K5', name: 'Ouzinkie Airport' },
  };
  catalog.airports = [airport];

  assert.equal(await catalog.findByCode('4k5'), airport);
  assert.equal(await catalog.findByCode('4K6'), null);
});
