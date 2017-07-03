(function (window, undefined) {

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

  var extractZipFile = function (file) {
    var pendingZipEntry = 0;
    var type = scrapbook.filenameParts(file.name)[1].toLowerCase();

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      zip.forEach((inZipPath, zipObj) => {
        if (zipObj.dir) { return; }
        ++pendingZipEntry;
        zipObj.async("arraybuffer").then((ab) => {
          let mime = Mime.prototype.lookup(inZipPath);
          let f = new File([ab], inZipPath.replace(/.*\//, ""), {type: mime});
          inZipFiles[inZipPath] = {file: f, url: URL.createObjectURL(f)};
          if (--pendingZipEntry === 0) { onAllZipEntriesProcessed(type); }
        });
      });
      if (pendingZipEntry === 0) { onAllZipEntriesProcessed(type); }
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onAllZipEntriesProcessed = function (type) {
    switch (type) {
      case "maff": {
        break;
      }
      case "htz":
      default: {
        var indexFile = "index.html";
        onZipExtracted(indexFile);
        break;
      }
    }
  };

  var onZipExtracted = function (indexFilePaths) {
    if (Object.prototype.toString.call(indexFilePaths) !== "[object Array]") {
      indexFilePaths = [indexFilePaths];
    }

    for (let path in inZipFiles) {
      blobUrlToInZipPath[inZipFiles[path].url] = path;
    }

    loadFile(indexFilePaths[0], urlSearch + urlHash);
  };

  var loadFile = function (inZipPath, url) {
    let searchAndHash = "";
    if (url) {
      let [base, search, hash] = scrapbook.splitUrl(url);
      searchAndHash = hash;
    }
    let f = inZipFiles[inZipPath];
    if (f) {
      if (["text/html", "application/xhtml+xml"].indexOf(f.file.type) !== -1) {
        var reader = new FileReader();
        reader.addEventListener("loadend", () => {
          var content = reader.result;
          var parser = new DOMParser();
          var doc = parser.parseFromString(content, "text/html");
          parseDocument(doc, inZipPath, (blobUrl) => {
            if (blobUrl) { loadUrl(blobUrl + searchAndHash); }
          });
        });
        // @TODO: use specified file encoding if it's not UTF-8?
        reader.readAsText(f.file, "UTF-8");
      } else {
        loadUrl(f.url + searchAndHash);
      }
    } else {
      loadUrl("about:blank" + searchAndHash);
    }
  };

  var loadUrl = function (url) {
    viewer.src = url;
    wrapper.style.display = 'block';
  };

  var parseDocument = function (doc, inZipPath, onComplete) {
    /**
     * helper functions
     */
    var parseUrl = function (url) {
      let absoluteUrl = new URL(url, refUrl);
      if (absoluteUrl.href.startsWith(virtualBase)) {
        let search = absoluteUrl.search;
        let hash = absoluteUrl.hash;
        absoluteUrl.search = "";
        absoluteUrl.hash = "";
        let inZipPath = absoluteUrl.href.slice(virtualBase.length);
        inZipPath = inZipPath.split("/").map(x => decodeURIComponent(x)).join("/");
        let f = inZipFiles[inZipPath];
        if (f) {
          return {
            url: f.url + search + hash,
            inZip: true,
            inZipPath: inZipPath,
            mime: f.file.type,
            search: search,
            hash: hash
          };
        } else {
          return {url: url, inZip: false};
        }
      }
      return {url: absoluteUrl.href, inZip: false};
    };

    var rewriteUrl = function (url) {
      return parseUrl(url).url;
    };

    var parserCheckDone = function () {};

    var parserDone = function () {
      var content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
      var blobUrl = URL.createObjectURL(new Blob([content], {type: doc.contentType}));
      onComplete(blobUrl);
    };

    /**
     * main
     */
    var refUrl = virtualBase + inZipPath;
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
        let info = parseUrl(metaRefreshTarget);
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
                elem.setAttribute("content", rewriteUrl(elem.getAttribute("content")));
                break;
            }
          }
          break;
        }

        // @TODO: content of the target should be parsed
        case "link": {
          if (elem.hasAttribute("href")) {
            elem.setAttribute("href", rewriteUrl(elem.getAttribute("href")));
          }
          break;
        }

        // @TODO: content should be parsed
        case "style": {
          break;
        }

        case "script": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src")));
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
            elem.setAttribute("background", rewriteUrl(elem.getAttribute("background")));
          }
          break;
        }

        // @TODO: content of the target should be parsed
        case "frame":
        case "iframe": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src")));
          }
          break;
        }

        case "a":
        case "area": {
          if (elem.hasAttribute("href")) {
            let info = parseUrl(elem.getAttribute("href"));
            if (info.inZip) {
              if (info.inZipPath !== inZipPath) {
                elem.setAttribute("href", info.url);
              } else {
                // link to self
                elem.setAttribute("href", info.search + info.hash || "#");
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
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src")));
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                return rewriteUrl(url);
              })
            );
          }
          break;
        }

        case "source": {
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset",
              scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                return rewriteUrl(url);
              })
            );
          }
          break;
        }

        case "embed": {
          if (elem.hasAttribute("src")) {
            elem.setAttribute("src", rewriteUrl(elem.getAttribute("src")));
          }
          break;
        }

        case "object": {
          if (elem.hasAttribute("data")) {
            elem.setAttribute("data", rewriteUrl(elem.getAttribute("data")));
          }
          break;
        }

        case "applet": {
          if (elem.hasAttribute("archive")) {
            elem.setAttribute("archive", rewriteUrl(elem.getAttribute("archive")));
          }
          break;
        }

        case "form": {
          if ( elem.hasAttribute("action") ) {
            elem.setAttribute("action", rewriteUrl(elem.getAttribute("action")));
          }
          break;
        }

        case "input": {
          switch (elem.type.toLowerCase()) {
            // images: input
            case "image":
              if (elem.hasAttribute("src")) {
                elem.setAttribute("src", rewriteUrl(elem.getAttribute("src")));
              }
              break;
          }
          break;
        }
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

  /**
   * main
   */
  var virtualBase = window.viewerData.virtualBase;

  var inZipFiles = {};
  var blobUrlToInZipPath = {};

  var viewer = document.getElementById('viewer');
  var wrapper = document.getElementById('wrapper');

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
            let url = scrapbook.splitUrl(elem.href)[0];
            let inZipPath = blobUrlToInZipPath[url];
            if (inZipPath) {
              let f = inZipFiles[inZipPath];
              if (["text/html", "application/xhtml+xml"].indexOf(f.file.type) !== -1) {
                e.preventDefault();
                e.stopPropagation();
                loadFile(inZipPath, elem.href);
              }
            }
          } catch (ex) {}
      }
    }, false);
  });

  extractZipFile(dataUriToFile(window.viewerData.zip));
});

})(window, undefined);
