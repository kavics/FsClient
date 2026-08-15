const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const {
  open,
  Protocol,
  RawBuffer,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  EventFlag,
} = require('node-simconnect');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const webDir = path.join(__dirname, '..', 'web');

app.use(express.static(webDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});
app.get('/remap-panel', (_req, res) => {
  res.sendFile(path.join(webDir, 'remap-panel.html'));
});

const state = {
  aircraft: {
    type: 'Unknown aircraft',
    callsign: 'Unknown callsign',
    identifier: 'Unknown ID',
  },
  ap: false,
  fd: false,
  heading: 123,
  altitude: 12000,
  vs: 700,
  selectedSpeed: 250,
  headingActive: false,
  altitudeActive: false,
  vsActive: false,
  speedActive: false,
  hdg: false,
  nav: false,
  apr: false,
  speedMode: 'IAS'
};

let simHandle = null;
let simConnected = false;
let simError = null;
let simInputEvents = {};
let simDataRequestId = 100;
let simDataDefinitionId = 200;
let simAircraftDataRequestId = 101;
let simAircraftDataDefinitionId = 204;
let simHeadingSetDefinitionId = 201;
let simHeadingValue = 123;
let simAltitudeSetDefinitionId = 202;
let simAltitudeValue = 12000;
let simVsSetDefinitionId = 203;
let simVsValue = 700;
let simClientEvents = {};

const SIM_EVENT_GROUP_ID = 1;
const SIM_EVENT_ID_BASE = 1000;
const SIM_CLIENT_EVENT_NAMES = {
  AP_TOGGLE: 'AP_MASTER',
  FD_TOGGLE: 'TOGGLE_FLIGHT_DIRECTOR',
  HDG_INC: 'HEADING_BUG_INC',
  HDG_DEC: 'HEADING_BUG_DEC',
  ALT_INC: 'AP_ALT_VAR_INC',
  ALT_DEC: 'AP_ALT_VAR_DEC',
  VS_INC: 'AP_VS_VAR_INC',
  VS_DEC: 'AP_VS_VAR_DEC',
  SPD_INC: 'AP_SPD_VAR_INC',
  SPD_DEC: 'AP_SPD_VAR_DEC',
  HDG_MODE: 'AP_HDG_HOLD',
  NAV_MODE: 'AP_NAV1_HOLD',
  APR_MODE: 'AP_APR_HOLD',
  ALT_MODE: 'AP_ALT_HOLD',
  VS_MODE: 'AP_PANEL_VS_HOLD',
};

function normalizeHeading(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const normalized = ((numeric % 360) + 360) % 360;
  return Math.round(normalized);
}

function registerSimInput(eventName, inputEventHash) {
  if (!simHandle) {
    return;
  }

  try {
    simHandle.subscribeInputEvent(inputEventHash);
    simInputEvents[eventName] = inputEventHash;
  } catch (error) {
    console.warn(`Unable to register input event ${eventName}:`, error.message);
  }
}

function sendSimEvent(eventName, data = 0) {
  if (!simConnected || !simHandle) {
    return;
  }

  const inputEventHash = simInputEvents[eventName];
  if (!inputEventHash) {
    return;
  }

  try {
    simHandle.setInputEvent(inputEventHash, data);
  } catch (error) {
    console.warn(`Unable to transmit ${eventName}:`, error.message);
  }
}

function supportsSf50InputEvents() {
  const aircraftType = String(state.aircraft?.type || '').toLowerCase();
  return aircraftType.includes('sf50') || aircraftType.includes('vision jet');
}

function sendSf50Event(eventName, data = 0) {
  if (supportsSf50InputEvents()) {
    sendSimEvent(eventName, data);
  }
}

function mapSimClientEvents() {
  if (!simHandle) {
    return;
  }

  simClientEvents = {};
  const entries = Object.entries(SIM_CLIENT_EVENT_NAMES);
  entries.forEach(([key, eventName], index) => {
    const eventId = SIM_EVENT_ID_BASE + index;
    try {
      simHandle.mapClientEventToSimEvent(eventId, eventName);
      simHandle.addClientEventToNotificationGroup(SIM_EVENT_GROUP_ID, eventId, true);
      simClientEvents[key] = eventId;
    } catch (error) {
      console.warn(`Unable to map sim event ${eventName}:`, error.message);
    }
  });
}

function sendSimClientEvent(eventKey, data = 0) {
  if (!simConnected || !simHandle) {
    return false;
  }

  const eventId = simClientEvents[eventKey];
  if (!eventId) {
    return false;
  }

  try {
    simHandle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      eventId,
      data,
      SIM_EVENT_GROUP_ID,
      EventFlag.EVENT_FLAG_DEFAULT
    );
    return true;
  } catch (error) {
    console.warn(`Unable to transmit mapped sim event ${eventKey}:`, error.message);
    return false;
  }
}

function setSimHeading(targetHeading) {
  if (!simConnected || !simHandle) {
    return;
  }

  const buffer = new RawBuffer(8);
  buffer.writeFloat64(targetHeading);

  try {
    simHandle.setDataOnSimObject(simHeadingSetDefinitionId, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
  } catch (error) {
    console.warn('Unable to set AUTOPILOT HEADING LOCK DIR:', error.message);
  }
}

function setSimAltitude(targetAltitude) {
  if (!simConnected || !simHandle) {
    return;
  }

  const buffer = new RawBuffer(8);
  buffer.writeFloat64(targetAltitude);

  try {
    simHandle.setDataOnSimObject(simAltitudeSetDefinitionId, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
  } catch (error) {
    console.warn('Unable to set AUTOPILOT ALTITUDE LOCK VAR:', error.message);
  }
}

function setSimVerticalSpeed(targetVerticalSpeed) {
  if (!simConnected || !simHandle) {
    return;
  }

  const buffer = new RawBuffer(8);
  buffer.writeFloat64(targetVerticalSpeed);

  try {
    simHandle.setDataOnSimObject(simVsSetDefinitionId, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
  } catch (error) {
    console.warn('Unable to set AUTOPILOT VERTICAL HOLD VAR:', error.message);
  }
}

function connectToSim() {
  open('REMAP Controller', Protocol.SunRise)
    .then(({ recvOpen, handle }) => {
      simHandle = handle;
      simConnected = true;
      simError = null;
      console.log(`Connected to SimConnect: ${recvOpen.applicationName}`);

      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT HEADING LOCK DIR',
        'Degrees',
        SimConnectDataType.FLOAT64
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT ALTITUDE LOCK VAR',
        'feet',
        SimConnectDataType.FLOAT64
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT VERTICAL HOLD VAR',
        'feet per minute',
        SimConnectDataType.FLOAT64
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT MASTER',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT FLIGHT DIRECTOR ACTIVE',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT HEADING LOCK',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT ALTITUDE LOCK',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT VERTICAL HOLD',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT AIRSPEED HOLD',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simDataDefinitionId,
        'AUTOPILOT FLIGHT LEVEL CHANGE',
        'Bool',
        SimConnectDataType.INT32
      );
      handle.addToDataDefinition(
        simAircraftDataDefinitionId,
        'TITLE',
        '',
        SimConnectDataType.STRING256
      );
      handle.addToDataDefinition(
        simAircraftDataDefinitionId,
        'ATC AIRLINE',
        '',
        SimConnectDataType.STRING64
      );
      handle.addToDataDefinition(
        simAircraftDataDefinitionId,
        'ATC FLIGHT NUMBER',
        '',
        SimConnectDataType.STRING32
      );
      handle.addToDataDefinition(
        simAircraftDataDefinitionId,
        'ATC ID',
        '',
        SimConnectDataType.STRING32
      );
      handle.addToDataDefinition(
        simHeadingSetDefinitionId,
        'AUTOPILOT HEADING LOCK DIR',
        'Degrees',
        SimConnectDataType.FLOAT64
      );
      handle.addToDataDefinition(
        simAltitudeSetDefinitionId,
        'AUTOPILOT ALTITUDE LOCK VAR',
        'feet',
        SimConnectDataType.FLOAT64
      );
      handle.addToDataDefinition(
        simVsSetDefinitionId,
        'AUTOPILOT VERTICAL HOLD VAR',
        'feet per minute',
        SimConnectDataType.FLOAT64
      );
      handle.requestDataOnSimObject(
        simDataRequestId,
        simDataDefinitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SIM_FRAME
      );
      handle.requestDataOnSimObject(
        simAircraftDataRequestId,
        simAircraftDataDefinitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SECOND
      );

      mapSimClientEvents();

      registerSimInput('AUTOPILOT_AP_1', BigInt('12363045925542918803'));
      registerSimInput('AUTOPILOT_FD_1_MODE', BigInt('16128460165689175023'));
      registerSimInput('SF50_AUTOPILOT_HEADING_MODE', BigInt('14877129622622326204'));
      registerSimInput('SF50_AUTOPILOT_APPROACH_MODE', BigInt('15588074792088839996'));
      registerSimInput('SF50_AUTOPILOT_NAV_MODE', BigInt('259809390282440827'));
      registerSimInput('SF50_AUTOPILOT_HEADING', BigInt('5777602633590007521'));
      registerSimInput('SF50_AUTOPILOT_ALTITUDE', BigInt('7530534537311112589'));
      registerSimInput('SF50_AUTOPILOT_VERTICALSPEED', BigInt('6192582550695889592'));
      registerSimInput('SF50_AUTOPILOT_FLC_MODE', BigInt('16447863451294193947'));
      registerSimInput('SF50_AUTOPILOT_VS_MODE', BigInt('15737573534715045278'));
      registerSimInput('SF50_AUTOPILOT_LEVEL', BigInt('16588451956985593732'));
      registerSimInput('SF50_AUTOPILOT_ALTITUDE_MODE', BigInt('12149859462491326249'));
      registerSimInput('SF50_AUTOPILOT_ALTITUDE_SYNC', BigInt('373335924501472008'));
      registerSimInput('SF50_AUTOPILOT_HEADING_SYNC', BigInt('7189026300003346845'));
      registerSimInput('SF50_AUTOPILOT_VNAV_MODE', BigInt('7768852054849873488'));

      handle.on('simObjectData', (recvSimObjectData) => {
        if (recvSimObjectData.requestID === simDataRequestId) {
          simHeadingValue = normalizeHeading(recvSimObjectData.data.readFloat64());
          simAltitudeValue = Math.round(recvSimObjectData.data.readFloat64());
          simVsValue = Math.round(recvSimObjectData.data.readFloat64());
          const apMaster = recvSimObjectData.data.readInt32() === 1;
          const fdActive = recvSimObjectData.data.readInt32() === 1;
          const headingActive = recvSimObjectData.data.readInt32() === 1;
          const altitudeActive = recvSimObjectData.data.readInt32() === 1;
          const vsActive = recvSimObjectData.data.readInt32() === 1;
          const airspeedHoldActive = recvSimObjectData.data.readInt32() === 1;
          const flcActive = recvSimObjectData.data.readInt32() === 1;
          if (Number.isFinite(simHeadingValue)) {
            updateState({
              ap: apMaster,
              fd: fdActive,
              heading: simHeadingValue,
              altitude: Number.isFinite(simAltitudeValue) ? simAltitudeValue : state.altitude,
              vs: Number.isFinite(simVsValue) ? simVsValue : state.vs,
              headingActive,
              altitudeActive,
              vsActive,
              speedActive: airspeedHoldActive || flcActive,
              hdg: headingActive,
            });
          }
        }
        if (recvSimObjectData.requestID === simAircraftDataRequestId) {
          const type = recvSimObjectData.data.readString256().trim();
          const airline = recvSimObjectData.data.readString64().trim();
          const flightNumber = recvSimObjectData.data.readString32().trim();
          const identifier = recvSimObjectData.data.readString32().trim();
          const callsign = [airline, flightNumber].filter(Boolean).join(' ');

          updateState({
            aircraft: {
              type: type || 'Unknown aircraft',
              callsign: callsign || 'Unknown callsign',
              identifier: identifier || 'Unknown ID',
            },
          });
        }
      });

      handle.on('exception', (recvException) => {
        console.warn('SimConnect exception:', recvException);
      });

      handle.on('quit', () => {
        simConnected = false;
        console.log('SimConnect closed by simulator');
      });

      handle.on('close', () => {
        simConnected = false;
        console.log('SimConnect connection closed');
      });
    })
    .catch((error) => {
      simConnected = false;
      simError = error.message;
      console.warn('SimConnect connection failed:', error.message);
    });
}

function broadcastState() {
  io.emit('state', state);
}

function updateState(patch) {
  Object.assign(state, patch);
  broadcastState();
}

function handleSimControl(action, payload = {}) {
  if (!simConnected) {
    return;
  }

  switch (action) {
    case 'setHeading': {
      const targetValue = normalizeHeading(payload.value);
      simHeadingValue = targetValue;
      setSimHeading(targetValue);
      break;
    }
    case 'setAltitude': {
      const targetAltitude = Math.round(Number(payload.value || 0));
      if (Number.isFinite(targetAltitude)) {
        simAltitudeValue = targetAltitude;
        setSimAltitude(targetAltitude);
      }
      break;
    }
    case 'setVs': {
      const targetVs = Math.round(Number(payload.value || 0));
      if (Number.isFinite(targetVs)) {
        simVsValue = targetVs;
        setSimVerticalSpeed(targetVs);
      }
      break;
    }
    case 'headingUp': {
      const targetValue = normalizeHeading(simHeadingValue + 1);
      simHeadingValue = targetValue;
      setSimHeading(targetValue);
      break;
    }
    case 'headingDown': {
      const targetValue = normalizeHeading(simHeadingValue - 1);
      simHeadingValue = targetValue;
      setSimHeading(targetValue);
      break;
    }
    case 'altitudeUp': {
      const targetAltitude = Math.round(simAltitudeValue + 100);
      simAltitudeValue = targetAltitude;
      setSimAltitude(targetAltitude);
      break;
    }
    case 'altitudeDown': {
      const targetAltitude = Math.round(simAltitudeValue - 100);
      simAltitudeValue = targetAltitude;
      setSimAltitude(targetAltitude);
      break;
    }
    case 'vsUp': {
      const targetVs = Math.round(simVsValue + 100);
      simVsValue = targetVs;
      setSimVerticalSpeed(targetVs);
      break;
    }
    case 'vsDown': {
      const targetVs = Math.round(simVsValue - 100);
      simVsValue = targetVs;
      setSimVerticalSpeed(targetVs);
      break;
    }
    case 'speedUp':
      sendSimClientEvent('SPD_INC', 0);
      break;
    case 'speedDown':
      sendSimClientEvent('SPD_DEC', 0);
      break;
    case 'toggleAp':
      if (!sendSimClientEvent('AP_TOGGLE', 0)) {
        sendSimEvent('AUTOPILOT_AP_1', 1);
      }
      break;
    case 'toggleFd':
      if (!sendSimClientEvent('FD_TOGGLE', 0)) {
        sendSimEvent('AUTOPILOT_FD_1_MODE', 1);
      }
      break;
    case 'toggleSubsystem':
      if (payload.subsystem === 'hdg') {
        if (!sendSimClientEvent('HDG_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_HEADING_MODE', 1);
        }
      } else if (payload.subsystem === 'alt') {
        if (!sendSimClientEvent('ALT_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_ALTITUDE_MODE', 1);
        }
      } else if (payload.subsystem === 'vs') {
        if (!sendSimClientEvent('VS_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_VS_MODE', 1);
        }
      } else if (payload.subsystem === 'spd') {
        sendSimEvent('SF50_AUTOPILOT_FLC_MODE', 1);
      }
      break;
    case 'toggleMode':
      if (payload.mode === 'hdg') {
        if (!sendSimClientEvent('HDG_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_HEADING_MODE', 1);
        }
      } else if (payload.mode === 'nav') {
        if (!sendSimClientEvent('NAV_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_NAV_MODE', 1);
        }
      } else if (payload.mode === 'apr') {
        if (!sendSimClientEvent('APR_MODE', 0)) {
          sendSimEvent('SF50_AUTOPILOT_APPROACH_MODE', 1);
        }
      }
      break;
    default:
      break;
  }
}

io.on('connection', (socket) => {
  // Detect if client is local or remote
  const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   socket.handshake.address ||
                   socket.request.connection.remoteAddress ||
                   'unknown';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp.startsWith('127.');
  const runLocation = isLocal ? 'LOCAL' : 'REMOTE';
  
  console.log(`Client connected from ${clientIp} (${runLocation})`);
  
  socket.emit('state', { ...state, runLocation });

  socket.on('control', (payload = {}) => {
    const { action, value, mode } = payload;

    handleSimControl(action, payload);

    switch (action) {
      case 'headingUp':
        if (!simConnected) {
          updateState({ heading: normalizeHeading(Number(state.heading) + 1) });
        }
        break;
      case 'headingDown':
        if (!simConnected) {
          updateState({ heading: normalizeHeading(Number(state.heading) - 1) });
        }
        break;
      case 'setHeading': {
        const targetHeading = normalizeHeading(value);
        updateState({ heading: targetHeading });
        break;
      }
      case 'altitudeUp':
        updateState({ altitude: state.altitude + 100 });
        break;
      case 'altitudeDown':
        updateState({ altitude: state.altitude - 100 });
        break;
      case 'setAltitude':
        updateState({ altitude: Number(value) });
        break;
      case 'vsUp':
        updateState({ vs: state.vs + 100 });
        break;
      case 'vsDown':
        updateState({ vs: state.vs - 100 });
        break;
      case 'setVs':
        updateState({ vs: Number(value) });
        break;
      case 'speedUp':
        updateState({ selectedSpeed: state.selectedSpeed + 1 });
        break;
      case 'speedDown':
        updateState({ selectedSpeed: state.selectedSpeed - 1 });
        break;
      case 'setSpeed':
        updateState({ selectedSpeed: Number(value) });
        break;
      case 'toggleAp':
        if (!simConnected) {
          updateState({ ap: !state.ap });
        }
        break;
      case 'toggleFd':
        if (!simConnected) {
          updateState({ fd: !state.fd });
        }
        break;
      case 'toggleSubsystem':
        if (!simConnected) {
          if (payload.subsystem === 'hdg') {
            updateState({ headingActive: !state.headingActive });
          } else if (payload.subsystem === 'alt') {
            updateState({ altitudeActive: !state.altitudeActive });
          } else if (payload.subsystem === 'vs') {
            updateState({ vsActive: !state.vsActive });
          } else if (payload.subsystem === 'spd') {
            updateState({ speedActive: !state.speedActive });
          }
        }
        break;
      case 'toggleMode':
        if (mode === 'hdg') {
          updateState({ hdg: true, nav: false, apr: false });
        } else if (mode === 'nav') {
          updateState({ hdg: false, nav: true, apr: false });
        } else if (mode === 'apr') {
          updateState({ hdg: false, nav: false, apr: true });
        }
        break;
      case 'setSpeedMode':
        updateState({ speedMode: value });
        break;
      default:
        break;
    }
  });
});

connectToSim();

server.listen(PORT, () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
  if (!simConnected) {
    console.log(`SimConnect status: waiting for FS2024 (${simError || 'no connection yet'})`);
  }
});
