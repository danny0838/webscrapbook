/********************************************************************
 *
 * Script for viewer.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

function init() {
  var fileSystemHandler = {
    createDir: function (dirEntry, path, callback) {
      var folders = (Object.prototype.toString.call(path) === "[object Array]") ? path : path.split("/");
      dirEntry.getDirectory(folders.join("/"), {}, (dirEntry) => {
        callback();
      }, (ex) => {
        this.createDirInternal(dirEntry, folders, callback);
      });
    },

    createDirInternal: function (dirEntry, folders, callback) {
      // Throw out './' or '/' and move on to prevent something like '/foo/.//bar'.
      if (folders[0] == '.' || folders[0] == '') {
        folders = folders.slice(1);
      }

      dirEntry.getDirectory(folders[0], {create: true}, (dirEntry) => {
        // Recursively add the new subfolder (if we still have another to create).
        if (folders.length) {
          this.createDirInternal(dirEntry, folders.slice(1), callback);
        } else {
          callback();
        }
      }, (ex) => {
        alert("Unable to create directory: '" + folders.join("/") + "': " + ex);
      });
    },

    createFile: function (dirEntry, path, fileBlob, callback) {
      this.createDir(dirEntry, path.split("/").slice(0, -1), () => {
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
    },

    createFileFromZipEntry: function (dirEntry, path, zipObj, callback) {
      this.createDir(dirEntry, path.split("/").slice(0, -1), () => {
        dirEntry.getFile(path, {create: true}, (fileEntry) => {
          // @TODO: reading a large file (about 400~500 MB) once into an
          //     arraybuffer could consume too much memory and cause the
          //     extension to shutdown.  Loading in chunks avoids this but
          //     is very slow and unuseful.  We currently use the faster
          //     method.
          zipObj.async("arraybuffer").then((ab) => {
            fileEntry.createWriter((fileWriter) => {
              fileWriter.onwriteend = function (e) {
                callback();
              };
              fileWriter.onerror = function (e) {
                alert("Unable to create write file: '" + path + "'");
                callback();
              };
              // fileWriter.seek(fileWriter.length);
              fileWriter.write(new Blob([ab]));
            }, (ex) => {
              console.error("Unable to create file writer: '" + path + "': " + ex);
            });
          });
        }, (ex) => {
          alert("Unable to create file: '" + path + "': " + ex);
        });
      });
    }
  };

  var viewer = {
    mainUrl: new URL(document.URL),
    filesystem: null,
    urlSearch: "",
    urlHash: "",
    isGecko: (() => {
        let m = chrome.runtime.getManifest();
        return m.applications && m.applications.gecko;
      })(),

    start: function () {
      if (viewer.mainUrl.searchParams.has("reload")) {
        fileSelector.style.display = "none";
        reloader.style.display = "block";
      } else {
        viewer.processUrlParams();
      }
    },

    processUrlParams: function () {
      let zipSourceUrl = viewer.mainUrl.searchParams.get("src");
      if (!zipSourceUrl) { return; }

      let zipSourceUrlObj = new URL(zipSourceUrl);
      viewer.urlSearch = zipSourceUrlObj.search;
      viewer.urlHash = viewer.mainUrl.hash;
      let filename = scrapbook.urlToFilename(zipSourceUrl);

      scrapbook.xhr({
        url: zipSourceUrl,
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
              let file = new File([xhr.response], filename, {type: Mime.prototype.lookup(filename)});
              viewer.processZipFile(file);
            }
          }
        },
        onerror: function (xhr, xhrAbort) {
          alert("Unable to load the specified zip file '" + zipSourceUrl + "'");
        }
      });

      let refreshUrl = new URL(viewer.mainUrl.href);
      refreshUrl.searchParams.set("reload", 1);
      history.replaceState({}, null, refreshUrl);
    },

    processZipFile: function (zipFile) {
      if (viewer.filesystem) {
        viewer.viewZipInFileSystem(zipFile);
      } else {
        viewer.viewZipInMemory(zipFile);
      }
    },

    readRdfFile: function (file, callback) {
      scrapbook.xhr({
        url: URL.createObjectURL(file),
        responseType: "document",
        onloadend: function (xhr, xhrAbort) {
          callback(xhr.response);
        }
      });
    },

    parseRdfDocument: function (doc) {
      var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
      var MAF = "http://maf.mozdev.org/metadata/rdf#";
      var result = {};

      var elems = doc.getElementsByTagNameNS(MAF, "indexfilename");
      var elem = elems[0];
      if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

      return result;
    },

    viewZipInFileSystem: function (zipFile) {
      var extractZipFile = function (file) {
        var ns = scrapbook.getUuid();
        var type = scrapbook.filenameParts(file.name)[1].toLowerCase();

        var zip = new JSZip();
        // @TODO: JSZip.loadAsync cannot load a large zip file
        //     (around 2GB, tested in Chrome)
        zip.loadAsync(file).then((zip) => {
          let jobs = [];
          viewer.filesystem.root.getDirectory(ns, {create: true}, () => {
            let nextJob = function () {
              if (jobs.length) {
                let job = jobs.shift();
                fileSystemHandler.createFileFromZipEntry.apply(fileSystemHandler, job);
              } else {
                onAllZipEntriesProcessed(type, ns);
              }
            };
            zip.forEach((inZipPath, zipObj) => {
              if (zipObj.dir) { return; }
              jobs.push([viewer.filesystem.root, ns + "/" + inZipPath, zipObj, nextJob]);
            });
            nextJob();
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
            var processMaffDirectoryEntry = function (directoryEntry, callback) {
              directoryEntry.getFile("index.rdf", {}, (fileEntry) => {
                fileEntry.file((file) => {
                  viewer.readRdfFile(file, (doc) => {
                    var meta = viewer.parseRdfDocument(doc);
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

            viewer.filesystem.root.getDirectory(ns, {}, (mainEntry) => {
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
            viewer.filesystem.root.getFile(indexFile, {}, (fileEntry) => {
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
          let mainFileEntry = indexFileEntries.shift();
          indexFileEntries.forEach((indexFileEntry) => {
            let url = indexFileEntry.toURL() + viewer.urlSearch + viewer.urlHash;
            chrome.tabs.create({url: url}, () => {});
          });
          let url = mainFileEntry.toURL() + viewer.urlSearch + viewer.urlHash;
          chrome.tabs.update(tab.id, {url: url}, () => {});
        });
      };

      extractZipFile(zipFile);
    },

    viewZipInMemory: function (zipFile) {
      var parseZipFile = function (file) {
        var zip = new JSZip();
        zip.loadAsync(file).then((zip) => {
          var onAllMaffDirectoryParsed = function (topdirs) {
            if (topdirs.length) {
              let firstDir = topdirs.shift();

              let onAllDirectoryProcessed = function () {
                firstDir.zip.generateAsync({type: "blob"}).then((zipBlob) => {
                  let f = new File([zipBlob], zipFile.name, {type: zipBlob.type});
                  invokeZipViewer(f, firstDir.indexFile);
                });
              };

              let remainingDirectories = 0;
              topdirs.forEach((dir) => {
                remainingDirectories++;
                dir.zip.generateAsync({type: "blob"}).then((zipBlob) => {
                  let f = new File([zipBlob], zipFile.name, {type: zipBlob.type});
                  invokeZipViewer(f, dir.indexFile, true);
                  if (--remainingDirectories === 0) { onAllDirectoryProcessed(); }
                });
              });
              if (remainingDirectories === 0) { onAllDirectoryProcessed(); }
            } else {
              alert("No available data can be loaded from this maff file.");
            }
          };

          var parseMaffDirectory = function (dirObj, callback) {
            var rdfFile = dirObj.file("index.rdf");
            if (rdfFile) {
              rdfFile.async("arraybuffer").then((ab) => {
                let filename = rdfFile.name.replace(/.*\//, "");
                let mime = Mime.prototype.lookup(filename);
                let file = new File([ab], filename, {type: mime});
                viewer.readRdfFile(file, (doc) => {
                  var meta = viewer.parseRdfDocument(doc);
                  var indexFilename = meta.indexfilename;
                  var indexFile = dirObj.file(indexFilename);
                  if (indexFile) {
                    callback({zip: dirObj, indexFile: indexFilename});
                  } else {
                    alert("Unable to get index file '" + indexFilename + "' in the directory: '" + dirObj.root + "'");
                    callback(null);
                  }
                });
              });
            } else {
              let indexFilename;
              dirObj.forEach((subPath, zipObj) => {
                if (!zipObj.dir && subPath.indexOf("/") === -1 && subPath.startsWith("index.")) {
                  if (!indexFilename) { indexFilename = subPath; }
                }
              });
              setTimeout(() => {
                if (indexFilename) {
                  callback({zip: dirObj, indexFile: indexFilename});
                } else {
                  callback(null);
                }
              }, 0);
            }
          };

          // get a list of top-folders
          let topdirs = {};
          zip.forEach((subPath, zipObj) => {
            let depth = Array.prototype.filter.call(subPath, x => x == "/").length;
            if (depth == 1) {
              let dirname = subPath.replace(/\/.*$/, "");
              if (!topdirs[dirname]) { topdirs[dirname] = zip.folder(dirname); }
            }
          });

          // filter for available top-folders
          let validTopdirs = [];
          let remainingDirectories = 0;
          for (let i in topdirs) {
            let topdir = topdirs[i];
            remainingDirectories++;
            parseMaffDirectory(topdir, (data) => {
              if (data) { validTopdirs.push(data); }
              if (--remainingDirectories === 0) { onAllMaffDirectoryParsed(validTopdirs); }
            });
          }
          if (remainingDirectories === 0) { onAllMaffDirectoryParsed(validTopdirs); }
        }).catch((ex) => {
          alert("Unable to load the zip file: " + ex);
        });
      };

      var invokeZipViewer = function (zipFile, indexFile, inNewTab) {
        let storeZipData = function (zipFile, callback) {
          var indexedDB = window.indexedDB;
          var request = indexedDB.open("zipFiles", 1); 

          request.onupgradeneeded = function (evt) {
            var db = evt.target.result;
            var objectStore = db.createObjectStore("zipFiles", {keyPath: "uuid"});
          }; 

          request.onsuccess = function (evt) {
            var uuid = scrapbook.getUuid();

            var db = evt.target.result;
            var transaction = db.transaction("zipFiles", "readwrite");
            var objectStore = transaction.objectStore(["zipFiles"]);
            var req = objectStore.add({uuid: uuid, blob: zipFile});

            transaction.oncomplete = function (evt) {
              callback(uuid);
            };

            transaction.onerror = function (evt) {
              alert("Unable to store the zip file: " + "(" + evt.target.error.name + ") " + evt.target.error.message);
            };
          };
           
          request.onerror = function (evt) {
            alert("Unable to open indexedDB: " + "(" + evt.target.error.name + ") " + evt.target.error.message);
          };
        };

        let startViewer = function (uuid) {
          let viewerData = {
            virtualBase: chrome.runtime.getURL("viewer/!/"),
            indexFile: indexFile,
            zipId: uuid,
            // In Firefox, the blob URL page generated by addon is restricted by CSP
            // and inline scripts are not allowed.  Convert them into blob URLs.
            useInlineScriptShim: viewer.isGecko
          };

          let content = '<!DOCTYPE html>\n' +
              '<html>\n' +
              '<head>\n' +
              '<meta charset="UTF-8">\n' +
              '<meta name="viewport" content="width=device-width">\n' +
              '<title>' + scrapbook.lang("ViewerTitle") + '</title>\n' +
              '<script src="' + chrome.runtime.getURL("lib/jszip.js") + '"></script>\n' +
              '<script src="' + chrome.runtime.getURL("lib/mime.js") + '"></script>\n' +
              '<script src="' + chrome.runtime.getURL("core/common.js") + '"></script>\n' +
              '<script src="' + chrome.runtime.getURL("viewer/zipviewer.js") + '">' + JSON.stringify(viewerData) + '</script>\n' +
              '<style>\n' +
              '@-webkit-keyframes spin {\n' +
              '  from {-webkit-transform:rotate(0turn)}\n' +
              '  to {-webkit-transform:rotate(1turn)}\n' +
              '}\n' +
              '\n' +
              '@-moz-keyframes spin {\n' +
              '  from {-moz-transform:rotate(0turn)}\n' +
              '  to {-moz-transform:rotate(1turn)}\n' +
              '}\n' +
              '\n' +
              '@keyframes spin {\n' +
              '  from {transform:rotate(0turn)}\n' +
              '  to {transform:rotate(1turn)}\n' +
              '}\n' +
              '\n' +
              'body {\n' +
              '  margin: 0;\n' +
              '  border: 0;\n' +
              '  padding: 0;\n' +
              '}\n' +
              '\n' +
              '#wrapper {\n' +
              '  position: relative;\n' +
              '  height: 100vh;\n' +
              '}\n' +
              '\n' +
              '#viewer {\n' +
              '  position: absolute;\n' +
              '  top: 0;\n' +
              '  left: 0;\n' +
              '  width: 100%;\n' +
              '  height: 100%;\n' +
              '  margin: 0;\n' +
              '  border: 0;\n' +
              '  padding: 0;\n' +
              '}\n' +
              '</style>\n' +
              '</head>\n' +
              '<body>\n' +
              '<div id="wrapper">\n' +
              '  <iframe id="viewer" sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"></iframe>\n' +
              '</div>\n' +
              '</body>\n' +
              '</html>\n';

          let url = URL.createObjectURL(new Blob([content], {type: "text/html"})) + viewer.urlHash;
          if (inNewTab) {
            chrome.tabs.create({url: url}, () => {});
          } else {
            chrome.tabs.getCurrent((tab) => {
              chrome.tabs.update(tab.id, {url: url}, () => {});
            });
          }
        };

        storeZipData(zipFile, startViewer);
      };

      var type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();
      switch (type) {
        case "maff": {
          parseZipFile(zipFile);
          break;
        }
        case "htz":
        default: {
          invokeZipViewer(zipFile, "index.html");
          break;
        }
      }
    }
  };

  // init common elements and events
  var reloader = document.getElementById('reloader');
  var fileSelector = document.getElementById('file-selector');
  var fileSelectorDrop = document.getElementById('file-selector-drop');
  var fileSelectorInput = document.getElementById('file-selector-input');

  reloader.addEventListener("click", (e) => {
    e.preventDefault();
    viewer.processUrlParams();
  }, false);

  fileSelectorDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    e.target.classList.add("dragover");
  }, false);

  fileSelectorDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    e.target.classList.remove("dragover");
    Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
      var entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          viewer.processZipFile(file);
        });
      }
    });
  }, false);

  fileSelectorDrop.addEventListener("dragleave", (e) => {
    e.target.classList.remove("dragover");
  }, false);

  fileSelectorDrop.addEventListener("click", (e) => {
    e.preventDefault();
    fileSelectorInput.click();
  }, false);

  fileSelectorInput.addEventListener("change", (e) => {
    e.preventDefault();
    var file = e.target.files[0];
    viewer.processZipFile(file);
  }, false);

  {
    let errorHandler = function (ex) {
      // console.error(ex);
      viewer.start();
    };

    try {
      if (scrapbook.options["viewer.useFileSystemApi"]) {
        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
        window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, (fs) => {
          viewer.filesystem = fs;
          viewer.start();
        }, errorHandler);
      } else {
        viewer.start();
      }
    } catch (ex) {
      errorHandler(ex);
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);
  scrapbook.loadOptions(() => { init(); });
});
