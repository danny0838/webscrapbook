/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

capturer.isContentScript = false;

/**
 * @type {Object.<string~timeId, {usedDocumentNames: Object.<string~documentName, number~count>, fileToUrl: Object.<string~filename, string~src>}>}
 */
capturer.captureInfo = {};
 
/**
 * @type {Object.<string~downloadId, {timeId: string, src: string, autoErase: boolean, onComplete: function, onError: function}>}
 */
capturer.downloadInfo = {};

/**
 * Prevent filename conflictAction. Appends a number if the given filename is used.
 *
 * @param {string} timeId
 * @param {string} filename - The unfixed filename.
 * @param {string|true} src - The source URL of the filename source. Use true means always create a new filename.
 * @return {{newFilename: string, isDuplicate: boolean}}
 */
capturer.getUniqueFilename = function (timeId, filename, src) {
  if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
  capturer.captureInfo[timeId].fileToUrl = capturer.captureInfo[timeId].fileToUrl || {
    "index.html": true,
    "index.xhtml": true,
    "index.dat": true,
    "index.rdf": true,
  };

  var newFilename = filename || "untitled";
  newFilename = scrapbook.validateFilename(newFilename);
  var {base: newFilenameBase, extension: newFilenameExt} = scrapbook.filenameParts(newFilename);
  newFilenameBase = scrapbook.crop(scrapbook.crop(newFilenameBase, 240, true), 128);
  newFilenameExt = newFilenameExt ? "." + newFilenameExt : "";
  tokenSrc = (typeof src === "string") ? scrapbook.splitUrlByAnchor(src)[0] : src;

  var seq = 0;
  newFilename = newFilenameBase + newFilenameExt;
  var newFilenameCI = newFilename.toLowerCase();
  while (capturer.captureInfo[timeId].fileToUrl[newFilenameCI] !== undefined) {
    if (capturer.captureInfo[timeId].fileToUrl[newFilenameCI] === tokenSrc) {
      return {newFilename: newFilename, isDuplicate: true};
    }
    newFilename = newFilenameBase + "-" + (++seq) + newFilenameExt;
    newFilenameCI = newFilename.toLowerCase(); 
  }
  capturer.captureInfo[timeId].fileToUrl[newFilenameCI] = tokenSrc;
  return {newFilename: newFilename, isDuplicate: false};
};

capturer.captureActiveTab = function () {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    capturer.captureTab(tabs[0]);
  });
};

capturer.captureAllTabs = function () {
  chrome.tabs.query({currentWindow: true}, (tabs) => {
    var delay = 0;
    tabs.forEach((tab) => {
      setTimeout(() => {
        capturer.captureTab(tab, true);
      }, delay);
      delay += 5;
    });
  });
};

capturer.captureTab = function (tab, quiet) {
  var cmd = "capturer.captureDocumentOrFile";
  var timeId = scrapbook.dateToId();
  var tabId = tab.id;
  var message = {
    cmd: cmd,
    settings: {
      timeId: timeId,
      frameIsMain: true,
      documentName: "index",
    },
    options: scrapbook.getOptions("capture"),
  };

  isDebug && console.debug(cmd + " (main) send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, {frameId: 0}, (response) => {
    isDebug && console.debug(cmd + " (main) response", tabId, response);
    if (!response) {
      if (!quiet) {
        alert(scrapbook.lang("ErrorCapture", [scrapbook.lang("ErrorContentScriptNotReady")]));
      } else{
        console.error(scrapbook.lang("ErrorCapture", [scrapbook.lang("ErrorContentScriptNotReady2", [tab.url, tab.id])]));
      }
      return;
    }
    if (response.error) {
      console.error(scrapbook.lang("ErrorCapture", ["tab " + tabId]));
      return;
    }
    delete(capturer.captureInfo[timeId]);
  });
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.url
 */
capturer.captureUrl = function (params, callback) {
  isDebug && console.debug("call: captureUrl", params);

  var sourceUrl = params.url;
  var settings = params.settings;
  var options = params.options;

  var filename;
  
  var xhr = new XMLHttpRequest();
  var xhr_shutdown = function () {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      // if header Content-Disposition is defined, use it
      try {
        var headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        var contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
        filename = contentDisposition.parameters.filename;
      } catch (ex) {}
    } else if (xhr.readyState === 4) {
      if (xhr.status == 200 || xhr.status == 0) {
        var doc = xhr.response;
        if (doc) {
          capturer.captureDocumentOrFile(doc, settings, options, callback);
        } else {
          capturer.captureFile({
            url: params.url,
            settings: params.settings,
            options: params.options
          }, callback);
        }
      } else {
        xhr.onerror();
      }
    }
  };
  xhr.ontimeout = function () {
    console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
    callback({url: capturer.getErrorUrl(sourceUrl, params.options), error: "timeout"});
    xhr_shutdown();
  };
  xhr.onerror = function () {
    var err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({url: capturer.getErrorUrl(sourceUrl, params.options), error: err});
    xhr_shutdown();
  };
  xhr.responseType = "document";
  xhr.open("GET", sourceUrl, true);
  xhr.send();

  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.url
 */
capturer.captureFile = function (params, callback) {
  isDebug && console.debug("call: captureFile", params);

  var timeId = params.settings.timeId;
  var sourceUrl = params.url;
  var settings = params.settings;
  var options = params.options;

  capturer.downloadFile({
    url: sourceUrl,
    settings: settings,
    options: options
  }, (response) => {
    if (settings.frameIsMain) {
      let meta = params.options["capture.recordDocumentMeta"] ? ' data-sb' + timeId + '-source="' + sourceUrl + '"' : "";
      // for the main frame, create a index.html that redirects to the file
      let html = '<html' + meta + '><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;URL=' + response.url + '"></head><body></body></html>';
      capturer.saveDocument({
        frameUrl: sourceUrl,
        settings: settings,
        options: options,
        data: {
          documentName: settings.documentName,
          mime: "text/html",
          content: html
        }
      }, callback);
    } else {
      callback({
        frameUrl: sourceUrl,
        filename: response.url
      });
    }
  });

  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 */
capturer.registerDocument = function (params, callback) {
  isDebug && console.debug("call: registerDocument", params);

  var timeId = params.settings.timeId;
  var documentName = params.settings.documentName;
  if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
  if (!capturer.captureInfo[timeId].usedDocumentNames) { capturer.captureInfo[timeId].usedDocumentNames = {}; }
  if (!capturer.captureInfo[timeId].usedDocumentNames[documentName]) { capturer.captureInfo[timeId].usedDocumentNames[documentName] = 0; }
  var fixedDocumentName = (capturer.captureInfo[timeId].usedDocumentNames[documentName] > 0) ?
      (documentName + "_" + capturer.captureInfo[timeId].usedDocumentNames[documentName]) :
      documentName;
  capturer.captureInfo[timeId].usedDocumentNames[documentName]++;
  callback({documentName: fixedDocumentName});
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.frameUrl
 *     - {{documentName: string, mime: string, charset: string, content: string}} params.data
 */
capturer.saveDocument = function (params, callback) {
  isDebug && console.debug("call: saveDocument", params);

  var timeId = params.settings.timeId;
  var frameUrl = params.frameUrl;
  var targetDir = params.options["capture.dataFolder"] + "/" + timeId;
  var autoErase = !params.settings.frameIsMain;
  var filename = params.data.documentName + "." + ((params.data.mime === "application/xhtml+xml") ? "xhtml" : "html");
  filename = scrapbook.validateFilename(filename);
  filename = capturer.getUniqueFilename(timeId, filename, true).newFilename;

  // save as data URI?
  // the main frame should still be downloaded
  if (params.options["capture.saveFileAsDataUri"] && !params.settings.frameIsMain) {
    let dataUri = scrapbook.stringToDataUri(params.data.content, params.data.mime, params.data.charset);
    callback({timeId: timeId, frameUrl: frameUrl, targetDir: targetDir, filename: dataUri});
    return true; // async response
  }

  var downloadParams = {
    url: URL.createObjectURL(new Blob([params.data.content], {type: params.data.mime})),
    filename: targetDir + "/" + filename,
    conflictAction: "uniquify",
  };

  isDebug && console.debug("download start", downloadParams);
  chrome.downloads.download(downloadParams, (downloadId) => {
    isDebug && console.debug("download response", downloadId);
    if (downloadId) {
      capturer.downloadInfo[downloadId] = {
        timeId: timeId,
        src: frameUrl,
        autoErase: autoErase,
        onComplete: () => {
          callback({timeId: timeId, frameUrl: frameUrl, targetDir: targetDir, filename: filename});
        },
        onError: (err) => {
          callback({url: capturer.getErrorUrl(frameUrl, params.options), error: err});
        }
      };
    } else {
      let err = chrome.runtime.lastError.message;
      callback({url: capturer.getErrorUrl(frameUrl, params.options), error: err});
    }
  });
  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.url
 *     - {string} params.rewriteMethod
 */
capturer.downloadFile = function (params, callback) {
  isDebug && console.debug("call: downloadFile", params);

  var settings = params.settings;
  var options = params.options;
  var timeId = settings.timeId;
  var targetDir = options["capture.dataFolder"] + "/" + timeId;
  var sourceUrl = params.url; sourceUrl = scrapbook.splitUrlByAnchor(sourceUrl)[0];
  var rewriteMethod = params.rewriteMethod;
  var filename = scrapbook.urlToFilename(sourceUrl);
  var isDuplicate;
  var headers = {};

  // special management of data URI
  if (sourceUrl.startsWith("data:")) {
    // params are identical
    capturer.downloadDataUri(params, callback);
    return true; // async response
  }

  var xhr = new XMLHttpRequest();

  var xhr_shutdown = function () {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 2) {
      // determine the filename
      // if header Content-Disposition is defined, use it
      try {
        let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        if (headerContentDisposition) {
          let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          headers.isAttachment = (contentDisposition.type === "attachment");
          headers.filename = contentDisposition.parameters.filename;
          filename = headers.filename || filename;
        }
      } catch (ex) {}

      // if no file extension, give one according to header Content-Type.
      try {
        let headerContentType = xhr.getResponseHeader("Content-Type");
        if (headerContentType) {
          let contentType = scrapbook.parseHeaderContentType(headerContentType);
          headers.contentType = contentType.contentType;
          headers.charset = contentType.charset;
          if (headers.contentType) {
            let {base, extension} = scrapbook.filenameParts(filename);
            if (!extension) {
              extension = Mime.prototype.extension(headers.contentType);
              filename = base + "." + (extension || "dat");
            }
          }
        }
      } catch (ex) {
        console.error(ex);
      }

      filename = scrapbook.validateFilename(filename);
      if (!options["capture.saveFileAsDataUri"]) {
        ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
        if (isDuplicate) {
          callback({url: filename, isDuplicate: true});
          xhr_shutdown();
        }
      }
    } else if (xhr.readyState === 4) {
      if ((xhr.status == 200 || xhr.status == 0) && xhr.response) {
        if (rewriteMethod && capturer[rewriteMethod]) {
          capturer[rewriteMethod]({
            settings: settings,
            options: options,
            data: xhr.response,
            charset: headers.charset,
            url: xhr.responseURL
          }, (response) => {
            capturer.saveBlob({
              settings: settings,
              options: options,
              blob: response,
              filename: filename,
              sourceUrl: sourceUrl,
            }, callback);
          });
        } else {
          capturer.saveBlob({
            settings: settings,
            options: options,
            blob: xhr.response,
            filename: filename,
            sourceUrl: sourceUrl,
          }, callback);
        }
      } else {
        xhr.onerror();
      }
    }
  };

  xhr.ontimeout = function () {
    console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
    callback({url: capturer.getErrorUrl(sourceUrl, options), error: "timeout"});
    xhr_shutdown();
  };

  xhr.onerror = function () {
    let err = [xhr.status, xhr.statusText].join(" ");
    console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
    callback({url: capturer.getErrorUrl(sourceUrl, options), error: err});
    xhr_shutdown();
  };

  xhr.responseType = "blob";
  xhr.open("GET", sourceUrl, true);
  xhr.send();

  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.url
 *     - {string} params.rewriteMethod
 */
capturer.downloadDataUri = function (params, callback) {
  isDebug && console.debug("call: downloadDataUri", params);

  var settings = params.settings;
  var options = params.options;
  var timeId = settings.timeId;
  var targetDir = options["capture.dataFolder"] + "/" + timeId;
  var sourceUrl = params.url; sourceUrl = scrapbook.splitUrlByAnchor(sourceUrl)[0];
  var rewriteMethod = params.rewriteMethod;
  var filename;
  var isDuplicate;

  if (options["capture.saveDataUriAsFile"] && !options["capture.saveFileAsDataUri"]) {
    let file = scrapbook.dataUriToFile(sourceUrl);
    if (file) {
      filename = file.name;
      filename = scrapbook.validateFilename(filename);
      ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
      if (!isDuplicate) {
        if (rewriteMethod && capturer[rewriteMethod]) {
          capturer[rewriteMethod]({
            settings: settings,
            options: options,
            data: file,
            charset: null,
            url: null
          }, (response) => {
            capturer.saveBlob({
              settings: settings,
              options: options,
              blob: response,
              filename: filename,
              sourceUrl: sourceUrl,
            }, callback);
          });
        } else {
          capturer.saveBlob({
            settings: settings,
            options: options,
            blob: file,
            filename: filename,
            sourceUrl: sourceUrl,
          }, callback);
        }
      } else {
        callback({url: filename, isDuplicate: true});
      }
    } else {
      callback({url: capturer.getErrorUrl(sourceUrl, options), error: "data URI cannot be read as file"});
    }
  } else {
    callback({url: sourceUrl});
  }

  return true; // async response
};

/**
 * @kind invokable
 * @param {Object} params 
 *     - {Object} params.settings
 *     - {Object} params.options
 *     - {string} params.blob
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 */
capturer.saveBlob = function (params, callback) {
  isDebug && console.debug("call: saveBlob", params);

  var settings = params.settings;
  var options = params.options;
  var timeId = settings.timeId;
  var blob = params.blob;
  var filename = params.filename;
  var sourceUrl = params.sourceUrl;
  var targetDir = options["capture.dataFolder"] + "/" + timeId;

  if (!blob) {
    callback({url: capturer.getErrorUrl(sourceUrl, options)});
  }

  // save blob as data URI?
  if (options["capture.saveFileAsDataUri"]) {
    let reader = new FileReader();
    reader.onloadend = function(event) {
      let dataUri = event.target.result;
      callback({url: dataUri});
    }
    reader.readAsDataURL(blob);
    return;
  }

  // download the data
  var downloadParams = {
    url: URL.createObjectURL(blob),
    filename: targetDir + "/" + filename,
    conflictAction: "uniquify",
  };

  isDebug && console.debug("download start", downloadParams);
  chrome.downloads.download(downloadParams, (downloadId) => {
    isDebug && console.debug("download response", downloadId);
    if (downloadId) {
      capturer.downloadInfo[downloadId] = {
        timeId: timeId,
        src: sourceUrl,
        autoErase: true,
        onComplete: () => {
          // @TODO: do we need to escape the URL to be safe to included in CSS or so?
          callback({url: filename});
        },
        onError: (err) => {
          callback({url: capturer.getErrorUrl(sourceUrl, options), error: err});
        }
      };
    } else {
      let err = chrome.runtime.lastError.message;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
      callback({url: capturer.getErrorUrl(sourceUrl, options), error: err});
    }
  });

  return true; // async response
};


/**
 * Events handling
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  isDebug && console.debug(message.cmd + " receive", sender.tab.id, message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let method = message.cmd.slice(9);
    if (capturer[method]) {
      message.args.tabId = sender.tab.id;
      return capturer[method](message.args, (response) => {
        sendResponse(response);
      });
    }
  }
});

chrome.downloads.onChanged.addListener((downloadDelta) => {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  var downloadId = downloadDelta.id;

  var erase = function (downloadId) {
    if (capturer.downloadInfo[downloadId].autoErase) {
      chrome.downloads.erase({id: downloadId}, (erasedIds) => {});
    }
    delete capturer.downloadInfo[downloadId];
  };

  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    // erase the download history of additional downloads (those recorded in capturer.downloadEraseIds)
    capturer.downloadInfo[downloadId].onComplete();
    erase(downloadId);
  } else if (downloadDelta.error) {
    chrome.downloads.search({id: downloadId}, (results) => {
      let err = results[0].error;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [capturer.downloadInfo[downloadId].src, err]));
      capturer.downloadInfo[downloadId].onError(err);
      erase(downloadId);
    });
  }
});

// isDebug && console.debug("loading background.js");
