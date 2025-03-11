'use strict';

// Polyfill for MV2
if (typeof browser !== 'undefined') {
  if (browser?.browserAction && !browser?.action) {
    browser.action = browser.browserAction;
    browser.contextMenus.ContextType.ACTION = browser.contextMenus.ContextType.BROWSER_ACTION;
  }
}

function initMenusListener() {
  const handlers = {
    testAutomated(info, tab) {
      const url = browser.runtime.getURL("test.html?grep=^(?!Manual tests)");
      browser.tabs.create({url});
    },

    testLibrary(info, tab) {
      const url = browser.runtime.getURL("test.html?grep=^(?!Capture tests|Manual tests)");
      browser.tabs.create({url});
    },

    testCapture(info, tab) {
      const url = browser.runtime.getURL("test.html?grep=^Capture tests");
      browser.tabs.create({url});
    },

    testManual(info, tab) {
      const url = browser.runtime.getURL("test.html?grep=^Manual tests");
      browser.tabs.create({url});
    },

    testList(info, tab) {
      const url = browser.runtime.getURL("test.html?dryrun=1");
      browser.tabs.create({url});
    },
  };

  browser.contextMenus.onClicked.addListener((info, tab) => {
    return handlers[info.menuItemId](info, tab);
  });
}

function updateMenus() {
  browser.contextMenus.create({
    id: "testAutomated",
    title: 'Run automated tests',
    contexts: [browser.contextMenus.ContextType.ACTION],
  });

  browser.contextMenus.create({
    id: "testLibrary",
    title: '- library tests',
    contexts: [browser.contextMenus.ContextType.ACTION],
  });

  browser.contextMenus.create({
    id: "testCapture",
    title: '- capture tests',
    contexts: [browser.contextMenus.ContextType.ACTION],
  });

  browser.contextMenus.create({
    id: "testManual",
    title: 'Run manual tests',
    contexts: [browser.contextMenus.ContextType.ACTION],
  });

  browser.contextMenus.create({
    id: "testList",
    title: 'List all tests to run manually',
    contexts: [browser.contextMenus.ContextType.ACTION],
  });
}

function initActionListener() {
  browser.action.onClicked.addListener(() => {
    const url = browser.runtime.getURL("test.html");
    browser.tabs.create({url});
  });
}

function initInstallListener() {
  browser.runtime.onInstalled.addListener((details) => {
    if (!browser.runtime.getManifest().background.persistent) {
      updateMenus();
    }
  });
}

initInstallListener();
initMenusListener();
initActionListener();
if (browser.runtime.getManifest().background.persistent) {
  updateMenus();
}
