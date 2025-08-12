/**
 * Polyfill for WebExtension APIs.
 *
 * This script should be able to be imported as module or injected as content
 * script.
 *
 * Copyright Danny Lin 2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */

(function () {

"use strict";

// Polyfill for MV2
if (typeof browser !== 'undefined') {
  if (browser?.browserAction && !browser?.action) {
    browser.action = browser.browserAction;
    if (browser.contextMenus) {
      browser.contextMenus.ContextType.ACTION = browser.contextMenus.ContextType.BROWSER_ACTION;
    }
  }

  if (browser?.tabs && !browser?.scripting) {
    browser.scripting = {
      async executeScript({args, files, func, injectImmediately, target: {tabId, frameIds, allFrames}}) {
        frameIds ??= allFrames ?
          (await browser.webNavigation.getAllFrames({tabId})).map(({frameId}) => frameId) :
          [0];
        const runAt = injectImmediately ? "document_start" : undefined;
        const matchAboutBlank = true;

        const tasks = frameIds.map(frameId => {
          let p;

          if (files) {
            p = Promise.resolve();
            for (const file of files) {
              p = p.then(results => browser.tabs.executeScript(tabId, {
                frameId, file, runAt, matchAboutBlank,
              }));
            }
          } else {
            p = browser.tabs.executeScript(tabId, {
              frameId,
              code: `(${func})(...${JSON.stringify(args ?? [])})`,
              runAt,
              matchAboutBlank,
            });
          }

          p = p.then(([result]) => ({
            frameId,
            result,
          }));

          return p;
        });

        return Promise.all(tasks);
      },
    };
  }
}

})();
