'use strict';

chrome.browserAction.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("test.html");
  chrome.tabs.create({url});
});

chrome.contextMenus.create({
  title: 'Run automated tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=Automated tests");
    chrome.tabs.create({url});
  }
});

chrome.contextMenus.create({
  title: 'Run manual tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=Manual tests");
    chrome.tabs.create({url});
  }
});
