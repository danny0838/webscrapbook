/******************************************************************************
 *
 * Shared utilities for most content scripts.
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 *****************************************************************************/

((window, document, browser) => {

const core = {};

/**
 * Return true to confirm that content script is loaded.
 *
 * @kind invokable
 */
core.isScriptLoaded = async function (params) {
  return true;
};

window.addEventListener("message", async (event) => {
  const message = event.data;
  const extension = browser.runtime.id;
  if (message.extension !== extension) { return; }

  const {uid, cmd, args} = message;
  isDebug && console.debug(cmd, "frame window receive", args);

  const [mainCmd, subCmd] = cmd.split(".");

  const object = window[mainCmd];
  if (!object || !object[subCmd]) { return; }

  event.ports[0].postMessage({
    extension,
    uid,
    cmd: cmd + ".start",
  });

  const response = await object[subCmd](args);
  event.ports[0].postMessage({
    extension,
    uid,
    cmd: cmd + ".complete",
    response,
  });
}, false);

browser.runtime.onMessage.addListener((message, sender) => {
  const {cmd, args} = message;
  isDebug && console.debug(cmd, "receive", args);

  const [mainCmd, subCmd] = cmd.split(".");

  const object = window[mainCmd];
  if (!object) { return; }

  const fn = object[subCmd];
  if (!fn) { return; }

  return fn(args);
});

})(this, this.document, this.browser);
