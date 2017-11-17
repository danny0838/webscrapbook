/********************************************************************
 *
 * Script for load.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

function onDragEnter(e) {
  indexer.dropmask.style.display = '';
  indexer.lastDragTarget = e.target;
};

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
};

function onDragLeave(e) {
  if (e.target === indexer.lastDragTarget) {
    indexer.dropmask.style.display = 'none';
  }
};

function onDrop(e) {
  e.preventDefault();
  indexer.dropmask.style.display = 'none';
  indexer.loadDrop(e.dataTransfer.items);
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
  isMobile: false,
  virtualBase: chrome.runtime.getURL("indexer/!/"),
  autoEraseSet: new Set(),

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
    this.logger.textContent = '';
    this.options = Object.assign({}, scrapbook.options);
  },

  end() {
    this.dirSelector.value = null;
    this.filesSelector.value = null;
    this.initEvents();
  },

  loadZipFile(file) {
    return Promise.resolve().then(() => {
      this.log(`Got file '${file.name}'.`);
      this.log(`Extracting zip content...`);

      return new JSZip().loadAsync(file).then((zipObj) => {
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

        let p = Promise.resolve();
        zipObj.forEach((inZipPath, zipEntryObj) => {
          if (zipEntryObj.dir) { return; }

          p = p.then(() => {
            // async('blob') has type = '' and has no lastModified
            return zipEntryObj.async('arraybuffer').then((ab) => {
              const filename = inZipPath.replace(/^.*[/]/, '');
              inputData.files.push({
                path: inZipPath.slice(cut),
                file: new File([ab], filename, {
                  type: Mime.prototype.lookup(filename),
                  lastModified: scrapbook.zipFixModifiedTime(zipEntryObj.date),
                }),
              });                    
            });
          });
        });
        return p.then(() => {
          this.log(`Found ${inputData.files.length} files.`);
          return indexer.import(inputData);
        });
      }, (ex) => {
        // not a valid zip file
        this.error(`Skipped invalid zip file '${file.name}'.`);
        this.log('');
      });
    });
  },

  loadInputDir(files) {
    return Promise.resolve().then(() => {
      this.start();
    }).then(() => {
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

        inputData.files.push({
          path: path.slice(cut),
          file: file,
        });
      }

      if (isWrongDir) {
        for (f of inputData.files) {
          f.path = newBase + f.file.webkitRelativePath.slice(newCut);
        }
      }

      this.log(`Found ${inputData.files.length} files.`);
      return this.import(inputData);
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }).then(() => {
      this.end();
    });
  },

  loadInputFiles(files) {
    return Promise.resolve().then(() => {
      this.start();
    }).then(() => {
      let p = Promise.resolve();
      Array.prototype.forEach.call(files, (file) => {
        return p = p.then(() => {
          return this.loadZipFile(file);
        });
      });
      return p;
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }).then(() => {
      this.end();
    });
  },

  loadDrop(items) {
    return Promise.resolve().then(() => {
      this.start();
    }).then(() => {
      let hasValidEntry = false;
      let p = Promise.resolve();
      Array.prototype.map.call(items, x => x.webkitGetAsEntry && x.webkitGetAsEntry()).forEach((entry) => {
        if (!entry) { return; }

        hasValidEntry = true;

        if (entry.isDirectory) {
          p = p.then(() => {
            const cut = entry.fullPath.length + 1;
            const inputData = {
              name: entry.name,
              files: [],
            };

            this.log(`Got directory '${inputData.name}'.`);
            this.log(`Inspecting files...`);

            const scanFiles = (dirEntry) => {
              return Promise.resolve().then(() => {
                let results = [];
                const reader = dirEntry.createReader();
                const read = () => {
                  return new Promise((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                  }).then((entries) => {
                    if (entries.length) {
                      results = results.concat(entries);
                      return read();
                    }
                    return results;
                  });
                };
                return read();
              }).then((entries) => {
                let p = Promise.resolve();
                for (const entry of entries) {
                  p = p.then(() => {
                    if (entry.isDirectory) {
                      return scanFiles(entry);
                    }
                    return new Promise((resolve, reject) => {
                      entry.file(resolve, reject);
                    }).then((file) => {
                      inputData.files.push({
                        path: entry.fullPath.slice(cut),
                        file: file,
                      });
                    });
                  });
                }
                return p;
              });
            };

            return scanFiles(entry).then(() => {
              this.log(`Found ${inputData.files.length} files.`);
              return indexer.import(inputData);
            });
          }).catch((ex) => {
            console.error(ex);
            this.error(`Unexpected error: ${ex.message}`);
          });
        } else {
          p = p.then(() => {
            return new Promise((resolve, reject) => {
              entry.file(resolve, reject);
            }).then((file) => {
              return this.loadZipFile(file);
            });
          }).catch((ex) => {
            console.error(ex);
            this.error(`Unexpected error: ${ex.message}`);
          });
        }
      });
      return p.then(() => {
        if (!hasValidEntry) {
          throw new Error(`At least one directory or zip file must be provided.`);
        }
      });
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    }).then(() => {
      this.end();
    });
  },

  import(inputData) {
    return Promise.resolve().then(() => {
      const scrapbookData = {
        title: inputData.name,
        meta: {},
        toc: {
          root: [],
        },
      };

      const zip = new JSZip();

      // collect files meaningful for ScrapBook
      const dataDirs = {};
      const treeFiles = {};
      const otherFiles = {};
      for (const {path, file} of inputData.files) {
        // record legacy ScrapBook files
        if (path === 'scrapbook.rdf') {
          otherFiles[path] = file;
        }

        // record files in tree/*
        if (path.startsWith('tree/')) {
          treeFiles[path] = file;
        }

        // map files in data/*
        if (/^data\/(([^\/]+)(?:\/.+|[.][^.]+))$/.test(path)) {
          const {$1: path, $2: id} = RegExp;
          if (!dataDirs[id]) { dataDirs[id] = {}; }
          dataDirs[id][path] = file;
        }
      }

      return Promise.resolve().then(() => {
        /* Import legacy ScrapBook data */

        const path = `scrapbook.rdf`;
        const file = otherFiles[path];
        if (!file) { return; }

        this.log(`Found 'scrapbook.rdf' for legacy ScrapBook. Importing...`);
        return scrapbook.readFileAsDocument(file).then((doc) => {
          const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
          const NS1 = "http://amb.vis.ne.jp/mozilla/scrapbook-rdf#";
          const NC = "http://home.netscape.com/NC-rdf#";

          const parseItemElem = (elem) => {
            const rid = elem.getAttributeNS(RDF, "about");
            if (!/^urn:scrapbook:item(\d{14})$/.test(rid)) { return; }

            const id = elem.getAttributeNS(NS1, "id") || RegExp.$1;

            const rdfMeta = {
              id,
              title: elem.getAttributeNS(NS1, "title"),
              type: elem.getAttributeNS(NS1, "type"),
              create: elem.getAttributeNS(NS1, "create"),
              modify: elem.getAttributeNS(NS1, "modify"),
              source: elem.getAttributeNS(NS1, "source"),
              icon: elem.getAttributeNS(NS1, "icon"),
              comment: elem.getAttributeNS(NS1, "comment"),
              chars: elem.getAttributeNS(NS1, "chars"),
              lock: elem.getAttributeNS(NS1, "lock"),
            };

            const meta = {
              id,
              index: dataDirs[id] && this.getIndexPath(dataDirs[id], id) || undefined,
              title: rdfMeta.title,
              type: rdfMeta.type,
              create: rdfMeta.create ? scrapbook.dateToId(scrapbook.idToDateOld(rdfMeta.create)) : "",
              modify: rdfMeta.modify ? scrapbook.dateToId(scrapbook.idToDateOld(rdfMeta.modify)) : "",
              source: rdfMeta.source,
              icon: rdfMeta.icon,
              comment: rdfMeta.comment,
            };

            /* meta.charset, meta.locked */
            if (rdfMeta.chars) { meta.charset = rdfMeta.chars; }
            if (rdfMeta.lock) { meta.locked = rdfMeta.lock; }

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

            /* meta.icon */
            let resProtocolBase = `resource://scrapbook/data/${id}/`;
            if (meta.icon.startsWith(resProtocolBase)) {
              meta.icon = meta.icon.slice(resProtocolBase.length);
            } else if (meta.icon.startsWith('moz-icon://')) {
              meta.icon = "";
            }

            if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
            scrapbookData.meta[id] = Object.assign(scrapbookData.meta[id], meta);
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
        }).catch((ex) => {
          console.error(ex);
          this.error(`Error importing 'scrapbook.rdf': ${ex.message}`);
        });
      }).then(() => {
        /* Import tree/meta* */

        let p = Promise.resolve();
        for (let i = 0; ; i++) {
          const path = `tree/meta${i || ""}.js`;
          const file = treeFiles[path];
          if (!file) { break; }

          p = p.then(() => {
            this.log(`Importing '${path}'...`);
            return scrapbook.readFileAsText(file).then((text) => {
              if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
                throw new Error(`Failed to retrieve JSON data.`);
              }

              const data = JSON.parse(RegExp.$1);
              for (const id in data) {
                if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
                scrapbookData.meta[id] = Object.assign(scrapbookData.meta[id], data[id]);
              }
            }).catch((ex) => {
              this.error(`Error importing '${path}': ${ex.message}`);
            });
          });
        }
        return p;
      }).then(() => {
        /* Import tree/toc* */

        let p = Promise.resolve();
        for (let i = 0; ; i++) {
          const path = `tree/toc${i || ""}.js`;
          const file = treeFiles[path];
          if (!file) { break; }

          p = p.then(() => {
            this.log(`Importing '${path}'...`);
            return scrapbook.readFileAsText(file).then((text) => {
              if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
                throw new Error(`Failed to retrieve JSON data.`);
              }

              const data = JSON.parse(RegExp.$1);
              scrapbookData.toc = Object.assign(scrapbookData.toc, data);
            }).catch((ex) => {
              this.error(`Error importing '${path}': ${ex.message}`);
            });
          });
        }
        return p;
      }).then(() => {
        /* Import data/* */

        this.log(`Inspecting data files...`);
        let p = Promise.resolve();
        for (const id of Object.keys(dataDirs).sort()) {
          if (scrapbookData.meta[id]) { continue; }

          const itemFiles = dataDirs[id];
          const index = this.getIndexPath(itemFiles, id);
          if (!index) { continue; }

          this.log(`Generating metadata entry for '${id}' from 'data/${index}'...`);
          const meta = scrapbookData.meta[id] = this.getDefaultMeta();
          let zipDataDir;

          p = p.then(() => {
            if (index.endsWith('/index.html') ||
                index.endsWith('.html') ||
                index.endsWith('.htm') ||
                index.endsWith('.xhtml') ||
                index.endsWith('.xht')) {
              return scrapbook.readFileAsDocument(itemFiles[index]);
            } else if (index.endsWith('.htz')) {
              return new JSZip().loadAsync(itemFiles[index]).then((zip) => {
                zipDataDir = zip;

                return zip.file("index.html").async("arraybuffer").then((ab) => {
                  const blob = new Blob([ab], {type: "text/html"});
                  return scrapbook.readFileAsDocument(blob);
                });
              });
            } else if (index.endsWith('.maff')) {
              // @TODO:
              // support multiple entries in one maff file
              return new JSZip().loadAsync(itemFiles[index], {createFolders: true}).then((zip) => {
                const zipDir = zip.folder(Object.keys(zip.files)[0]);
                zipDataDir = zipDir;

                const zipRdfFile = zipDir.file("index.rdf");
                if (zipRdfFile) {
                  return zipRdfFile.async("arraybuffer").then((ab) => {
                    const blob = new Blob([ab], {type: "application/rdf+xml"});
                    return scrapbook.readFileAsDocument(blob);
                  }).then((doc) => {
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
                    return zipDir.file(rdfMeta.indexfilename).async("arraybuffer").then((ab) => {
                      const blob = new Blob([ab], {type: "text/html"});
                      return scrapbook.readFileAsDocument(blob);
                    });
                  });
                } else {
                  for (const path in zipDir.files) {
                    const subPath = path.slice(zipDir.root.length);
                    if (subPath.startsWith("index.")) {
                      return zipDir.file(subPath).async("arraybuffer").then((ab) => {
                        const blob = new Blob([ab], {type: "text/html"});
                        return scrapbook.readFileAsDocument(blob);
                      });
                    }
                  }
                }
              });
            }
          }).then((doc) => {
            if (!doc) { throw new Error(`Unable to load index file 'data/${index}'`); }

            const html = doc.documentElement;

            /* meta.index */
            meta.index = index;

            /* meta.type */
            meta.type = html.hasAttribute('data-scrapbook-type') ?
                html.getAttribute('data-scrapbook-type') :
                (meta.type || "");

            /* meta.source */
            meta.source = html.hasAttribute('data-scrapbook-source') ?
                html.getAttribute('data-scrapbook-source') : 
                (meta.source || "");

            /* meta.title */
            // fallback to source and then id
            meta.title = doc.title || meta.title || 
                (meta.source ? scrapbook.urlToFilename(meta.source) : "") || 
                (meta.type !== 'separator' ? id : '');

            /* meta.modify */
            // update using last modified time of the index file
            const fileModify = scrapbook.dateToId(new Date(itemFiles[index].lastModified));
            if (fileModify > meta.modify) { meta.modify = fileModify; }

            /* meta.create */
            // fallback to modify time
            meta.create = html.hasAttribute('data-scrapbook-create') ? 
                html.getAttribute('data-scrapbook-create') : 
                (meta.create || meta.modify);

            /* meta.comment */
            meta.comment = html.hasAttribute('data-scrapbook-comment') ? 
                html.getAttribute('data-scrapbook-comment') : 
                (meta.comment || "");

            /* meta.icon */
            return Promise.resolve().then(() => {
              let icon;
              const favIconElem = doc.querySelector('link[rel~="icon"][href]');
              if (favIconElem && favIconElem.hasAttribute('href')) {
                icon = favIconElem.getAttribute('href');

                // special handling if data is in zip
                // return data URL for further caching
                if (zipDataDir) {
                  return zipDataDir.file(icon).async('arraybuffer').then((ab) => {
                    const mime = Mime.prototype.extension(icon);
                    const blob = new Blob([ab], {type: mime});
                    return scrapbook.readFileAsDataURL(blob);
                  }).then((dataUrl) => {
                    this.log(`Retrieved favicon at '${icon}' for packed 'data/${index}' as '${dataUrl}'`);
                    return dataUrl;
                  }).catch((ex) => {
                    console.error(ex);
                    this.error(`Unable to retrieve favicon at '${icon}' for packed 'data/${index}': ${ex.message}`);
                  });
                }

                // special handling of singleHtmlJs generated data URI
                if (/\bdata:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(icon)) {
                  const resType = RegExp.$1;
                  const resId = RegExp.$2;
                  const loader = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
                  if (/\([\n\r]+(.+)[\n\r]+\);$/.test(loader.textContent)) {
                    const data = JSON.parse(RegExp.$1);
                    icon = `data:${resType};base64,${data[resId].d}`;
                  }
                }
              }
              return icon;
            }).then((icon) => {
              meta.icon = icon || meta.icon || "";
              if (meta.icon) {
                meta.icon = this.parseUrl(meta.icon, index, itemFiles).url;
              }
            });
          }).catch((ex) => {
            this.error(`Error inspecting 'data/${index}': ${ex.message}`);
          });
        }
        return p;
      }).then(() => {
        /* Fix meta and toc */

        this.log(`Inspecting metadata...`);
        for (const id in scrapbookData.meta) {
          const meta = scrapbookData.meta[id];
          if (!['folder', 'separator', 'bookmark'].includes(meta.type)) {
            if (!dataDirs[id]) {
              this.error(`Removed metadata entry for '${id}': Missing data files.`);
              delete(scrapbookData.meta[id]);
              continue;
            }

            if (!meta.index || !dataDirs[id][meta.index]) {
              const index = this.getIndexPath(dataDirs[id], id);
              if (index) {
                this.error(`Missing index file '${meta.index || ''}' for '${id}'. Shifted to '${index}'.`);
                meta.index = index;
              } else {
                this.error(`Missing index file '${meta.index || ''}' for '${id}'.`);
              }
            }
          }
        }

        this.log(`Inspecting TOC...`);
        const referredIds = new Set();
        for (const id in scrapbookData.toc) {
          if (!scrapbookData.meta[id] && id !== 'root' && id !== 'hidden') {
            this.error(`Removed TOC entry '${id}': Missing metadata entry.`);
            delete(scrapbookData.toc[id]);
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
            return true;
          });

          if (!scrapbookData.toc[id].length && id !== 'root' && id !== 'hidden') {
            this.error(`Removed empty TOC entry '${id}'.`);
            delete(scrapbookData.toc[id]);
          }
        }

        for (const id in scrapbookData.meta) {
          if (!referredIds.has(id) && id !== 'root' && id !== 'hidden') {
            this.log(`Added '${id}' to root of TOC.`);
            scrapbookData.toc.root.push(id);
          }
        }
      }).then(() => {
        /* Generate cache for favicon */

        this.log(`Inspecting favicons...`);
        const tasks = [];
        const urlAccessMap = new Map();
        for (const id in scrapbookData.meta) {
          tasks[tasks.length] = Promise.resolve().then(() => {
            let {index, icon: favIconUrl} = scrapbookData.meta[id];
            index = index || "";
            if (!favIconUrl || favIconUrl.indexOf(':') === -1) { return favIconUrl; }

            // cache the favicon if its not in relative path
            const headers = {};

            return Promise.resolve().then(() => {
              const prevAccess = urlAccessMap.get(favIconUrl);
              if (prevAccess) {
                // this.log(`Using previuos access for '${favIconUrl}' for '${id}'.`);
                return prevAccess;
              }

              const p = Promise.resolve().then(() => {
                if (favIconUrl.startsWith("data:")) {
                  return scrapbook.dataUriToFile(favIconUrl);
                }

                return scrapbook.xhr({
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
                }).then((xhr) => {
                  // retrieve extension
                  let [, ext] = scrapbook.filenameParts(headers.filename || scrapbook.urlToFilename(xhr.responseURL));
                  const blob = xhr.response;
                  const mime = blob.type;

                  if (!mime.startsWith('image/') && mime !== 'application/octet-stream') {
                    throw new Error(`Invalid image mimetype '${mime}'.`);
                  }

                  // if no extension, generate one according to mime
                  if (!ext) { ext = Mime.prototype.extension(mime); }
                  ext =  ext ? '.' + ext : '';

                  return scrapbook.readFileAsArrayBuffer(blob).then((ab) => {                  
                    const sha = scrapbook.sha1(ab, 'ARRAYBUFFER');
                    return new File([blob], `${sha}${ext}`, {type: blob.type});
                  });
                }, (ex) => {
                  throw new Error(`Unable to fetch URL: ${ex.message}`);
                });
              });
              urlAccessMap.set(favIconUrl, p);
              return p;
            }).then((file) => {
              const path = `tree/favicon/${file.name}`;

              if (!treeFiles[path]) {
                scrapbook.zipAddFile(zip, path, file, false);
                this.log(`Saved favicon '${favIconUrl}' for '${id}' at '${path}'.`);
              } else {
                this.log(`Use saved favicon for '${favIconUrl}' for '${id}' at '${path}'.`);
              }

              const url = `${index.indexOf('/') !== -1 ? '../' : ''}../${path}`;
              return url;
            }).catch((ex) => {
              console.error(ex);
              this.error(`Removed invalid favicon '${favIconUrl}' for '${id}': ${ex.message}`);
            });
          }).then((favIconUrl) => {
            scrapbookData.meta[id].icon = favIconUrl || "";
          }).catch((ex) => {
            console.error(ex);
            this.error(`Error inspecting favicon '${favIconUrl}' for '${id}': ${ex.message}`);
          });
        }
        return Promise.all(tasks);
      }).then(() => {
        /* Check for missing and unused favicons */

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
            }
          }
        }
      }).then(() => {
        /* Generate files */

        this.log(`Checking for created and updated files...`);
        let content;
        let file;

        /* tree/meta#.js */
        content = this.generateMetaFile(scrapbookData.meta);
        file = new Blob([content], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, 'tree/meta.js', file, true);

        // fill an empty file for loaded tree/meta#.js since we don't want to use it
        // 
        // @TODO:
        // generate multiple meta#.js for large size meta
        for (let i = 1; ; i++) {
          const path = `tree/meta${i}.js`;
          let file = treeFiles[path];
          if (!file) { break; }

          file = new Blob([""], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, path, file, true);
        }

        /* tree/toc#.js */
        content = this.generateTocFile(scrapbookData.toc);
        file = new Blob([content], {type: "application/javascript"});
        scrapbook.zipAddFile(zip, 'tree/toc.js', file, true);

        // fill an empty file for loaded tree/toc#.js since we don't want to use it
        // 
        // @TODO:
        // generate multiple toc#.js for large size toc
        for (let i = 1; ; i++) {
          const path = `tree/toc${i}.js`;
          let file = treeFiles[path];
          if (!file) { break; }

          file = new Blob([""], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, path, file, true);
        }

        /* tree/map.html */
        content = this.generateMapFile(scrapbookData);
        file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, 'tree/map.html', file, true);

        /* tree/frame.html */
        content = this.generateFrameFile(scrapbookData);
        file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, 'tree/frame.html', file, true);
      }).then(() => {
        /* Include resource files */

        const resToInclude = {
          'tree/icon/toggle.png': chrome.runtime.getURL("resources/toggle.png"),
          'tree/icon/collapse.png': chrome.runtime.getURL("resources/collapse.png"),
          'tree/icon/expand.png': chrome.runtime.getURL("resources/expand.png"),
          'tree/icon/external.png': chrome.runtime.getURL("resources/external.png"),
          'tree/icon/item.png': chrome.runtime.getURL("resources/item.png"),
          'tree/icon/fclose.png': chrome.runtime.getURL("resources/fclose.png"),
          'tree/icon/fopen.png': chrome.runtime.getURL("resources/fopen.png"),
          'tree/icon/note.png': chrome.runtime.getURL("resources/note.png"),  // ScrapBook X notex
          'tree/icon/postit.png': chrome.runtime.getURL("resources/postit.png"),  // ScrapBook X note
        };

        let p = Promise.resolve();
        for (const path in resToInclude) {
          if (treeFiles[path]) { continue; }
          p = p.then(() => {
            return scrapbook.xhr({
              url: resToInclude[path],
              responseType: 'blob',
            }).then((xhr) => {
              return xhr.response;
            }).then((blob) => {
              scrapbook.zipAddFile(zip, path, blob, false);
            }).catch((ex) => {
              this.error(`Error adding file '${path}' to zip: ${ex.message}`);
            });
          });
        }
        return p;
      }).then(() => {
        /* Check for same files and generate backup files */

        let p = Promise.resolve();
        zip.forEach((path, zipObj) => {
          if (zipObj.dir) { return; }
          if (!path.startsWith('tree/')) { return; }
          if (path.startsWith('tree/cache/')) { return; }

          const bakPath = 'tree.bak/' + path.slice('tree/'.length);
          const oldFile = treeFiles[path];
          if (!oldFile) { return; }

          // @TODO:
          // Maybe binary compare is better than sha compare?
          let shaOld;
          p = p.then(() => {
            return scrapbook.readFileAsArrayBuffer(oldFile);
          }).then((ab) => {
            shaOld = scrapbook.sha1(ab, 'ARRAYBUFFER');
          }).then(() => {
            return zipObj.async('arraybuffer');
          }).then((ab) => {
            const shaNew = scrapbook.sha1(ab, 'ARRAYBUFFER');
            if (shaOld !== shaNew) {
              scrapbook.zipAddFile(zip, bakPath, oldFile, null, {date: oldFile.lastModifiedDate});
            } else {
              zip.remove(path);
            }
          }).catch((ex) => {
            console.error(ex);
            this.error(`Error checking file ${path}: ${ex.message}`);
          });
        });
        return p;
      }).then(() => {
        /* Generate the zip file and download it */

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

        if (this.options["indexer.autoDownload"]) {
          const directory = scrapbook.getOption("capture.scrapbookFolder").replace(/^.*[\\\/]/, "");

          if (scrapbook.validateFilename(scrapbookData.title) === directory) {
            this.log(`Downloading files...`);
            let p = Promise.resolve();
            zip.forEach((inZipPath, zipObj) => {
              if (zipObj.dir) { return; }

              p = p.then(() => {
                return zipObj.async("blob");
              }).then((blob) => {
                return browser.downloads.download({
                  url: URL.createObjectURL(blob),
                  filename: directory + "/" + inZipPath,
                  conflictAction: "overwrite",
                  saveAs: false,
                });
              }).then((downloadId) => {
                this.autoEraseSet.add(downloadId);
              });
            });
            return p;
          }

          this.error(`Picked folder does not match configured Web ScrapBook folder. Download as zip...`);
        }

        this.log(`Generating zip file...`);
        return zip.generateAsync({type: "blob"}).then((blob) => {
          const url = URL.createObjectURL(blob);
          const elem = document.createElement('a');
          elem.href = url;
          elem.download = `${scrapbookData.title}.zip`;
          document.body.appendChild(elem);
          elem.click();
          elem.remove();
        });
      }).then(() => {
        /* We are done! */
        this.log(`Done.`);
        this.log(``);
      });
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    });
  },

  log(msg) {
    logger.appendChild(document.createTextNode(msg + '\n'));
  },

  error(msg) {
    const span = document.createElement('span');
    span.className = 'error';
    span.appendChild(document.createTextNode(msg + '\n'));
    logger.appendChild(span);
  },

  getIndexPath(itemFiles, id) {
    let index;

    index = `${id}/index.html`;
    if (itemFiles[index]) { return index; }

    index = `${id}.html`;
    if (itemFiles[index]) { return index; }

    index = `${id}.htm`;
    if (itemFiles[index]) { return index; }

    index = `${id}.xhtml`;
    if (itemFiles[index]) { return index; }

    index = `${id}.xht`;
    if (itemFiles[index]) { return index; }

    index = `${id}.maff`;
    if (itemFiles[index]) { return index; }

    index = `${id}.htz`;
    if (itemFiles[index]) { return index; }

    index = `${id}.mht`;
    if (itemFiles[index]) { return index; }

    index = `${id}.epub`;
    if (itemFiles[index]) { return index; }

    return null;
  },

  parseUrl(url, index, itemFiles) {
    let base = this.virtualBase + index;
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, base);
    } catch (ex) {
      // url cannot be resolved, return original (invalid)
      return {url: url, exist: 0};
    }

    if (absoluteUrl.href.startsWith(this.virtualBase)) {
      const search = absoluteUrl.search;
      const hash = absoluteUrl.hash;
      absoluteUrl.search = "";
      absoluteUrl.hash = "";

      let subPath = absoluteUrl.href.slice(base.lastIndexOf('/') + 1);
      subPath = subPath.split("/").map(x => scrapbook.decodeURIComponent(x)).join("/");

      // return subpath
      return {url: subPath, exist: !!itemFiles[subPath] ? 1 : 0};
    }

    // url target not in the provided directory, return absolute URL
    return {url: absoluteUrl.href, exist: -1};
  },

  getDefaultMeta() {
    return {
      index: undefined,
      title: undefined,
      type: undefined,
      create: undefined,
      modify: undefined,
      source: undefined,
      icon: undefined,
      comment: undefined,
    };
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
  generateMapFile(scrapbookData) {
    return `<!DOCTYPE html>
<!--
  This file is generated by Web ScrapBook and is not intended to be edited.
  Create map.css and/or map.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="map">
<head>
<base target="main">
<meta charset="UTF-8">
<title>${scrapbookData.title || ""}</title>
<meta name="viewport" content="width=device-width">
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
  border: 1px solid ThreeDShadow;
  padding: .125em .5em;
  background-color: InfoBackground;
}

#header > a {
  color: #666666;
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
    meta: {},
    cache: {}
  },

  toc: function (data) {
    this.data.toc = data;
  },

  meta: function (data) {
    this.data.meta = data;
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
    if (meta.type) { elem.className = 'scrapbook-type-' + meta.type; };
    parent.container.appendChild(elem);

    var div = document.createElement('div');
    div.onclick = scrapbook.onClickItem;
    elem.appendChild(div);

    if (meta.type !== 'separator') {
      var a = document.createElement('a');
      a.appendChild(document.createTextNode(meta.title || id));
      if (meta.type !== 'bookmark') {
        if (meta.index) { a.href = '../data/' + meta.index; }
      } else {
        if (meta.source) {
          a.href = meta.source;
        } else {
          if (meta.index) { a.href = '../data/' + meta.index; }
        }
      }
      if (meta.comment) { a.title = meta.comment; }
      if (meta.type === 'folder') { a.onclick = scrapbook.onClickFolder; }
      div.appendChild(a);

      var icon = document.createElement('img');
      if (meta.icon) {
        icon.src = (meta.icon.indexOf(':') === -1) ? 
            ('../data/' + meta.index).replace(/\\/[^\\/]*$/, '') + '/' + meta.icon : 
            meta.icon;
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
        top.frames["main"].location = anchor.href;
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
  }
};
</script>
<script src="meta.js"></script>
<script src="toc.js"></script>
<script src="map.js"></script>
</head>
<body>
<div id="header">
<a id="toggle-all" title="Expand all" href="#"><img src="icon/toggle.png">${scrapbookData.title || ""}</a>
</div>
<script>scrapbook.init();</script>
</body>
</html>
`;
  },

  generateFrameFile(scrapbookData) {
    return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Frameset//EN" "http://www.w3.org/TR/html4/frameset.dtd">
<!--
  This file is generated by Web ScrapBook and is not intended to be edited.
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
};

chrome.downloads.onChanged.addListener((downloadDelta) => {
  const downloadId = downloadDelta.id;
  if (!indexer.autoEraseSet.has(downloadId)) { return; }

  if ((downloadDelta.state && downloadDelta.state.current === "complete") || 
      downloadDelta.error) {
    return browser.downloads.erase({id: downloadDelta.id});
  }
});

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);
  scrapbook.loadOptionsAuto.then(() => {
    return Promise.resolve().then(() => {
      return browser.runtime.getBrowserInfo();
    }).then((info) => {
      if (info.name === 'Fennec') { indexer.isMobile = true; }
    }).catch((ex) => {
      // not mobile
    });
  }).then(() => {
    // init common elements and events
    indexer.dropmask = document.getElementById('dropmask');
    indexer.dirSelector = document.getElementById('dir-selector');
    indexer.filesSelector = document.getElementById('files-selector');
    indexer.logger = document.getElementById('logger');

    // adjust GUI for mobile
    if (indexer.isMobile) {
      indexer.dirSelector.disabled = true;
      document.getElementById('dir-selector-label').remove();
    }

    // init events
    indexer.initEvents();
  });
});
