'use strict';

function initMenusListener() {
  const handlers = {
    testAutomated(info, tab) {
      const url = chrome.runtime.getURL("test.html?grep=^(?!Manual tests)");
      chrome.tabs.create({url});
    },

    testLibrary(info, tab) {
      const url = chrome.runtime.getURL("test.html?grep=^(?!Capture tests|Manual tests)");
      chrome.tabs.create({url});
    },

    testCapture(info, tab) {
      const url = chrome.runtime.getURL("test.html?grep=^Capture tests");
      chrome.tabs.create({url});
    },

    testManual(info, tab) {
      const url = chrome.runtime.getURL("test.html?grep=^Manual tests");
      chrome.tabs.create({url});
    },

    testList(info, tab) {
      const url = chrome.runtime.getURL("test.html?dryrun=1");
      chrome.tabs.create({url});
    },
  };

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    return handlers[info.menuItemId](info, tab);
  });
}

function updateMenus() {
  chrome.contextMenus.create({
    id: "testAutomated",
    title: 'Run automated tests',
    contexts: ["browser_action"],
  });

  chrome.contextMenus.create({
    id: "testLibrary",
    title: '- library tests',
    contexts: ["browser_action"],
  });

  chrome.contextMenus.create({
    id: "testCapture",
    title: '- capture tests',
    contexts: ["browser_action"],
  });

  chrome.contextMenus.create({
    id: "testManual",
    title: 'Run manual tests',
    contexts: ["browser_action"],
  });

  chrome.contextMenus.create({
    id: "testList",
    title: 'List all tests to run manually',
    contexts: ["browser_action"],
  });
}

function initActionListener() {
  chrome.browserAction.onClicked.addListener(() => {
    const url = chrome.runtime.getURL("test.html");
    chrome.tabs.create({url});
  });
}

initMenusListener();
updateMenus();
initActionListener();
