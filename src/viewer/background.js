/********************************************************************
 *
 * The background script for viewer functionality
 *
 *******************************************************************/

(function (window, undefined) {

function redirectUrl(tabId, url, filename) {
  var pathname = filename || url.pathname;

  if (scrapbook.options["viewer.viewHtz"] && pathname.toLowerCase().endsWith(".htz")) {
    // redirect
  } else if (scrapbook.options["viewer.viewMaff"] && pathname.toLowerCase().endsWith(".maff")) {
    // redirect
  } else {
    return; // no redirect
  }

  var newUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  newUrl.hash = url.hash;
  url.hash = "";
  newUrl.search = "?src=" + encodeURIComponent(url.href);
  newUrl = newUrl.href;

  // return {redirectUrl: newUrl}; // this doesn't work
  chrome.tabs.update(tabId, {url: newUrl}, () => {});
  return {cancel: true};
}

// This event won't fire when visiting a file URL if
// isAllowedFileSchemeAccess is false
chrome.webRequest.onBeforeRequest.addListener(function (details) {
  return redirectUrl(details.tabId, new URL(details.url));
}, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);

})(window, undefined);
