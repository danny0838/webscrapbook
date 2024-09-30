'use strict';

async function invokeTestExtension({cmd, args}) {
  const event = new CustomEvent("WsbTest", {
    detail: {cmd, args},
  });
  window.dispatchEvent(event);
}

async function initTestExtension() {
  return await invokeTestExtension({
    cmd: 'initManualTest',
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initTestExtension();
});
