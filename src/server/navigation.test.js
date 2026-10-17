const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRequiredVerticalSpeed, greatCircleDistanceNm } = require('./navigation');

test('calculates great-circle distance in nautical miles', () => {
  const distance = greatCircleDistanceNm(51.47, -0.4543, 40.6413, -73.7781);
  assert.ok(Math.abs(distance - 2990) < 5);
});

test('rejects invalid coordinates for great-circle distance', () => {
  assert.equal(greatCircleDistanceNm(91, 0, 0, 0), null);
  assert.equal(greatCircleDistanceNm(null, 0, 0, 0), null);
});

test('handles antipodal points without floating-point overflow', () => {
  assert.ok(Math.abs(greatCircleDistanceNm(0, 0, 0, 180) - Math.PI * 3440.065) < 1);
});

test('calculates the vertical speed required to meet the target altitude at arrival', () => {
  assert.equal(calculateRequiredVerticalSpeed(100, 120, 6000, 12000), 120);
  assert.equal(calculateRequiredVerticalSpeed(100, 120, 12000, 6000), -120);
});

test('does not calculate vertical speed without positive distance and groundspeed', () => {
  assert.equal(calculateRequiredVerticalSpeed(0, 120, 6000, 12000), null);
  assert.equal(calculateRequiredVerticalSpeed(100, 0, 6000, 12000), null);
  assert.equal(calculateRequiredVerticalSpeed(100, 120, null, 12000), null);
});
