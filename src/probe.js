const { open, Protocol, SimConnectConstants, EventFlag } = require('node-simconnect');

open('REMAP Probe', Protocol.SunRise)
  .then(function ({ handle }) {
    handle.mapClientEventToSimEvent(100, 'AP_ALT_VAR_INC');
    handle.mapClientEventToSimEvent(101, 'AP_ALT_VAR_DEC');
    handle.addClientEventToNotificationGroup(1, 100, true);
    handle.addClientEventToNotificationGroup(1, 101, true);
    handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, 100, 0, 1, EventFlag.EVENT_FLAG_DEFAULT);
    console.log('sent inc');
    setTimeout(function () {
      handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, 101, 0, 1, EventFlag.EVENT_FLAG_DEFAULT);
      console.log('sent dec');
      setTimeout(function () { process.exit(0); }, 1000);
    }, 1000);
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
