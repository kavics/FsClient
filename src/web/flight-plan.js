const socket = io();
const map = L.map('map', { zoomControl: true, preferCanvas: true });
const routeForm = document.getElementById('route-form');
const originInput = document.getElementById('origin-code');
const destinationInput = document.getElementById('destination-code');
const showRouteButton = document.getElementById('show-route');
const connection = document.getElementById('connection');
const connectionLabel = document.getElementById('connection-label');
const message = document.getElementById('message');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők',
}).addTo(map);
map.setView([47.5, 19.0], 5);

const HISTORY_SAMPLE_INTERVAL_MS = 1000;
const HISTORY_DURATION_MS = 2 * 60 * 60 * 1000;
const HISTORY_LIMIT = HISTORY_DURATION_MS / HISTORY_SAMPLE_INTERVAL_MS + 1;
const historyRenderer = L.canvas({ padding: 0.5 });
let routeLayer = null;
let airportLayer = null;
let aircraftMarker = null;
let currentPosition = null;
let currentDestination = null;
let routeRequestId = 0;
let lastHistorySample = null;
const historyPoints = [];

function setMessage(text, kind = '') {
  message.textContent = text;
  message.dataset.kind = kind;
}

function validPosition(state) {
  return Number.isFinite(state.currentLatitude)
    && Number.isFinite(state.currentLongitude)
    && Math.abs(state.currentLatitude) <= 90
    && Math.abs(state.currentLongitude) <= 180;
}

function distanceNm(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeA = radians(first.latitude);
  const latitudeB = radians(second.latitude);
  const latitudeDelta = latitudeB - latitudeA;
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine = Math.min(1, Math.max(0, Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2));
  return 3440.065 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function altitudeColor(altitude) {
  const ratio = Math.min(1, Math.max(0, (Number(altitude) || 0) / 30000));
  const stops = [
    { at: 0, rgb: [45, 205, 115] },
    { at: 0.5, rgb: [255, 211, 74] },
    { at: 1, rgb: [239, 76, 76] },
  ];
  const lower = ratio <= 0.5 ? stops[0] : stops[1];
  const upper = ratio <= 0.5 ? stops[1] : stops[2];
  const fraction = (ratio - lower.at) / (upper.at - lower.at);
  const rgb = lower.rgb.map((value, index) => Math.round(value + (upper.rgb[index] - value) * fraction));
  return `rgb(${rgb.join(',')})`;
}

function drawHistorySegment(first, second) {
  const color = altitudeColor((first.altitude + second.altitude) / 2);
  return L.polyline(
    [[first.latitude, first.longitude], [second.latitude, second.longitude]],
    { color, weight: 3, opacity: 0.9, lineCap: 'round', interactive: false, renderer: historyRenderer },
  ).addTo(map);
}

function trimHistory(now) {
  const oldestAllowedTime = now - HISTORY_DURATION_MS;
  while (historyPoints.length > HISTORY_LIMIT
    || (historyPoints[0] && historyPoints[0].time < oldestAllowedTime)) {
    const oldest = historyPoints.shift();
    if (oldest.segment) map.removeLayer(oldest.segment);
    if (oldest.marker) map.removeLayer(oldest.marker);
    if (historyPoints[0]?.segment) {
      map.removeLayer(historyPoints[0].segment);
      historyPoints[0].segment = null;
    }
  }
}

function addHistorySample(position, altitude) {
  const now = Date.now();
  if (lastHistorySample && now - lastHistorySample.time < HISTORY_SAMPLE_INTERVAL_MS) {
    return;
  }

  const sample = { ...position, altitude, time: now, marker: null, segment: null };
  if (lastHistorySample && now - lastHistorySample.time <= HISTORY_SAMPLE_INTERVAL_MS * 2) {
    sample.segment = drawHistorySegment(lastHistorySample, sample);
  }
  const color = altitudeColor(altitude);
  sample.marker = L.circleMarker([position.latitude, position.longitude], {
    radius: 4,
    color,
    weight: 1,
    fillColor: color,
    fillOpacity: 1,
    interactive: false,
    renderer: historyRenderer,
  }).addTo(map);
  historyPoints.push(sample);
  lastHistorySample = sample;
  trimHistory(now);
}

function renderPosition(state) {
  const aircraft = state.aircraft || {};
  document.getElementById('aircraft-type').textContent = aircraft.type || '—';
  document.getElementById('callsign').textContent = aircraft.callsign || '—';
  document.getElementById('aircraft-id').textContent = aircraft.identifier || '—';

  if (!validPosition(state)) {
    currentPosition = null;
    lastHistorySample = null;
    document.getElementById('position').textContent = 'Nincs szimulátoradat';
    document.getElementById('altitude').textContent = '—';
    document.getElementById('heading').textContent = '—';
    document.getElementById('distance').textContent = '—';
    if (aircraftMarker) {
      map.removeLayer(aircraftMarker);
      aircraftMarker = null;
    }
    return;
  }

  const position = { latitude: state.currentLatitude, longitude: state.currentLongitude };
  const altitude = Number.isFinite(state.currentAltitude) ? state.currentAltitude : 0;
  currentPosition = position;
  addHistorySample(position, altitude);
  document.getElementById('position').textContent = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
  document.getElementById('altitude').textContent = Number.isFinite(state.currentAltitude)
    ? `${Math.round(state.currentAltitude).toLocaleString('hu-HU')} ft`
    : '—';
  document.getElementById('heading').textContent = Number.isFinite(state.currentHeading)
    ? `${Math.round(state.currentHeading)}°`
    : '—';
  document.getElementById('distance').textContent = currentDestination
    ? `${distanceNm(position, currentDestination).toFixed(1)} NM`
    : '—';

  if (!aircraftMarker) {
    const aircraftIcon = L.divIcon({
      className: 'aircraft-icon-wrap',
      html: '<div class="aircraft-marker" aria-label="Aktuális pozíció"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M15 2 18 3 19 12 28 18 28 21 19 18 19 25 23 28 23 30 16 28 9 30 9 28 13 25 13 18 4 21 4 18 13 12 14 3Z"/></svg></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    aircraftMarker = L.marker([position.latitude, position.longitude], { icon: aircraftIcon, zIndexOffset: 1000 })
      .bindTooltip('Aktuális pozíció')
      .addTo(map);
  } else {
    aircraftMarker.setLatLng([position.latitude, position.longitude]);
  }

  const markerElement = aircraftMarker.getElement()?.querySelector('.aircraft-marker');
  if (markerElement && Number.isFinite(state.currentHeading)) {
    markerElement.style.transform = `rotate(${state.currentHeading}deg)`;
  }

}

function renderRoute(route) {
  if (routeLayer) map.removeLayer(routeLayer);
  if (airportLayer) map.removeLayer(airportLayer);

  const start = route.origin;
  const destination = route.destination;
  routeLayer = L.polyline(
    [[start.latitude, start.longitude], [destination.latitude, destination.longitude]],
    {
      color: '#000000',
      weight: 3,
      opacity: 0.95,
      dashArray: '3 5',
      lineCap: 'round',
      interactive: false,
    },
  ).addTo(map);

  airportLayer = L.layerGroup([
    L.circleMarker([start.latitude, start.longitude], {
      radius: 7, color: '#e8f4ec', weight: 2, fillColor: '#34bd78', fillOpacity: 1,
    }).bindTooltip(`Indulás: ${start.code} · ${start.name}`),
    L.circleMarker([destination.latitude, destination.longitude], {
      radius: 7, color: '#e8f4ec', weight: 2, fillColor: '#ed6868', fillOpacity: 1,
    }).bindTooltip(`Cél: ${destination.code} · ${destination.name}`),
  ]).addTo(map);
  currentDestination = destination;
  if (currentPosition) {
    document.getElementById('distance').textContent = `${distanceNm(currentPosition, destination).toFixed(1)} NM`;
  }
  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40], maxZoom: 9 });
}

routeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const originCode = originInput.value.trim().toUpperCase();
  const destinationCode = destinationInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(originCode) || !/^[A-Z0-9]{3,4}$/.test(destinationCode)) {
    setMessage('Mindkét mezőbe 3 vagy 4 karakteres repülőtér-kódot írj.', 'error');
    return;
  }

  const requestId = ++routeRequestId;
  showRouteButton.disabled = true;
  currentDestination = null;
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (airportLayer) {
    map.removeLayer(airportLayer);
    airportLayer = null;
  }
  document.getElementById('distance').textContent = '—';
  setMessage('Repülőterek keresése…');
  socket.emit('flightRoute:resolve', { originCode, destinationCode }, (result) => {
    if (requestId !== routeRequestId) return;
    showRouteButton.disabled = false;
    if (!result?.ok) {
      setMessage(result?.error || 'Nem sikerült feloldani a repülőtereket.', 'error');
      return;
    }

    renderRoute(result);
    setMessage(`${result.origin.code} → ${result.destination.code} útvonala megjelenítve.`);
  });
});

socket.on('connect', () => {
  connection.dataset.state = 'connected';
  connectionLabel.textContent = 'Szerverhez kapcsolódva';
});
socket.on('disconnect', () => {
  connection.dataset.state = 'disconnected';
  connectionLabel.textContent = 'Szerverkapcsolat megszakadt';
});
socket.on('state', renderPosition);
