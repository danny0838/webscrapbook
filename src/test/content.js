(function (global, factory) {
  // Browser globals
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  Object.assign(global, factory(global));
}(this, function (global) {

'use strict';

let messagePort;
const messagePortPromise = (() => {
  let _resolve;
  let _reject;
  const p = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });
  p._resolve = _resolve;
  p._reject = _reject;
  return p;
})();

/**
 * Connect with the background script.
 */
chrome.runtime.onConnect.addListener((port) => {
  messagePort = port;
  messagePortPromise._resolve(port);
  port.onMessage.addListener(async (message, port) => {
    const {id, cmd, args} = message;
    try {
      await global[cmd](...(args || []), port);
    } catch (ex) {
      port.postMessage({id, error: {message: ex.message}});
    }
  });
});

/**
 * Receive message from page script.
 */
window.addEventListener('WsbTest', async (event) => {
  const {id, cmd, args} = event.detail;
  try {
    const response = await global[cmd](...(args || []));
    window.dispatchEvent(new CustomEvent("WsbTestResolve", {
      detail: {id, response},
    }));
  } catch (ex) {
    window.dispatchEvent(new CustomEvent("WsbTestReject", {
      detail: {id, error: ex},
    }));
  }
});

function onButtonClick(event) {
  const elem = event.currentTarget;
  const value = elem.value === "YES";
  messagePort.postMessage({cmd: 'result', args: [value]});
}

async function initManualTest() {
  await messagePortPromise;

  const form = document.body.appendChild(document.createElement('form'));

  const label = form.appendChild(document.createElement('label'));
  label.textContent = `Does it work?`;

  const input1 = form.appendChild(document.createElement('input'));
  input1.type = 'button';
  input1.value = 'YES';
  input1.accessKey = 'Y';
  input1.addEventListener('click', onButtonClick);

  const input2 = form.appendChild(document.createElement('input'));
  input2.type = 'button';
  input2.value = 'NO';
  input2.accessKey = 'N';
  input2.addEventListener('click', onButtonClick);
}

return {
  initManualTest,
};

}));
