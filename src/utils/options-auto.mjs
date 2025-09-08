/******************************************************************************
 * Loads and updates options automatically
 *
 * @modifies scrapbook
 *****************************************************************************/

import {scrapbook} from "./common.mjs";

scrapbook.loadOptionsAuto = scrapbook.loadOptions();

browser.storage.onChanged.addListener((changes, areaName) => {
  // Cache keys are stored in storage.local and are valid JSON format.
  // We only update when a config key is changed.
  if (areaName === "local") {
    try {
      for (const key in changes) { JSON.parse(key); }
      return;
    } catch (ex) {}

    for (const key in changes) {
      scrapbook.options[key] = 'newValue' in changes[key] ? changes[key].newValue : scrapbook.DEFAULT_OPTIONS[key];
    }
  }
});
