const { open, Protocol } = require('node-simconnect');

open('REMAP Input Probe', Protocol.SunRise)
  .then(function ({ handle }) {
    const eventHash = BigInt('5777602633590007521');
    handle.on('exception', function (recv) {
      console.log('exception', recv.exceptionName, recv.exception, recv.sendId);
    });
    handle.on('enumerateInputEventParams', function (recv) {
      console.log('params', recv.inputEventIdHash.toString(), recv.value);
    });
    handle.on('subscribeInputEvent', function (recv) {
      console.log('subscribed', recv.inputEventIdHash.toString(), recv.type);
    });
    handle.on('getInputEvent', function (recv) {
      console.log('getInputEvent', recv.type, recv.value);
    });

    handle.subscribeInputEvent(eventHash);
    handle.enumerateInputEventParams(eventHash);
    handle.getInputEvent(1, eventHash);
    setTimeout(function () { process.exit(0); }, 2000);
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
