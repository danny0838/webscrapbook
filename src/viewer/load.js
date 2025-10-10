/******************************************************************************
 * Script for load.html
 *
 * @requires scrapbook
 * @requires JSZip
 * @requires Mime
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
    global.JSZip,
    global.Mime,
  );
}(this, function (isDebug, scrapbook, JSZip, Mime) {

'use strict';

/**
 * We usually get:
 *
 * onDragEnter html
 * onDragEnter .dropmask
 * onDragLeave html
 * onDragOver .dropmask
 * onDragOver .dropmask
 * ...
 * onDragLeave .dropmask
 *  or
 * onDrop   .dropmask (in this case onDragLeave doesn't fire)
 */
function onDragEnter(e) {
  viewer.dropmask.hidden = false;
  viewer.lastDropTarget = e.target;
}

function onDragOver(e) {
  e.preventDefault(); // required to allow drop
  e.dataTransfer.dropEffect = "copy";
}

function onDragLeave(e) {
  if (e.target !== viewer.lastDropTarget) { return; }
  viewer.dropmask.hidden = true;
}

async function onDrop(e) {
  e.preventDefault();
  viewer.dropmask.hidden = true;

  const entries = Array.prototype.map.call(
    e.dataTransfer.items,
    x => x.webkitGetAsEntry && x.webkitGetAsEntry(),
  );

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile) { continue; }

    try {
      const file = await new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });
      files.push(file);
    } catch (ex) {
      // this should never happen
      console.error(ex);
    }
  }

  return await viewer.loadFiles(files);
}

function onChangeFiles(e) {
  e.preventDefault();
  const files = Array.from(e.target.files);
  if (!files.length) { return; }

  return viewer.loadFiles(files);
}

const viewer = {
  mainUrl: new URL(document.URL),
  urlSearch: "",
  urlHash: "",
  pageList: [],
  autoLoading: false,

  initEvents() {
    window.addEventListener("dragenter", onDragEnter, false);
    window.addEventListener("dragover", onDragOver, false);
    window.addEventListener("dragleave", onDragLeave, false);
    window.addEventListener("drop", onDrop, false);
    this.filesSelector.addEventListener("change", onChangeFiles, false);
  },

  uninitEvents() {
    window.removeEventListener("dragenter", onDragEnter, false);
    window.removeEventListener("dragover", onDragOver, false);
    window.removeEventListener("dragleave", onDragLeave, false);
    window.removeEventListener("drop", onDrop, false);
    this.filesSelector.removeEventListener("change", onChangeFiles, false);
  },

  log(msg) {
    this.logger.appendChild(document.createTextNode(msg + '\n'));
  },

  error(msg) {
    const span = document.createElement('span');
    span.className = 'error';
    span.appendChild(document.createTextNode(msg + '\n'));
    this.logger.appendChild(span);
  },

  async openUrl(url, inNewTab = false) {
    if (inNewTab) {
      // In Firefox, a window.open popup is blocked by default, and the
      // dialog isn't shown as the main tab is immediately redirected. As a
      // result, the user has to tweak the popup blocker setting in prior to
      // see the popup. Use browser.tabs.create to workaround the issue.
      if (scrapbook.userAgent.is('gecko')) {
        try {
          return await browser.tabs.create({url, active: false});
        } catch (ex) {
          console.error(ex);
        }
      }

      return window.open(url);
    }

    if (this.autoLoading) {
      return window.location.replace(url);
    }

    return window.location.assign(url);
  },

  async openUrls(urls) {
    // move main index file to the last
    urls.push(urls.shift());

    let result;
    for (let i = 0, I = urls.length; i < I; i++) {
      result = await viewer.openUrl(urls[i], i !== urls.length - 1);
    }
    return result;
  },

  async start() {
    try {
      /* process URL params */
      const files = [];
      const zipSourceUrl = viewer.mainUrl.searchParams.get("src");
      if (zipSourceUrl) {
        this.autoLoading = true;
        const zipSourceUrlObj = new URL(zipSourceUrl);
        viewer.urlSearch = zipSourceUrlObj.search;
        viewer.urlHash = viewer.mainUrl.hash;
        let filename = scrapbook.urlToFilename(zipSourceUrl);

        try {
          const xhr = await scrapbook.xhr({
            url: zipSourceUrl,
            responseType: "blob",
          });

          // if header Content-Disposition is defined, use it
          // local request (status = 0) has no response header
          if (xhr.status !== 0) {
            try {
              const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
              const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
              filename = contentDisposition.parameters.filename || filename;
            } catch (ex) {
              // error when parsing header
            }
          }

          const file = new File([xhr.response], filename, {type: Mime.lookup(filename)});
          files.push(file);
        } catch (ex) {
          this.error(`Unable to fetch specified ZIP file '${zipSourceUrl}'`);
          return;
        }
      }
      return await this.loadFiles(files);
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }
  },

  async loadFiles(files) {
    this.pageList = [];
    this.uninitEvents();
    this.filesSelector.disabled = true;
    this.loadmask.hidden = false;
    this.logger.textContent = '';

    files = files.sort((a, b) => {
      if (a.name > b.name) { return 1; }
      if (a.name < b.name) { return -1; }
      return 0;
    });

    for (const file of files) {
      try {
        await viewer.processZipFile(file);
      } catch (ex) {
        // this should never happen
        console.error(ex);
      }
    }

    if (!this.pageList.length) {
      this.autoLoading = false;
      this.initEvents();
      this.filesSelector.disabled = false;
      this.filesSelector.value = null;
      this.loadmask.hidden = true;
      return;
    }

    this.log('Done.');
    this.log('');
    return await this.openUrls(this.pageList);
  },

  async processZipFile(zipFile) {
    this.log(`Loading: '${zipFile.name}'...`);
    try {
      const uuid = scrapbook.getUuid();
      const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();

      /* retrieve and store zip entries */
      const zip = await (async () => {
        try {
          return await (new JSZip().loadAsync(zipFile));
        } catch (ex) {
          throw new Error(`ZIP file invalid or unsupported.`);
        }
      })();

      for (const [inZipPath, zipObj] of Object.entries(zip.files)) {
        const data = new File([zipObj.dir ? "" : await zipObj.async("blob")], inZipPath.match(/([^/]+)\/?$/)[1], {
          type: zipObj.dir ? "inode/directory" : Mime.lookup(inZipPath),
          lastModified: scrapbook.zipFixModifiedTime(zipObj.date),
        });

        const key = {table: "pageCache", id: uuid, path: inZipPath};
        await scrapbook.cache.set(key, data, 'indexedDB');
      }

      /* Retrieve indexFiles */
      let indexFiles = [];
      switch (type) {
        case "maff": {
          try {
            indexFiles = await scrapbook.getMaffIndexFiles(zip);
          } catch (ex) {
            this.error(ex.message);
          }
          break;
        }
        case "htz":
        default: {
          if (zip.files["index.html"]) {
            indexFiles = ["index.html"];
          }
          break;
        }
      }

      if (!indexFiles.length) {
        throw new Error(`No available page found.`);
      }

      /* convert indexFiles to this.pageList */
      const url = new URL(browser.runtime.getURL("viewer/view.html"));
      const s = url.searchParams;
      s.set("id", uuid);
      url.hash = viewer.urlHash;

      for (const indexFile of indexFiles) {
        const pos = indexFile.lastIndexOf('/');

        // set dir filter
        if (pos !== -1) {
          s.set("d", indexFile.slice(0, pos));
        } else {
          s.delete("d");
        }

        s.set("p", indexFile);
        this.pageList.push(url.href);
      }
    } catch (ex) {
      console.error(ex);
      this.error(`Unable to open archive: ${ex.message}`);
    }
    this.log('');
  },
};

document.addEventListener("DOMContentLoaded", async function () {
  scrapbook.loadLanguages(document);

  // init common elements and events
  viewer.dropmask = document.getElementById('dropmask');
  viewer.loadmask = document.getElementById('loadmask');
  viewer.filesSelector = document.getElementById('files-selector');
  viewer.logger = document.getElementById('logger');

  await scrapbook.loadOptions();
  await viewer.start();
});

}));
