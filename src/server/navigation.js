const EARTH_RADIUS_NM = 3440.065;

function greatCircleDistanceNm(latitudeA, longitudeA, latitudeB, longitudeB) {
  if ([latitudeA, longitudeA, latitudeB, longitudeB].some((value) => value === null || value === undefined || value === '')) {
    return null;
  }
  const coordinates = [latitudeA, longitudeA, latitudeB, longitudeB].map(Number);
  if (!coordinates.every(Number.isFinite)
    || Math.abs(coordinates[0]) > 90
    || Math.abs(coordinates[2]) > 90
    || Math.abs(coordinates[1]) > 180
    || Math.abs(coordinates[3]) > 180) {
    return null;
  }

  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(coordinates[2] - coordinates[0]);
  const longitudeDelta = radians(coordinates[3] - coordinates[1]);
  const haversine = Math.min(1, Math.max(0, Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(coordinates[0])) * Math.cos(radians(coordinates[2]))
      * Math.sin(longitudeDelta / 2) ** 2));
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function calculateRequiredVerticalSpeed(distanceNm, groundSpeedKnots, currentAltitude, targetAltitude) {
  if ([distanceNm, groundSpeedKnots, currentAltitude, targetAltitude]
    .some((value) => value === null || value === undefined || value === '')) {
    return null;
  }
  const values = [distanceNm, groundSpeedKnots, currentAltitude, targetAltitude].map(Number);
  if (!values.every(Number.isFinite) || values[0] <= 0 || values[1] <= 0) {
    return null;
  }

  const travelTimeMinutes = (values[0] / values[1]) * 60;
  return Math.round((values[3] - values[2]) / travelTimeMinutes);
}

module.exports = { calculateRequiredVerticalSpeed, greatCircleDistanceNm };
