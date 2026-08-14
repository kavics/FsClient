const { open, Protocol } = require('node-simconnect');

open('REMAP Event List', Protocol.SunRise)
  .then(({ handle }) => {
    const allEvents = [];

    handle.on('inputEventsList', (recv) => {
      recv.inputEventDescriptors.forEach((event) => {
        allEvents.push({
          name: event.name,
          idHash: event.inputEventIdHash.toString()
        });
      });
      console.log(JSON.stringify(allEvents.slice(0, 80), null, 2));
      setTimeout(() => process.exit(0), 2000);
    });

    handle.on('exception', (ex) => {
      console.log('Exception', ex.exceptionName, ex.exception);
    });

    handle.enumerateInputEvents(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
