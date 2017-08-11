/********************************************************************
 *
 * The background script for viewer functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

(function (window, undefined) {

function redirectUrl(tabId, url, filename, mime) {
  if (mime === "application/html+zip" && scrapbook.options["viewer.viewHtz"]) {
    // redirect
  } else if (mime === "application/x-maff" && scrapbook.options["viewer.viewMaff"]) {
    // redirect
  } else {
    let pathname = (filename || url.pathname).toLowerCase();
    if (pathname.endsWith(".htz") && scrapbook.options["viewer.viewHtz"]) {
      // redirect
    } else if (pathname.endsWith(".maff") && scrapbook.options["viewer.viewMaff"]) {
      // redirect
    } else {
      return; // no redirect
    }
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

chrome.extension.isAllowedFileSchemeAccess((isAllowedAccess) => {
  if (!isAllowedAccess) { return; }

  // This event won't fire when visiting a file URL if
  // isAllowedFileSchemeAccess is false
  chrome.webRequest.onBeforeRequest.addListener(function (details) {
    return redirectUrl(details.tabId, new URL(details.url));
  }, {urls: ["file://*", "ftp://*/*"], types: ["main_frame"]}, ["blocking"]);
});

chrome.webRequest.onHeadersReceived.addListener(function (details) {
  let headers = details.responseHeaders;
  for (let i in headers) {
    switch (headers[i].name.toLowerCase()) {
      case "content-type": {
        let contentType = scrapbook.parseHeaderContentType(headers[i].value);
        let mime = contentType.type;
        return redirectUrl(details.tabId, new URL(details.url), null, mime);
      }
      case "content-disposition": {
        let contentDisposition = scrapbook.parseHeaderContentDisposition(headers[i].value);
        let filename = contentDisposition.parameters.filename;
        return redirectUrl(details.tabId, new URL(details.url), filename);
      }
    }
  }

  return redirectUrl(details.tabId, new URL(details.url));
}, {urls: ["http://*/*", "https://*/*"], types: ["main_frame"]}, ["blocking", "responseHeaders"]);

})(window, undefined);
