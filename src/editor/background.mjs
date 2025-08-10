/******************************************************************************
 * The background script for editor functionality
 *
 * @requires scrapbook
 * @module editor
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  if (global.hasOwnProperty('editor')) { return; }
  global.editor = factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

const AUTO_EDIT_FILTER = {url: [{schemes: ["http", "https"]}]};

const activeEditorTabIds = new Set();

function onDomContentLoaded(details) {
  const {tabId, frameId, url} = details;

  if (frameId !== 0) {
    if (!activeEditorTabIds.has(tabId)) {
      return;
    }

    // a frame in an active editor is loaded, run init script for it
    return Promise.all([
      scrapbook.invokeContentScript({
        tabId,
        frameId: 0,
        cmd: "editor.getStatus",
      }),
      scrapbook.initContentScripts(tabId, frameId),
    ]).then(([status, initResults]) => {
      return scrapbook.invokeContentScript({
        tabId,
        frameId,
        cmd: "editor.initFrame",
        args: status,
      });
    });
  }

  // the main frame is reloaded, mark it as inactive
  activeEditorTabIds.delete(tabId);

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
  browser.webNavigation.onDOMContentLoaded.removeListener(onDomContentLoaded);
  if (scrapbook.getOption("editor.autoInit") && scrapbook.hasServer()) {
    browser.webNavigation.onDOMContentLoaded.addListener(onDomContentLoaded, AUTO_EDIT_FILTER);
  }
}

function registerActiveEditorTab(tabId, willEnable = true) {
  if (willEnable) {
    activeEditorTabIds.add(tabId);
  } else {
    activeEditorTabIds.delete(tabId);
  }
}

async function init() {
  await scrapbook.loadOptionsAuto;
  toggleAutoEdit();
}

init();

return {
  toggleAutoEdit,
  registerActiveEditorTab,
};

}));
