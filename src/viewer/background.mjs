/******************************************************************************
 * The background script for viewer functionality
 *
 * @requires scrapbook
 * @module viewer
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  if (global.hasOwnProperty('viewer')) { return; }
  global.viewer = factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

const VIEWER_BEFORE_REQUEST_FILTER = {urls: ["file://*"], types: ["main_frame", "sub_frame"]};
const VIEWER_BEFORE_REQUEST_EXTRA = ["blocking"];
const VIEWER_HEADERS_RECEIVED_FILTER = {urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame"]};
const VIEWER_HEADERS_RECEIVED_EXTRA = ["blocking", "responseHeaders"];

let allowFileAccess;

function redirectUrl(tabId, type, url, filename, mime) {
  if (mime === "application/html+zip" && scrapbook.getOption("viewer.viewHtz")) {
    // redirect
  } else if (mime === "application/x-maff" && scrapbook.getOption("viewer.viewMaff")) {
    // redirect
  } else if (mime === "application/octet-stream" || mime === "application/zip" || !mime) {
    const pathname = (filename || url.pathname).toLowerCase();
    if (pathname.endsWith(".htz") && scrapbook.getOption("viewer.viewHtz")) {
      // redirect
    } else if (pathname.endsWith(".maff") && scrapbook.getOption("viewer.viewMaff")) {
      // redirect
    } else {
      return; // no redirect
    }
  } else {
    return; // no redirect
  }

  let newUrl = new URL(browser.runtime.getURL("viewer/load.html"));
  newUrl.hash = url.hash;
  url.hash = "";
  newUrl.search = "?src=" + encodeURIComponent(url.href);
  newUrl = newUrl.href;

  if (type === "sub_frame") {
    // Chromium < 119: an extension page in a frame cannot access IndexedDB.
    if (scrapbook.userAgent.is('chromium') && scrapbook.userAgent.major < 119) {
      const html = `<!DOCTYPE html>
<html dir="${scrapbook.lang('@@bidi_dir')}">
<head>
<meta charset="UTF-8">
<style>
a {
background: ${scrapbook.lang('@@bidi_start_edge')}/1em url("${scrapbook.escapeHtml(browser.runtime.getURL("core/scrapbook_128.png"))}") no-repeat;
padding-inline-start: 1em;
}
</style>
</head>
<body>
<a href="${scrapbook.escapeHtml(newUrl, false)}" target="_blank">View HTML archive</a>
</body>
</html>
`;
      const dataUrl = scrapbook.unicodeToDataUri(html, "text/html");
      return {redirectUrl: dataUrl};
    }
  }

  return {redirectUrl: newUrl};
}

function onBeforeRequest(details) {
  return redirectUrl(details.tabId, details.type, new URL(details.url), null, "application/octet-stream");
}

function onHeadersReceived(details) {
  const headers = details.responseHeaders;
  let mime;
  let filename;
  for (const header of headers) {
    switch (header.name.toLowerCase()) {
      case "content-type": {
        const contentType = scrapbook.parseHeaderContentType(header.value);
        mime = contentType.type;
        break;
      }
      case "content-disposition": {
        const contentDisposition = scrapbook.parseHeaderContentDisposition(header.value);

        // do not launch viewer if the file is marked to be downloaded
        if (contentDisposition.type !== "inline" && !scrapbook.getOption("viewer.viewAttachments")) {
          return;
        }

        filename = contentDisposition.parameters.filename;
        break;
      }
    }
  }

  return redirectUrl(details.tabId, details.type, new URL(details.url), filename, mime);
}

function toggleViewerListeners() {
  browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
  browser.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
  if (scrapbook.getOption("viewer.viewHtz") || scrapbook.getOption("viewer.viewMaff")) {
    if (allowFileAccess) {
      browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, VIEWER_BEFORE_REQUEST_FILTER, VIEWER_BEFORE_REQUEST_EXTRA);
    }
    browser.webRequest.onHeadersReceived.addListener(onHeadersReceived, VIEWER_HEADERS_RECEIVED_FILTER, VIEWER_HEADERS_RECEIVED_EXTRA);
  }
}

async function clearViewerCaches() {
  const tabs = await browser.tabs.query({});

  /* build a set with the ids that are still being viewed */
  const usedIds = new Set();
  for (const tab of tabs) {
    try {
      const u = new URL(tab.url);
      if (u.href.startsWith(browser.runtime.getURL("viewer/view.html") + '?')) {
        const id = u.searchParams.get('id');
        if (id) { usedIds.add(id); }
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  /* remove cache entry for all IDs that are not being viewed */
  const filter = {
    includes: {table: 'pageCache'},
    excludes: {id: usedIds},
  };
  await scrapbook.cache.removeAll(filter, 'indexedDB');
  await scrapbook.cache.removeAll(filter, 'storage');
}

async function init() {
  clearViewerCaches(); // async

  allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  await scrapbook.loadOptionsAuto;
  toggleViewerListeners();
}

init();

return {
  toggleViewerListeners,
};

}));
