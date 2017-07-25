(function (window, undefined) {

var viewerData = JSON.parse(document.currentScript.textContent);

document.addEventListener("DOMContentLoaded", function () {
  /**
   * common helper functions
   */
  var byteStringToArrayBuffer = function (bstr) {
    var n = bstr.length, u8ar = new Uint8Array(n);
    while (n--) { u8ar[n] = bstr.charCodeAt(n); }
    return u8ar.buffer;
  };

  var dataUriToFile = function (dataUri) {
    if (dataUri.startsWith("data:")) {
      dataUri = dataUri.slice(5);

      var pos = dataUri.indexOf(",");
      var meta = dataUri.slice(0, pos);
      var [mime, filename, base64] = meta.split(";");
      var filename = decodeURIComponent(filename.replace(/^filename=/i, ""));
      var data = dataUri.slice(pos + 1);
      var bstr = atob(data), ab = byteStringToArrayBuffer(bstr);
      return new File([ab], filename, {type: "application/octet-stream"});
    }
    return null;
  };

  var inZipPathToUrl = function (inZipPath) {
    return virtualBase + (inZipPath || "").split("/").map(x => encodeURIComponent(x)).join("/");
  };

  var parseUrl = function (url, refUrl) {
    try {
      var absoluteUrl = new URL(url, refUrl || undefined);
    } catch (ex) {
      // url cannot be resolved, return original (invalid)
      return {url: url, inZip: false};
    }
    if (absoluteUrl.href.startsWith(virtualBase)) {
      let search = absoluteUrl.search;
      let hash = absoluteUrl.hash;
      absoluteUrl.search = "";
      absoluteUrl.hash = "";
      let inZipPath = absoluteUrl.href.slice(virtualBase.length);
      inZipPath = inZipPath.split("/").map(x => scrapbook.decodeURIComponent(x)).join("/");
      let f = inZipFiles[inZipPath];
      if (f) {
        // url targets a file in zip, return its blob URL
        return {
          url: f.url + hash, // blob URL with a search is invalid
          inZip: true,
          inZipPath: inZipPath,
          mime: f.file.type,
          search: search,
          hash: hash
        };
      } else {
        // url targets a non-exist file in zip, return original (invalid)
        return {url: url, inZip: false};
      }
    }
    // url target not in zip, return absolute URL
    return {url: absoluteUrl.href, inZip: false};
  };

  var getZipFile = function (uuid, callback) {
    var indexedDB = window.indexedDB;
    var request = indexedDB.open("zipFiles", 1); 

    request.onupgradeneeded = function (evt) {
      var db = evt.target.result;
      var objectStore = db.createObjectStore("zipFiles", {keyPath: "uuid"});
    }; 

    request.onsuccess = function (evt) {
      var db = evt.target.result;
      var transaction = db.transaction("zipFiles", "readwrite");
      var objectStore = transaction.objectStore(["zipFiles"]);

      var req = objectStore.get(uuid);
      req.onsuccess = function (evt) {
        var data = evt.target.result;
        var req2 = objectStore.delete(uuid);
        callback(data.blob);
      };

      req.onerror = function (evt) {
        alert("Unable to read the zip file.");
      };
    };
     
    request.onerror = function (evt) {
      console.error(evt.target.error);
    };
  };

  var extractZipFile = function (file) {
    var pendingZipEntry = 0;

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      zip.forEach((inZipPath, zipObj) => {
        if (zipObj.dir) { return; }
        ++pendingZipEntry;
        zipObj.async("arraybuffer").then((ab) => {
          let mime = Mime.prototype.lookup(inZipPath);
          let f = new File([ab], inZipPath.replace(/.*\//, ""), {type: mime});
          inZipFiles[inZipPath] = {file: f, url: URL.createObjectURL(f)};
          if (--pendingZipEntry === 0) { onAllZipEntriesProcessed(); }
        });
      });
      if (pendingZipEntry === 0) { onAllZipEntriesProcessed(); }
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onAllZipEntriesProcessed = function () {
    for (let path in inZipFiles) {
      blobUrlToInZipPath[inZipFiles[path].url] = path;
    }

    loadFile(viewerData.indexFile || "index.html", urlSearch + urlHash);
  };

  /**
   * @callback fetchFileRewriteFuncCallback
   * @param {Blob} rewrittenBlob
   */

  /**
   * @callback fetchFileRewriteFunc
   * @param {Object} params
   *     - {Blob} data
   *     - {string} charset
   *     - {string} url
   * @param {function(rewrittenBlob)} callback
   */

  /**
   * @callback fetchFileOnComplete
   * @param {string} fetchedUrl
   */

  /**
   * @param {Object} params 
   *     - {string} params.inZipPath
   *     - {fetchFileRewriteFunc} params.rewriteFunc
   *     - {Array} params.recurseChain
   * @param {fetchFileOnComplete} callback
   */
  var fetchFile = function (params, callback) {
    let inZipPath = params.inZipPath;
    let rewriteFunc = params.rewriteFunc;
    let recurseChain = params.recurseChain;

    let f = inZipFiles[inZipPath];
    if (f) {
      if (rewriteFunc) {
        rewriteFunc({
          data: f.file,
          charset: null,
          url: inZipPathToUrl(inZipPath),
          recurseChain: recurseChain
        }, (rewrittenFile) => {
          callback(URL.createObjectURL(rewrittenFile));
        });
      } else {
        callback(f.url);
      }
    } else {
      callback(null);
    }
  };

  var fetchPage = function (inZipPath, url, recurseChain, callback) {
    let searchAndHash = "";
    if (url) {
      let [base, search, hash] = scrapbook.splitUrl(url);
      searchAndHash = hash; // blob URL with a search is invalid
    }
    fetchFile({
      inZipPath: inZipPath,
      rewriteFunc: (params, onRewrite) => {
        var data = params.data;
        var charset = params.charset;
        var recurseChain = params.recurseChain;

        if (["text/html", "application/xhtml+xml"].indexOf(data.type) !== -1) {
          var reader = new FileReader();
          reader.addEventListener("loadend", () => {
            var content = reader.result;
            var parser = new DOMParser();
            var doc = parser.parseFromString(content, data.type);
            parseDocument(doc, inZipPath, (blob) => {
              onRewrite(blob);
            }, recurseChain);
          });
          reader.readAsText(data, charset || "UTF-8");
        } else {
          onRewrite(data);
        }
      },
      recurseChain: recurseChain
    }, (fetchedUrl) => {
      callback(fetchedUrl ? fetchedUrl + searchAndHash : fetchedUrl);
    });
  };

  var loadFile = function (inZipPath, url) {
    fetchPage(inZipPath, url, [], (fetchedUrl) => {
      loadUrl(fetchedUrl || "about:blank");
    });
  };

  var loadUrl = function (url) {
    viewer.src = url;
  };

  var parseDocument = function (doc, inZipPath, onComplete, recurseChain) {
    /**
     * helper functions
     */
    var rewriteUrl = function (url, refUrlOverwrite) {
      return parseUrl(url, refUrlOverwrite || refUrl).url;
    };

    var parserCheckDone = function () {};

    var parserDone = function () {
      var content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
      onComplete(new Blob([content], {type: doc.contentType}));
    };

    /**
     * main
     */
    var refUrl = inZipPathToUrl(inZipPath);
    var remainingTasks = 0;

    // check meta refresh
    if (metaRefreshAvailable > 0) {
      let metaRefreshTarget;
      Array.prototype.forEach.call(doc.querySelectorAll("meta"), (elem) => {
        if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content") &&
            elem.getAttribute("http-equiv").toLowerCase() == "refresh" && 
            elem.getAttribute("content").match(/^[^;]*;\s*url=(.*)$/i) ) {
          metaRefreshTarget = RegExp.$1;
        }
      });
      if (metaRefreshTarget) {
        metaRefreshAvailable--;
        let info = parseUrl(metaRefreshTarget, refUrl);
        info.inZip ? loadFile(info.inZipPath, info.url) : loadUrl(info.url);
        return null;
      }
    }

    // modify URLs
    Array.prototype.forEach.call(doc.querySelectorAll("*"), (elem) => {
      // skip elements that are already removed from the DOM tree
      if (!elem.parentNode) { return; }

      switch (elem.nodeName.toLowerCase()) {
        case "meta": {
          if (elem.hasAttribute("property") && elem.hasAttribute("content")) {
            switch (elem.getAttribute("property").toLowerCase()) {
              case "og:image":
              case "og:image:url":
              case "og:image:secure_url":
              case "og:audio":
              case "og:audio:url":
              case "og:audio:secure_url":
              case "og:video":
              case "og:video:url":
              case "og:video:secure_url":
              case "og:url":
                elem.setAttribute("content", rewriteUrl(elem.getAttribute("content"), refUrl));
                break;
            }
          }
          break;
        }

        case "link": {
          if (elem.hasAttribute("href")) {
            // elem.rel == "" if "rel" attribute not defined
            let rels = elem.rel.toLowerCase().split(/[ \t\r\n\v\f]+/);
            if (rels.indexOf("stylesheet") >= 0) {
              remainingTasks++;
              let info = parseUrl(elem.getAttribute("href"), refUrl);
              fetchFile({
                inZipPath: info.inZipPath,
                rewriteFunc: processCssFile,
                recurseChain: [refUrl]
              }, (fetchedUrl) => {
                elem.setAttribute("href", fetchedUrl || info.url);
                remainingTasks--;
                parserCheckDone();
              });
            } else {
              elem.setAttribute("href", rewriteUrl(elem.getAttribute("href")));
            }
          }
          break;
        }

        case "style": {
          remainingTasks++;
          let fetcher = new ComplexUrlFetcher(refUrl);
          let rewriteCss = processCssFileText(elem.textContent, refUrl, fetcher);
          fetcher.startFetches(() => {
            elem.textContent = fetcher.finalRewrite(rewriteCss);
            remainingTasks--;
            parserCheckDone();
          });
          break;
        }

        case "script": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
          } else if (viewerData.useInlineScriptShim) {
            let text = elem.textContent;
            if (text) {
              elem.src = URL.createObjectURL(new Blob([text], {type: "application/javascript"}));
              elem.textContent = "";
            }
          }
          break;
        }

        case "body":
        case "table":
        case "tr":
        case "th":
        case "td": {
          // deprecated: background attribute (deprecated since HTML5)
          if (elem.hasAttribute("background")) {
            elem.setAttribute("background", rewriteUrl(elem.getAttribute("background"), refUrl));
          }
          break;
        }

        case "frame":
        case "iframe": {
          if (elem.hasAttribute("src")) {
            let frameRecurseChain = JSON.parse(JSON.stringify(recurseChain));
            frameRecurseChain.push(refUrl);
            let info = parseUrl(elem.getAttribute("src"), refUrl);
            if (info.inZip) {
              let targetUrl = inZipPathToUrl(info.inZipPath);
              if (frameRecurseChain.indexOf(targetUrl) !== -1) {
                // console.warn("Resource '" + refUrl + "' has a circular reference to '" + targetUrl + "'.");
                elem.setAttribute("src", "about:blank");
                break;
              }
            }

            remainingTasks++;
            fetchFile({
              inZipPath: info.inZipPath,
              rewriteFunc: (params, onRewrite) => {
                var data = params.data;
                var charset = params.charset;
                var recurseChain = params.recurseChain;

                if (["text/html", "application/xhtml+xml"].indexOf(data.type) !== -1) {
                  var reader = new FileReader();
                  reader.addEventListener("loadend", () => {
                    var content = reader.result;
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(content, data.type);
                    parseDocument(doc, info.inZipPath, (blob) => {
                      onRewrite(blob);
                    }, recurseChain);
                  });
                  reader.readAsText(data, charset || "UTF-8");
                } else {
                  onRewrite(data);
                }
              },
              recurseChain: frameRecurseChain
            }, (fetchedUrl) => {
              elem.setAttribute("src", fetchedUrl || info.url);
              remainingTasks--;
              parserCheckDone();
            });
          }
          break;
        }

        case "a":
        case "area": {
          if (elem.hasAttribute("href")) {
            let info = parseUrl(elem.getAttribute("href"), refUrl);
            if (info.inZip) {
              if (info.inZipPath !== inZipPath) {
                elem.setAttribute("href", info.url);
              } else {
                // link to self
                elem.setAttribute("href", info.hash || "#");
              }
            } else {
              // link target is not in the zip
              elem.setAttribute("href", info.url);
            }
          }
          break;
        }

        case "img": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                return rewriteUrl(url, refUrl);
              })
            );
          }
          break;
        }

        case "source": {
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                return rewriteUrl(url, refUrl);
              })
            );
          }
          break;
        }

        case "embed": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
          }
          break;
        }

        case "object": {
          if (elem.hasAttribute("data")) {
            elem.setAttribute("data", rewriteUrl(elem.getAttribute("data"), refUrl));
          }
          break;
        }

        case "applet": {
          if (elem.hasAttribute("archive")) {
            elem.setAttribute("archive", rewriteUrl(elem.getAttribute("archive"), refUrl));
          }
          break;
        }

        case "form": {
          if ( elem.hasAttribute("action") ) {
            elem.setAttribute("action", rewriteUrl(elem.getAttribute("action"), refUrl));
          }
          break;
        }

        case "input": {
          switch (elem.type.toLowerCase()) {
            // images: input
            case "image":
              if (elem.hasAttribute("src")) {
                elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
              }
              break;
          }
          break;
        }
      }

      // styles: style attribute
      if (elem.hasAttribute("style")) {
        remainingTasks++;
        let fetcher = new ComplexUrlFetcher(refUrl);
        let rewriteCss = processCssFileText(elem.getAttribute("style"), refUrl, fetcher);
        fetcher.startFetches(() => {
          elem.setAttribute("style", fetcher.finalRewrite(rewriteCss));
          remainingTasks--;
          parserCheckDone();
        });
      }
    });

    // parserCheckDone calls before here should be nullified
    // since the document parsing is not finished yet at that moment
    parserCheckDone = function () {
      if (remainingTasks <= 0) {
        parserDone();
      }
    };

    // the document parsing is finished, finalize the document 
    // if there is no pending parsing now
    parserCheckDone();
  };

  var ComplexUrlFetcher = class ComplexUrlFetcher {
    constructor(refUrl, recurseChain) {
      this.urlHash = {};
      this.urlRewrittenCount = 0;
      this.recurseChain = JSON.parse(JSON.stringify(recurseChain || []));
      if (refUrl) {
        // if a refUrl is specified, record the recurse chain
        // for future check of circular referencing
        this.recurseChain.push(scrapbook.splitUrlByAnchor(refUrl)[0]);
      }
    }

    getUrlHash(url, rewriteMethod) {
      var key = scrapbook.getUuid();
      this.urlHash[key] = {
        url: url,
        newUrl: null,
        rewriteMethod: rewriteMethod
      };
      return "urn:scrapbook:url:" + key;
    }

    startFetches(callback) {
      var keys = Object.keys(this.urlHash), len = keys.length;
      if (len > 0) {
        keys.forEach((key) => {
          let sourceUrl = this.recurseChain[this.recurseChain.length - 1];
          let info = parseUrl(this.urlHash[key].url, sourceUrl);

          if (info.inZip) {
            let targetUrl = inZipPathToUrl(info.inZipPath);
            if (this.recurseChain.indexOf(scrapbook.splitUrlByAnchor(targetUrl)[0]) !== -1) {
              // console.warn("Resource '" + sourceUrl + "' has a circular reference to '" + targetUrl + "'.");
              this.urlHash[key].newUrl = "about:blank";
              if (++this.urlRewrittenCount === len) {
                callback();
              }
              return;
            }
          }

          fetchFile({
            inZipPath: info.inZipPath,
            rewriteFunc: this.urlHash[key].rewriteMethod,
            url: inZipPathToUrl(info.inZipPath),
            recurseChain: this.recurseChain
          }, (fetchedUrl) => {
            this.urlHash[key].newUrl = fetchedUrl || info.url;
            if (++this.urlRewrittenCount === len) {
              callback();
            }
          });
        });
      } else {
        callback();
      }
    }

    finalRewrite(text) {
      return text.replace(/urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
        if (this.urlHash[key]) { return this.urlHash[key].newUrl; }
        // This could happen when a web page really contains a content text in our format.
        // We return the original text for keys not defineded in the map to prevent a bad replace
        // since it's nearly impossible for them to hit on the hash keys we are using.
        return match;
      });
    }
  };

  var processCssFile = function (params, callback) {
    var data = params.data;
    var charset = params.charset;
    var refUrl = params.url;
    var recurseChain = params.recurseChain;

    scrapbook.parseCssFile(data, charset, (text, onReplaceComplete) => {
      var fetcher = new ComplexUrlFetcher(refUrl, recurseChain);
      var rewriteCss = processCssFileText(text, refUrl, fetcher);
      fetcher.startFetches(() => {
        text = fetcher.finalRewrite(rewriteCss);
        onReplaceComplete(text);
      });
    }, (replacedCssBlob) => {
      callback(replacedCssBlob);
    });
  };

  var processCssFileText = function (cssText, refUrl, fetcher) {
    var result = scrapbook.parseCssText(cssText, {
      rewriteImportUrl: function (url) {
        return fetcher.getUrlHash(url, processCssFile);
      },
      rewriteFontFaceUrl: function (url) {
        return fetcher.getUrlHash(url);
      },
      rewriteBackgroundUrl: function (url) {
        return fetcher.getUrlHash(url);
      }
    });
    return result;
  };

  /**
   * main
   */
  var virtualBase = viewerData.virtualBase;

  var viewer = document.getElementById('viewer');

  var inZipFiles = {};
  var blobUrlToInZipPath = {};

  var urlSearch = "";
  var urlHash = location.hash;
  var metaRefreshAvailable = 5;

  viewer.addEventListener("load", (e) => {
    var doc = viewer.contentDocument;
    document.title = doc.title;

    doc.documentElement.addEventListener("click", (e) => {
      let elem = e.target;
      switch (elem.nodeName.toLowerCase()) {
        case "a": case "area":
          try {
            let url = elem.href;
            let inZipPath = blobUrlToInZipPath[scrapbook.splitUrl(url)[0]];
            if (inZipPath) {
              let f = inZipFiles[inZipPath];
              if (["text/html", "application/xhtml+xml"].indexOf(f.file.type) !== -1) {
                e.preventDefault();
                e.stopPropagation();
                fetchPage(inZipPath, url, [], (fetchedUrl) => {
                  elem.href = fetchedUrl || "about:blank";
                  elem.click();
                });
              }
            }
          } catch (ex) {}
      }
    }, false);
  });

  getZipFile(viewerData.zipId, extractZipFile);
});

})(window, undefined);
