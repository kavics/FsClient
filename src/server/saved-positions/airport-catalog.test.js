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
