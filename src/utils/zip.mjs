/******************************************************************************
 * ZIP related utilities.
 *****************************************************************************/

/* global JSZip */

import * as scrapbook from "./common.mjs";
import "../lib/jszip.js";

// ensure module loaded (may be external when bundled)
if (!globalThis.JSZip) {
  throw new Error('Failed to load global JSZip');
}

const COMPRESSIBLE_TYPES = new Set([
  'application/xml',

  // historical non-text/* javascript types
  // ref: https://mimesniff.spec.whatwg.org/
  'application/javascript',
  'application/ecmascript',
  'application/x-ecmascript',
  'application/x-javascript',

  'application/json',
]);

const COMPRESSIBLE_SUFFIXES = new Set([
  '+xml',
  '+json',
]);

function isCompressible(mimetype) {
  if (!mimetype) {
    return false;
  }

  if (mimetype.startsWith('text/')) {
    return true;
  }

  if (COMPRESSIBLE_TYPES.has(mimetype)) {
    return true;
  }

  for (const suffix of COMPRESSIBLE_SUFFIXES) {
    if (mimetype.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

const _generateAsyncHandlerZip = {
  get(target, prop, receiver) {
    if (prop === "files") {
      return new Proxy(Reflect.get(target, prop, receiver), _generateAsyncHandlerZipFiles);
    }
    return Reflect.get(target, prop, receiver);
  },
};

const _generateAsyncHandlerZipFiles = {
  get(target, prop, receiver) {
    return new Proxy(Reflect.get(target, prop, receiver), _generateAsyncHandlerZipObject);
  },
};

const _generateAsyncHandlerZipObject = {
  get(target, prop, receiver) {
    if (prop === "date") {
      const d = Reflect.get(target, prop, receiver);
      return new Date(d.valueOf() - d.getTimezoneOffset() * 60 * 1000);
    }
    return Reflect.get(target, prop, receiver);
  },
};

class Zip extends JSZip {
  file(...args) {
    if (args.length < 2) {
      return super.file(...args);
    }

    const [filename, data, options] = args;

    // Auto-determine compression method if not defined
    // when data is a Blob (with type available).
    if (typeof options?.compression === 'undefined' && data instanceof Blob) {
      const newOptions = {...options};
      if (isCompressible(data.type)) {
        newOptions.compression = "DEFLATE";
        if (typeof newOptions.compressionOptions?.level === 'undefined') {
          newOptions.compressionOptions = {...newOptions.compressionOptions, level: 9};
        }
      } else {
        newOptions.compression = "STORE";
      }
      return super.file(filename, data, newOptions);
    }

    return super.file(...args);
  }

  async generateAsync({fixModifiedTime = true, ...options} = {}, onUpdate) {
    // The timestamp field of zip usually use local time, while JSZip writes
    // UTC time for compatibility purpose since it does not support extended
    // UTC fields. For example, a file modified at 08:00 (UTC+8) is stored with
    // timestamp 00:00. We fix this by ourselves.
    // https://github.com/Stuk/jszip/issues/369
    let proxy = this;
    if (fixModifiedTime) {
      proxy = new Proxy(proxy, _generateAsyncHandlerZip);
    }
    return await super.generateAsync.call(proxy, options, onUpdate);
  }

  async loadAsync(data, {fixModifiedTime = true, ...options} = {}) {
    const rv = await super.loadAsync(data, options);
    // JSZip assumes timestamp of every file be UTC time and returns adjusted
    // local time. For example, retrieving date for an entry with timestamp
    // 00:00 gets 08:00 if the timezone is UTC+8. We fix this by ourselves.
    // https://github.com/Stuk/jszip/issues/369
    if (rv && fixModifiedTime) {
      for (const subpath in rv.files) {
        const d = rv.files[subpath].date;
        d.setTime(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
      }
    }
    return rv;
  }

  static async loadAsync(...args) {
    return new this().loadAsync(...args);
  }
}

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
            doc = await scrapbook.readFileAsDocument(file);
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
  COMPRESSIBLE_TYPES,
  COMPRESSIBLE_SUFFIXES,
  RDF as NS_RDF,
  MAF as NS_MAF,
  isCompressible,
  Zip,
  Maff,
};
