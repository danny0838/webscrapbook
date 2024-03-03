'use strict';

chrome.browserAction.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("test.html");
  chrome.tabs.create({url});
});

chrome.contextMenus.create({
  title: 'Run automated tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=^(?!Manual tests)");
    chrome.tabs.create({url});
  }
});

chrome.contextMenus.create({
  title: '- library tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=^(?!Capture tests|Manual tests)");
    chrome.tabs.create({url});
  }
});

chrome.contextMenus.create({
  title: '- capture tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=^Capture tests");
    chrome.tabs.create({url});
  }
});

chrome.contextMenus.create({
  title: 'Run manual tests',
  contexts: ["browser_action"],
  onclick: (info, tab) => {
    const url = chrome.runtime.getURL("test.html?grep=^Manual tests");
    chrome.tabs.create({url});
  }
});
