/********************************************************************
 *
 * Script for viewer.html
 *
 *******************************************************************/

document.addEventListener("DOMContentLoaded", function () {
  // load languages
  scrapbook.loadLanguages(document);

  /**
   * check requestFileSystem
   */
  var myFileSystem = window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

  if (!myFileSystem) {
    alert("This module won't work because your browser does not support requestFileSystem API.");
    return;
  }

  // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
  window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, function (fs) {
    myFileSystem = fs;
    init();
  });

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

          fileWriter.onwriteend = function(e) {
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

  var extractZipFile = function (file, callback) {
    var pendingZipEntry = 0;
    var ns = scrapbook.getUuid();
    var type = scrapbook.filenameParts(file.name).extension.toLowerCase();

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      myFileSystem.root.getDirectory(ns, {create: true}, () => {
        zip.forEach((relativePath, zipObj) => {
          if (zipObj.dir) { return; }
          ++pendingZipEntry;
          zipObj.async("arraybuffer").then((ab) => {
            createFile(myFileSystem.root, ns + "/" + relativePath, new Blob([ab], {type: "text/plain"}), () => {
              if (--pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns, callback); }
            });
          });
        });
        if (pendingZipEntry === 0) { onAllZipEntriesProcessed(type, ns, callback); }
      }, (ex) => {
        alert("Unable to create directory: '" + ns + "': " + ex);
      });
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onAllZipEntriesProcessed = function (type, ns, callback) {
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
              alert("Unable to read index.ref in the directory: '" + directoryEntry.fullPath + "'");
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
          var validIndexes = 0;
          indexFileEntries.forEach((indexFileEntry) => {
            if (indexFileEntry) {
              validIndexes++;
              callback(indexFileEntry);
            }
          });
          if (validIndexes === 0) {
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
          callback(fileEntry);
        }, (ex) => {
          alert("Unable to get file: '" + indexFile + "': " + ex);
        });
        break;
      }
    }
  };

  var onZipExtracted = function (indexFileEntry) {
    var url = indexFileEntry.toURL() + urlSearch + urlHash;

    var docUrl = new URL(document.URL);
    var urlObj = new URL(url);
    docUrl.hash = urlObj.hash;
    urlObj.hash = "";
    docUrl.search = "?href=" + encodeURIComponent(urlObj.pathname.slice(1) + urlObj.search);
    history.pushState({}, null, docUrl.href);

    loadUrl(url);
  };

  var loadUrl = function (url) {
    viewer.src = url;
    wrapper.style.display = 'block';
    fileSelector.style.display = 'none';
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
          extractZipFile(file, onZipExtracted);
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
    extractZipFile(file, onZipExtracted);
  }, false);

  viewer.addEventListener("load", (e) => {
    document.title = viewer.contentDocument.title;
  });

  var init = function () {
    // if a source htz is specified, load it
    var mainUrl = new URL(document.URL);

    var href = mainUrl.searchParams.get("href");
    if (href) {
      var url = new URL(href, "file://");
      myFileSystem.root.getFile(url.pathname, {}, (indexFileEntry) => {
        var targetUrl = indexFileEntry.toURL() + url.search + mainUrl.hash;
        loadUrl(targetUrl);
      }, (ex) => {
        alert("Unable to load file: '" + href + "': " + ex);
      });
      return;
    }

    var src = mainUrl.searchParams.get("src");
    if (src) {
      try {
        var srcUrl = new URL(src);
        var urlSearch = srcUrl.search;
        var urlHash = mainUrl.hash;
        // use a random hash to avoid recursive redirect
        srcUrl.searchParams.set("ipimkkaicmlacnnmkmejigldfflpcmhl", 1);
        var src = srcUrl.toString();
        var filename = scrapbook.urlToFilename(src);

        var xhr = new XMLHttpRequest();

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
              var file = new File([xhr.response], filename);
              extractZipFile(file, onZipExtracted);
            }
          }
        };

        xhr.responseType = "blob";
        xhr.open("GET", src, true);
        xhr.send();
      } catch (ex) {
        alert("Unable to load the specified zip file '" + src + "': " + ex);
      }
    }
  };

});
