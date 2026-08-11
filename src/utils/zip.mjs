/******************************************************************************
 * ZIP related utilities.
 *****************************************************************************/

import {readFileAsDocument} from "./common.mjs";
import * as Mime from "../lib/mime.mjs";

import "../lib/web-streams-polyfill-prefix.js";
import "../lib/web-streams-polyfill.js";
import "../lib/web-streams-polyfill-postfix.js";

// Never import zip.js to otherwhere directly to prevent missing polyfill.
import * as zjs from "../lib/zip.js";
import {
  configure, ZipReader, ZipWriter,
  BlobReader, Uint8ArrayReader, TextReader,
  BlobWriter, Uint8ArrayWriter, Data64URIWriter,
} from "../lib/zip.js";

/******************************************************************************
 * The JSZip style ZIP file handlers.
 * https://stuk.github.io/jszip/
 *****************************************************************************/

class ZipObject {}

class ZipObjectReader extends ZipObject {
  constructor({name, data, options, entry}) {
    super();
    Object.assign(this, {
      name: entry.filename,
      date: entry.lastModDate,
      comment: entry.comment,
      _entry: entry,
    });
  }

  async "async"(type) {
    switch (type) {
      case 'blob': {
        return await this._entry.getData(new BlobWriter(Mime.lookup(this.name)));
      }
      case 'base64': {
        const datauri = await this._entry.getData(new Data64URIWriter(Mime.lookup(this.name)));
        return datauri.replace(/^data:[^,]+;base64,/, '');
      }
      default: {
        throw new Error(`Unknown type: ${type}`);
      }
    }
  }
}

class ZipObjectWriter extends ZipObject {
  constructor({name, data, options}) {
    super();
    const {date, comment, compression, compressionOptions} = options ?? {};
    Object.assign(this, {
      name,
      date,
      comment,
      options: {compression, compressionOptions},
      _data: data,
    });
  }
}

class Zip {
  constructor() {
    this.files = {};
  }

  file(...args) {
    if (args.length < 2) {
      const [name] = args;
      return this.files[name];
    }

    const [name, data, {createFolders = false, ...options} = {}] = args;
    if (createFolders) {
      let missing = [];
      let parent = this._getParentFolder(name);
      while (parent) {
        if (!this.files[parent]) {
          missing.push(parent);
        }
        parent = this._getParentFolder(parent);
      }
      while (missing.length) {
        const parent = missing.pop();
        this.files[parent] = new ZipObjectWriter({name: parent});
      }
    }
    this.files[name] = new ZipObjectWriter({name, data, options});
    return this;
  }

  async generateAsync({
    type,
    mimeType = 'application/zip',
    compression: _compreession = 'STORE',
    compressionOptions: _compressionOptions = null,
  } = {}) {
    const writer = new ZipWriter(this._getWriter(type, mimeType));
    await Promise.all(Object.entries(this.files).map(([name, entry]) => {
      const {
        date,
        comment,
        options: {
          compression = _compreession,
          compressionOptions = _compressionOptions,
        },
        _data,
      } = entry;
      const options = {
        lastModDate: date,
        comment,
        compressionMethod: {STORE: 0, DEFLATE: 8}[compression?.toUpperCase()],
        level: compressionOptions?.level ?? undefined,
      };
      return writer.add(name, this._getReader(_data), options);
    }));
    return await writer.close();
  }

  async loadAsync(data) {
    const reader = new ZipReader(this._getReader(data));
    this.comment = reader.comment;
    const entries = await reader.getEntries();
    for (const entry of entries) {
      this.files[entry.filename] = new ZipObjectReader({entry});
    }
    return this;
  }

  _getParentFolder(path) {
    if (path.slice(-1) === "/") {
        path = path.substring(0, path.length - 1);
    }
    const lastSlash = path.lastIndexOf("/");
    return (lastSlash >= 0) ? path.substring(0, lastSlash + 1) : "";
  }

  _getReader(data) {
    if (data == null) {
      return undefined;
    } else if (data instanceof Blob) {
      return new BlobReader(data);
    } else if (data instanceof Uint8Array) {
      return new Uint8ArrayReader(data);
    } else if (typeof data === 'string') {
      return new TextReader(data);
    } else {
      throw new Error(`Unknown data type: ${data}`);
    }
  }

  _getWriter(type, mimeType) {
    switch (type) {
      case 'blob': {
        return new BlobWriter(mimeType);
      }
      case 'uint8array': {
        return new Uint8ArrayWriter();
      }
      default: {
        throw new Error(`Unknown type: ${type}`);
      }
    }
  }

  static async loadAsync(...args) {
    return new this().loadAsync(...args);
  }
}


/******************************************************************************
 * Helpers
 *****************************************************************************/

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MAF = "http://maf.mozdev.org/metadata/rdf#";

class Maff {
  static parseIndexRdf(doc) {
    const result = {};
    let elem;

    elem = doc.getElementsByTagNameNS(MAF, "originalurl")[0];
    if (elem) { result.originalurl = elem.getAttributeNS(RDF, "resource"); }

    elem = doc.getElementsByTagNameNS(MAF, "title")[0];
    if (elem) { result.title = elem.getAttributeNS(RDF, "resource"); }

    elem = doc.getElementsByTagNameNS(MAF, "archivetime")[0];
    if (elem) { result.archivetime = elem.getAttributeNS(RDF, "resource"); }

    elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
    if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

    elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
    if (elem) { result.charset = elem.getAttributeNS(RDF, "resource"); }

    return result;
  }

  static async getIndexFiles(zipObj) {
    // get the list of top-folders
    const topdirs = new Set();
    for (const inZipPath in zipObj.files) {
      const depth = inZipPath.split("/").length - 1;
      if (depth === 1) {
        const dirname = inZipPath.replace(/\/.*$/, "");
        topdirs.add(dirname + '/');
      }
    }

    // get index files in each topdir
    const indexFiles = [];
    for (const topdir of topdirs) {
      try {
        const zipDir = zipObj.folder(topdir);
        const zipRdfFile = zipDir.file('index.rdf');
        if (zipRdfFile) {
          let doc;
          try {
            const ab = await zipRdfFile.async('arraybuffer');
            const file = new File([ab], 'index.rdf', {type: "application/rdf+xml"});
            doc = await readFileAsDocument(file);
          } catch (ex) {
            throw new Error(`Unable to load 'index.rdf'.`);
          }

          const meta = this.parseIndexRdf(doc);

          if (!meta.indexfilename) {
            throw new Error(`'index.rdf' specifies no index file.`);
          }

          if (!/^index[.][^./]+$/.test(meta.indexfilename)) {
            throw new Error(`'index.rdf' specified index file '${meta.indexfilename}' is invalid.`);
          }

          const zipIndexFile = zipDir.file(meta.indexfilename);
          if (!zipIndexFile) {
            throw new Error(`'index.rdf' specified index file '${meta.indexfilename}' not found.`);
          }

          indexFiles.push(zipIndexFile.name);
        } else {
          const files = zipDir.file(/^index[.][^./]+$/);
          if (files.length) {
            indexFiles.push(files[0].name);
          } else {
            throw new Error(`'index.*' file not found.`);
          }
        }
      } catch (ex) {
        throw new Error(`Unable to get index file in directory: '${topdir}': ${ex.message}`);
      }
    }
    return indexFiles;
  }
}

export {
  zjs,
  RDF as NS_RDF,
  MAF as NS_MAF,
  Zip,
  Maff,
};
