/********************************************************************
 *
 * The background script for viewer functionality
 *
 *******************************************************************/

chrome.webRequest.onBeforeRequest.addListener(function (details) {
  if (details.frameId !== 0) { return; }

  var url = new URL(details.url);
  if (!/\.htz/i.test(url.pathname) || url.searchParams.has("noredirect")) { return; }

  var newUrl = chrome.runtime.getURL("viewer/viewer.html" + "?src=" + encodeURIComponent(url.href));
  // return {redirectUrl: newUrl}; // this doesn't work
  chrome.tabs.update(details.tabId, {url: newUrl}, () => {});
  return {cancel: true};
}, { urls: ["<all_urls>"] }, ["blocking"]);
