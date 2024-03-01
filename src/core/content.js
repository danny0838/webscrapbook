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
    root, // root and window are different in Firefox
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, global, window, console) {

  'use strict';

  const core = {};

  /**
   * Return true to confirm that content script is loaded.
   *
   * @type invokable
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

  scrapbook.addMessageListener();

  return core;

}));
