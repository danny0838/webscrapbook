/******************************************************************************
 *
 * The background script for editor functionality
 *
 * @require {Object} scrapbook
 * @public {Object} editor
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('editor')) { return; }
  root.editor = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    console,
  );
}(this, function (isDebug, browser, scrapbook, console) {

  'use strict';

  const AUTO_EDIT_FILTER = {url: [{schemes: ["http", "https"]}]};

  function onNavigationComplete(details) {
    if (details.frameId !== 0) { return; }

    const {url, tabId} = details;
    const [urlMain, urlSearch, urlHash] = scrapbook.splitUrl(url);

    // skip URLs not in the backend server
    if (!urlMain.startsWith(scrapbook.getOption("server.url"))) {
      return;
    }

    // skip directory listing
    if (urlMain.endsWith('/')) {
      return;
    }

    // skip URLs with query as it could be some server command
    if (urlSearch) {
      return;
    }

    return scrapbook.editTab({
      tabId,
      willActive: true,
    });
  }

  function toggleAutoEdit() {
    browser.webNavigation.onCompleted.removeListener(onNavigationComplete);
    if (scrapbook.getOption("editor.autoInit") && scrapbook.hasServer()) {
      browser.webNavigation.onCompleted.addListener(onNavigationComplete, AUTO_EDIT_FILTER);
    }
  }

  async function init() {
    await scrapbook.loadOptionsAuto;
    toggleAutoEdit();
  }

  init();

  return {
    toggleAutoEdit,
  };

}));
