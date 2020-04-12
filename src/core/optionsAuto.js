/******************************************************************************
 *
 * Loads and updates options automatically
 *
 * @require {Object} scrapbook
 * @public {Function} scrapbook.loadOptionsAuto
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('loadOptionsAuto')) { return; }
  root.loadOptionsAuto = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  scrapbook.loadOptionsAuto = scrapbook.loadOptions();

  browser.storage.onChanged.addListener((changes, areaName) => {
    // Config keys are stored in storage.sync and fallbacks to storage.local;
    // cache keys are stored in storage.local and are valid JSON format.
    // We only update when a config key is changed.
    if (areaName !== "sync") {
      try {
        for (let key in changes) { JSON.parse(key); }
        return;
      } catch(ex) {}
    }
    for (let key in changes) {
      scrapbook.options[key] = changes[key].newValue;
    }
  });

  return scrapbook.loadOptionsAuto;

}));
