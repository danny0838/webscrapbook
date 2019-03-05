/********************************************************************
 *
 * Script for load.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

/**
 * We usually get:
 *
 * onDragEnter html
 * onDragEnter .dropmask
 * onDragLeave html
 * onDragOver .dropmask
 * onDragOver .dropmask
 * ...
 * onDragLeave .dropmask[1]
 *  or
 * onDrop   .dropmask (in this case onDragLeave doesn't fire)
 *
 * [1]: In Firefox, we get document (e10s) or XULDocument (non-e10s).
 *      https://bugzilla.mozilla.org/show_bug.cgi?id=1420590
 */
function onDragEnter(e) {
  indexer.dropmask.hidden = false;
  indexer.lastDropTarget = e.target;
};

function onDragOver(e) {
  e.preventDefault(); // required to allow drop
};

function onDragLeave(e) {
  let shouldUnMask = false;
  try {
    if (e.target === indexer.lastDropTarget || 
        e.target === document || 
        e.target.nodeName === "#document"/* XULDocument */) {
      shouldUnMask = true;
    }
  } catch (ex) {
    // access to XULDocument may throw
    shouldUnMask = true;
  }
  if (shouldUnMask) {
    indexer.dropmask.hidden = true;
  }
};

function onDrop(e) {
  e.preventDefault();
  indexer.dropmask.hidden = true;
  const entries = Array.prototype.map.call(
    e.dataTransfer.items,
    x => x.webkitGetAsEntry && x.webkitGetAsEntry()
  );
  indexer.loadDrop(entries);
};

function onChangeDir(e) {
  e.preventDefault();
  const files = e.target.files;
  if (!(files && files.length)) { return; }

  indexer.loadInputDir(files);
};

function onChangeFiles(e) {
  e.preventDefault();
  const files = e.target.files;
  if (!(files && files.length)) { return; }

  indexer.loadInputFiles(files);
};

const indexer = {
  autoEraseSet: new Set(),

  /**
   * UI related methods
   */
  log(msg) {
    logger.appendChild(document.createTextNode(msg + '\n'));
  },

  error(msg) {
    const span = document.createElement('span');
    span.className = 'error';
    span.appendChild(document.createTextNode(msg + '\n'));
    logger.appendChild(span);
  },

  initEvents() {
    window.addEventListener("dragenter", onDragEnter, false);
    window.addEventListener("dragover", onDragOver, false);
    window.addEventListener("dragleave", onDragLeave, false);
    window.addEventListener("drop", onDrop, false);
    this.dirSelector.addEventListener("change", onChangeDir, false);
    this.filesSelector.addEventListener("change", onChangeFiles, false);
  },

  uninitEvents() {
    window.removeEventListener("dragenter", onDragEnter, false);
    window.removeEventListener("dragover", onDragOver, false);
    window.removeEventListener("dragleave", onDragLeave, false);
    window.removeEventListener("drop", onDrop, false);
    this.dirSelector.removeEventListener("change", onChangeDir, false);
    this.filesSelector.removeEventListener("change", onChangeFiles, false);
  },

  start() {
    this.uninitEvents();
    this.dirSelector.disabled = true;
    this.filesSelector.disabled = true;
    this.logger.textContent = '';
    this.logger.className = '';
    this.options = Object.assign({}, scrapbook.options);
  },

  end() {
    this.dirSelector.disabled = false;
    this.dirSelector.value = null;
    this.filesSelector.disabled = false;
    this.filesSelector.value = null;
    this.initEvents();
  },

  async loadZipFile(file) {
    this.log(`Got file '${file.name}'.`);
    this.log(`Extracting zip content...`);

    try {
      const zipObj = await new JSZip().loadAsync(file);

      const inputData = {
        name: file.name.replace(/[.][^.]+$/, ''),
        files: [],
      };
      let cut = 0;

      const topDirName = inputData.name + '/';
      if (zipObj.files[topDirName]) {
        let onlyTopDir = true;
        for (const path in zipObj.files) {
          if (!path.startsWith(topDirName)) {
            onlyTopDir = false;
            break;
          }
        }
        if (onlyTopDir) {
          this.error(`Stripped root directory path '${topDirName}' for all entries.`);
          cut = topDirName.length;
        }
      }

      let hasDataDir = false;
      for (const [inZipPath, zipEntryObj] of Object.entries(zipObj.files)) {
        if (zipEntryObj.dir) { continue; }

        // async('blob') has type = '' and has no lastModified
        const ab = await zipEntryObj.async('arraybuffer');
        const path = inZipPath.slice(cut);
        const filename = inZipPath.replace(/^.*[/]/, '');
        if (path.startsWith('data/')) { hasDataDir = true; }
        inputData.files.push({
          path,
          file: new File([ab], filename, {
            type: Mime.lookup(filename),
            lastModified: scrapbook.zipFixModifiedTime(zipEntryObj.date),
          }),
        });
      }

      if (hasDataDir) {
        this.log(`Found ${inputData.files.length} files.`);
        await indexer.import(inputData);
      } else {
        // not a valid ScrapBook folder
        this.error(`Skipped invalid zip of ScrapBook folder.`);
        this.log('');
      }
    } catch (ex) {
      // not a valid zip file
      this.error(`Skipped invalid zip file '${file.name}'.`);
      this.log('');
    }
  },

  async loadInputFiles(files) {
    try {
      await this.start();

      for (const file of files) {
        await this.loadZipFile(file);
      }
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }

    await this.end();
  },

  async loadInputDir(files) {
    try {
      await this.start();

      const p = files[0].webkitRelativePath;
      const cut = p.indexOf('/') + 1;
      const inputData = {
        name: p.slice(0, cut - 1),
        files: [],
      };

      this.log(`Got directory '${inputData.name}'.`);

      // We cannot get the exact path since File.webkitRelativePath
      // returns only the common ancestor of the child, but at least
      // we can detect and fix some common cases with heuristics.
      // Below [] marks the common ancestor folder of input files.
      let isRightDir = false;
      let isWrongDir = false;
      let newCut = cut;
      let newBase = '';

      let hasDataDir = false;
      for (const file of files) {
        let path = file.webkitRelativePath;

        if (!isRightDir && !isWrongDir) {
          if (/^[^/]+[/]data[/]/.test(path)) {
            // [WSB]/data/...
            isRightDir = true;
          } else if (/^[^/]+[/]tree[/]/.test(path)) {
            // [WSB]/tree/...
            isRightDir = true;
          } else if (/^data[/]\d{17}[/.]/.test(path)) {
            // WSB/[data]/...
            isWrongDir = true;
            newCut = 0;
            this.log(`Common ancestor directory name seems incorrect. Adjust as it were WSB/[data]/...`);
          } else if (/^data[/]/.test(path)) {
            // Assume it's:
            // WSB/[data]/custom_content
            isWrongDir = true;
            newCut = 0;
            this.log(`Common ancestor directory name seems incorrect. Adjust as it were WSB/[data]/...`);
          } else if (/^tree[/]/.test(path)) {
            // WSB/[tree]/...
            isWrongDir = true;
            newCut = 0;
            this.log(`Common ancestor directory name seems incorrect. Adjust as it were WSB/[tree]/...`);
          } else if (/^\d{17}[/]/.test(path)) {
            // WSB/data/[...]/...
            isWrongDir = true;
            newCut = 0;
            newBase = 'data/';
            this.log(`Common ancestor directory name seems incorrect. Adjust as it were WSB/data/[...]`);
          }
        }

        path = path.slice(cut);
        if (path.startsWith('data/')) { hasDataDir = true; }
        inputData.files.push({
          path,
          file,
        });
      }

      if (isWrongDir) {
        hasDataDir = false;
        for (f of inputData.files) {
          const path = newBase + f.file.webkitRelativePath.slice(newCut);
          if (path.startsWith('data/')) { hasDataDir = true; }
          f.path = path;
        }
      }

      if (hasDataDir) {
        this.log(`Found ${inputData.files.length} files.`);
        await this.import(inputData);
      } else {
        // not a valid ScrapBook folder
        this.error(`Skipped invalid zip of ScrapBook folder.`);
        this.log('');
      }
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }

    await this.end();
  },

  async loadDrop(entries) {
    try {
      await this.start();

      let hasValidEntry = false;
      for (const entry of entries) {
        if (!entry) { return; }

        hasValidEntry = true;

        if (entry.isDirectory) {
          try {
            const cut = entry.fullPath.length + 1;
            const inputData = {
              name: entry.name,
              files: [],
            };

            this.log(`Got directory '${inputData.name}'.`);
            this.log(`Inspecting files...`);

            let hasDataDir = false;
            const scanFiles = async (dirEntry) => {
              // load all entries in dirEntry
              let entries = [];
              {
                const reader = dirEntry.createReader();
                let subentries;
                do {
                  subentries = await new Promise((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                  });
                  entries = entries.concat(subentries);
                } while (subentries.length)
              }

              // handle loaded entries
              for (const entry of entries) {
                if (entry.isDirectory) {
                  await scanFiles(entry);
                  continue;
                }

                const file = await new Promise((resolve, reject) => {
                  entry.file(resolve, reject);
                });

                const path = entry.fullPath.slice(cut);
                if (path.startsWith('data/')) { hasDataDir = true; }

                // Fix a Firefox bug that the returned File type is always ""
                // when a FileSystemFileEntry read from a FileSystemDirectoryEntry
                // calls file().
                // https://bugzilla.mozilla.org/show_bug.cgi?id=1424689
                if (scrapbook.userAgent.is('gecko')) {
                  file = new File([file], file.name, {
                    type: Mime.lookup(file.name),
                    lastModified: file.lastModified,
                  });
                }

                inputData.files.push({
                  path,
                  file,
                });
              }
            };

            await scanFiles(entry);

            if (hasDataDir) {
              this.log(`Found ${inputData.files.length} files.`);
              await indexer.import(inputData);
            } else {
              // not a valid ScrapBook folder
              this.error(`Skipped invalid ScrapBook folder.`);
              this.log('');
            }
          } catch (ex) {
            console.error(ex);
            this.error(`Unexpected error: ${ex.message}`);
          }
        } else {
          try {
            const file = await new Promise((resolve, reject) => {
              entry.file(resolve, reject);
            });
            await this.loadZipFile(file);
          } catch (ex) {
            console.error(ex);
            this.error(`Unexpected error: ${ex.message}`);
          }
        }
      }

      if (!hasValidEntry) {
        throw new Error(`At least one directory or zip file must be provided.`);
      }
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }

    await this.end();
  },

  /**
   * Main index generating process of an individual directory or ZIP file
   *
   * @param {object} inputData - processed structured files
   */
  async import(inputData) {
    try {
      const scrapbookData = {
        title: inputData.name,
        meta: {},
        toc: {
          root: [],
        },
        fulltext: {},
      };

      const zip = new JSZip();

      // collect files meaningful for ScrapBook
      const dataDirIds = new Set();
      const dataFiles = {};
      const treeFiles = {};
      const otherFiles = {};
      for (const {path, file} of inputData.files) {
        if (path.startsWith('tree/')) {
          treeFiles[path] = file;
        } else if (/^data[/](([^/]+)(?:[/].+|[.][^.]+))$/.test(path)) {
          const {$1: path, $2: id} = RegExp;
          dataFiles[path] = file;
          dataDirIds.add(id);
        } else {
          otherFiles[path] = file;
        }
      }

      await this.importLegacyRdf({scrapbookData, dataFiles, otherFiles});
      await this.importMetaJs({scrapbookData, treeFiles});
      await this.importTocJs({scrapbookData, treeFiles});
      await this.importDataDir({scrapbookData, dataFiles, dataDirIds});
      await this.fixMetaToc({scrapbookData, dataFiles});
      await this.cacheFavicons({scrapbookData, dataFiles, treeFiles, zip});
      await this.handleBadFavicons({scrapbookData, treeFiles, zip});
      await this.generateFiles({scrapbookData, treeFiles, otherFiles, zip});

      if (this.options["indexer.fulltextCache"]) {
        await this.generateFulltextCache({scrapbookData, dataFiles, treeFiles, zip});
      }

      await this.checkSameAndBackup({scrapbookData, treeFiles, otherFiles, zip});
      await this.makeZipAndDownload({scrapbookData, zip});

      /* We are done! */
      this.log(`Done.`);
      this.log(``);
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }
  },

  /* Import legacy ScrapBook RDF (metadata and toc) */
  async importLegacyRdf({scrapbookData, dataFiles, otherFiles}) {
    try {
      const path = `scrapbook.rdf`;
      const file = otherFiles[path];
      if (!file) { return; }

      this.log(`Found 'scrapbook.rdf' for legacy ScrapBook. Importing...`);

      const doc = await scrapbook.readFileAsDocument(file);

      const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
      const NS1 = "http://amb.vis.ne.jp/mozilla/scrapbook-rdf#";
      const NC = "http://home.netscape.com/NC-rdf#";

      const parseItemElem = (elem) => {
        const rid = elem.getAttributeNS(RDF, "about");
        if (!/^urn:scrapbook:item(\d{14})$/.test(rid)) { return; }

        const id = elem.getAttributeNS(NS1, "id") || RegExp.$1;
        const meta = {id};
        Array.prototype.forEach.call(elem.attributes, (attrElem) => {
          if (attrElem.prefix === "NS1" && attrElem.nodeName !== "NS1:id") {
            const attrName = attrElem.nodeName.slice(4);
            meta[attrName] = elem.getAttributeNS(NS1, attrName);
          }
        });

        if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
        scrapbookData.meta[id].index = this.getIndexPath(dataFiles, id) || undefined,
        this.mergeLegacyMeta(scrapbookData.meta[id], meta);
      };

      const parseSeqElem = (elem) => {
        const rid = elem.getAttributeNS(RDF, "about");
        if (!/^urn:scrapbook:(?:item(\d{14})|(root))$/.test(rid)) { return; }

        const id = RegExp.$1 || RegExp.$2;

        Array.prototype.forEach.call(elem.getElementsByTagNameNS(RDF, "li"), (refElem) => {
          const refRid = refElem.getAttributeNS(RDF, "resource");
          if (!/^urn:scrapbook:item(\d{14})$/.test(refRid)) { return; }
          const refId = RegExp.$1;
          if (!scrapbookData.toc[id]) { scrapbookData.toc[id] = []; }
          scrapbookData.toc[id].push(refId);
        });
      };

      Array.prototype.forEach.call(doc.getElementsByTagNameNS(RDF, "Description"), parseItemElem);
      Array.prototype.forEach.call(doc.getElementsByTagNameNS(NC, "BookmarkSeparator"), parseItemElem);
      Array.prototype.forEach.call(doc.getElementsByTagNameNS(RDF, "Seq"), parseSeqElem);
    } catch (ex) {
      console.error(ex);
      this.error(`Error importing 'scrapbook.rdf': ${ex.message}`);
    }
  },

  /* Import tree/meta*.js */
  async importMetaJs({scrapbookData, treeFiles}) {
    for (let i = 0; ; i++) {
      const path = `tree/meta${i || ""}.js`;
      const file = treeFiles[path];
      if (!file) { break; }

      this.log(`Importing '${path}'...`);
      try {
        const text = await scrapbook.readFileAsText(file);

        if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
          throw new Error(`Failed to retrieve JSON data.`);
        }

        const data = JSON.parse(RegExp.$1);
        for (const id in data) {
          if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
          scrapbookData.meta[id] = Object.assign(scrapbookData.meta[id], data[id]);
        }
      } catch (ex) {
        this.error(`Error importing '${path}': ${ex.message}`);
      }
    }
  },

  /* Import tree/toc*.js */
  async importTocJs({scrapbookData, treeFiles}) {
    for (let i = 0; ; i++) {
      const path = `tree/toc${i || ""}.js`;
      const file = treeFiles[path];
      if (!file) { break; }

      this.log(`Importing '${path}'...`);
      try {
        const text = await scrapbook.readFileAsText(file);

        if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
          throw new Error(`Failed to retrieve JSON data.`);
        }

        const data = JSON.parse(RegExp.$1);
        scrapbookData.toc = Object.assign(scrapbookData.toc, data);
      } catch (ex) {
        this.error(`Error importing '${path}': ${ex.message}`);
      }
    }
  },

  /* Import metadata from data/* */
  async importDataDir({scrapbookData, dataFiles, dataDirIds}) {
    this.log(`Inspecting data files...`);
    for (const id of [...dataDirIds].sort()) {
      if (scrapbookData.meta[id]) { continue; }

      const index = this.getIndexPath(dataFiles, id);

      let meta;
      let importedIndexDat = false;

      await (async () => {
        // check for index.dat of legacy ScrapBook X
        if (!(!index || index.endsWith('/index.html'))) { return; }

        const indexDatPath = `${id}/index.dat`;
        const indexDatFile = dataFiles[indexDatPath];
        if (!indexDatFile) { return; }

        this.log(`Found 'data/${indexDatPath}' for legacy ScrapBook. Importing...`);
        try {
          const text = await scrapbook.readFileAsText(indexDatFile);
          const indexDatMeta = this.parseIndexDat(text);
          if (!indexDatMeta) { return; }

          if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
          this.mergeLegacyMeta(scrapbookData.meta[id], indexDatMeta);
          importedIndexDat = true;
        } catch (ex) {
          console.error(ex);
          this.error(`Error importing 'data/${indexDatPath}': ${ex.message}`);
        }
      })();

      await (async () => {
        if (!index) { return; }

        meta = scrapbookData.meta[id] = scrapbookData.meta[id] || this.getDefaultMeta();

        /* meta.index */
        meta.index = index;

        /* meta.modify */
        // update using last modified time of the index file
        const fileModify = scrapbook.dateToId(new Date(dataFiles[index].lastModified));
        if (fileModify > meta.modify) { meta.modify = fileModify; }

        // skip importing index file if index.dat has been imported
        if (importedIndexDat) {
          return;
        }

        try {
          const doc = await (async () => {
            this.log(`Generating metadata entry from 'data/${index}'...`);
            if (this.isHtmlFile(index)) {
              return await scrapbook.readFileAsDocument(dataFiles[index]);
            } else if (this.isHtzFile(index)) {
              const zip = await new JSZip().loadAsync(dataFiles[index]);
              const ab = await zip.file("index.html").async("arraybuffer");
              const blob = new Blob([ab], {type: "text/html"});
              return await scrapbook.readFileAsDocument(blob);
            } else if (this.isMaffFile(index)) {
              // @TODO: support multiple entries in one maff file
              const zip = await new JSZip().loadAsync(dataFiles[index], {createFolders: true});
              const zipDir = zip.folder(Object.keys(zip.files)[0]);
              const zipRdfFile = zipDir.file("index.rdf");
              if (zipRdfFile) {
                let ab = await zipRdfFile.async("arraybuffer");
                let blob = new Blob([ab], {type: "application/rdf+xml"});
                const doc = await scrapbook.readFileAsDocument(blob);

                const rdfMeta = scrapbook.parseMaffRdfDocument(doc);

                // merge rdf metadata to scrapbookData.meta
                if (rdfMeta.title) {
                  meta.title = rdfMeta.title;
                }
                if (rdfMeta.originalurl) {
                  meta.source = rdfMeta.originalurl;
                }
                if (rdfMeta.archivetime) {
                  meta.create = scrapbook.dateToId(new Date(rdfMeta.archivetime));
                }

                // load pointed index file
                ab = await zipDir.file(rdfMeta.indexfilename).async("arraybuffer");
                blob = new Blob([ab], {type: "text/html"});
                return await scrapbook.readFileAsDocument(blob);
              } else {
                for (const path in zipDir.files) {
                  const subPath = path.slice(zipDir.root.length);
                  if (subPath.startsWith("index.")) {
                    const ab = await zipDir.file(subPath).async("arraybuffer");
                    const blob = new Blob([ab], {type: "text/html"});
                    return await scrapbook.readFileAsDocument(blob);
                  }
                }
              }
            }
          })();

          await (async () => {
            if (!doc) { throw new Error(`Unable to load index file 'data/${index}'`); }

            /* Merge information from html document to meta */
            const html = doc.documentElement;

            /* meta.id */
            meta.id = html.hasAttribute('data-scrapbook-id') ? 
                html.getAttribute('data-scrapbook-id') : 
                meta.id;

            /* meta.type */
            meta.type = html.hasAttribute('data-scrapbook-type') ? 
                html.getAttribute('data-scrapbook-type') : 
                meta.type;

            /* meta.source */
            meta.source = html.hasAttribute('data-scrapbook-source') ? 
                html.getAttribute('data-scrapbook-source') : 
                meta.source;

            /* meta.title */
            meta.title = html.hasAttribute('data-scrapbook-title') ? 
                html.getAttribute('data-scrapbook-title') : 
                doc.title || meta.title;

            /* meta.create */
            meta.create = html.hasAttribute('data-scrapbook-create') ? 
                html.getAttribute('data-scrapbook-create') : 
                meta.create;

            /* meta.icon */
            {
              let icon;
              if (html.hasAttribute('data-scrapbook-icon')) {
                icon = html.getAttribute('data-scrapbook-icon');
              } else {
                const favIconElem = doc.querySelector('link[rel~="icon"][href]');
                if (favIconElem) {
                  icon = favIconElem.getAttribute('href');
                }
              }
              meta.icon = icon || meta.icon;
            }

            /* meta.comment */
            meta.comment = html.hasAttribute('data-scrapbook-comment') ? 
                html.getAttribute('data-scrapbook-comment') : 
                meta.comment;

            /* meta.charset */
            meta.charset = html.hasAttribute('data-scrapbook-charset') ? 
                html.getAttribute('data-scrapbook-charset') : 
                meta.charset;

            /* meta.folder */
            meta.folder = html.hasAttribute('data-scrapbook-folder') ? 
                html.getAttribute('data-scrapbook-folder') : 
                meta.folder;

            /* meta.exported */
            meta.exported = html.hasAttribute('data-scrapbook-exported') ? 
                html.getAttribute('data-scrapbook-exported') : 
                meta.exported;
          })();
        } catch (ex) {
          console.error(ex);
          this.error(`Error inspecting 'data/${index}': ${ex.message}`);
        }
      })();
    }
  },

  /* Fix meta and toc */
  async fixMetaToc({scrapbookData, dataFiles}) {
    /* Process metadata */
    this.log(`Inspecting metadata...`);

    // handle tweaked ID
    const indexIdMap = new Map();
    for (let id in scrapbookData.meta) {
      const meta = scrapbookData.meta[id];

      if (meta.id) {
        const newId = meta.id;
        // scrapbookData.meta[newId] is imported from meta#.js
        // scrapbookData.meta[id] is imported from dataDir
        if (newId !== id) {
          if (!scrapbookData.meta[newId]) {
            // scrapbookData.meta[newId] not used
            scrapbookData.meta[newId] = meta;
            delete(scrapbookData.meta[id]);
            this.log(`Tweaked '${id}' to '${newId}'.`);
            id = newId;
          } else if (scrapbookData.meta[newId].index === meta.index) {
            // scrapbookData.meta[newId] used by self
            delete(scrapbookData.meta[id]);
            this.log(`Tweaked '${id}' to '${newId}'. Discarded metadata of '${id}'.`);
            continue;
          } else {
            // scrapbookData.meta[newId] used by another item, mark this as invalid
            delete(scrapbookData.meta[id]);
            this.error(`Removed bad metadata entry '${id}': specified ID '${newId}' has been used.`);
            continue;
          }
        }
      }

      if (meta.index) {
        const indexId = indexIdMap.get(meta.index);
        if (indexId) {
          delete(scrapbookData.meta[id]);
          this.log(`Tweaked '${id}' to '${indexId}'. Discarded metadata of '${id}'.`);
          continue;
        }
        indexIdMap.set(meta.index, id);
      }
    }

    for (const id in scrapbookData.meta) {
      const meta = scrapbookData.meta[id];

      // remove stale items
      // fix missing index file
      if (!['folder', 'separator', 'bookmark'].includes(meta.type)) {
        if (!meta.index || !dataFiles[meta.index]) {
          const index = this.getIndexPath(dataFiles, id);
          if (index) {
            meta.index = index;
            this.error(`Missing index file '${meta.index || ''}' for '${id}'. Shifted to '${index}'.`);
          } else {
            delete(scrapbookData.meta[id]);
            this.error(`Removed metadata entry for '${id}': Missing index file.`);
            continue;
          }
        }
      }

      // fix meta

      /* meta.type */
      meta.type = meta.type || "";

      /* meta.source */
      meta.source = meta.source || "";

      /* meta.title */
      // fallback to source and then id
      meta.title = meta.title || 
          (meta.source ? scrapbook.urlToFilename(meta.source) : '') || 
          (meta.type !== 'separator' ? id : '');

      /* meta.modify */
      // fallback to current time
      meta.modify = meta.modify || scrapbook.dateToId();

      /* meta.create */
      // fallback to modify time
      meta.create = meta.create || meta.modify;

      /* meta.icon */
      meta.icon = meta.icon || "";

      /* meta.comment */
      meta.comment = meta.comment || "";
    }

    /* Remove stale items from TOC */
    // generate referredIds and titleIdMap during the loop for later use
    this.log(`Inspecting TOC...`);
    const referredIds = new Set();
    const titleIdMap = new Map();
    for (const id in scrapbookData.toc) {
      if (!scrapbookData.meta[id] && id !== 'root' && id !== 'hidden') {
        delete(scrapbookData.toc[id]);
        this.error(`Removed TOC entry '${id}': Missing metadata entry.`);
        continue;
      }

      scrapbookData.toc[id] = scrapbookData.toc[id].filter((refId) => {
        if (!scrapbookData.meta[refId]) {
          this.error(`Removed TOC reference '${refId}' from '${id}': Missing metadata entry.`);
          return false;
        }
        if (refId === 'root' || refId === 'hidden') {
          this.error(`Removed TOC reference '${refId}' from '${id}': Invalid entry.`);
          return false;
        }
        referredIds.add(refId);
        titleIdMap.set(scrapbookData.meta[refId].title, refId);
        return true;
      });

      if (!scrapbookData.toc[id].length && id !== 'root' && id !== 'hidden') {
        delete(scrapbookData.toc[id]);
        this.error(`Removed empty TOC entry '${id}'.`);
      }
    }

    /* Add new items to TOC */
    this.log(`Adding new items to TOC...`);

    const insertToToc = (id, toc, metas) => {
      if (!metas[id].folder) {
        this.log(`Appended '${id}' to root of TOC.`);
        toc['root'].push(id);
        return;
      }

      let parentId = 'root';
      metas[id].folder.split(/[\t\n\r\v\f]+/).forEach((folder) => {
        let folderId = titleIdMap.get(folder);
        if (!(metas[folderId] && toc[parentId].indexOf(folderId) !== -1)) {
          folderId = this.generateFolder(folder, metas);
          toc[parentId].push(folderId);
          titleIdMap.set(folder, folderId);
          this.log(`Generated folder '${folderId}' with name '${folder}'.`);
        }
        if (!toc[folderId]) {
          toc[folderId] = [];
        }
        parentId = folderId;
      });
      toc[parentId].push(id);
      this.log(`Appended '${id}' to '${parentId}'.`);
    };

    for (const id of Object.keys(scrapbookData.meta).sort((a, b) => {
      const token_a = [scrapbookData.meta[a].exported, a];
      const token_b = [scrapbookData.meta[b].exported, b];
      if (token_a > token_b) { return 1; }
      if (token_a < token_b) { return -1; }
      return 0;
    })) {
      if (!referredIds.has(id) && id !== 'root' && id !== 'hidden') {
        insertToToc(id, scrapbookData.toc, scrapbookData.meta);
        titleIdMap.set(scrapbookData.meta[id].title, id);
      }

      // id, folder, and exported are temporary
      delete(scrapbookData.meta[id].id);
      delete(scrapbookData.meta[id].folder);
      delete(scrapbookData.meta[id].exported);
    }
  },

  /* Generate cache for favicon */
  async cacheFavicons({scrapbookData, dataFiles, treeFiles, zip}) {
    this.log(`Inspecting favicons...`);
    const urlAccessMap = new Map();
    return await Promise.all(Object.keys(scrapbookData.meta).map(async (id) => {
      try {
        let {index, icon: favIconUrl} = scrapbookData.meta[id];
        index = index || "";

        // the favIconUrl is ok
        if (!favIconUrl || favIconUrl.startsWith('../')) { return; }

        // allow relative favicon if index is HTML
        if (this.isHtmlFile(index) && !scrapbook.isUrlAbsolute(favIconUrl)) { return; }

        try {
          const file = await (async () => {
            const getShaFile = (data) => {
              if (!data) { throw new Error(`Unable to fetch a file for this favicon URL.`); }

              let {ab, mime, ext} = data;

              // validate that we have a correct image mimetype
              if (!mime.startsWith('image/') && mime !== 'application/octet-stream') {
                throw new Error(`Invalid image mimetype '${mime}'.`);
              }

              // if no extension, generate one according to mime
              if (!ext) { ext = Mime.extension(mime); }

              const sha = scrapbook.sha1(ab, 'ARRAYBUFFER');
              return new File([ab], `${sha}${ext ? '.' + ext : ''}`, {type: mime});
            };

            // retrive absolute URL
            if (scrapbook.isUrlAbsolute(favIconUrl)) {
              const prevAccess = urlAccessMap.get(favIconUrl);
              if (prevAccess) {
                // this.log(`Using previuos access for '${favIconUrl}' for '${id}'.`);
                return prevAccess;
              }

              const p = (async () => {
                if (favIconUrl.startsWith("data:")) {
                  // special handling of singleHtmlJs generated data URI
                  if (/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(favIconUrl)) {
                    const resType = RegExp.$1;
                    const resId = RegExp.$2;

                    const doc = await scrapbook.readFileAsDocument(dataFiles[index]);
                    if (!doc) { throw new Error(`Unable to load HTML document from 'data/${index}'.`); }

                    const loader = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
                    if (loader && /\([\n\r]+(.+)[\n\r]+\);(?:\/\/.*|\/\*.*?\*\/)*$/.test(loader.textContent)) {
                      const data = JSON.parse(RegExp.$1);
                      const url = `data:${resType};base64,${data[resId].d}`;
                      return scrapbook.dataUriToFile(url, false);
                    }
                  }

                  return scrapbook.dataUriToFile(favIconUrl, false);
                }

                const headers = {};
                let xhr;
                try {
                  xhr = await scrapbook.xhr({
                    url: favIconUrl,
                    responseType: 'blob',
                    timeout: 5000,
                    onreadystatechange(xhr) {
                      if (xhr.readyState !== 2) { return; }

                      // get headers
                      if (xhr.status !== 0) {
                        const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
                        if (headerContentDisposition) {
                          const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
                          // headers.isAttachment = (contentDisposition.type === "attachment");
                          headers.filename = contentDisposition.parameters.filename;
                        }
                        const headerContentType = xhr.getResponseHeader("Content-Type");
                        if (headerContentType) {
                          const contentType = scrapbook.parseHeaderContentType(headerContentType);
                          headers.contentType = contentType.type;
                          // headers.charset = contentType.parameters.charset;
                        }
                      }
                    },
                  });
                } catch (ex) {
                  throw new Error(`Unable to fetch URL: ${ex.message}`);
                }

                const [, ext] = scrapbook.filenameParts(headers.filename || scrapbook.urlToFilename(xhr.responseURL));
                const blob = xhr.response;
                const mime = blob.type;

                const ab = scrapbook.readFileAsArrayBuffer(blob);
                return getShaFile({ab, mime, ext});
              })();
              urlAccessMap.set(favIconUrl, p);
              return p;
            } else if (this.isHtzFile(index) || this.isMaffFile(index)) {
              const zip = await new JSZip().loadAsync(dataFiles[index], {createFolders: true});

              let zipDir;
              if (this.isMaffFile(index)) {
                zipDir = zip.folder(Object.keys(zip.files)[0]);
              } else {
                zipDir = zip;
              }

              const favIconPath = decodeURIComponent(favIconUrl);
              const zipFile = zipDir.file(favIconPath);

              if (!zipFile) {
                throw new Error(`'${favIconPath}' does not exist.`);
              }

              const mime = Mime.lookup(zipFile.name);
              const [, ext] = scrapbook.filenameParts(zipFile.name);

              const ab = await zipFile.async('arraybuffer');
              return getShaFile({ab, mime, ext});
            }
          })();

          const path = `tree/favicon/${file.name}`;

          // A non-empty existed file is a duplicate since favicon files are named using a checksum.
          if (!treeFiles[path] || treeFiles[path].size === 0) {
            scrapbook.zipAddFile(zip, path, file, false);
            this.log(`Saved favicon '${scrapbook.crop(favIconUrl, 256)}' for '${id}' at '${path}'.`);
          } else {
            this.log(`Use saved favicon for '${scrapbook.crop(favIconUrl, 256)}' for '${id}' at '${path}'.`);
          }

          const url = '../'.repeat(index.split('/').length) + scrapbook.escapeFilename(path);
          scrapbookData.meta[id].icon = url;
        } catch (ex) {
          console.error(ex);
          this.error(`Removed invalid favicon '${scrapbook.crop(favIconUrl, 256)}' for '${id}': ${ex.message}`);
          scrapbookData.meta[id].icon = "";
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Error inspecting favicon for '${id}': ${ex.message}`);
      }
    }));
  },

  /* Check for missing and unused favicons */
  async handleBadFavicons({scrapbookData, treeFiles, zip}) {
    const referedFavIcons = new Set();
    for (const id in scrapbookData.meta) {
      if (/^(?:[.][.][/]){1,2}(tree[/]favicon[/].*)$/.test(scrapbookData.meta[id].icon)) {
        let path = RegExp.$1;
        referedFavIcons.add(path);

      if (!treeFiles[path] && !zip.files[path]) {
          this.error(`Missing favicon: '${path}' (used by '${id}')`);
        }
      }
    }

    for (const path in treeFiles) {
      if (/^tree[/]favicon[/]/.test(path)) {
        if (!referedFavIcons.has(path)) {
          this.error(`Unused favicon: '${path}'`);

          // generate an empty icon file to replace it
          const file = new Blob([""], {type: "application/octet-stream"});
          scrapbook.zipAddFile(zip, path, file, false);
        }
      }
    }
  },
  
  /* Generate index pages, meta, toc, resource files, etc. */
  async generateFiles({scrapbookData, treeFiles, otherFiles, zip}) {
    this.log(`Checking for created and updated files...`);

    let metaFiles = 0;
    let tocFiles = 0;

    /* tree/meta#.js */
    // A javascript string >= 256 MiB (UTF-16 chars) causes an error
    // in the browser. Split each js file at around 256 K items to
    // prevent the issue. (An item is mostly < 512 bytes)
    {
      const exportFile = (meta, i) => {
        const content = this.generateMetaFile(meta);
        const file = new Blob([content], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, `tree/meta${i || ""}.js`, file, true);
      };

      const sizeThreshold = 256 * 1024;
      let i = 0;
      let size = 0;
      let meta = {};
      for (const id in scrapbookData.meta) {
        meta[id] = scrapbookData.meta[id];
        size += 1;

        if (size >= sizeThreshold) {
          exportFile(meta, i);
          i += 1;
          size = 0;
          meta = {};
        }
      }
      if (Object.keys(meta).length) {
        exportFile(meta, i);
        i += 1;
      }
      metaFiles = i;

      // fill an empty file for unused tree/meta#.js
      for (; ; i++) {
        const path = `tree/meta${i}.js`;
        let file = treeFiles[path];
        if (!file) { break; }

        file = new Blob([""], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, path, file, true);
      }
    }

    /* tree/toc#.js */
    // A javascript string >= 256 MiB (UTF-16 chars) causes an error
    // in the browser. Split each js file at around 4 M entries to
    // prevent the issue. (An entry is mostly < 32 bytes)
    {
      const exportFile = (toc, i) => {
        const content = this.generateTocFile(toc);
        const file = new Blob([content], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, `tree/toc${i || ""}.js`, file, true);
      };

      const sizeThreshold = 4 * 1024 * 1024;
      let i = 0;
      let size = 0;
      let toc = {};
      for (const id in scrapbookData.toc) {
        toc[id] = scrapbookData.toc[id];
        size += 1 + toc[id].length;

        if (size >= sizeThreshold) {
          exportFile(toc, i);
          i += 1;
          size = 0;
          toc = {};
        }
      }
      if (Object.keys(toc).length) {
        exportFile(toc, i);
        i += 1;
      }
      tocFiles = i;

      // fill an empty file for unused tree/toc#.js
      for (; ; i++) {
        const path = `tree/toc${i}.js`;
        let file = treeFiles[path];
        if (!file) { break; }

        file = new Blob([""], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, path, file, true);
      }
    }

    /* tree/map.html */
    content = this.generateMapFile(scrapbookData, metaFiles, tocFiles);
    file = new Blob([content], {type: "text/html"});
    scrapbook.zipAddFile(zip, 'tree/map.html', file, true);

    /* tree/frame.html */
    content = this.generateFrameFile(scrapbookData);
    file = new Blob([content], {type: "text/html"});
    scrapbook.zipAddFile(zip, 'tree/frame.html', file, true);

    /* tree/search.html */
    content = this.generateSearchFile(scrapbookData);
    file = new Blob([content], {type: "text/html"});
    scrapbook.zipAddFile(zip, 'tree/search.html', file, true);

    /* resource files */
    const resToInclude = {
      'tree/icon/toggle.png': browser.runtime.getURL("resources/toggle.png"),
      'tree/icon/search.png': browser.runtime.getURL("resources/search.png"),
      'tree/icon/collapse.png': browser.runtime.getURL("resources/collapse.png"),
      'tree/icon/expand.png': browser.runtime.getURL("resources/expand.png"),
      'tree/icon/external.png': browser.runtime.getURL("resources/external.png"),
      'tree/icon/item.png': browser.runtime.getURL("resources/item.png"),
      'tree/icon/fclose.png': browser.runtime.getURL("resources/fclose.png"),
      'tree/icon/fopen.png': browser.runtime.getURL("resources/fopen.png"),
      'tree/icon/note.png': browser.runtime.getURL("resources/note.png"),  // ScrapBook X notex
      'tree/icon/postit.png': browser.runtime.getURL("resources/postit.png"),  // ScrapBook X note
    };

    /* server scripts */
    if (this.options["indexer.serverScripts"]) {
      resToInclude["server.py"] = browser.runtime.getURL("resources/server.py");

      if (!otherFiles["config.ini"]) {
        resToInclude["config.ini"] = browser.runtime.getURL("resources/config.ini");
      }
    }

    for (const path in resToInclude) {
      if (treeFiles[path]) { continue; }

      try {
        const xhr = await scrapbook.xhr({
          url: resToInclude[path],
          responseType: 'blob',
        });
        const blob = xhr.response;
        scrapbook.zipAddFile(zip, path, blob, false);
      } catch (ex) {
        this.error(`Error adding file '${path}' to zip: ${ex.message}`);
      }
    }
  },

  /* Generate fulltext cache */
  async generateFulltextCache({scrapbookData, dataFiles, treeFiles, zip}) {
    this.log(`Generating fulltext cache...`);
    let cacheLastModified = 0;

    /* Import tree/fulltext*.js */
    for (let i = 0; ; i++) {
      const path = `tree/fulltext${i || ""}.js`;
      const file = treeFiles[path];
      if (!file) { break; }

      this.log(`Importing '${path}'...`);
      try {
        const text = await scrapbook.readFileAsText(file);
        if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
          throw new Error(`Failed to retrieve JSON data.`);
        }

        const data = JSON.parse(RegExp.$1);
        scrapbookData.fulltext = Object.assign(scrapbookData.fulltext, data);
        cacheLastModified = Math.max(file.lastModified, cacheLastModified);
      } catch (ex) {
        this.error(`Error importing '${path}': ${ex.message}`);
      }
    }

    /* Remove stale cache for nonexist items */
    for (const id in scrapbookData.fulltext) {
      if (!scrapbookData.meta[id]) {
        delete(scrapbookData.fulltext[id]);
        this.log(`Removed stale cache for '${id}'.`);
      }
    }

    /* Build cache for items */
    await (async () => {
      const noIndexTags = new Set([
        "head",
        "style", "script",
        "frame", "iframe",
        "embed", "object", "applet",
        "audio", "video",
        "canvas",
        "noframes", "noscript",
        "parsererror",
        "svg", "math",
      ]);

      const getIndexPaths = async () => {
        if (this.isMaffFile(index)) {
          itemZip = itemZip || await new JSZip().loadAsync(dataFiles[index], {createFolders: true});
          return await scrapbook.getMaffIndexFiles(itemZip);
        } else if (this.isHtzFile(index)) {
          return ['index.html'];
        }

        return [scrapbook.filepathParts(index)[1]];
      };

      const getFile = async (path) => {
        if (this.isHtmlFile(index)) {
          if (path === '.') {
            return dataFiles[index];
          }

          let [base] = scrapbook.filepathParts(index);
          base = base ? base + '/' : '';
          return dataFiles[base + path];
        } else if (this.isHtzFile(index) || this.isMaffFile(index)) {
          const [base, filename] = scrapbook.filepathParts(path);
          itemZip = itemZip || await new JSZip().loadAsync(dataFiles[index], {createFolders: true});

          const file = itemZip.file(path);
          if (!file) { return file; }

          const ab = await file.async("arraybuffer");
          return new File([ab], filename, {type: Mime.lookup(filename)});
        }
      };

      const getFulltextCache = async (path) => {
        const file = await getFile(path);
        return await getFulltextCacheForFile(path, file);
      };

      const getFulltextCacheForFile = async (path, file) => {
        if (!file) { return null; }

        const mime = scrapbook.parseHeaderContentType(file.type).type;

        if (["text/html", "application/xhtml+xml"].indexOf(mime) !== -1) {
          return await getFulltextCacheHtml(path, file);
        } else if (mime.startsWith("text/")) {
          return await getFulltextCacheTxt(path, file);
        }
      };

      const getFulltextCacheHtml = async (path, file) => {
        const doc = await scrapbook.readFileAsDocument(file);
        if (!doc) { return null; }

        const getRelativeFilePath = (url) => {
          const base = getRelativeFilePath.base = getRelativeFilePath.base || 
              'file:///!/';
          const ref = getRelativeFilePath.ref = getRelativeFilePath.ref || 
              new URL(path.replace(/[^/]+/g, m => encodeURIComponent(m)), base).href;
          const [urlMain] = scrapbook.splitUrlByAnchor(url);

          let target;
          try {
            target = new URL(urlMain, ref).href;
          } catch (ex) {
            // urlMain cannot be resolved
          }
          if (!target) { return null; }
          if (!target.startsWith(base)) { return null; }
          if (target === ref) { return null; } // ignore referring self
          return decodeURIComponent(target.slice(base.length));
        };

        // @TODO: better handle content
        // (no space between inline nodes, line break between block nodes, etc.)
        const getElementTextRecursively = async (elem) => {
          for (const child of elem.childNodes) {
            if (child.nodeType === 1) {
              const nodeName = child.nodeName.toLowerCase();
              if (["a", "area"].indexOf(nodeName) !== -1) {
                if (child.hasAttribute("href")) {
                  const url = child.getAttribute("href");
                  if (url.startsWith("data:")) {
                    await addDataUriContent(url);
                  } else {
                    const target = getRelativeFilePath(url);
                    if (target && !filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
                  }
                }
              } else if (["iframe", "frame"].indexOf(nodeName) !== -1) {
                if (child.hasAttribute("src")) {
                  const url = child.getAttribute("src");
                  if (url.startsWith("data:")) {
                    await addDataUriContent(url);
                  } else {
                    const target = getRelativeFilePath(url);
                    if (target) {
                      if (this.options["indexer.fulltextCacheFrameAsPageContent"]) {
                        // Add frame content to current page content if the targeted
                        // file hasn't been indexed.
                        if (filesToUpdate.get(target) !== false) {
                          filesToUpdate.set(target, false);
                          const fulltext = await getFulltextCache(target);
                          if (fulltext) { results.push(fulltext); }
                        }
                      } else {
                        if (!filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
                      }
                    }
                  }
                }
              }
              if (!noIndexTags.has(nodeName)) {
                await getElementTextRecursively(child);
              }
            } else if (child.nodeType === 3) {
              results.push(child.nodeValue);
            }
          }
        };

        const addDataUriContent = async (url) => {
          // special handling of singleHtmlJs generated data URI
          if (/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(url)) {
            const resType = RegExp.$1;
            const resId = RegExp.$2;

            itemLoaderData = itemLoaderData || (() => {
              const loader = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
              if (loader && /\([\n\r]+(.+)[\n\r]+\);(?:\/\/.*|\/\*.*?\*\/)*$/.test(loader.textContent)) {
                return JSON.parse(RegExp.$1);
              }
              return [];
            })();

            url = `data:${resType};base64,${itemLoaderData[resId].d}`;
          }

          const file = scrapbook.dataUriToFile(url);
          const fulltext = await getFulltextCacheForFile("", file);
          if (fulltext) { results.push(fulltext); }
        };

        const results = [];

        // check for a potential meta refresh (mostly for file item)
        let hasInstantRedirect = false;
        for (const metaRefreshElem of doc.querySelectorAll('meta[http-equiv="refresh"][content]')) {
          const {time, url} = scrapbook.parseHeaderRefresh(metaRefreshElem.getAttribute("content"));
          if (time === 0) { hasInstantRedirect = true; }
          if (url) {
            if (url.startsWith("data:")) {
              await addDataUriContent(url);
            } else {
              const target = getRelativeFilePath(url);
              if (target && !filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
            }
          }
        }

        if (hasInstantRedirect) {
          if (results.length) {
            return results.join(" ").replace(/\s+/g, " ");
          }

          return null;
        }

        await getElementTextRecursively(doc);
        return results.join(" ").replace(/\s+/g, " ");
      };

      const getFulltextCacheTxt = async (path, file) => {
        const text = await scrapbook.readFileAsText(file, meta.charset || 'UTF-8') || null;
        if (!text) { return text; }

        return text.replace(/\s+/g, " ");
      };

      let meta;
      let index;
      let itemZip;
      let itemLoaderData;
      let filesToUpdate;

      for (const [id, meta] of Object.entries(scrapbookData.meta)) {
        try {
          index = meta.index;

          const file = index && dataFiles[index];

          // no index file: remove cache
          if (!file) {
            if (scrapbookData.fulltext[id]) {
              delete(scrapbookData.fulltext[id]);
              this.log(`Removed stale cache for '${id}'.`);
            }
            continue;
          }

          filesToUpdate = new Map();
          itemZip = null;
          itemLoaderData = null;

          /* determine the files to be cached */
          await (async () => {
            // if no existed fulltext cache, rebuild as default
            // (for index and referred files)
            if (!scrapbookData.fulltext[id]) {
              this.log(`Creating cache for '${id}'...`);

              scrapbookData.fulltext[id] = {};
              (await getIndexPaths()).forEach((filePath) => {
                filesToUpdate.set(filePath, true);
              });
              return;
            }

            // rebuild partial
            // For folder: check index and all cached files, and rebuild updated ones
            // For archive or single HTML: rebuild all entries if the archive file is changed

            // check update for index file / archive file
            if (file.lastModified > cacheLastModified) {
              // updated: add to update list
              (await getIndexPaths()).forEach((filePath) => {
                filesToUpdate.set(filePath, true);
              });
            }

            // check update for files that has a fulltext cache
            if (this.isHtmlFile(index)) {
              for (let filePath in scrapbookData.fulltext[id]) {
                // replace deprecated filePath "."
                if (filePath === '.') {
                  const filePathNew = scrapbook.filepathParts(index)[1];
                  scrapbookData.fulltext[id][filePathNew] = scrapbookData.fulltext[id][filePath];
                  delete(scrapbookData.fulltext[id][filePath]);
                  filePath = filePathNew;
                }

                const file = await getFile(filePath);
                if (!file) {
                  // removed: remove the cache
                  delete(scrapbookData.fulltext[id][filePath]);
                  filesToUpdate.set(filePath, true);
                } else if (file.lastModified > cacheLastModified) {
                  // updated: add to update list
                  filesToUpdate.set(filePath, true);
                }
              }
            }

            if (filesToUpdate.size > 0) {
              // at least one file to update
              this.log(`Updating cache for '${id}'...`);

              if (!this.isHtmlFile(index)) {
                scrapbookData.fulltext[id] = {};
              }
            }
          })();

          /* build cache for filesToUpdate Set */
          for (const filePath of filesToUpdate.keys()) {
            if (!filesToUpdate.get(filePath)) {
              delete(scrapbookData.fulltext[id][filePath]);
              continue;
            }

            filesToUpdate.set(filePath, false);
            const fulltext = await getFulltextCache(filePath) || null;
            if (fulltext === null) {
              delete(scrapbookData.fulltext[id][filePath]);
            } else {
              scrapbookData.fulltext[id][filePath] = {
                content: fulltext || '',
              };
            }
          }
        } catch (ex) {
          console.error(ex);
          this.error(`Error generating cache for '${id}': ${ex.message}`);
        }
      }
    })();

    /* Generate files */
    {
      /* tree/fulltext#.js */
      // A javascript string >= 256 MiB (UTF-16 chars) causes an error
      // in the browser. Split each js file at at around 128 MiB to
      // prevent the issue.
      const exportFile = (fulltext, i) => {
        const content = this.generateFulltextFile(fulltext);
        const file = new Blob([content], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, `tree/fulltext${i || ""}.js`, file, true);
      };

      const sizeThreshold = 128 * 1024 * 1024;
      let i = 0;
      let size = 0;
      let fulltext = {};
      for (const id in scrapbookData.fulltext) {
        fulltext[id] = scrapbookData.fulltext[id];
        for (const filePath in fulltext[id]) {
          size += fulltext[id][filePath].content.length;
        }
        if (size >= sizeThreshold) {
          exportFile(fulltext, i);
          i += 1;
          size = 0;
          fulltext = {};
        }
      }
      if (Object.keys(fulltext).length) {
        exportFile(fulltext, i);
        i += 1;
      }

      // fill an empty file for unused tree/fulltext#.js
      for (; ; i++) {
        const path = `tree/fulltext${i}.js`;
        let file = treeFiles[path];
        if (!file) { break; }

        file = new Blob([""], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, path, file, true);
      }
    }
  },

  /* Remove same files and generate backup files */
  async checkSameAndBackup({scrapbookData, treeFiles, otherFiles, zip}) {
    for (const [path, zipObj] of Object.entries(zip.files)) {
      if (zipObj.dir) { continue; }
      if (path.startsWith('tree/cache/')) { continue; }

      let bakPath;
      let oldFile;

      if (path.startsWith('tree/')) {
        bakPath = 'tree.bak/' + path.slice('tree/'.length);
        oldFile = treeFiles[path];
      } else if (path === 'server.py') {
        bakPath = path + '.bak';
        oldFile = otherFiles[path];
      } else {
        continue;
      }

      if (!oldFile) { continue; }

      // @TODO: Maybe binary compare is better than sha compare?
      let shaOld;
      try {
        let ab = await scrapbook.readFileAsArrayBuffer(oldFile);
        shaOld = scrapbook.sha1(ab, 'ARRAYBUFFER');
        ab = await zipObj.async('arraybuffer');
        const shaNew = scrapbook.sha1(ab, 'ARRAYBUFFER');
        if (shaOld !== shaNew) {
          scrapbook.zipAddFile(zip, bakPath, oldFile, null, {date: oldFile.lastModifiedDate});
        } else {
          zip.remove(path);
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Error checking file ${path}: ${ex.message}`);
      }
    }
  },

  /* Generate the zip file and download it */
  async makeZipAndDownload({scrapbookData, zip}) {
    // check if there is a new file
    let hasNewFile = false;
    for (const path in zip.files) {
      const zipObj = zip.files[path];
      if (!zipObj.dir) {
        hasNewFile = true;
        break;
      }
    }
    if (!hasNewFile) {
      this.log(`Current files are already up-to-date.`);
      return;
    }

    // auto download
    if (this.options["indexer.autoDownload"]) {
      const directory = scrapbook.getOption("capture.scrapbookFolder");

      if (scrapbook.validateFilename(scrapbookData.title) === directory.replace(/^.*[\\\/]/, "")) {
        this.log(`Downloading files...`);
        for (const [inZipPath, zipObj] of Object.entries(zip.files)) {
          if (zipObj.dir) { continue; }

          try {
            const blob = await zipObj.async("blob");
            const downloadId = await browser.downloads.download({
              url: URL.createObjectURL(blob),
              filename: directory + "/" + inZipPath,
              conflictAction: "overwrite",
              saveAs: false,
            });
            this.autoEraseSet.add(downloadId);
          } catch (ex) {
            this.error(`Error downloading ${directory + "/" + inZipPath}: ${ex.message}`);
          }
        }
        return;
      }

      this.error(`Picked folder does not match configured WebScrapBook folder. Download as zip...`);
    }

    // download zip
    this.log(`Generating zip file...`);
    const blob = await zip.generateAsync({type: "blob"});

    /* Download the blob */
    const filename = `${scrapbookData.title}.zip`;

    if (scrapbook.userAgent.is('gecko')) {
      // Firefox has a bug that the screen turns unresponsive
      // when an addon page is redirected to a blob URL.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
      //
      // Workaround by creating the anchor in an iframe.
      const iDoc = this.downloader.contentDocument;
      const a = iDoc.createElement('a');
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      iDoc.body.appendChild(a);
      a.click();
      a.remove();

      // In case the download still fails.
      const file = new File([blob], filename, {type: "application/octet-stream"});
      const elem = document.createElement('a');
      elem.target = 'download';
      elem.href = URL.createObjectURL(file);
      elem.textContent = `If the download doesn't start, click me.`;
      this.logger.appendChild(elem);
      this.log('');
      return;
    }

    const elem = document.createElement('a');
    elem.download = filename;
    elem.href = URL.createObjectURL(blob);
    elem.textContent = `If the download doesn't start, click me.`;
    this.logger.appendChild(elem);
    elem.click();
    this.log('');
  },

  getIndexPath(dataFiles, id) {
    let index;

    index = `${id}/index.html`;
    if (dataFiles[index]) { return index; }

    index = `${id}.html`;
    if (dataFiles[index]) { return index; }

    index = `${id}.htm`;
    if (dataFiles[index]) { return index; }

    index = `${id}.xhtml`;
    if (dataFiles[index]) { return index; }

    index = `${id}.xht`;
    if (dataFiles[index]) { return index; }

    index = `${id}.maff`;
    if (dataFiles[index]) { return index; }

    index = `${id}.htz`;
    if (dataFiles[index]) { return index; }

    return null;
  },

  isHtmlFile(path) {
    const p = path.toLowerCase();
    return p.endsWith('.html') || p.endsWith('.htm') || 
        p.endsWith('.xhtml') || p.endsWith('.xht');
  },

  isHtzFile(path) {
    const p = path.toLowerCase();
    return p.endsWith('.htz');
  },

  isMaffFile(path) {
    const p = path.toLowerCase();
    return p.endsWith('.maff');
  },

  getDefaultMeta() {
    return {
      id: undefined,
      index: undefined,
      title: undefined,
      type: undefined,
      create: undefined,
      modify: undefined,
      source: undefined,
      icon: undefined,
      comment: undefined,
      charset: undefined,
      marked: undefined,
      locked: undefined,
      folder: undefined,
      exported: undefined,
    };
  },

  parseIndexDat(text) {
    const data = text.split('\n');
    if (data.length < 2) { return null; }
    const meta = this.getDefaultMeta();
    for (const d of data) {
      const [key, ...values] = d.split('\t');
      if (!values.length) { continue; }
      meta[key] = values.join('\t');
    }
    return meta;
  },

  /**
   * @param {Object} newMeta - current scrapbookData.meta[id] object, will be modified
   * @param {Object} legacyMeta - meta object from legacy ScrapBook X
   */
  mergeLegacyMeta(newMeta, legacyMeta) {
    const id = legacyMeta.id;

    const meta = JSON.parse(JSON.stringify(legacyMeta));

    /* meta.type, meta.marked */
    meta.type = {
      "note": "postit",
      "notex": "note",
      "combine": "site",
    }[meta.type] || meta.type || "";

    if (meta.type == "marked") {
      meta.type = "";
      meta.marked = true;
    }

    /* meta.create */
    meta.create = meta.create ? scrapbook.dateToId(scrapbook.idToDateOld(meta.create)) : "";

    /* meta.modify */
    meta.modify = meta.modify ? scrapbook.dateToId(scrapbook.idToDateOld(meta.modify)) : "";

    /* meta.icon */
    const resProtocolBase = `resource://scrapbook/data/${id}/`;
    const resProtocolBase2 = `resource://scrapbook/icon/`;
    meta.icon = meta.icon || "";
    if (meta.icon.startsWith(resProtocolBase)) {
      meta.icon = meta.icon.slice(resProtocolBase.length);
    } else if (meta.icon.startsWith(resProtocolBase2)) {
      meta.icon = `../../icon/${meta.icon.slice(resProtocolBase2.length)}`;
    } else if (meta.icon.startsWith('moz-icon://')) {
      meta.icon = "";
    }

    /* meta.comment */
    meta.comment = meta.comment ? meta.comment.replace(/ __BR__ /g, '\n') : "";

    /* meta.charset */
    if (meta.chars) {
      meta.charset = meta.chars;
    }
    delete(meta.chars);

    /* meta.locked */
    if (meta.lock) {
      meta.locked = true;
    }
    delete(meta.lock);

    /* meta.container */
    delete(meta.container);

    /* meta.exported */
    if (meta.exported) {
      meta.exported = scrapbook.dateToId(new Date(meta.exported));
    }

    newMeta = Object.assign(newMeta, meta);
  },

  getUniqueId(id, metas) {
    if (!metas[id]) { return id; }

    const d = scrapbook.idToDate(id);
    let v = d.valueOf();
    do {
      v += 1;
      d.setTime(v);
      id = scrapbook.dateToId(d);
    } while (metas[id]);

    return id;
  },

  generateFolder(title, metas) {
    const folderId = this.getUniqueId(scrapbook.dateToId(), metas);
    const meta = metas[folderId] = this.getDefaultMeta();
    meta.type = 'folder';
    meta.title = title;
    meta.create = folderId;
    return folderId;
  },

  generateMetaFile(jsonData) {
    return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.meta(${JSON.stringify(jsonData, null, 2)})`;
  },

  generateTocFile(jsonData) {
    return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.toc(${JSON.stringify(jsonData, null, 2)})`;
  },

  generateFulltextFile(jsonData) {
    return `/**
 * This file is generated by WebScrapBook and is not intended to be edited.
 */
scrapbook.fulltext(${JSON.stringify(jsonData, null, 1)})`;
  },

  /**
   * The generated page ought to work on most browsers.
   *
   * Beware of cross-browser compatibility, basicly comply with CSS 2.1
   * and ECMAscript 3 or provide a fallback.
   *
   * - Avoid Node.textContent (IE < 9)
   *
   * Also remember to escape '\' with '\\' in this long string.
   */
  generateMapFile(scrapbookData, metaFiles = 1, tocFiles = 1) {
    const loadMetaJs = () => {
      let result = [];
      for (let i = 0; i < metaFiles; i++) {
        result.push(`<script src="meta${i || ""}.js"></script>`);
      }
      return result.join("\n");
    };

    const loadTocJs = () => {
      let result = [];
      for (let i = 0; i < tocFiles; i++) {
        result.push(`<script src="toc${i || ""}.js"></script>`);
      }
      return result.join("\n");
    };

    return `<!DOCTYPE html>
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create map.css and/or map.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="map">
<head>
<base target="main">
<meta charset="UTF-8">
<title>${scrapbookData.title || ""}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html {
  height: 100%;
}

body {
  margin: 0;
  padding: 0;
  font-size: .8em;
  line-height: 1.35em;
}

#header {
  margin-bottom: .75em;
  border: 1px solid #A0A0A0;
  padding: .125em .5em;
  background-color: #FFFFE1;
}

#header > a {
  color: #666666;
}

#search img {
  margin: 0;
  width: 1.5em;
  height: 1em;
}

#item-root {
  padding: 0 1.65em;
}

ul {
  margin: 0;
  padding: 0;
}

li {
  list-style-type: none;
  margin: .2em 0;
  padding-${scrapbook.lang('@@bidi_start_edge')}: .85em;
}

li > div {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -.85em;
  white-space: nowrap;
}

a {
  text-decoration: none;
  color: #000000;
}

a:focus {
  background-color: #6495ED;
  text-decoration: underline;
}

a:active {
  background-color: #FFB699;
}

a > img {
  display: inline-block;
  margin-left: .1em;
  margin-right: .1em;
  border: none;
  width: 1.25em;
  height: 1.25em;
  vertical-align: middle;
}

a.scrapbook-toggle {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -1.45em;
}

a.scrapbook-external > img {
  width: 1em;
  height: 1em;
  vertical-align: top;
}

.scrapbook-type-bookmark > div > a {
  color: rgb(32,192,32);
}

.scrapbook-type-note > div > a {
  color: rgb(80,0,32);
}

.scrapbook-type-site > div > a {
  color: blue;
}

.scrapbook-type-separator > div > fieldset {
  margin: 0;
  border: none;
  border-top: 1px solid #aaa;
  padding: 0 0 0 1em;
  text-indent: 0;
}

.scrapbook-type-separator > div > fieldset > legend {
  padding: 0;
}

.scrapbook-marked > div > a {
  font-weight: bold;
}
</style>
<!--[if lte IE 7]><style>
a > img {
  display: inline;
  zoom: 1;
}
</style><![endif]-->
<link rel="stylesheet" href="map.css">
<script>
var scrapbook = {
  data: {
    title: document.title,
    toc: {},
    meta: {}
  },

  toc: function (data) {
    for (var id in data) {
      this.data.toc[id] = data[id];
    }
  },

  meta: function (data) {
    for (var id in data) {
      this.data.meta[id] = data[id];
    }
  },

  init: function () {
    var rootElem = document.createElement('div');
    rootElem.id = 'item-root';

    rootElem.container = document.createElement('ul');
    rootElem.container.className = 'scrapbook-container';
    rootElem.appendChild(rootElem.container);

    for (var i = 0, I = scrapbook.data.toc.root.length; i < I; i++) {
      var id = scrapbook.data.toc.root[i];
      scrapbook.addItem(id, rootElem, ["root"]);
    }

    document.body.appendChild(rootElem);

    document.getElementById('toggle-all').onclick = scrapbook.onClickToggleAll;

    scrapbook.loadHash();
  },

  addItem: function (id, parent, idChain) {
    var meta = scrapbook.data.meta[id];

    var elem = document.createElement('li');
    elem.id = 'item-' + id;
    if (meta.type) { elem.className = 'scrapbook-type-' + meta.type + ' '; };
    if (meta.marked) { elem.className += 'scrapbook-marked '; }
    parent.container.appendChild(elem);

    var div = document.createElement('div');
    div.onclick = scrapbook.onClickItem;
    elem.appendChild(div);

    if (meta.type !== 'separator') {
      var a = document.createElement('a');
      a.appendChild(document.createTextNode(meta.title || id));
      if (meta.type !== 'bookmark') {
        if (meta.index) { a.href = '../data/' + scrapbook.escapeFilename(meta.index); }
      } else {
        if (meta.source) {
          a.href = meta.source;
        } else {
          if (meta.index) { a.href = '../data/' + scrapbook.escapeFilename(meta.index); }
        }
      }
      if (meta.comment) { a.title = meta.comment; }
      if (meta.type === 'folder') { a.onclick = scrapbook.onClickFolder; }
      div.appendChild(a);

      var icon = document.createElement('img');
      if (meta.icon) {
        icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
            meta.icon : 
            ('../data/' + scrapbook.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
      } else {
        icon.src = {
          'folder': 'icon/fclose.png',
          'note': 'icon/note.png',
          'postit': 'icon/postit.png',
        }[meta.type] || 'icon/item.png';
      }
      icon.alt = "";
      a.insertBefore(icon, a.firstChild);

      if (meta.type !== 'bookmark' && meta.source) {
        var srcLink = document.createElement('a');
        srcLink.className = 'scrapbook-external';
        srcLink.href = meta.source;
        srcLink.title = "${scrapbook.escapeQuotes(scrapbook.lang('IndexerSourceLinkTitle'))}";
        div.appendChild(srcLink);
        srcLink.target = "_blank";

        var srcImg = document.createElement('img');
        srcImg.src = 'icon/external.png';
        srcImg.alt = '';
        srcLink.appendChild(srcImg);
      }

      var childIdList = scrapbook.data.toc[id];
      if (childIdList && childIdList.length) {
        elem.toggle = document.createElement('a');
        elem.toggle.href = '#';
        elem.toggle.className = 'scrapbook-toggle';
        elem.toggle.onclick = scrapbook.onClickToggle;
        div.insertBefore(elem.toggle, div.firstChild);

        var toggleImg = document.createElement('img');
        toggleImg.src = 'icon/collapse.png';
        toggleImg.alt = '';
        elem.toggle.appendChild(toggleImg);

        elem.container = document.createElement('ul');
        elem.container.className = 'scrapbook-container';
        elem.container.style.display = 'none';
        elem.appendChild(elem.container);

        var childIdChain = idChain.slice();
        childIdChain.push(id);
        for (var i = 0, I = childIdList.length; i < I; i++) {
          var childId = childIdList[i];
          if (idChain.indexOf(childId) === -1) {
            scrapbook.addItem(childId, elem, childIdChain);
          }
        }
      }
    } else {
      var line = document.createElement('fieldset');
      if (meta.comment) { line.title = meta.comment; }
      div.appendChild(line);

      var legend = document.createElement('legend');
      legend.appendChild(document.createTextNode('\\xA0' + (meta.title || '') + '\\xA0'));
      line.appendChild(legend);
    }

    return elem;
  },

  loadHash: function () {
    var hash = self.location.hash || top.location.hash;
    if (!hash) { return; }
    
    var itemElem = document.getElementById(hash.slice(1));
    if (!itemElem) { return; }

    var e = itemElem.parentNode;
    while (e && e.parentNode) {
      if (e.nodeName.toLowerCase() === 'ul') {
        scrapbook.toggleElem(e, true);
      }
      e = e.parentNode;
    }

    if (self !== top && location.hash !== hash) {
      location.hash = hash;
    }

    var anchor = scrapbook.getItemAnchor(itemElem);

    if (anchor) {
      if (self !== top) {
        top.document.title = anchor.childNodes[1].nodeValue || scrapbook.data.title;
        if (anchor.href) { top.frames["main"].location = anchor.href; }
      }
      setTimeout(function(){ anchor.focus(); }, 0);
    }
  },

  getItemAnchor: function (itemElem) {
    var anchorElem = null;
    if (!/^item-(?!root$)/.test(itemElem.id)) { return anchorElem; }

    var elems = itemElem.firstChild.getElementsByTagName('a');
    for (var i = 0, I = elems.length; i < I; i++) {
      var e = elems[i];
      if (e.className !== 'scrapbook-toggle' && 
          e.className !== 'scrapbook-external') {
        anchorElem = e;
        break;
      }
    }
    return anchorElem;
  },

  onClickFolder: function (event) {
    event.preventDefault();
    var target = this.previousSibling;
    target.focus();
    target.click();
  },

  onClickItem: function (event) {
    var hash = '#' + this.parentNode.id;
    var anchor = scrapbook.getItemAnchor(this.parentNode);

    try {
      var title = anchor ? anchor.childNodes[1].nodeValue : "";
      title = title || scrapbook.data.title;

      if (self !== top) {
        top.document.title = title;
        if (top.history && top.history.pushState) {
          top.history.pushState('', title, hash);
        } else {
          top.location.hash = hash;
        }
      } else {
        if (history && history.replaceState) {
          history.replaceState('', title, hash);
        }
      }
    } catch(ex) {
      if (console && console.error) { console.error(ex); }
    }
  },

  onClickToggle: function (event) {
    event.preventDefault();
    scrapbook.toggleElem(this.parentNode.nextSibling);
  },

  onClickToggleAll: function (event) {
    event.preventDefault();
    scrapbook.toggleAllElem();
  },

  toggleElem: function (elem, willOpen) {
    if (typeof willOpen === "undefined") {
      willOpen = (elem.style.display === "none");
    }
    elem.style.display = willOpen ? '' : 'none';

    try {
      elem.previousSibling.firstChild.firstChild.src = willOpen ? 'icon/expand.png' : 'icon/collapse.png';
    } catch (ex) {
      // if the elem is the root elem, previousSibling is undefined and an error is thrown
    }
  },

  toggleAllElem: function (willOpen) {
    var elems = document.getElementsByTagName("ul");
    if (typeof willOpen === "undefined") {
      willOpen = false;
      for (var i = 1, I = elems.length; i < I; i++) { // skip root
        if (elems[i].style.display === "none") { willOpen = true; break; }
      }
    }
    for (var i = 1, I = elems.length; i < I; i++) { // skip root
      scrapbook.toggleElem(elems[i], willOpen);
    }
  },

  escapeFilename: function (filename) {
    return filename.replace(/[^/]+/g, function (m) { return encodeURIComponent(m); });
  }
};
</script>
${loadMetaJs()}
${loadTocJs()}
<script src="map.js"></script>
</head>
<body>
<div id="header">
<a id="toggle-all" title="Expand all" href="#"><img src="icon/toggle.png">${scrapbookData.title || ""}</a>
<a id="search" href="search.html" target="_self"><img src="icon/search.png" alt=""></a>
</div>
<script>scrapbook.init();</script>
</body>
</html>
`;
  },

  /**
   * The generated page ought to work on most browsers.
   *
   * Also remember to escape '\' with '\\' in this long string.
   */
  generateFrameFile(scrapbookData) {
    return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Frameset//EN" "http://www.w3.org/TR/html4/frameset.dtd">
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create frame.css and/or frame.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="frame">
<head>
<meta charset="UTF-8">
<title>${scrapbookData.title || ""}</title>
<link rel="stylesheet" href="frame.css">
<script src="frame.js"></script>
</head>
<frameset cols="200,*">
<frame name="nav" src="map.html">
<frame name="main">
</frameset>
</html>
`;
  },

  generateSearchFile(scrapbookData) {
    return `<!DOCTYPE html>
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create search.css and/or search.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="search">
<head>
<meta charset="UTF-8">
<title>${scrapbook.lang('IndexerSearchTitle', [scrapbookData.title || ""])}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html {
  height: 100%;
}

body {
  margin: 0;
  padding: 0;
  font-size: .8em;
  line-height: 1.35em;
}

#searchForm {
  display: flex;
  flex-direction: row;
  padding: .25em;
}

#keyword {
  flex: auto;
  min-width: 150px;
}

#helper {
  width: 2em;
}

#result {
  margin: 0;
  margin-top: 1em;
  padding: 0;
}

#support {
  margin-top: 2em;
  padding: .5em;
  background-color: #FEE;
  font-size: .85em;
}

ul {
  margin: 0;
  padding: 0;
}

li {
  list-style-type: none;
  margin: .2em;
  padding-${scrapbook.lang('@@bidi_start_edge')}: 1em;
}

li > div {
  white-space: nowrap;
}

a {
  text-decoration: none;
  color: #000000;
}

a:focus {
  background-color: #6495ED;
  text-decoration: underline;
}

a:active {
  background-color: #FFB699;
}

a > img {
  display: inline-block;
  margin-left: .1em;
  margin-right: .1em;
  border: none;
  width: 1.25em;
  height: 1.25em;
  vertical-align: middle;
}

a.scrapbook-toggle {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -1.45em;
}

a.scrapbook-external > img {
  width: 1em;
  height: 1em;
  vertical-align: top;
}

.scrapbook-type-bookmark > div > a {
  color: rgb(32,192,32);
}

.scrapbook-type-note > div > a {
  color: rgb(80,0,32);
}

.scrapbook-type-site > div > a {
  color: blue;
}

.scrapbook-type-separator > div > fieldset {
  margin: 0;
  border: none;
  border-top: 1px solid #aaa;
  padding: 0 0 0 1em;
  text-indent: 0;
}

.scrapbook-type-separator > div > fieldset > legend {
  padding: 0;
}

.scrapbook-marked > div > a {
  font-weight: bold;
}
</style>
<link rel="stylesheet" href="search.css">
<script>
const conf = {
  scrapbooks: [
    {name: "", path: "../"}
  ],
  allow_http: 0,  // whether to load rdf cache from the http? -1: deny, 0: ask; 1: allow
  default_search: "-type:separator",  // the constant string to add before the input keyword
  default_field: "tcc",  // the field to search for bare key terms
  view_in_map_path: "tree/map.html",  // path (related to book) of the map page for "view in map"
  view_in_map_title: "View in Map",  // title for "view in map"
};

const scrapbook = {
  books: [],

  data: null,

  toc(data) {
    this.data.toc = Object.assign(this.data.toc, data);
  },

  meta(data) {
    this.data.meta = Object.assign(this.data.meta, data);
  },

  fulltext(data) {
    this.data.fulltext = Object.assign(this.data.fulltext, data);
  },

  init() {
    document.getElementById('searchForm').addEventListener('submit', (event) => {
      event.preventDefault();
      this.search();
    });
 
    document.getElementById('helper').addEventListener('change', (event) => {
      event.preventDefault();
      this.helperFill();
    });

    conf.scrapbooks.forEach((book) => {
      scrapbook.books.push({
        name: book.name,
        path: book.path,
        toc: {},
        meta: {},
        fulltext: {},
      });
    });

    return this.loadBooks().then(() => {
      document.getElementById('search').disabled = false;
    });
  },

  loadBooks() {
    let p = Promise.resolve();
    scrapbook.books.forEach((book) => {
      p = p.then(() => {
        return this.loadBook(book);
      }).catch((ex) => {
        console.error(ex);
        this.addMsg("Error: " + ex.message);
      });
    });
    return p;
  },

  loadBook(book) {
    return Promise.resolve().then(() => {
      let base = this.resolveUrl(book.path, location.href);
      if (!this.checkHttp(base)) {
        this.addMsg("Rejected to load book from HTTP: " + base);
        return;
      }

      const loadMeta = () => {
        const loop = () => {
          const url = this.resolveUrl("tree/meta" + (i || "") + ".js", base);
          return this.loadScript(url).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            if (i === 0) { throw ex; }
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      const loadToc = () => {
        const loop = () => {
          const url = this.resolveUrl("tree/toc" + (i || "") + ".js", base);
          return this.loadScript(url).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            if (i === 0) { throw ex; }
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      const loadFulltext = () => {
        const loop = () => {
          const url = this.resolveUrl("tree/fulltext" + (i || "") + ".js", base);
          return this.loadScript(url).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      scrapbook.data = book;
      return Promise.all([
        loadMeta(),
        loadToc(),
        loadFulltext(),
      ]);
    });
  },

  loadScript(url) {
    return new Promise((resolve, reject) => {
      const elem = document.createElement("script");
      document.getElementsByTagName("head")[0].appendChild(elem);
      elem.onload = (event) => {
        console.log("Loaded '" + url + "'");
        resolve();
      };
      elem.onerror = (event) => {
        elem.remove();
        reject(new Error("Failed to load '" + url + "'"));
      };
      elem.src = url;
    });
  },

  checkHttp(url) {
    const targetUrl = this.resolveUrl(url, location.href);
    const targetUrlObj = new URL(targetUrl);
    if (['http:', 'https:'].indexOf(targetUrlObj.protocol) !== -1 &&
        ['localhost', '127.0.0.1'].indexOf(targetUrlObj.hostname) === -1) {
      if (conf.allow_http === 0) {
        if (confirm("Loading search database from the web could produce large network flow. Continue?")) {
          conf.allow_http = 1;
        } else {
          conf.allow_http = -1;
        }
      }
      if (conf.allow_http > 0) { return true; }
      return false;
    }
    return true;
  },

  search() {
    return Promise.resolve().then(() => {
      this.clearResult();

      // set query string
      let queryStr = document.getElementById("keyword").value;
      if (conf.default_search) {
        queryStr = conf.default_search + " " + queryStr;
      }

      // parse query
      const query = searchEngine.parseQuery(queryStr);
      if (query.error.length) {
        for (const err of query.error) {
          this.addMsg("Error: " + err);
        }
        return;
      }
      console.log("Search:", query);

      // search and get result
      return searchEngine.search(query);
    }).catch((ex) => {
      console.error(ex);
      this.addMsg("Error: " + ex.message);
    });
  },

  showResults(results, book) {
    const name = book.name ? "(" + book.name + ") " : "";
    this.addMsg(name + "Found " + results.length + " results:");
    for (const item of results) {
      this.addResult(item, book);
    }
    this.addMsg("\\u00A0");
  },

  addResult(item, book) {
    const {id, file, meta, fulltext} = item;

    const li = document.createElement("li");
    if (meta.type) {
      li.className = "scrapbook-type-" + meta.type;
    }
    document.getElementById("result").appendChild(li);

    const div = document.createElement("div");
    li.appendChild(div);

    {
      let href;
      if (meta.type !== "bookmark") {
        if (meta.index) {
          let subpath = 
              (!file || file === '.' || this.isZipFile(meta.index)) ? 
              meta.index : 
              meta.index.replace(/[^/]+$/, '') + file;
          subpath = this.escapeFilename(subpath || "");
          if (subpath) {
            href = book.path + "data/" + subpath;
          }
        }
      } else {
        href = meta.source;
      }
      const a = document.createElement("a");
      if (href) { a.href = href; }
      a.target = "main";
      a.textContent = a.title = meta.title;
      div.appendChild(a);

      if (file && !(
          file === "." || 
          (this.isZipFile(meta.index) && file === "index.html") || 
          (!this.isZipFile(meta.index) && file === meta.index.replace(/^.*[/]/, ''))
          )) {
        const span = document.createElement("span");
        span.textContent = " (" + file + ")";
        a.appendChild(span);
      }

      const icon = document.createElement('img');
      if (meta.icon) {
        icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
            meta.icon : 
            (book.path + 'data/' + this.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
      } else {
        icon.src = {
          'folder': 'icon/fclose.png',
          'note': 'icon/note.png',
          'postit': 'icon/postit.png',
        }[meta.type] || 'icon/item.png';
      }
      icon.alt = "";
      a.insertBefore(icon, a.firstChild);
    }

    {
      const a = document.createElement("a");
      a.href = book.path + conf.view_in_map_path + "#item-" + id;
      a.target = "_blank";
      a.className = "scrapbook-external";
      a.title = conf.view_in_map_title;
      div.appendChild(a);

      var img = document.createElement("img");
      img.src = "icon/external.png";
      img.alt = "";
      a.appendChild(img);
    }
  },

  clearResult() {
    document.getElementById("result").innerHTML = "";
  },

  addMsg(msg) {
    let wrapper = document.getElementById("result");
    let result = document.createElement("li");
    result.appendChild(document.createTextNode(msg));
    wrapper.appendChild(result);
  },

  resolveUrl(url, base) {
    try {
      return new URL(url, base).href;
    } catch(ex) {
      // unable to resolve
    }
    return url;
  },

  isZipFile(path) {
    const p = path.toLowerCase();
    return p.endsWith('.htz') || p.endsWith('.maff');
  },

  escapeRegExp(str) {
    return str.replace(/[-/\\\\^$*+?.|()[\\]{}]/g, "\\\\$&");
  },

  escapeFilename(filename) {
    return filename.replace(/[^/]+/g, m => encodeURIComponent(m));
  },

  helperFill() {
    let helper = document.getElementById("helper");
    let keyword = document.getElementById("keyword");
    keyword.value = keyword.value + (keyword.value === "" ? "" : " ") + helper.value;
    helper.selectedIndex = 0;
    keyword.focus();
    keyword.setSelectionRange(keyword.value.length, keyword.value.length);
  },
};

const searchEngine = {
  parseQuery(queryStr) {
    const query = {
      error: [],
      rules: {},
      sorts: [],
      root: null,
      mc: false,
      re: false,
      default: conf.default_field,
    };

    const addRule = (name, type, value) => {
      if (typeof query.rules[name] === "undefined") {
        query.rules[name] = {"include": [], "exclude": []};
      }
      query.rules[name][type].push(value);
    };

    const addSort = (key, order) => {
      switch (key) {
        case "id": case "file":
          query.sorts.push({key, order});
          break;
        case "content":
          query.sorts.push({key: "fulltext", subkey: key, order});
          break;
        default:
          query.sorts.push({key: "meta", subkey: key, order});
          break;
      }
    };

    const addError = (msg) => {
      query.error.push(msg);
    };

    const parseStr = (term, exactMatch = false) => {
      const flags = query.mc ? "m" : "im";
      let regex = "";
      if (query.re) {
        try {
          regex = new RegExp(term, flags);
        } catch(ex) {
          addError("Invalid RegExp: " + term);
          return null;
        }
      } else {
        let key = scrapbook.escapeRegExp(term);
        if (exactMatch) { key = "^" + key + "$"; }
        regex = new RegExp(key, flags);
      }
      return regex;
    };

    const parseDate = (term) => {
      const match = term.match(/^(\\d{0,17})(?:-(\\d{0,17}))?$/);
      if (!match) {
        addError("Invalid date format: " + term);
        return null;
      }
      const since = match[1] ? this.dateUtcToLocal(pad(match[1], 17)) : pad("", 17);
      const until = match[2] ? this.dateUtcToLocal(pad(match[2], 17)) : pad("", 17, "9");
      return [since, until];
    };

    const pad = (n, width, z) => {
      z = z || "0";
      n = n + "";
      return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
    };

    queryStr.replace(/(-?[A-Za-z]+:|-)(?:"((?:""|[^"])*)"|([^"\\s]*))|(?:"((?:""|[^"])*)"|([^"\\s]+))/g, (match, cmd, qterm, term, qterm2, term2) => {
      if (cmd) {
        term = (qterm !== undefined) ? qterm.replace(/""/g, '"') : term;
      } else {
        term = (qterm2 !== undefined) ? qterm2.replace(/""/g, '"') : term2;
      }

      switch (cmd) {
        case "mc:":
          query.mc = true;
          break;
        case "-mc:":
          query.mc = false;
          break;
        case "re:":
          query.re = true;
          break;
        case "-re:":
          query.re = false;
          break;
        case "root:":
          query.root = term;
          break;
        case "-root:":
          query.root = null;
          break;
        case "sort:":
          addSort(term, 1);
          break;
        case "-sort:":
          addSort(term, -1);
          break;
        case "type:":
          addRule("type", "include", parseStr(term, true));
          break;
        case "-type:":
          addRule("type", "exclude", parseStr(term, true));
          break;
        case "id:":
          addRule("id", "include", parseStr(term, true));
          break;
        case "-id:":
          addRule("id", "exclude", parseStr(term, true));
          break;
        case "file:":
          addRule("file", "include", parseStr(term));
          break;
        case "-file:":
          addRule("file", "exclude", parseStr(term));
          break;
        case "source:":
          addRule("source", "include", parseStr(term));
          break;
        case "-source:":
          addRule("source", "exclude", parseStr(term));
          break;
        case "tcc:":
          addRule("tcc", "include", parseStr(term));
          break;
        case "-tcc:":
          addRule("tcc", "exclude", parseStr(term));
          break;
        case "title:":
          addRule("title", "include", parseStr(term));
          break;
        case "-title:":
          addRule("title", "exclude", parseStr(term));
          break;
        case "comment:":
          addRule("comment", "include", parseStr(term));
          break;
        case "-comment:":
          addRule("comment", "exclude", parseStr(term));
          break;
        case "content:":
          addRule("content", "include", parseStr(term));
          break;
        case "-content:":
          addRule("content", "exclude", parseStr(term));
          break;
        case "create:":
          addRule("create", "include", parseDate(term));
          break;
        case "-create:":
          addRule("create", "exclude", parseDate(term));
          break;
        case "modify:":
          addRule("modify", "include", parseDate(term));
          break;
        case "-modify:":
          addRule("modify", "exclude", parseDate(term));
          break;
        case "-":
          addRule(query["default"], "exclude", parseStr(term));
          break;
        default:
          addRule(query["default"], "include", parseStr(term));
          break;
      }

      return "";
    });
    return query;
  },

  search(query) {
    let p = Promise.resolve();
    scrapbook.books.forEach((book) => {
      p = p.then(() => {
        return this.searchBook(query, book).then((results) => {
          scrapbook.showResults(results, book);
        });
      });
    });
    return p;
  },

  searchBook(query, book) {
    return Promise.resolve().then(() => {
      const results = [];

      let idPool;
      if (query.root) {
        idPool = new Set();

        const addIdRecursively = (id) => {
          for (const refId of book.toc[id]) {
            if (book.meta[refId] && !idPool.has(refId)) {
              idPool.add(refId);
              if (book.toc[refId]) {
                addIdRecursively(refId);
              }
            }
          }
        };

        if (book.meta[query.root] && book.toc[query.root]) {
          addIdRecursively(query.root);
        }
      } else {
        idPool = new Set(Object.keys(book.meta));
      }

      idPool.forEach((id) => {
        let subfiles = book.fulltext[id] || {};
        if (!Object.keys(subfiles).length) { subfiles[""] = {}; }

        for (const file in subfiles) {
          const item = {
            id,
            file,
            meta: book.meta[id],
            fulltext: subfiles[file],
          };
          if (this.matchItem(item, query)) {
            results.push(item);
          }
        }
      });

      // sort results
      for (const {key, subkey, order} of query.sorts) {
        results.sort((a, b) => {
          a = a[key]; if (subkey) { a = a[subkey]; } a = a || "";
          b = b[key]; if (subkey) { b = b[subkey]; } b = b || "";
          if (a > b) { return order; }
          if (a < b) { return -order; }
          return 0;
        });
      }

      return results;
    });
  },

  matchItem(item, query) {
    if (!item.meta) {
      return false;
    }

    for (const i in query.rules) {
      if (!this["_match_" + i](query.rules[i], item)) { return false; }
    }

    return true;
  },

  _match_tcc(rule, item) {
    return this.matchText(rule, [item.meta.title, item.meta.comment, item.fulltext.content].join("\\n"));
  },

  _match_content(rule, item) {
    return this.matchText(rule, item.fulltext.content);
  },

  _match_id(rule, item) {
    return this.matchText(rule, item.id);
  },

  _match_file(rule, item) {
    return this.matchText(rule, item.file);
  },

  _match_title(rule, item) {
    return this.matchText(rule, item.meta.title);
  },

  _match_comment(rule, item) {
    return this.matchText(rule, item.meta.comment);
  },

  _match_source(rule, item) {
    return this.matchText(rule, item.meta.source);
  },

  _match_type(rule, item) {
    const text = item.meta.type;
    
    for (const key of rule.exclude) {
      if (key.test(text)) {
        return false;
      }
    }

    // use "or" clause
    if (!rule.include.length) { return true; }
    for (const key of rule.include) {
      if (key.test(text)) {
        return true;
      }
    }
    return false;
  },

  _match_create(rule, item) {
    return this.matchDate(rule, item.meta.create);
  },

  _match_modify(rule, item) {
    return this.matchDate(rule, item.meta.modify);
  },

  matchText(rule, text) {
    text = text || "";

    for (const key of rule.exclude) {
      if (key.test(text)) {
        return false;
      }
    }

    for (const key of rule.include) {
      if (!key.test(text)) {
        return false;
      }
    }

    return true;
  },

  matchDate(rule, date) {
    if (!date) { return false; }

    for (const key of rule.exclude) {
      if (key[0] <= date && date <= key[1]) {
        return false;
      }
    }

    for (const key of rule.include) {
      if (!(key[0] <= date && date <= key[1])) {
        return false;
      }
    }

    return true;
  },

  dateUtcToLocal(dateStr) {
    if (/^(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{3})$/.test(dateStr)) {
      const dd = new Date(
          parseInt(RegExp.$1, 10), Math.max(parseInt(RegExp.$2, 10), 1) - 1, Math.max(parseInt(RegExp.$3, 10), 1),
          parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
          );
      return dd.getUTCFullYear() +
          this.intToFixedStr(dd.getUTCMonth() + 1, 2) +
          this.intToFixedStr(dd.getUTCDate(), 2) +
          this.intToFixedStr(dd.getUTCHours(), 2) +
          this.intToFixedStr(dd.getUTCMinutes(), 2) +
          this.intToFixedStr(dd.getUTCSeconds(), 2) +
          this.intToFixedStr(dd.getUTCMilliseconds(), 3);
    }
    return null;
  },

  intToFixedStr(number, width, padder) {
    padder = padder || "0";
    number = number.toString(10);
    return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
  },
};
</script>
<script src="search.js"></script>
</head>
<body>
<form id="searchForm">
  <input id="keyword" type="text">
  <select id="helper">
    <option value="" selected="selected"></option>
    <option value="id:">id:</option>
    <option value="title:">title:</option>
    <option value="comment:">comment:</option>
    <option value="content:">content:</option>
    <option value="tcc:">tcc:</option>
    <option value="source:">source:</option>
    <option value="type:">type:</option>
    <option value="create:">create:</option>
    <option value="modify:">modify:</option>
    <option value="re:">re:</option>
    <option value="mc:">mc:</option>
    <option value="file:">file:</option>
    <option value="root:">root:</option>
    <option value="sort:">sort:</option>
    <option value="-sort:modify">Last Modified</option>
    <option value="-sort:create">Last Created</option>
    <option value="sort:title">Title Ascending</option>
    <option value="-sort:title">Title Descending</option>
    <option value="sort:id">ID Sort</option>
  </select>
  <input id="search" type="submit" value="go" disabled="disabled" autocomplete="off">
</form>
<div>
<ul id="result"></ul>
</div>
<div id="support">
Supported browsers: Chromium ≥ 49, Firefox ≥ 41, Edge ≥ 14, Safari ≥ 8, with JavaScript enabled.
</div>
<script>scrapbook.init();</script>
</body>
</html>
`;
  },
};

browser.downloads.onChanged.addListener(async (downloadDelta) => {
  const downloadId = downloadDelta.id;
  if (!indexer.autoEraseSet.has(downloadId)) { return; }

  if ((downloadDelta.state && downloadDelta.state.current === "complete") || 
      downloadDelta.error) {
    return await browser.downloads.erase({id: downloadDelta.id});
  }
});

document.addEventListener("DOMContentLoaded", async function () {
  scrapbook.loadLanguages(document);

  // init common elements and events
  indexer.dropmask = document.getElementById('dropmask');
  indexer.downloader = document.getElementById('downloader');
  indexer.dirSelector = document.getElementById('dir-selector');
  indexer.filesSelector = document.getElementById('files-selector');
  indexer.logger = document.getElementById('logger');

  const dirSelectorLabel = document.getElementById('dir-selector-label');
  const filesSelectorLabel = document.getElementById('files-selector-label');

  await scrapbook.loadOptionsAuto;

  // init events
  indexer.initEvents();

  // enable UI
  // adjust GUI for mobile
  if ('webkitdirectory' in indexer.dirSelector || 
      'mozdirectory' in indexer.dirSelector || 
      'directory' in indexer.dirSelector) {
    // directory selection supported
    dirSelectorLabel.hidden = false;
  }
  filesSelectorLabel.hidden = false;
});
