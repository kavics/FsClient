const {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} = require('node-simconnect');

const REQUEST_ID = 910;
const DEFINITION_ID = 911;

open('REMAP AP State Probe', Protocol.SunRise)
  .then(({ handle }) => {
    handle.on('exception', (recv) => {
      console.log('exception', recv.exceptionName, recv.exception, recv.sendId);
    });

    handle.on('simObjectData', (recv) => {
      if (recv.requestID !== REQUEST_ID) {
        return;
      }

      const values = {
        apMaster: recv.data.readInt32(),
        fdActive: recv.data.readInt32(),
        hdgLock: recv.data.readInt32(),
        altLock: recv.data.readInt32(),
        verticalHold: recv.data.readInt32(),
        airspeedHold: recv.data.readInt32(),
        flc: recv.data.readInt32(),
      };

      console.log(JSON.stringify(values, null, 2));
      process.exit(0);
    });

    [
      ['AUTOPILOT MASTER', 'Bool'],
      ['AUTOPILOT FLIGHT DIRECTOR ACTIVE', 'Bool'],
      ['AUTOPILOT HEADING LOCK', 'Bool'],
      ['AUTOPILOT ALTITUDE LOCK', 'Bool'],
      ['AUTOPILOT VERTICAL HOLD', 'Bool'],
      ['AUTOPILOT AIRSPEED HOLD', 'Bool'],
      ['AUTOPILOT FLIGHT LEVEL CHANGE', 'Bool'],
    ].forEach(([name, unit]) => {
      handle.addToDataDefinition(DEFINITION_ID, name, unit, SimConnectDataType.INT32);
    });

    handle.requestDataOnSimObject(
      REQUEST_ID,
      DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND
    );
  })
  .catch((error) => {
    console.log('Failed to connect', error);
    process.exit(1);
  });
