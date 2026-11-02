(function exposeFlightPlanParser(root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = parser;
  }
  if (root) {
    root.FlightPlanParser = parser;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function parseCoordinatePair(value) {
    const decimal = value.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*,.*)?$/);
    if (decimal) {
      return { latitude: Number(decimal[1]), longitude: Number(decimal[2]) };
    }

    const dms = value.match(/^\s*([NS])\s*(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:\.\d+)?)\s*"?\s*,\s*([EW])\s*(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:\.\d+)?)\s*"?/i);
    if (!dms) {
      return null;
    }

    if ([dms[3], dms[4], dms[7], dms[8]].some((part) => Number(part) >= 60)) {
      return null;
    }

    const toDecimal = (degrees, minutes, seconds, negative) => {
      const coordinate = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
      return negative ? -coordinate : coordinate;
    };
    return {
      latitude: toDecimal(dms[2], dms[3], dms[4], dms[1].toUpperCase() === 'S'),
      longitude: toDecimal(dms[6], dms[7], dms[8], dms[5].toUpperCase() === 'W'),
    };
  }

  function parseFlightPlan(xml, Parser = globalThis.DOMParser) {
    if (typeof xml !== 'string' || !xml.trim()) {
      throw new Error('A kiválasztott fájl üres.');
    }
    if (typeof Parser !== 'function') {
      throw new Error('A böngésző nem támogatja az XML flight plan feldolgozását.');
    }

    const document = new Parser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) {
      throw new Error('A fájl nem érvényes XML flight plan.');
    }

    const waypoints = [...document.getElementsByTagName('ATCWaypoint')].map((element, index) => {
      const position = element.getElementsByTagName('WorldPosition')[0]?.textContent?.trim() || '';
      const coordinates = parseCoordinatePair(position);
      if (!coordinates
        || !Number.isFinite(coordinates.latitude)
        || !Number.isFinite(coordinates.longitude)
        || Math.abs(coordinates.latitude) > 90
        || Math.abs(coordinates.longitude) > 180) {
        throw new Error(`Nem értelmezhető a(z) ${index + 1}. útvonalpont koordinátája.`);
      }
      return {
        name: element.getAttribute('id')?.trim() || `Útvonalpont ${index + 1}`,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
    });

    if (waypoints.length < 2) {
      throw new Error('A flight plan legalább két koordinátás útvonalpontot tartalmazzon.');
    }
    return waypoints;
  }

  return { parseFlightPlan };
}));
