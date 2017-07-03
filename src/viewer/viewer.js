/********************************************************************
 *
 * Script for viewer.html
 *
 *******************************************************************/

function initWithFileSystem(myFileSystem) {
  /**
   * common helper functions
   */
  var createDir = function (dirEntry, path, callback) {
    var folders = (Object.prototype.toString.call(path) === "[object Array]") ? path : path.split("/");
    dirEntry.getDirectory(folders.join("/"), {}, (dirEntry) => {
      callback();
    }, (ex) => {
      createDirInternal(dirEntry, folders, callback);
    });
  };

  var createDirInternal = function (dirEntry, folders, callback) {
    // Throw out './' or '/' and move on to prevent something like '/foo/.//bar'.
    if (folders[0] == '.' || folders[0] == '') {
      folders = folders.slice(1);
    }

    dirEntry.getDirectory(folders[0], {create: true}, (dirEntry) => {
      // Recursively add the new subfolder (if we still have another to create).
      if (folders.length) {
        createDir(dirEntry, folders.slice(1), callback);
      } else {
        callback();
      }
    }, (ex) => {
      alert("Unable to create directory: '" + folders.join("/") + "': " + ex);
    });
  };

  var createFile = function (dirEntry, path, fileBlob, callback) {
    createDir(dirEntry, path.split("/").slice(0, -1), () => {
      dirEntry.getFile(path, {create: true}, (fileEntry) => {
        // Create a FileWriter object for our FileEntry (log.txt).
        fileEntry.createWriter((fileWriter) => {

          fileWriter.onwriteend = function (e) {
            callback();
          };

          fileWriter.onerror = function (e) {
            alert("Unable to create write file: '" + path + "'");
            callback();
          };

          fileWriter.write(fileBlob);
        }, (ex) => {
          alert("Unable to create file writer: '" + path + "': " + ex);
        });
      }, (ex) => {
        alert("Unable to create file: '" + path + "': " + ex);
      });
    });
  };

  var extractZipFile = function (file) {
    var pendingZipEntry = 0;
    var ns = scrapbook.getUuid();
    var type = scrapbook.filenameParts(file.name)[1].toLowerCase();

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      myFileSystem.root.getDirectory(ns, {create: true}, () => {
        zip.forEach((inZipPath, zipObj) => {
          if (zipObj.dir) { return; }
          ++pendingZipEntry;
          zipObj.async("arraybuffer").then((ab) => {
            createFile(myFileSystem.root, ns + "/" + inZipPath, new Blob([ab], {type: "text/plain"}), () => {
              if (--pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns); }
            });
          });
        });
        if (pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns); }
      }, (ex) => {
        alert("Unable to create directory: '" + ns + "': " + ex);
      });
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onAllZipEntriesProcessed = function (type, ns) {
    switch (type) {
      case "maff": {
        var readRdfFile = function (file, callback) {
          var xhr = new XMLHttpRequest();
          xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
              if (xhr.status == 200 || xhr.status == 0) {
                callback(xhr.response);
              }
            }
          };
          xhr.responseType = "document";
          xhr.open("GET", URL.createObjectURL(file), true);
          xhr.send();
        };

        var processRdfDocument = function (doc) {
          var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
          var MAF = "http://maf.mozdev.org/metadata/rdf#";
          var result = {};

          var elems = doc.getElementsByTagNameNS(MAF, "indexfilename");
          var elem = elems[0];
          if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

          return result;
        };
        
        var processMaffDirectoryEntry = function (directoryEntry, callback) {
          directoryEntry.getFile("index.rdf", {}, (fileEntry) => {
            fileEntry.file((file) => {
              readRdfFile(file, (doc) => {
                var meta = processRdfDocument(doc);
                directoryEntry.getFile(meta.indexfilename, {}, (fileEntry) => {
                  callback(fileEntry);
                }, (ex) => {
                  alert("Unable to get index file '" + meta.indexfilename + "' in the directory: '" + directoryEntry.fullPath + "': " + ex);
                  callback(null);
                });
              });
            }, (ex) => {
              alert("Unable to read index.rdf in the directory: '" + directoryEntry.fullPath + "'");
              callback(null);
            });
          }, (ex) => {
            directoryEntry.createReader().readEntries((entries) => {
              for (let i = 0, I = entries.length; i < I; ++i) {
                let entry = entries[i];
                if (entry.isFile && entry.name.startsWith("index.")) {
                  callback(entry);
                  return;
                }
              }
              callback(null);
            }, (ex) => {
              alert("Unable to read directory: '" + directoryEntry.fullPath + "'");
              callback(null);
            });
          });
        };

        var onAllDirectoryParsed = function (indexFileEntries) {
          let validIndexFileEntries = indexFileEntries.filter(x => !!x);
          if (validIndexFileEntries.length) {
            onZipExtracted(validIndexFileEntries);
          } else {
            alert("No available data can be loaded from this maff file.");
          }
        };
        
        myFileSystem.root.getDirectory(ns, {}, (mainEntry) => {
          mainEntry.createReader().readEntries((entries) => {
            let remainingDirectories = 0, indexFileEntries = [];
            entries.forEach((entry) => {
              if (!entry.isDirectory) { return; }
              remainingDirectories++;
              let index = indexFileEntries.length;
              indexFileEntries.length++;
              processMaffDirectoryEntry(entry, (indexFileEntry) => {
                indexFileEntries[index] = indexFileEntry;
                if (--remainingDirectories === 0) { onAllDirectoryParsed(indexFileEntries); }
              });
            });
            if (remainingDirectories === 0) { onAllDirectoryParsed(indexFileEntries); }
          }, (ex) => {
            alert("Unable to read directory: '" + ns + "'");
          });
        }, (ex) => {
          alert("Unable to get directory: '" + ns + "'");
        });
        break;
      }
      case "htz":
      default: {
        var indexFile = ns + "/" + "index.html";
        myFileSystem.root.getFile(indexFile, {}, (fileEntry) => {
          onZipExtracted(fileEntry);
        }, (ex) => {
          alert("Unable to get file: '" + indexFile + "': " + ex);
        });
        break;
      }
    }
  };

  var onZipExtracted = function (indexFileEntries) {
    if (Object.prototype.toString.call(indexFileEntries) !== "[object Array]") {
      indexFileEntries = [indexFileEntries];
    }

    chrome.tabs.getCurrent((tab) => {
      mainUrl.search = mainUrl.hash = "";
      history.replaceState({}, null, mainUrl);
      let mainFileEntry = indexFileEntries.shift();
      indexFileEntries.forEach((indexFileEntry) => {
        let url = indexFileEntry.toURL() + urlSearch + urlHash;
        chrome.tabs.create({url: url}, () => {});
      });
      let url = mainFileEntry.toURL() + urlSearch + urlHash;
      chrome.tabs.update(tab.id, {url: url}, () => {});
    });
  };

  /**
   * main script
   */
  var fileSelector = document.getElementById('file-selector');
  var fileSelectorDrop = document.getElementById('file-selector-drop');
  var fileSelectorInput = document.getElementById('file-selector-input');
  var urlSearch = "";
  var urlHash = "";

  fileSelectorDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, false);

  fileSelectorDrop.addEventListener("drop", (e) => {
    e.preventDefault();

    Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
      var entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          extractZipFile(file);
        });
      }
    });
  }, false);

  fileSelectorDrop.addEventListener("click", (e) => {
    e.preventDefault();
    fileSelectorInput.click();
  }, false);

  fileSelectorInput.addEventListener("change", (e) => {
    e.preventDefault();
    var file = e.target.files[0];
    extractZipFile(file);
  }, false);

  // if source is specified, load it
  let mainUrl = new URL(document.URL);

  let src = mainUrl.searchParams.get("src");
  if (src) {
    let srcUrl = new URL(src);
    urlSearch = srcUrl.search;
    urlHash = mainUrl.hash;
    // use a random hash to avoid recursive redirect
    srcUrl.searchParams.set(scrapbook.runtime.viewerRedirectKey, 1);
    src = srcUrl.href;
    let filename = scrapbook.urlToFilename(src);

    scrapbook.xhr({
      url: src,
      responseType: "blob",
      onreadystatechange: function (xhr, xhrAbort) {
        if (xhr.readyState === 2) {
          // if header Content-Disposition is defined, use it
          try {
            let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            filename = contentDisposition.parameters.filename || filename;
          } catch (ex) {}
        } else if (xhr.readyState === 4) {
          if (xhr.status == 200 || xhr.status == 0) {
            let file = new File([xhr.response], filename);
            extractZipFile(file);
          }
        }
      },
      onerror: function (xhr, xhrAbort) {
        alert("Unable to load the specified zip file '" + src + "'");
      }
    });
    return;
  }
}

function initWithoutFileSystem() {
  var inZipFiles = {};
  var blobUrlToInZipPath = {};
  var virtualBase = chrome.runtime.getURL("viewer/!/");

  /**
   * common helper functions
   */
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
          let f = new File([ab], scrapbook.urlToFilename(inZipPath), {type: mime});
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
    fileSelector.style.display = 'none';
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
   * main script
   */
  var fileSelector = document.getElementById('file-selector');
  var fileSelectorDrop = document.getElementById('file-selector-drop');
  var fileSelectorInput = document.getElementById('file-selector-input');
  var wrapper = document.getElementById('wrapper');
  var viewer = document.getElementById('viewer');
  var urlSearch = "";
  var urlHash = "";
  var metaRefreshAvailable = 5;

  fileSelectorDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, false);

  fileSelectorDrop.addEventListener("drop", (e) => {
    e.preventDefault();

    Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
      var entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          extractZipFile(file);
        });
      }
    });
  }, false);

  fileSelectorDrop.addEventListener("click", (e) => {
    e.preventDefault();
    fileSelectorInput.click();
  }, false);

  fileSelectorInput.addEventListener("change", (e) => {
    e.preventDefault();
    var file = e.target.files[0];
    extractZipFile(file);
  }, false);

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

  // if source is specified, load it
  let mainUrl = new URL(document.URL);

  let href = mainUrl.searchParams.get("href");
  if (href) {
    alert("Unable to load file: '" + href + "': " + ex);
  }

  let src = mainUrl.searchParams.get("src");
  if (src) {
    try {
      let srcUrl = new URL(src);
      urlSearch = srcUrl.search;
      urlHash = mainUrl.hash;
      // use a random hash to avoid recursive redirect
      srcUrl.searchParams.set(scrapbook.runtime.viewerRedirectKey, 1);
      src = srcUrl.toString();
      let filename = scrapbook.urlToFilename(src);

      let xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) {
          // if header Content-Disposition is defined, use it
          try {
            let headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            let contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            filename = contentDisposition.parameters.filename || filename;
          } catch (ex) {}
        } else if (xhr.readyState === 4) {
          if (xhr.status == 200 || xhr.status == 0) {
            let file = new File([xhr.response], filename);
            extractZipFile(file);
          }
        }
      };

      xhr.responseType = "blob";
      xhr.open("GET", src, true);
      xhr.send();
    } catch (ex) {
      alert("Unable to load the specified zip file '" + src + "': " + ex);
    }
    return;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // load languages
  scrapbook.loadLanguages(document);
  
  scrapbook.loadOptions(() => {
    // request FileSystem
    var errorHandler = function (ex) {
      // console.error(ex);
      initWithoutFileSystem();
    };

    try {
      if (scrapbook.options["viewer.useFileSystemApi"]) {
        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
        window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, (fs) => {
          initWithFileSystem(fs);
        }, errorHandler);
      } else {
        initWithoutFileSystem();
      }
    } catch (ex) {
      errorHandler(ex);
    }
  });
});
