/********************************************************************
 *
 * Script for browserAction.html
 *
 *******************************************************************/

document.addEventListener('DOMContentLoaded', () => {
  // load languages
  scrapbook.loadLanguages(document);

  document.getElementById("captureTab").addEventListener('click', () => {
    var win = chrome.extension.getBackgroundPage();
    win.capturer.captureActiveTab();
    window.close();
  });

  document.getElementById("captureTabSource").addEventListener('click', () => {
    var win = chrome.extension.getBackgroundPage();
    win.capturer.captureActiveTabSource();
    window.close();
  });

  document.getElementById("captureAllTabs").addEventListener('click', () => {
    var win = chrome.extension.getBackgroundPage();
    win.capturer.captureAllTabs();
    window.close();
  });

  document.getElementById("openOptions").addEventListener('click', () => {
    window.open(chrome.runtime.getURL("core/options.html"));
    window.close();
  });
});
