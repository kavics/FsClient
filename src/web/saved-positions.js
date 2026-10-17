const socket = io();
const byId = (id) => document.getElementById(id);
const state = {
  status: null,
  positions: [],
  selectedId: null,
  candidates: [],
  preview: null,
  aircraftKey: null,
  lookupAttemptedFor: null,
  noticeTimer: null,
};

const conditionsElement = byId('conditions');
const connectionElement = byId('connection');
const saveButton = byId('save-button');
const positionList = byId('position-list');
const positionDetail = byId('position-detail');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function request(eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('The application server is not connected'));
      return;
    }
    socket.emit(eventName, payload, (response) => {
      if (!response?.ok) {
        const error = new Error(response?.error?.message || 'Operation failed');
        error.code = response?.error?.code;
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

function notify(message, kind = 'success') {
  const notice = byId('notice');
  notice.textContent = message;
  notice.dataset.kind = kind;
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => {
    notice.textContent = '';
    delete notice.dataset.kind;
  }, 5000);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Unknown date';
}

function formatCoordinate(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'Unknown';
}

function updateConnection() {
  const status = state.status;
  let label = 'Simulator offline';
  let connectionState = 'disconnected';
  if (!socket.connected) {
    label = 'Server offline';
  } else if (status?.simConnected) {
    connectionState = 'connected';
    label = status.fresh ? 'Simulator connected' : 'Waiting for fresh data';
  } else if (socket.connected) {
    connectionState = 'unknown';
    label = 'Waiting for simulator';
  }
  connectionElement.dataset.state = connectionState;
  byId('connection-label').textContent = label;
  byId('aircraft-title').textContent = status?.aircraftTitle || 'Waiting for simulator';
  byId('sample-time').textContent = status?.sampleAt
    ? `Fresh sample ${formatDate(status.sampleAt)}`
    : 'Simulator data unavailable';
}

function renderConditions() {
  const labels = [
    ['onGround', 'On ground'],
    ['stationary', 'Stationary'],
    ['parkingBrake', 'Parking brake'],
    ['enginesOff', 'All engines off'],
  ];
  const conditions = state.status?.conditions || {};
  conditionsElement.replaceChildren(...labels.map(([key, label]) => {
    const value = conditions[key];
    const condition = element('div', 'condition');
    condition.dataset.state = value === null || value === undefined ? 'unknown' : value ? 'ready' : 'blocked';
    condition.append(element('span', 'condition-mark'));
    const copy = element('div', 'condition-copy');
    copy.append(element('span', '', label));
    copy.append(element('strong', '', value === null || value === undefined ? 'Unknown' : value ? 'Ready' : 'Not ready'));
    condition.append(copy);
    return condition;
  }));
  saveButton.disabled = !state.status?.canSave;
  byId('export-button').disabled = state.positions.length === 0;
  const loadButton = positionDetail.querySelector('[data-load]');
  if (loadButton) loadButton.disabled = !state.status?.canLoad;
}

function clearAirportFields() {
  byId('airport-icao').value = '';
  byId('airport-name').value = '';
  byId('airport-city').value = '';
  byId('airport-country').value = '';
}

function readPlace(prefix = 'airport-') {
  const place = {
    icao: byId(`${prefix}icao`).value.trim(),
    name: byId(`${prefix}name`).value.trim(),
    city: byId(`${prefix}city`).value.trim(),
    country: byId(`${prefix}country`).value.trim(),
  };
  return Object.values(place).some(Boolean) ? place : null;
}

function useCandidate(candidate) {
  byId('airport-icao').value = candidate.place.icao || '';
  byId('airport-name').value = candidate.place.name || '';
  byId('airport-city').value = candidate.place.city || '';
  byId('airport-country').value = candidate.place.country || '';
  const label = byId('label');
  if (!label.value.trim()) label.value = candidate.place.name || candidate.place.icao || '';
  notify('Airport suggestion added. Review or edit it before saving.');
}

function renderCandidates() {
  const container = byId('airport-candidates');
  if (!state.candidates.length) {
    container.replaceChildren();
    return;
  }
  container.replaceChildren(...state.candidates.map((candidate) => {
    const row = element('div', 'candidate');
    const copy = element('div', 'candidate-copy');
    copy.append(element('strong', '', candidate.place.name || candidate.place.icao || 'Nearby airport'));
    const details = [candidate.place.icao, candidate.place.city, candidate.place.country].filter(Boolean).join(' / ');
    copy.append(element('span', '', `${details || 'Airport'} / ${candidate.distanceKm} km / ${candidate.confidence} confidence`));
    const use = element('button', '', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => useCandidate(candidate));
    row.append(copy, use);
    return row;
  }));
}

async function lookupAirports() {
  const key = state.status?.aircraftKey;
  if (!key || !state.status?.canSave || state.lookupAttemptedFor === key) return;
  state.lookupAttemptedFor = key;
  try {
    const response = await request('savedPositions:lookup');
    state.candidates = response.candidates || [];
    renderCandidates();
    if (state.candidates.length === 1 && state.candidates[0].confidence === 'high') {
      useCandidate(state.candidates[0]);
    } else if (response.warning) {
      notify(response.warning.message, 'error');
    } else if (state.candidates.length === 0) {
      notify('No nearby airport found. A custom position name can be used.', '');
    }
  } catch (error) {
    notify(error.message, 'error');
  }
}

function renderPositions() {
  byId('position-count').textContent = String(state.positions.length);
  byId('export-button').disabled = state.positions.length === 0;
  if (!state.positions.some((position) => position.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!state.positions.length) {
    positionList.replaceChildren(element('p', 'list-empty', state.status?.aircraftKey
      ? 'No positions saved for this aircraft yet.'
      : 'Connect the simulator to see positions for the active aircraft.'));
    renderDetail();
    return;
  }
  positionList.replaceChildren(...state.positions.map((position) => {
    const button = element('button', 'position-row');
    button.type = 'button';
    button.setAttribute('aria-current', String(position.id === state.selectedId));
    button.append(element('strong', '', position.label));
    const place = position.place?.icao || position.place?.name || 'Custom position';
    button.append(element('span', '', `${place} / ${formatDate(position.createdAt)}`));
    button.addEventListener('click', () => {
      state.selectedId = position.id;
      renderPositions();
    });
    return button;
  }));
  renderDetail();
}

function dataCell(label, value) {
  const cell = element('div', 'data-cell');
  cell.append(element('span', '', label));
  cell.append(element('strong', '', value));
  return cell;
}

function renderDetail() {
  const position = state.positions.find((item) => item.id === state.selectedId);
  if (!position) {
    const empty = element('div', 'empty-detail');
    empty.append(element('span', 'detail-mark', '--'));
    empty.append(element('p', '', 'Select a saved position to inspect it.'));
    positionDetail.replaceChildren(empty);
    return;
  }

  const header = element('div', 'detail-top');
  const heading = element('div');
  heading.append(element('h3', '', position.label));
  heading.append(element('p', '', `${position.aircraftTitle} / ${formatDate(position.createdAt)}`));
  header.append(heading);
  const placeName = [position.place?.icao, position.place?.name, position.place?.city, position.place?.country].filter(Boolean).join(' / ') || 'No airport details';
  const grid = element('div', 'data-grid');
  grid.append(
    dataCell('Airport', placeName),
    dataCell('Latitude', `${formatCoordinate(position.position.latitude)} deg`),
    dataCell('Longitude', `${formatCoordinate(position.position.longitude)} deg`),
    dataCell('Altitude MSL', `${formatCoordinate(position.position.altitudeMslMeters, 1)} m`),
    dataCell('True heading', `${formatCoordinate(position.orientation.headingTrue, 1)} deg`),
    dataCell('Pitch / bank', `${formatCoordinate(position.orientation.pitch, 1)} / ${formatCoordinate(position.orientation.bank, 1)} deg`),
  );

  const fields = element('form', 'edit-fields');
  fields.innerHTML = `
    <label class="field-label" for="edit-label">Position name</label>
    <input id="edit-label" maxlength="120" required />
    <label class="field-label" for="edit-note">Note</label>
    <textarea id="edit-note" maxlength="2000" rows="2"></textarea>
    <div class="airport-fields">
      <label><span>ICAO</span><input id="edit-icao" maxlength="8" /></label>
      <label><span>Airport</span><input id="edit-name" maxlength="200" /></label>
      <label><span>City</span><input id="edit-city" maxlength="120" /></label>
      <label><span>Country</span><input id="edit-country" maxlength="120" /></label>
    </div>
  `;
  fields.elements.namedItem('edit-label').value = position.label;
  fields.elements.namedItem('edit-note').value = position.note || '';
  fields.elements.namedItem('edit-icao').value = position.place?.icao || '';
  fields.elements.namedItem('edit-name').value = position.place?.name || '';
  fields.elements.namedItem('edit-city').value = position.place?.city || '';
  fields.elements.namedItem('edit-country').value = position.place?.country || '';
  fields.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('savedPositions:update', {
        id: position.id,
        label: fields.elements.namedItem('edit-label').value,
        note: fields.elements.namedItem('edit-note').value,
        place: readPlace('edit-'),
      });
      await refreshList();
      notify('Saved position details updated.');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  const actions = element('div', 'detail-actions');
  const load = element('button', 'primary-button', 'Load into simulator');
  load.type = 'button';
  load.dataset.load = 'true';
  load.disabled = !state.status?.canLoad;
  load.addEventListener('click', () => loadPosition(position));
  const save = element('button', 'quiet-button', 'Save details');
  save.type = 'submit';
  const remove = element('button', 'danger-button', 'Delete');
  remove.type = 'button';
  remove.addEventListener('click', () => deletePosition(position));
  actions.append(load, save, remove);
  fields.append(actions);
  positionDetail.replaceChildren(header, grid);
  if (position.note) positionDetail.append(element('p', 'strip-meta', position.note));
  positionDetail.append(fields);
}

async function refreshList() {
  const response = await request('savedPositions:list');
  state.positions = response.positions || [];
  renderPositions();
}

async function loadPosition(position) {
  const details = `${position.label}\n${position.aircraftTitle}\n${formatCoordinate(position.position.latitude)}, ${formatCoordinate(position.position.longitude)}\n${formatCoordinate(position.position.altitudeMslMeters, 1)} m MSL`;
  if (!window.confirm(`Move the aircraft to this saved position?\n\n${details}`)) return;
  const button = positionDetail.querySelector('[data-load]');
  button.disabled = true;
  button.textContent = 'Loading and verifying...';
  try {
    const response = await request('savedPositions:load', { id: position.id });
    notify(response.verification?.verified ? 'Position loaded and verified from the simulator.' : 'The simulator did not verify the loaded position.', response.verification?.verified ? 'success' : 'error');
  } catch (error) {
    notify(error.message, 'error');
  } finally {
    renderDetail();
    renderConditions();
  }
}

async function deletePosition(position) {
  if (!window.confirm(`Delete "${position.label}"? This cannot be undone.`)) return;
  try {
    await request('savedPositions:delete', { id: position.id });
    state.selectedId = null;
    await refreshList();
    notify('Saved position deleted.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

byId('save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.status?.canSave) return;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  try {
    const response = await request('savedPositions:save', {
      label: byId('label').value,
      note: byId('note').value,
      place: readPlace(),
    });
    state.selectedId = response.position.id;
    await refreshList();
    notify('Position saved from the simulator.');
  } catch (error) {
    notify(error.message, 'error');
  } finally {
    saveButton.textContent = 'Save current position';
    renderConditions();
  }
});

byId('clear-airport').addEventListener('click', () => {
  clearAirportFields();
  notify('Airport details cleared. Position coordinates are unchanged.');
});

byId('export-button').addEventListener('click', async () => {
  try {
    const response = await request('savedPositions:export');
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fsclient-positions-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('Saved positions exported.');
  } catch (error) {
    notify(error.message, 'error');
  }
});

byId('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const preview = await request('savedPositions:importPreview', { data });
    state.preview = preview;
    renderImportPreview();
  } catch (error) {
    notify(error.message, 'error');
  }
});

function renderImportPreview() {
  const preview = state.preview;
  const container = byId('import-preview');
  if (!preview) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  byId('import-summary').textContent = `${preview.count} records found / ${preview.validCount} valid / ${preview.invalid.length} invalid / ${preview.conflicts.length} ID conflicts.`;
  byId('import-invalid').textContent = preview.invalid.slice(0, 20)
    .map((item) => `Record ${item.index + 1}: ${item.message}`).join('\n');
  const conflicts = byId('import-conflicts');
  conflicts.replaceChildren(...preview.conflicts.map((conflict) => {
    const row = element('label', 'conflict-row');
    row.append(element('strong', '', conflict.label));
    const select = element('select');
    select.dataset.conflictId = conflict.id;
    select.append(new Option('Choose action', ''), new Option('Skip existing ID', 'skip'), new Option('Import as new record', 'new'));
    row.append(select);
    return row;
  }));
  byId('confirm-import').disabled = preview.conflicts.some((conflict) => !conflicts.querySelector(`[data-conflict-id="${CSS.escape(conflict.id)}"]`)?.value);
}

byId('import-conflicts').addEventListener('change', () => {
  if (!state.preview) return;
  byId('confirm-import').disabled = state.preview.conflicts.some((conflict) =>
    !byId('import-conflicts').querySelector(`[data-conflict-id="${CSS.escape(conflict.id)}"]`)?.value);
});

byId('confirm-import').addEventListener('click', async () => {
  if (!state.preview) return;
  const choices = {};
  byId('import-conflicts').querySelectorAll('[data-conflict-id]').forEach((select) => {
    choices[select.dataset.conflictId] = select.value;
  });
  try {
    const result = await request('savedPositions:import', { token: state.preview.token, choices });
    state.preview = null;
    renderImportPreview();
    await refreshList();
    notify(`Imported ${result.importedCount} / skipped ${result.skippedCount}.`);
  } catch (error) {
    notify(error.message, 'error');
  }
});

byId('cancel-import').addEventListener('click', () => {
  state.preview = null;
  renderImportPreview();
});

socket.on('savedPositions:status', (status) => {
  const nextKey = status.aircraftKey || null;
  if (state.aircraftKey !== nextKey) {
    state.aircraftKey = nextKey;
    state.positions = [];
    state.selectedId = null;
    state.candidates = [];
    state.lookupAttemptedFor = null;
    byId('save-form').reset();
    renderCandidates();
    renderPositions();
    if (nextKey) refreshList().catch((error) => notify(error.message, 'error'));
  }
  state.status = status;
  updateConnection();
  renderConditions();
  if (status.canSave) lookupAirports();
});

socket.on('savedPositions:list', (positions) => {
  state.positions = Array.isArray(positions) ? positions : [];
  renderPositions();
});

socket.on('connect', () => updateConnection());
socket.on('disconnect', () => {
  updateConnection();
  state.status = null;
  renderConditions();
});

renderConditions();
renderPositions();
updateConnection();