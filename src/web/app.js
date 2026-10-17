const socket = io();

const statusEl = document.getElementById('status');
const runLocationEl = document.getElementById('runLocation');
const headingInputEl = document.getElementById('headingInput');
const headingFormEl = document.getElementById('headingForm');
const altitudeInputEl = document.getElementById('altitudeInput');
const altitudeFormEl = document.getElementById('altitudeForm');
const vsInputEl = document.getElementById('vsInput');
const vsFormEl = document.getElementById('vsForm');
const speedInputEl = document.getElementById('speedInput');
const speedFormEl = document.getElementById('speedForm');
const headingValueEl = document.getElementById('headingValue');
const altitudeValueEl = document.getElementById('altitudeValue');
const vsValueEl = document.getElementById('vsValue');
const speedValueEl = document.getElementById('speedValue');
const aircraftTypeEl = document.getElementById('aircraftType');
const aircraftCallsignEl = document.getElementById('aircraftCallsign');
const aircraftIdentifierEl = document.getElementById('aircraftIdentifier');
const targetAirportFormEl = document.getElementById('targetAirportForm');
const targetAirportInputEl = document.getElementById('targetAirportInput');
const targetDistanceOutputEl = document.getElementById('targetDistanceOutput');
const requiredVsOutputEl = document.getElementById('requiredVsOutput');
const targetAirportStatusEl = document.getElementById('targetAirportStatus');

let latestState = null;
let targetAirportPending = false;
let targetAirportHasError = false;
const fieldConfigs = {
  heading: {
    input: headingInputEl,
    form: headingFormEl,
    valueEl: headingValueEl,
    stateKey: 'heading',
    action: 'setHeading'
  },
  altitude: {
    input: altitudeInputEl,
    form: altitudeFormEl,
    valueEl: altitudeValueEl,
    stateKey: 'altitude',
    action: 'setAltitude'
  },
  vs: {
    input: vsInputEl,
    form: vsFormEl,
    valueEl: vsValueEl,
    stateKey: 'vs',
    action: 'setVs'
  },
  speed: {
    input: speedInputEl,
    form: speedFormEl,
    valueEl: speedValueEl,
    stateKey: 'selectedSpeed',
    action: 'setSpeed'
  }
};
const enterSubmittedFields = new Set();

function isEditing(input) {
  return document.activeElement === input;
}

function setChip(id, active) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('active', active);
  }
}

function renderTargetDistance(state) {
  if (!targetAirportInputEl) {
    return;
  }
  const targetMatchesInput = state.targetAirport?.icao === targetAirportInputEl.value.trim().toUpperCase();
  if (targetDistanceOutputEl) {
    targetDistanceOutputEl.value = targetMatchesInput && Number.isFinite(state.targetDistanceNm)
      ? `${state.targetDistanceNm.toFixed(1)} NM`
      : '-- NM';
  }
  if (requiredVsOutputEl) {
    const requiredVsFpm = state.requiredVsFpm;
    requiredVsOutputEl.value = targetMatchesInput && Number.isFinite(requiredVsFpm)
      ? `${requiredVsFpm > 0 ? '+' : ''}${requiredVsFpm} FPM`
      : '-- FPM';
  }
  if (targetAirportStatusEl && targetMatchesInput && state.targetAirport) {
    targetAirportStatusEl.textContent = [state.targetAirport.icao, state.targetAirport.name]
      .filter(Boolean)
      .join(' · ');
  }
}

function renderState(state) {
  latestState = state;

  if (aircraftTypeEl) aircraftTypeEl.textContent = state.aircraft?.type || 'Unknown aircraft';
  if (aircraftCallsignEl) aircraftCallsignEl.textContent = state.aircraft?.callsign || 'Unknown callsign';
  if (aircraftIdentifierEl) aircraftIdentifierEl.textContent = state.aircraft?.identifier || 'Unknown ID';
  if (targetAirportInputEl && !isEditing(targetAirportInputEl) && !targetAirportPending && !targetAirportHasError) {
    targetAirportInputEl.value = state.targetAirport?.icao || '';
  }
  renderTargetDistance(state);

  if (headingInputEl && !isEditing(headingInputEl)) headingInputEl.value = state.heading;
  if (altitudeInputEl && !isEditing(altitudeInputEl)) altitudeInputEl.value = state.altitude;
  if (vsInputEl && !isEditing(vsInputEl)) vsInputEl.value = state.vs;
  if (speedInputEl && !isEditing(speedInputEl)) speedInputEl.value = state.selectedSpeed;
  Object.values(fieldConfigs).forEach((field) => {
    if (!field.valueEl) {
      return;
    }
    const displayStateKey = field.valueEl.dataset.displayStateKey || field.stateKey;
    field.valueEl.textContent = state[displayStateKey] ?? '--';
  });

  setChip('apChip', state.ap);
  setChip('fdChip', state.fd);
  setChip('hdgChip', state.hdg);
  setChip('navChip', state.nav);
  setChip('aprChip', state.apr);

  document.querySelectorAll('.mode').forEach((button) => {
    const active = button.dataset.mode === 'hdg' && state.hdg || button.dataset.mode === 'nav' && state.nav || button.dataset.mode === 'apr' && state.apr;
    button.classList.toggle('active', active);
  });

  document.querySelectorAll('.subsystem-toggle').forEach((button) => {
    const subsystem = button.dataset.subsystem;
    const active = subsystem === 'hdg'
      ? state.headingActive
      : subsystem === 'alt'
        ? state.altitudeActive
        : subsystem === 'vs'
          ? state.vsActive
          : subsystem === 'spd'
            ? state.speedActive
            : false;
    button.classList.toggle('active', active);
  });

  document.querySelectorAll('.toggle[data-action="toggleAp"]').forEach((button) => {
    button.classList.toggle('active', state.ap);
  });

  document.querySelectorAll('.toggle[data-action="toggleFd"]').forEach((button) => {
    button.classList.toggle('active', state.fd);
  });

  document.querySelectorAll('.toggle[data-action="setSpeedMode"]').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === state.speedMode);
  });
}

socket.on('connect', () => {
  if (statusEl) {
    statusEl.textContent = '●';
    statusEl.classList.remove('disconnected');
    statusEl.classList.add('connected');
  }
});

socket.on('disconnect', () => {
  if (statusEl) {
    statusEl.textContent = '●';
    statusEl.classList.remove('connected');
    statusEl.classList.add('disconnected');
  }
});

socket.on('state', (state) => {
  // Extract and display run location
  if (state.runLocation) {
    if (runLocationEl) {
      runLocationEl.textContent = state.runLocation;
      runLocationEl.style.color = state.runLocation === 'LOCAL' ? '#22c55e' : '#f59e0b';
    }
  }
  renderState(state);
});

if (targetAirportFormEl && targetAirportInputEl) {
  targetAirportInputEl.addEventListener('input', () => {
    targetAirportHasError = false;
    if (targetAirportStatusEl) targetAirportStatusEl.textContent = '';
    if (targetDistanceOutputEl) targetDistanceOutputEl.value = '-- NM';
    if (requiredVsOutputEl) requiredVsOutputEl.value = '-- FPM';
  });

  function submitTargetAirport() {
    if (targetAirportPending) {
      return;
    }

    const code = targetAirportInputEl.value.trim().toUpperCase();
    targetAirportInputEl.value = code;
    const currentCode = latestState?.targetAirport?.icao || '';
    if (code === currentCode && !targetAirportHasError) {
      if (latestState) {
        renderTargetDistance(latestState);
      }
      return;
    }

    targetAirportPending = true;
    targetAirportHasError = false;
    if (targetDistanceOutputEl) targetDistanceOutputEl.value = '-- NM';
    if (requiredVsOutputEl) requiredVsOutputEl.value = '-- FPM';
    if (targetAirportStatusEl) targetAirportStatusEl.textContent = code ? 'Reptér keresése…' : '';

    socket.emit('targetAirport:set', { code }, (response) => {
      targetAirportPending = false;
      targetAirportHasError = !response?.ok;
      if (targetAirportHasError && targetAirportStatusEl) {
        targetAirportStatusEl.textContent = response?.error || 'Nem sikerült beállítani a célrepülőteret.';
      } else if (latestState) {
        renderTargetDistance(latestState);
      }
    });
  }

  targetAirportFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    submitTargetAirport();
  });

  targetAirportInputEl.addEventListener('blur', submitTargetAirport);
}

function submitFieldInput(fieldName) {
  const field = fieldConfigs[fieldName];
  if (!field || !field.input) {
    return;
  }

  const value = Number(field.input.value);
  if (!Number.isFinite(value)) {
    if (latestState) {
      field.input.value = latestState[field.stateKey];
    }
    return;
  }

  enterSubmittedFields.add(fieldName);
  field.input.value = value;
  if (field.valueEl && !field.valueEl.dataset.displayStateKey) {
    field.valueEl.textContent = value;
  }
  if (latestState) {
    latestState = { ...latestState, [field.stateKey]: value };
  } else {
    latestState = { [field.stateKey]: value };
  }
  socket.emit('control', { action: field.action, value });
  field.input.blur();
}

function handleAction(button) {
  const action = button.dataset.action;
  const inputId = button.dataset.input;
  const input = inputId ? document.getElementById(inputId) : null;
  const value = input ? input.value : button.dataset.value;

  if (action === 'setHeading' || action === 'setAltitude' || action === 'setVs' || action === 'setSpeed') {
    return;
  }

  if (input) {
    const currentValue = Number(input.value || 0);
    switch (action) {
      case 'headingUp':
        input.value = currentValue + 1;
        break;
      case 'headingDown':
        input.value = currentValue - 1;
        break;
      case 'altitudeUp':
        input.value = currentValue + 100;
        break;
      case 'altitudeDown':
        input.value = currentValue - 100;
        break;
      case 'vsUp':
        input.value = currentValue + 100;
        break;
      case 'vsDown':
        input.value = currentValue - 100;
        break;
      case 'speedUp':
        input.value = currentValue + 1;
        break;
      case 'speedDown':
        input.value = currentValue - 1;
        break;
      default:
        break;
    }
  }

  if (action === 'setSpeedMode') {
    socket.emit('control', { action, value });
    return;
  }

  if (action === 'toggleSubsystem') {
    socket.emit('control', { action, subsystem: button.dataset.subsystem });
    return;
  }

  if (action === 'toggleMode') {
    socket.emit('control', { action, mode: button.dataset.mode });
    return;
  }

  if (action === 'toggleAp' || action === 'toggleFd') {
    socket.emit('control', { action });
    return;
  }

  if (action.startsWith('set')) {
    socket.emit('control', { action, value: input ? input.value : value });
    return;
  }

  socket.emit('control', { action });
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    handleAction(button);
  });
});

Object.entries(fieldConfigs).forEach(([fieldName, field]) => {
  if (field.form) {
    field.form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitFieldInput(fieldName);
    });
  }

  if (field.input) {
    field.input.addEventListener('focus', () => {
      field.input.classList.add('editing');
    });

    field.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Done' || event.key === 'Go') {
        event.preventDefault();
        submitFieldInput(fieldName);
      }
    });

    field.input.addEventListener('keyup', (event) => {
      if (event.key === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        submitFieldInput(fieldName);
      }
    });

    field.input.addEventListener('blur', () => {
      field.input.classList.remove('editing');

      if (field.input.value.trim() !== '') {
        field.input.value = Number(field.input.value);
      }

      if (enterSubmittedFields.has(fieldName)) {
        enterSubmittedFields.delete(fieldName);
        return;
      }

      if (latestState) {
        field.input.value = latestState[field.stateKey];
      }
    });
  }
});
