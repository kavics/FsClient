const socket = io();
const map = L.map('map', { zoomControl: true });
const planFileInput = document.getElementById('plan-file');
const followInput = document.getElementById('follow-aircraft');
const connection = document.getElementById('connection');
const connectionLabel = document.getElementById('connection-label');
const message = document.getElementById('message');
const aircraftIcon = L.divIcon({
  className: '',
  html: '<div class="aircraft-marker" aria-label="Aktuális pozíció"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M15 2 18 3 19 12 28 18 28 21 19 18 19 25 23 28 23 30 16 28 9 30 9 28 13 25 13 18 4 21 4 18 13 12 14 3Z"/></svg></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők',
}).addTo(map);
map.setView([47.5, 19.0], 5);

let routeLayer = null;
let aircraftMarker = null;
let waypointLayer = null;
let hasPlan = false;
let hasFittedPlan = false;

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

function renderPosition(state) {
  if (!validPosition(state)) {
    document.getElementById('position').textContent = 'Nincs szimulátoradat';
    document.getElementById('altitude').textContent = '—';
    document.getElementById('heading').textContent = '—';
    if (aircraftMarker) {
      map.removeLayer(aircraftMarker);
      aircraftMarker = null;
    }
    hasFittedPlan = false;
    return;
  }

  const latitude = state.currentLatitude;
  const longitude = state.currentLongitude;
  document.getElementById('position').textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  document.getElementById('altitude').textContent = Number.isFinite(state.currentAltitude)
    ? `${Math.round(state.currentAltitude).toLocaleString('hu-HU')} ft`
    : '—';
  document.getElementById('heading').textContent = Number.isFinite(state.currentHeading)
    ? `${Math.round(state.currentHeading)}°`
    : '—';

  if (!aircraftMarker) {
    aircraftMarker = L.marker([latitude, longitude], { icon: aircraftIcon, zIndexOffset: 1000 })
      .bindTooltip('Aktuális pozíció')
      .addTo(map);
  } else {
    aircraftMarker.setLatLng([latitude, longitude]);
  }

  const markerElement = aircraftMarker.getElement()?.querySelector('.aircraft-marker');
  if (markerElement && Number.isFinite(state.currentHeading)) {
    markerElement.style.transform = `rotate(${state.currentHeading}deg)`;
  }

  if (hasPlan && !hasFittedPlan) {
    fitMapToContent();
  } else if (followInput.checked) {
    map.panTo([latitude, longitude]);
  }
}

function fitMapToContent() {
  const bounds = routeLayer?.getBounds();
  if (!bounds?.isValid()) {
    return;
  }
  if (aircraftMarker) {
    bounds.extend(aircraftMarker.getLatLng());
  }
  map.fitBounds(bounds, { padding: [32, 32], maxZoom: 9 });
  hasFittedPlan = Boolean(aircraftMarker);
}

function renderWaypoints(waypoints) {
  const waypointList = document.getElementById('waypoint-list');
  waypointList.replaceChildren(...waypoints.map((waypoint) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = waypoint.name;
    const coordinates = document.createElement('small');
    coordinates.textContent = `${waypoint.latitude.toFixed(4)}, ${waypoint.longitude.toFixed(4)}`;
    item.append(name, coordinates);
    return item;
  }));
  document.getElementById('waypoint-count').textContent = `${waypoints.length} útvonalpont`;
}

function displayPlan(waypoints, fileName) {
  if (routeLayer) map.removeLayer(routeLayer);
  if (waypointLayer) map.removeLayer(waypointLayer);

  const positions = waypoints.map(({ latitude, longitude }) => [latitude, longitude]);
  routeLayer = L.polyline(positions, { color: '#f4d36b', weight: 4, opacity: 0.9 }).addTo(map);
  waypointLayer = L.layerGroup(waypoints.map((waypoint, index) => L.circleMarker(
    [waypoint.latitude, waypoint.longitude],
    {
      radius: 5,
      color: '#f4d36b',
      weight: 2,
      fillColor: '#674b15',
      fillOpacity: 1,
      className: 'waypoint-dot',
    },
  ).bindTooltip(`${index + 1}. ${waypoint.name}`))).addTo(map);

  hasPlan = true;
  hasFittedPlan = false;
  document.getElementById('plan-name').textContent = fileName;
  renderWaypoints(waypoints);
  fitMapToContent();
  setMessage('A flight plan betöltve. Az aktuális pozíció a szimulátoradat megérkezésekor jelenik meg.');
}

planFileInput.addEventListener('change', async () => {
  const file = planFileInput.files?.[0];
  if (!file) return;

  try {
    const xml = await file.text();
    const waypoints = FlightPlanParser.parseFlightPlan(xml);
    displayPlan(waypoints, file.name);
  } catch (error) {
    setMessage(error.message || 'Nem sikerült betölteni a flight plant.', 'error');
  } finally {
    planFileInput.value = '';
  }
});

followInput.addEventListener('change', () => {
  if (followInput.checked && aircraftMarker) {
    map.panTo(aircraftMarker.getLatLng());
  }
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
