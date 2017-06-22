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

    var onAllZipEntryProcessed = function () {
      var indexFile = ns + "/" + "index.html";
      myFileSystem.root.getFile(indexFile, {}, (fileEntry) => {
        callback(fileEntry);
      }, (ex) => {
        alert("Unable to get file: '" + indexFile + "': " + ex);
      });
    };

    var zip = new JSZip();
    zip.loadAsync(file).then((zip) => {
      myFileSystem.root.getDirectory(ns, {create: true}, () => {
        zip.forEach((relativePath, zipObj) => {
          if (zipObj.dir) { return; }
          zipObj.async("arraybuffer").then((ab) => {
            ++pendingZipEntry;
            createFile(myFileSystem.root, ns + "/" + relativePath, new Blob([ab], {type: "text/plain"}), () => {
              if (--pendingZipEntry === 0) { onAllZipEntryProcessed(); }
            });
          });
        });
      }, (ex) => {
        alert("Unable to create directory: '" + ns + "': " + ex);
      });
    }).catch((ex) => {
      alert("Unable to load the zip file: " + ex);
    });
  };

  var onZipExtracted = function (indexFileEntry) {
    var url = indexFileEntry.toURL();
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

  // if a source htz is specified, load it
  var url = new URL(document.URL);
  var src = url.searchParams.get("src");
  if (src) {
    try {
      var srcUrl = new URL(src);
      srcUrl.searchParams.set("noredirect", 1);
      var src = srcUrl.toString();

      var xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status == 200 || xhr.status == 0) {
            var blob = xhr.response;
            extractZipFile(blob, onZipExtracted);
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
});
