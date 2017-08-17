/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
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

/**
 * @return {Promise}
 */
capturer.captureActiveTab = function () {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, resolve);
  }).then((tabs) => {
    return capturer.captureTab(tabs[0]);
  }).then((value) => {
    if (Object.prototype.toString.call(value) === "[object Error]") {
      alert(value.message);
    }
  });
};

/**
 * @return {Promise}
 */
capturer.captureAllTabs = function () {
  return new Promise((resolve, reject) => {
    chrome.extension.isAllowedFileSchemeAccess(resolve);
  }).then((isAllowedAccess) => {
    let urlMatch = ["http://*/*", "https://*/*", "ftp://*/*"];
    if (isAllowedAccess) { urlMatch.push("file://*"); }
    return new Promise((resolve, reject) => {
      chrome.tabs.query({
        currentWindow: true,
        url: urlMatch
      }, resolve);
    });
  }).then((tabs) => {
    var ms = -5;
    return Promise.all(tabs.map((tab) => {
      return scrapbook.delay(ms += 5).then(() => {
        return capturer.captureTab(tab);
      });
    }));
  }).then((values) => {});
};

/**
 * @return {Promise}
 */
capturer.captureTab = function (tab, quiet) {
  return Promise.resolve().then(() => {
    var timeId = scrapbook.dateToId();
    var tabId = tab.id;
    var message = {
      settings: {
        timeId: timeId,
        frameIsMain: true,
        documentName: "index",
        favIconUrl: tab.favIconUrl,
        recurseChain: []
      },
      options: capturer.fixOptions(scrapbook.getOptions("capture"))
    };

    return Promise.resolve().then(() => {
      isDebug && console.debug("(main) send", tabId, message);
      return capturer.invoke("captureDocumentOrFile", message, tabId);
    }).then((response) => {
      isDebug && console.debug("(main) response", tabId, response);
      delete(capturer.captureInfo[timeId]);
      if (!response) {
        throw new Error(scrapbook.lang("ErrorContentScriptNotReady"));
      } else if (response.error) {
        throw new Error(scrapbook.lang("ErrorCaptureGeneral"));
      }
      return response;
    }).catch((ex) => {
      var source = "[" + tab.id + "] " + tab.url;
      var err = scrapbook.lang("ErrorCapture", [source, ex.message]);
      if (!quiet) { console.error(err); }
      return new Error(err);
    });
  });
};

/**
 * @return {Promise}
 */
capturer.captureActiveTabSource = function () {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, resolve);
  }).then((tabs) => {
    return capturer.captureTabSource(tabs[0]);
  }).then((value) => {
    if (Object.prototype.toString.call(value) === "[object Error]") {
      alert(value.message);
    }
  });
};

/**
 * @return {Promise}
 */
capturer.captureTabSource = function (tab, quiet) {
  return new Promise((resolve, reject) => {
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

    return Promise.resolve().then(() => {
      isDebug && console.debug("(main) send", tab.url, message);
      return capturer.captureUrl(message);
    }).then((response) => {
      isDebug && console.debug("(main) response", tab.url, response);
      delete(capturer.captureInfo[timeId]);
      if (!response) {
        throw new Error(scrapbook.lang("ErrorContentScriptNotReady"));
      } else if (response.error) {
        throw new Error(scrapbook.lang("ErrorCaptureGeneral"));
      }
      return response;
    }).catch((ex) => {
      var source = "[" + tab.id + "] " + tab.url;
      var err = scrapbook.lang("ErrorCapture", [source, ex.message]);
      if (!quiet) { console.error(err); }
      return new Error(err);
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureUrl = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureUrl", params);

    var {url: sourceUrl, refUrl, settings, options} = params;

    var headers = {};

    var determineFilename = function () {
      // run this only once
      if (arguments.callee.done) { return; }
      arguments.callee.done = true;

      // skip if documentName is already specified
      if (params.settings.documentName) { return; }

      // if filename defined by header Content-Disposition, use it
      let filename = headers.filename ||
          sourceUrl.startsWith("data:") ?
              scrapbook.dataUriToFile(scrapbook.splitUrlByAnchor(sourceUrl)[0]).name :
              scrapbook.urlToFilename(sourceUrl);

      let mime = headers.contentType || Mime.prototype.lookup(filename) || "text/html";
      let fn = filename.toLowerCase();
      if (["text/html", "application/xhtml+xml"].indexOf(mime) !== -1) {
        let exts = Mime.prototype.allExtensions(mime);
        for (let i = 0, I = exts.length; i < I; i++) {
          let ext = ("." + exts[i]).toLowerCase();
          if (fn.endsWith(ext)) {
            filename = filename.slice(0, -ext.length);
            break;
          }
        }
      }

      params.settings.documentName = filename;
    };

    let requestHeaders = {};
    if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

    return new Promise((resolve, reject) => {
      scrapbook.xhr({
        url: sourceUrl.startsWith("data:") ? scrapbook.splitUrlByAnchor(sourceUrl)[0] : sourceUrl,
        responseType: "document",
        requestHeaders: requestHeaders,
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
          }
        },
        onload: function (xhr, xhrAbort) {
          determineFilename();
          let doc = xhr.response;
          if (doc) {
            capturer.captureDocumentOrFile({
              doc: doc,
              refUrl: refUrl,
              settings: settings,
              options: options
            }).then(resolve);
          } else {
            capturer.captureFile({
              url: params.url,
              refUrl: refUrl,
              settings: params.settings,
              options: params.options
            }).then(resolve);
          }
        },
        onerror: reject
      });
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: ex};
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {{title: string}} params.data
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureFile", params);

    var {url: sourceUrl, refUrl, data = {}, settings, options} = params,
        {title} = data,
        {timeId} = settings;

    return capturer.downloadFile({
      url: sourceUrl,
      refUrl: refUrl,
      settings: settings,
      options: options
    }).then((response) => {
      if (settings.frameIsMain) {
        let meta = params.options["capture.recordDocumentMeta"] ? ' data-sb' + timeId + '-source="' + scrapbook.escapeHtml(sourceUrl) + '"' : "";
        // for the main frame, create a index.html that redirects to the file
        let html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(response.url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
</body>
</html>`;
        return capturer.saveDocument({
          sourceUrl: sourceUrl,
          documentName: settings.documentName,
          settings: settings,
          options: options,
          data: {
            title: title,
            mime: "text/html",
            content: html
          }
        });
      } else {
        return Promise.resolve({
          timeId: timeId,
          sourceUrl: sourceUrl,
          targetDir: response.targetDir,
          filename: response.filename,
          url: response.url
        });
      }
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.registerDocument = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: registerDocument", params);

    var {settings, options} = params,
        {timeId, documentName} = settings;

    if (!capturer.captureInfo[timeId]) { capturer.captureInfo[timeId] = {}; }
    if (!capturer.captureInfo[timeId].usedDocumentNames) { capturer.captureInfo[timeId].usedDocumentNames = {}; }
    if (!capturer.captureInfo[timeId].usedDocumentNames[documentName]) { capturer.captureInfo[timeId].usedDocumentNames[documentName] = 0; }

    var fixedDocumentName = (capturer.captureInfo[timeId].usedDocumentNames[documentName] > 0) ?
        (documentName + "_" + capturer.captureInfo[timeId].usedDocumentNames[documentName]) :
        documentName;
    capturer.captureInfo[timeId].usedDocumentNames[documentName]++;

    return {documentName: fixedDocumentName};
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {{mime: string, charset: string, content: string, title: string}} params.data
 *     - {string} params.documentName
 *     - {string} params.sourceUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.saveDocument = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: saveDocument", params);

    var {data, documentName, sourceUrl, settings, options} = params,
        {timeId} = settings;
    var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

    return new Promise((resolve, reject) => {
      switch (options["capture.saveAs"]) {
        case "singleHtml": {
          if (!settings.frameIsMain) {
            let dataUri = scrapbook.stringToDataUri(data.content, data.mime, data.charset);
            resolve({timeId: timeId, sourceUrl: sourceUrl, url: dataUri});
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
              autoErase: false,
              savePrompt: options["capture.savePrompt"]
            }).then(() => {
              resolve({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
            }).catch(reject);
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
            resolve({timeId: timeId, sourceUrl: sourceUrl, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
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
              }).then(() => {
                resolve({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
              }).catch(reject);
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
            resolve({timeId: timeId, sourceUrl: sourceUrl, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
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
            var rdfContent = `<?xml version="1.0"?>
<RDF:RDF xmlns:MAF="http://maf.mozdev.org/metadata/rdf#"
         xmlns:NC="http://home.netscape.com/NC-rdf#"
         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <RDF:Description RDF:about="urn:root">
    <MAF:originalurl RDF:resource="${scrapbook.escapeHtml(sourceUrl)}"/>
    <MAF:title RDF:resource="${scrapbook.escapeHtml(data.title)}"/>
    <MAF:archivetime RDF:resource="${scrapbook.escapeHtml(scrapbook.idToDate(timeId).toUTCString())}"/>
    <MAF:indexfilename RDF:resource="${filename}"/>
    <MAF:charset RDF:resource="UTF-8"/>
  </RDF:Description>
</RDF:RDF>
`;

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
              }).then(() => {
                resolve({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
              }).catch(reject);
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

          capturer.saveBlob({
            timeId: timeId,
            blob: new Blob([data.content], {type: data.mime}),
            directory: targetDir,
            filename: filename,
            sourceUrl: sourceUrl,
            autoErase: !settings.frameIsMain || (ext === ".xhtml"),
            savePrompt: false
          }).then(() => {
            if (settings.frameIsMain && (ext === ".xhtml")) {
              // create index.html that redirects to index.xhtml
              filename = "index.html";
              let html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
              return capturer.saveBlob({
                timeId: timeId,
                blob: new Blob([html], {type: "text/html"}),
                directory: targetDir,
                filename: filename,
                sourceUrl: sourceUrl,
                autoErase: false,
                savePrompt: false
              });
            }
          }).then(() => {
            resolve({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
          }).catch(reject);
          break;
        }
      }
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: ex};
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.rewriteMethod
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.downloadFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: downloadFile", params);

    var {url: sourceUrl, refUrl, rewriteMethod, settings, options} = params,
        {timeId} = settings;
    var targetDir = options["capture.dataFolder"] + "/" + timeId;

    var headers = {};
    var filename;
    var isDuplicate;
    var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

    return new Promise((resolve, reject) => {
      // special management of data URI
      if (sourceUrl.startsWith("data:")) {
        if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
          let file = scrapbook.dataUriToFile(scrapbook.splitUrlByAnchor(sourceUrl)[0]);
          if (file) {
            filename = file.name;
            filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
            ({newFilename: filename, isDuplicate} = capturer.getUniqueFilename(timeId, filename, sourceUrl));
            if (!isDuplicate) {
              Promise.resolve(capturer[rewriteMethod]).then((fn) => {
                if (fn) {
                  return fn({
                    settings: settings,
                    options: options,
                    data: file,
                    charset: null,
                    url: null
                  });
                }
                return file;
              }).then((blob) => {
                return capturer.downloadBlob({
                  settings: settings,
                  options: options,
                  blob: blob,
                  filename: filename,
                  sourceUrl: sourceUrl,
                });
              }).then(resolve).catch(reject);
            } else {
              resolve({filename: filename, url: scrapbook.escapeFilename(filename) + hash, isDuplicate: true});
            }
          } else {
            reject(new Error("Malformed data URL."));
          }
        } else {
          resolve({url: sourceUrl});
        }
        return;
      }

      var determineFilename = function () {
        // run this only once
        if (arguments.callee.done) { return true; }
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
            resolve({filename: filename, url: scrapbook.escapeFilename(filename) + hash, isDuplicate: true});
            return false;
          }
        }
        return true;
      };

      let requestHeaders = {};
      if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

      scrapbook.xhr({
        url: sourceUrl,
        responseType: "blob",
        requestHeaders: requestHeaders,
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
            if (!determineFilename()) { xhrAbort(); }
          }
        },
        onload: function (xhr, xhrAbort) {
          if (!determineFilename()) { return; }
          Promise.resolve(capturer[rewriteMethod]).then((fn) => {
            if (fn) {
              return fn({
                settings: settings,
                options: options,
                data: xhr.response,
                charset: headers.charset,
                url: xhr.responseURL
              });
            }
            return xhr.response;
          }).then((blob) => {
            return capturer.downloadBlob({
              settings: settings,
              options: options,
              blob: blob,
              filename: filename,
              sourceUrl: sourceUrl,
            });
          }).then(resolve).catch(reject);
        },
        onerror: reject
      });
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: ex};
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.blob
 *     - {string} params.filename - validated and unique
 *     - {string} params.sourceUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.downloadBlob = function (params) {
  return new Promise((resolve, reject) => {
    isDebug && console.debug("call: downloadBlob", params);

    var {blob, filename, sourceUrl, settings, options} = params,
        {timeId} = settings;
    var hash = scrapbook.splitUrlByAnchor(sourceUrl)[1];

    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        scrapbook.readFileAsDataURL(blob).then((dataUri) => {
          if (filename) {
            dataUri = dataUri.replace(";", ";filename=" + encodeURIComponent(filename) + ";");
          }
          resolve({url: dataUri + hash});
        });
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

        resolve({filename: filename, url: scrapbook.escapeFilename(filename) + hash});
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

        resolve({filename: filename, url: scrapbook.escapeFilename(filename) + hash});
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
        }).then(() => {
          resolve({timeId: timeId, sourceUrl: sourceUrl, targetDir: targetDir, filename: filename, url: scrapbook.escapeFilename(filename) + hash});
        }).catch(reject);
        break;
      }
    }
  });
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
 * @return {Promise}
 */
capturer.saveBlob = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: saveBlob", params);

    var {timeId, blob, directory, filename, sourceUrl, autoErase, savePrompt} = params;

    return capturer.saveUrl({
      url: URL.createObjectURL(blob),
      directory: directory,
      filename: filename,
      sourceUrl: sourceUrl,
      autoErase: autoErase,
      savePrompt: savePrompt
    });
  });
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
 * @return {Promise}
 */
capturer.saveUrl = function (params) {
  return new Promise((resolve, reject) => {
    isDebug && console.debug("call: saveUrl", params);

    var {timeId, url, directory, filename, sourceUrl, autoErase, savePrompt} = params;

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
          onComplete: resolve,
          onError: reject
        };
      } else {
        reject(chrome.runtime.lastError);
      }
    });
  });
};


/**
 * Events handling
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  isDebug && console.debug(message.cmd, "receive", "[" + sender.tab.id + "]", message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let fn = capturer[message.cmd.slice(9)];
    if (fn) {
      message.args.tabId = sender.tab.id;
      fn(message.args).then((response) => {
        sendResponse(response);
      });
      return true; // async response
    }
  }
});

chrome.downloads.onChanged.addListener((downloadDelta) => {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  var downloadId = downloadDelta.id, downloadInfo = capturer.downloadInfo;
  if (!downloadInfo[downloadId]) { return; }

  var p;
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    p = Promise.resolve().then(() => {
      downloadInfo[downloadId].onComplete();
    });
  } else if (downloadDelta.error) {
    p = Promise.resolve().then(() => {
      downloadInfo[downloadId].onError(new Error(downloadDelta.error.current));
    });
  }
  p && p.catch((ex) => {
    console.error(ex);
  }).then(() => {
    // erase the download history of additional downloads (autoErase = true)
    if (downloadInfo[downloadId].autoErase) {
      return new Promise((resolve, reject) => {
        chrome.downloads.erase({id: downloadId}, resolve);
      });
    }
  }).then((erasedIds) => {
    delete downloadInfo[downloadId];
  }).catch((ex) => {
    console.error(ex);
  });
});

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  // Some headers (e.g. "referer") are not allowed to be set via
  // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
  // modify it here to workaround.
  details.requestHeaders.forEach((header) => {
    if (header.name.slice(0, 15) === "X-WebScrapBook-") {
      header.name = header.name.slice(15);
    }
  });
  return {requestHeaders: details.requestHeaders};
}, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"]);

// isDebug && console.debug("loading background.js");
