const { open, Protocol, SimConnectConstants, EventFlag } = require('node-simconnect');

open('REMAP Probe SF50', Protocol.SunRise)
  .then(function ({ handle }) {
    const events = [
      { name: 'AUTOPILOT_AP_1', data: 1 },
      { name: 'SF50_AUTOPILOT_HEADING_MODE', data: 1 },
      { name: 'SF50_AUTOPILOT_ALTITUDE', data: 1 }
    ];

    handle.on('exception', function (recv) {
      console.log('exception', recv.exceptionName, recv.exception, recv.sendId);
    });

    let index = 0;
    function sendNext() {
      if (index >= events.length) {
        setTimeout(function () { process.exit(0); }, 1000);
        return;
      }
      const event = events[index];
      index += 1;
      try {
        handle.mapClientEventToSimEvent(index * 10, event.name);
        handle.addClientEventToNotificationGroup(1, index * 10, true);
        handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, index * 10, event.data, 1, EventFlag.EVENT_FLAG_DEFAULT);
        console.log('sent', event.name, event.data);
      } catch (err) {
        console.log('failed', event.name, err.message);
      }
      setTimeout(sendNext, 500);
    }

    sendNext();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
