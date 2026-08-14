const { open, Protocol, SimConnectConstants, EventFlag } = require('node-simconnect');

open('REMAP Probe', Protocol.SunRise).then(function ({ handle }) {
  const names = ['AP_MASTER', 'AP_HDG_HOLD', 'AP_NAV1_HOLD', 'AP_APR_HOLD', 'TOGGLE_FLIGHT_DIRECTOR', 'HEADING_BUG_INC', 'HEADING_BUG_DEC', 'ALTITUDE_BUG_INC', 'ALTITUDE_BUG_DEC', 'VSI_INC', 'VSI_DEC'];
  var eventId = 100;
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    try {
      handle.mapClientEventToSimEvent(eventId, name);
      handle.addClientEventToNotificationGroup(1, eventId, true);
      handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, eventId, 1, 1, EventFlag.EVENT_FLAG_DEFAULT);
      console.log('sent', name);
    } catch (err) {
      console.log('failed', name, err.message);
    }
    eventId += 1;
  }
  setTimeout(function () { process.exit(0); }, 2000);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
