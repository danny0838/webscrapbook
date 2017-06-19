/********************************************************************
 *
 * Script for browserAction.html
 *
 *******************************************************************/

document.addEventListener('DOMContentLoaded', () => {
  // load languages
  scrapbook.loadLanguages(document);

  document.getElementById("captureTab").addEventListener('click', () => {
    chrome.runtime.getBackgroundPage((win) => {
      win.capturer.captureActiveTab();
    });
    window.close();
  });

  document.getElementById("captureTabSource").addEventListener('click', () => {
    chrome.runtime.getBackgroundPage((win) => {
      win.capturer.captureActiveTabSource();
    });
    window.close();
  });

  document.getElementById("captureAllTabs").addEventListener('click', () => {
    chrome.runtime.getBackgroundPage((win) => {
      win.capturer.captureAllTabs();
    });
    window.close();
  });

  document.getElementById("openOptions").addEventListener('click', () => {
    chrome.tabs.create({url: chrome.runtime.getURL("core/options.html"), active: true}, () => {
    });
    window.close();
  });
});
