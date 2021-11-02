/******************************************************************************
 *
 * Shared utilities for most content scripts.
 *
 * @require {Object} scrapbook
 * @public {Object} core
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('core')) { return; }
  root.core = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, root, window, console) {

  'use strict';

  const core = {};

  /**
   * Return true to confirm that content script is loaded.
   *
   * @kind invokable
   */
  core.isScriptLoaded = async function (params) {
    return true;
  };

  /**
   * Return frameId of the frame of this content script.
   */
  window.addEventListener("message", async (event) => {
    try {
      if (event.data !== browser.runtime.getURL('')) {
        throw new Error('Not extension context.');
      }
    } catch (ex) {
      // browser.runtime.getURL() may trigger an error if extension is reloaded
      return;
    }

    event.ports[0].postMessage({frameId: core.frameId});
  }, false);

  browser.runtime.onMessage.addListener((message, sender) => {
    const {cmd, args} = message;
    isDebug && console.debug(cmd, "receive", args);

    const parts = cmd.split(".");
    const subCmd = parts.pop();
    let object = root;
    for (const part of parts) {
      object = object[part];
    }

    // thrown Error don't show here but cause the sender to receive an error
    if (!object || !subCmd || typeof object[subCmd] !== 'function') {
      throw new Error(`Unable to invoke unknown command '${cmd}'.`);
    }

    return Promise.resolve()
      .then(() => {
        return object[subCmd](args, sender);
      })
      .catch((ex) => {
        console.error(ex);
        throw ex;
      });
  });

  return core;

}));
