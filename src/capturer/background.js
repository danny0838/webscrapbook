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
 * @param {string} filename - The unfixed filename. Should be validated (via scrapbook.validateFilename).
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
  var [newFilenameBase, newFilenameExt] = scrapbook.filenameParts(newFilename);
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
      favIconUrl: tab.favIconUrl,
      recurseChain: []
    },
    options: capturer.fixOptions(scrapbook.getOptions("capture"))
  };

  isDebug && console.debug(cmd + " (main) send", tabId, message);
  chrome.tabs.sendMessage(tabId, message, {frameId: 0}, (response) => {
    isDebug && console.debug(cmd + " (main) response", tabId, response);
    var source = "[" + tab.id + "] " + tab.url;
    if (!response) {
      if (!quiet) {
        alert(scrapbook.lang("ErrorCapture", [source, scrapbook.lang("ErrorContentScriptNotReady")]));
      } else{
        console.error(scrapbook.lang("ErrorCapture", [source, scrapbook.lang("ErrorContentScriptNotReady")]));
      }
    } else if (response.error) {
      console.error(scrapbook.lang("ErrorCapture", [source, scrapbook.lang("ErrorCaptureGeneral")]));
    }
    delete(capturer.captureInfo[timeId]);
  });
};

capturer.captureActiveTabSource = function () {
  chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    capturer.captureTabSource(tabs[0]);
  });
};

capturer.captureTabSource = function (tab) {
  var timeId = scrapbook.dateToId();
  var tabId = tab.id;
  var message = {
    url: tab.url,
    settings: {
      timeId: timeId,
      frameIsMain: true,
      documentName: "index",
      recurseChain: []
    },
    options: capturer.fixOptions(scrapbook.getOptions("capture"))
  };

  isDebug && console.debug("(main) send", tabId, message);
  capturer.captureUrl(message, function (response) {
    isDebug && console.debug("(main) response", tabId, response);
    var source = tab.url;
    if (!response) {
      alert(scrapbook.lang("ErrorCapture", [source, scrapbook.lang("ErrorContentScriptNotReady")]));
    } else if (response.error) {
      console.error(scrapbook.lang("ErrorCapture", [source, scrapbook.lang("ErrorCaptureGeneral")]));
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

  scrapbook.xhr({
    url: sourceUrl,
    responseType: "document",
    onreadystatechange: function (xhr, xhrAbort) {
      if (xhr.readyState === 2 && xhr.status !== 0) {
        if (!params.settings.documentName) {
          let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
          let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          let filename = contentDisposition.parameters.filename || scrapbook.urlToFilename(sourceUrl);
          let headerContentType = xhr.getResponseHeader("Content-Type");
          let contentType = scrapbook.parseHeaderContentType(headerContentType);
          let mime = contentType.type || Mime.prototype.lookup(filename) || "text/html";
          if (["text/html", "application/xhtml+xml"].indexOf(mime) !== -1) {
            let exts = Mime.prototype.allExtensions(mime);
            for (let i = 0, I = exts.length; i < I; i++) {
              let ext = "." + exts[i];
              if (filename.endsWith(ext)) {
                filename = filename.slice(0, -ext.length);
                break;
              }
            }
          }
          params.settings.documentName = filename;
        }
      }
    },
    onloadend: function (xhr, xhrAbort) {
      let doc = xhr.response;
      if (doc) {
        capturer.captureDocumentOrFile(doc, settings, options, callback);
      } else {
        capturer.captureFile({
          url: params.url,
          settings: params.settings,
          options: params.options
        }, callback);
      }
    },
    ontimeout: function (xhr, xhrAbort) {
      console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
      callback({url: capturer.getErrorUrl(sourceUrl, params.options), error: "timeout"});
    },
    onerror: function (xhr, xhrAbort) {
      let err = xhr.statusText ? xhr.status + " " + xhr.statusText : xhr.status;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
      callback({url: capturer.getErrorUrl(sourceUrl, params.options), error: err});
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
 *     - {{title: string}} params.data
 */
capturer.captureFile = function (params, callback) {
  isDebug && console.debug("call: captureFile", params);

  var timeId = params.settings.timeId;
  var sourceUrl = params.url;
  var settings = params.settings;
  var options = params.options;
  var data = params.data;
  var title = data && data.title;

  capturer.downloadFile({
    url: sourceUrl,
    settings: settings,
    options: options
  }, (response) => {
    if (settings.frameIsMain) {
      let meta = params.options["capture.recordDocumentMeta"] ? ' data-sb' + timeId + '-source="' + scrapbook.escapeHtml(sourceUrl) + '"' : "";
      // for the main frame, create a index.html that redirects to the file
      let html = '<!DOCTYPE html>\n' +
          '<html' + meta + '>\n' +
          '<head>\n' +
          '<meta charset="UTF-8">\n' +
          '<meta http-equiv="refresh" content="0;url=' + scrapbook.escapeHtml(response.url) + '">\n' +
          (title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : '') +
          '</head>\n' +
          '<body>\n' +
          '</body>\n' +
          '</html>';
      capturer.saveDocument({
        sourceUrl: sourceUrl,
        documentName: settings.documentName,
        settings: settings,
        options: options,
        data: {
          title: title,
          mime: "text/html",
          content: html
        }
      }, callback);
    } else {
      callback({
        timeId: timeId,
        sourceUrl: sourceUrl,
        targetDir: response.targetDir, 
        filename: response.filename,
        url: response.url
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
 *     - {string} params.sourceUrl
 *     - {string} params.documentName
 *     - {{mime: string, charset: string, content: string, title: string}} params.data
 */
capturer.saveDocument = function (params, callback) {
  isDebug && console.debug("call: saveDocument", params);

  var settings = params.settings;
  var options = params.options;
  var sourceUrl = params.sourceUrl;
  var documentName = params.documentName;
  var data = params.data;
  var timeId = settings.timeId;
  var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

  switch (options["capture.saveAs"]) {
    case "singleHtml": {
      if (!settings.frameIsMain) {
        let dataUri = scrapbook.stringToDataUri(data.content, data.mime, data.charset);
        callback({timeId: timeId, sourceUrl: sourceUrl, url: dataUri});
      } else {
        var targetDir = options["capture.dataFolder"];
        var filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
        filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
        var ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
        if (!filename.endsWith(ext)) filename += ext;

        capturer.saveBlob({
          timeId: timeId,
          blob: new Blob([data.content], {type: data.mime}),
          directory: targetDir,
          filename: filename,
          sourceUrl: sourceUrl,
          autoErase: autoErase,
          savePrompt: options["capture.savePrompt"]
        }, () => {
          callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
        }, (ex) => {
          callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
        });
      }
      break;
    }

    case "zip": {
      var ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
      var filename = documentName + ext;
      filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
      filename = capturer.getUniqueFilename(timeId, filename, true).newFilename;

      if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
      var zip = capturer.captureInfo[timeId].zip = capturer.captureInfo[timeId].zip || new JSZip();

      zip.file(filename, new Blob([data.content], {type: data.mime}), {
        compression: "DEFLATE",
        compressionOptions: {level: 9}
      });

      if (!settings.frameIsMain) {
        callback({timeId: timeId, sourceUrl: sourceUrl, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
      } else {
        // create index.html that redirects to index.xhtml
        if (ext === ".xhtml") {
          let html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
          zip.file("index.html", new Blob([html], {type: "text/html"}), {
            compression: "DEFLATE",
            compressionOptions: {level: 9}
          });
        }

        // generate and download the zip file
        zip.generateAsync({type: "blob"}).then((zipBlob) => {
          var targetDir = options["capture.dataFolder"];
          var filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
          filename += ".htz";

          capturer.saveBlob({
            timeId: timeId,
            blob: zipBlob,
            directory: targetDir,
            filename: filename,
            sourceUrl: sourceUrl,
            autoErase: false,
            savePrompt: options["capture.savePrompt"]
          }, () => {
            callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
          }, (ex) => {
            callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
          });
        });
      }
      break;
    }

    case "maff": {
      var ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
      var filename = documentName + ext;
      filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
      filename = capturer.getUniqueFilename(timeId, filename, true).newFilename;

      if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
      var zip = capturer.captureInfo[timeId].zip = capturer.captureInfo[timeId].zip || new JSZip();

      zip.file(timeId + "/" + filename, new Blob([data.content], {type: data.mime}), {
        compression: "DEFLATE",
        compressionOptions: {level: 9}
      });

      if (!settings.frameIsMain) {
        callback({timeId: timeId, sourceUrl: sourceUrl, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
      } else {
        // create index.html that redirects to index.xhtml
        if (ext === ".xhtml") {
          let html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
          zip.file(timeId + "/" + "index.html", new Blob([html], {type: "text/html"}), {
            compression: "DEFLATE",
            compressionOptions: {level: 9}
          });
        }

        // generate index.rdf
        var rdfContent = '<?xml version="1.0"?>\n' +
            '<RDF:RDF xmlns:MAF="http://maf.mozdev.org/metadata/rdf#"\n' +
            '         xmlns:NC="http://home.netscape.com/NC-rdf#"\n' +
            '         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
            '  <RDF:Description RDF:about="urn:root">\n' +
            '    <MAF:originalurl RDF:resource="' + scrapbook.escapeHtml(sourceUrl) + '"/>\n' +
            '    <MAF:title RDF:resource="' + scrapbook.escapeHtml(data.title) + '"/>\n' +
            '    <MAF:archivetime RDF:resource="' + scrapbook.escapeHtml(scrapbook.idToDate(timeId).toUTCString()) + '"/>\n' +
            '    <MAF:indexfilename RDF:resource="' + filename + '"/>\n' +
            '    <MAF:charset RDF:resource="UTF-8"/>\n' +
            '  </RDF:Description>\n' +
            '</RDF:RDF>\n';

        zip.file(timeId + "/" + "index.rdf", new Blob([rdfContent], {type: "application/rdf+xml"}), {
          compression: "DEFLATE",
          compressionOptions: {level: 9}
        });

        // generate and download the zip file
        zip.generateAsync({type: "blob"}).then((zipBlob) => {
          var targetDir = options["capture.dataFolder"];
          var filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
          filename += ".maff";

          capturer.saveBlob({
            timeId: timeId,
            blob: zipBlob,
            directory: targetDir,
            filename: filename,
            sourceUrl: sourceUrl,
            autoErase: false,
            savePrompt: options["capture.savePrompt"]
          }, () => {
            callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
          }, (ex) => {
            callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
          });
        });
      }
      break;
    }

    case "downloads":
    default: {
      var targetDir = options["capture.dataFolder"] + "/" + timeId;
      var ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
      var filename = documentName + ext;
      filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
      filename = capturer.getUniqueFilename(timeId, filename, true).newFilename;

      if (!(settings.frameIsMain && (ext === ".xhtml"))) {
        var autoErase = !settings.frameIsMain;
        var saveBlobComplete = function () {
          callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
        };
      } else {
        var autoErase = true;
        var saveBlobComplete = function () {
          // create index.html that redirects to index.xhtml
          let filename = "index.html";
          let html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
          capturer.saveBlob({
            timeId: timeId,
            blob: new Blob([html], {type: "text/html"}),
            directory: targetDir,
            filename: filename,
            sourceUrl: sourceUrl,
            autoErase: false,
            savePrompt: false
          }, () => {
            callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
          }, (ex) => {
            callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
          });
        };
      }

      capturer.saveBlob({
        timeId: timeId,
        blob: new Blob([data.content], {type: data.mime}),
        directory: targetDir,
        filename: filename,
        sourceUrl: sourceUrl,
        autoErase: autoErase,
        savePrompt: false
      }, saveBlobComplete, (ex) => {
        callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
      });
      break;
    }
  }

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
  var sourceUrl = params.url;
  var rewriteMethod = params.rewriteMethod;

  var headers = {};
  var filename;
  var isDuplicate;
  var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

  // special management of data URI
  if (sourceUrl.startsWith("data:")) {
    // params are identical
    capturer.downloadDataUri(params, callback);
    return true; // async response
  }

  var determineFilename = function (xhrAbort) {
    // run this only once
    if (arguments.callee.done) { return; }
    arguments.callee.done = true;

    // if filename defined by header Content-Disposition, use it
    // otherwise use the filename from URL
    filename = headers.filename || scrapbook.urlToFilename(sourceUrl);

    // if no file extension, give one according to header Content-Type
    if (headers.contentType) {
      let [base, extension] = scrapbook.filenameParts(filename);
      if (!extension) {
        extension = Mime.prototype.extension(headers.contentType);
        if (extension) {
          filename = base + "." + extension;
        }
      }
    }

    filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
    // singleHtml mode always save as dataURI and does not need to uniquify
    if (options["capture.saveAs"] !== "singleHtml") {
      ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
      if (isDuplicate) {
        callback({filename: filename, url: scrapbook.escapeFilename(filename) + hash, isDuplicate: true});
        xhrAbort();
      }
    }
  };

  scrapbook.xhr({
    url: sourceUrl,
    responseType: "blob",
    onreadystatechange: function (xhr, xhrAbort) {
      if (xhr.readyState === 2 && xhr.status !== 0) {
        let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        if (headerContentDisposition) {
          let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          headers.isAttachment = (contentDisposition.type === "attachment");
          headers.filename = contentDisposition.parameters.filename;
        }
        let headerContentType = xhr.getResponseHeader("Content-Type");
        if (headerContentType) {
          let contentType = scrapbook.parseHeaderContentType(headerContentType);
          headers.contentType = contentType.type;
          headers.charset = contentType.parameters.charset;
        }
        determineFilename(xhrAbort);
      }
    },
    onloadend: function (xhr, xhrAbort) {
      determineFilename(xhrAbort);
      if (rewriteMethod && capturer[rewriteMethod]) {
        capturer[rewriteMethod]({
          settings: settings,
          options: options,
          data: xhr.response,
          charset: headers.charset,
          url: xhr.responseURL
        }, (response) => {
          capturer.downloadBlob({
            settings: settings,
            options: options,
            blob: response,
            filename: filename,
            sourceUrl: sourceUrl,
          }, callback);
        });
      } else {
        capturer.downloadBlob({
          settings: settings,
          options: options,
          blob: xhr.response,
          filename: filename,
          sourceUrl: sourceUrl,
        }, callback);
      }
    },
    ontimeout: function (xhr, xhrAbort) {
      console.warn(scrapbook.lang("ErrorFileDownloadTimeout", sourceUrl));
      callback({url: capturer.getErrorUrl(sourceUrl, options), error: "timeout"});
    },
    onerror: function (xhr, xhrAbort) {
      let err = xhr.statusText ? xhr.status + " " + xhr.statusText : xhr.status;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
      callback({url: capturer.getErrorUrl(sourceUrl, options), error: err});
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
capturer.downloadDataUri = function (params, callback) {
  isDebug && console.debug("call: downloadDataUri", params);

  var settings = params.settings;
  var options = params.options;
  var timeId = settings.timeId;
  var targetDir = options["capture.dataFolder"] + "/" + timeId;
  var sourceUrl = params.url;
  var rewriteMethod = params.rewriteMethod;
  var filename;
  var isDuplicate;
  var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

  if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
    let file = scrapbook.dataUriToFile(scrapbook.splitUrlByAnchor(sourceUrl)[0]);
    if (file) {
      filename = file.name;
      filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
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
            capturer.downloadBlob({
              settings: settings,
              options: options,
              blob: response,
              filename: filename,
              sourceUrl: sourceUrl,
            }, callback);
          });
        } else {
          capturer.downloadBlob({
            settings: settings,
            options: options,
            blob: file,
            filename: filename,
            sourceUrl: sourceUrl,
          }, callback);
        }
      } else {
        callback({filename: filename, url: scrapbook.escapeFilename(filename) + hash, isDuplicate: true});
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
 *     - {string} params.filename - validated and unique
 *     - {string} params.sourceUrl
 */
capturer.downloadBlob = function (params, callback) {
  isDebug && console.debug("call: downloadBlob", params);

  var settings = params.settings;
  var options = params.options;
  var timeId = settings.timeId;
  var blob = params.blob;
  var filename = params.filename;
  var sourceUrl = params.sourceUrl;
  var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

  if (!blob) {
    callback({url: capturer.getErrorUrl(sourceUrl, options)});
  }

  switch (options["capture.saveAs"]) {
    case "singleHtml": {
      let reader = new FileReader();
      reader.onloadend = function (event) {
        let dataUri = event.target.result;
        if (filename) {
          dataUri = dataUri.replace(";", ";filename=" + encodeURIComponent(filename) + ";");
        }
        callback({url: dataUri + hash});
      }
      reader.readAsDataURL(blob);
      break;
    }

    case "zip": {
      if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
      var zip = capturer.captureInfo[timeId].zip = capturer.captureInfo[timeId].zip || new JSZip();

      if (/^text\/|\b(?:xml|json|javascript)\b/.test(blob.type) && blob.size >= 128) {
        zip.file(filename, blob, {
          compression: "DEFLATE",
          compressionOptions: {level: 9}
        });
      } else {
        zip.file(filename, blob, {
          compression: "STORE"
        });
      }

      callback({filename: filename, url: scrapbook.escapeFilename(filename) + hash});
      break;
    }

    case "maff": {
      if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
      var zip = capturer.captureInfo[timeId].zip = capturer.captureInfo[timeId].zip || new JSZip();

      if (/^text\/|\b(?:xml|json|javascript)\b/.test(blob.type) && blob.size >= 128) {
        zip.file(timeId + "/" + filename, blob, {
          compression: "DEFLATE",
          compressionOptions: {level: 9}
        });
      } else {
        zip.file(timeId + "/" + filename, blob, {
          compression: "STORE"
        });
      }

      callback({filename: filename, url: scrapbook.escapeFilename(filename) + hash});
      break;
    }

    case "downloads":
    default: {
      // download the data
      var targetDir = options["capture.dataFolder"] + "/" + timeId;

      capturer.saveBlob({
        timeId: timeId,
        blob: blob,
        directory: targetDir,
        filename: filename,
        sourceUrl: sourceUrl,
        autoErase: true,
        savePrompt: false
      }, () => {
        callback({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
      }, (ex) => {
        callback({url: capturer.getErrorUrl(sourceUrl, options), error: ex});
      });
      break;
    }
  }

  return true; // async response
};

/**
 * @param {Object} params 
 *     - {string} params.timeId
 *     - {string} params.blob
 *     - {string} params.directory
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 *     - {boolean} params.autoErase
 *     - {boolean} params.savePrompt
 * @param {function} onComplete - function () {}
 * @param {function} onError - function (ex) {}
 */
capturer.saveBlob = function (params, onComplete, onError) {
  isDebug && console.debug("call: saveBlob", params);

  var timeId = params.timeId;
  var blob = params.blob;
  var directory = params.directory;
  var filename = params.filename;
  var sourceUrl = params.sourceUrl;
  var autoErase = params.autoErase;
  var savePrompt = params.savePrompt;

  if (!blob) {
    onComplete();
    return;
  }

  capturer.saveUrl({
    url: URL.createObjectURL(blob),
    directory: directory,
    filename: filename,
    sourceUrl: sourceUrl,
    autoErase: autoErase,
    savePrompt: savePrompt
  }, onComplete, onError);

  return true; // async response
};

/**
 * @param {Object} params 
 *     - {string} params.timeId
 *     - {string} params.url
 *     - {string} params.directory
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 *     - {boolean} params.autoErase
 *     - {boolean} params.savePrompt
 * @param {function} onComplete - function () {}
 * @param {function} onError - function (ex) {}
 */
capturer.saveUrl = function (params, onComplete, onError) {
  isDebug && console.debug("call: saveUrl", params);

  var timeId = params.timeId;
  var url = params.url;
  var directory = params.directory;
  var filename = params.filename;
  var sourceUrl = params.sourceUrl;
  var autoErase = params.autoErase;
  var savePrompt = params.savePrompt;

  var downloadParams = {
    url: url,
    filename: (directory ? directory + "/" : "") + filename,
    conflictAction: "uniquify",
    saveAs: savePrompt
  };

  isDebug && console.debug("download start", downloadParams);
  chrome.downloads.download(downloadParams, (downloadId) => {
    isDebug && console.debug("download response", downloadId);
    if (downloadId) {
      capturer.downloadInfo[downloadId] = {
        timeId: timeId,
        src: sourceUrl,
        autoErase: autoErase,
        onComplete: onComplete,
        onError: onError
      };
    } else {
      let err = chrome.runtime.lastError.message;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, err]));
      onError(err);
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

chrome.downloads.onChanged.addListener(function (downloadDelta) {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  var downloadId = downloadDelta.id;
  if (!capturer.downloadInfo[downloadId]) { return; }

  var that = arguments.callee;
  if (!that.erase) {
    that.erase = function (downloadId) {
      if (capturer.downloadInfo[downloadId].autoErase) {
        chrome.downloads.erase({id: downloadId}, (erasedIds) => {});
      }
      delete capturer.downloadInfo[downloadId];
    };
  }

  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    // erase the download history of additional downloads (those recorded in capturer.downloadEraseIds)
    try {
      capturer.downloadInfo[downloadId].onComplete();
    } catch (ex) {
      console.error(ex);
    }
    that.erase(downloadId);
  } else if (downloadDelta.error) {
    chrome.downloads.search({id: downloadId}, (results) => {
      let err = results[0].error;
      console.warn(scrapbook.lang("ErrorFileDownloadError", [capturer.downloadInfo[downloadId].src, err]));
      try {
        capturer.downloadInfo[downloadId].onError(err);
      } catch (ex) {
        console.error(ex);
      }
      that.erase(downloadId);
    });
  }
});

// isDebug && console.debug("loading background.js");
