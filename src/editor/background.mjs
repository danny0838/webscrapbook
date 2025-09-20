/******************************************************************************
 * The background script for editor functionality
 *****************************************************************************/

import * as utils from "../utils/extension.mjs";

utils.loadOptionsAuto(); // async

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
      utils.invokeContentScript({
        tabId,
        frameId: 0,
        cmd: "editor.getStatus",
      }),
      utils.initContentScripts(tabId, frameId),
    ]).then(([status, initResults]) => {
      return utils.invokeContentScript({
        tabId,
        frameId,
        cmd: "editor.initFrame",
        args: status,
      });
    });
  }

  // the main frame is reloaded, mark it as inactive
  activeEditorTabIds.delete(tabId);

  const [urlMain, urlSearch, urlHash] = utils.splitUrl(url);

  // skip URLs not in the backend server
  if (!urlMain.startsWith(utils.getOption("server.url"))) {
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

  return utils.editTab({
    tabId,
    willActive: true,
  });
}

function toggleAutoEdit() {
  browser.webNavigation.onDOMContentLoaded.removeListener(onDomContentLoaded);
  if (utils.getOption("editor.autoInit") && utils.hasServer()) {
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
  await utils.loadOptionsAuto();
  toggleAutoEdit();
}

init();

export {
  toggleAutoEdit,
  registerActiveEditorTab,
};
