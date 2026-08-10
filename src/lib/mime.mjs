/******************************************************************************
 * MIME related utilities.
 *****************************************************************************/

/* global Mime */

import "../lib/mime.js";

// ensure module loaded (may be external when bundled)
if (!globalThis.Mime) {
  throw new Error('Failed to load global Mime');
}

const {db} = globalThis.Mime;
delete globalThis.Mime;

const LOOKUP_REPLACE_REGEX = /.*[./\\]/;
const EXTENSION_MATCH_REGEX = /^\s*([^;\s]*)(?:;|\s|$)/;

// see also: https://github.com/jshttp/mime-db/blob/master/src/custom-suffix.json
const COMPRESSIBLE_SUFFIXES = new Set([
  '+csv',
  '+json',
  '+json-seq',
  '+xml',
  '+yaml',
]);

/**
 * Reverse map from extension to MIME type
 */
const types = (() => {
  const table = {};
  for (const mime in db) {
    const exts = db[mime].extensions;
    if (exts) {
      for (const ext of exts) {
        table[ext] = mime;
      }
    }
  }
  return table;
})();

/**
 * Extended MIME types
 */
extend("application/html+zip", {extensions: ["htz"]}, {important: true});
extend("application/x-maff", {extensions: ["maff"]}, {important: true});

// RFC 3534 defined .ogg, which may be expected by some implementations.
extend("application/ogg", {extensions: ["ogg"]}, {minor: true});

// patch for outdated mime-db data and legacy types
extend("application/octet-stream", {compressible: undefined}, {minor: true});
extend("application/yaml", {compressible: true}, {minor: true});
extend("application/x-ecmascript", {compressible: true}, {minor: true});
extend("application/font-sfnt", {compressible: true}, {minor: true});
extend("application/x-font-ttf", {compressible: true}, {minor: true});

/**
 * Extend the database.
 * @param {string} mime - the MIME type to extend
 * @param {Object} [data] - the data for the MIME type
 * @param {string[]} [data.extensions] - extensions to add
 * @param {Object} [options]
 * @param {boolean} [options.important] - insert the extensions at first
 * @param {boolean} [options.minor] - don't add the extension to types
 */
function extend(mime, {extensions = [], ...kwargs} = {}, {important, minor} = {}) {
  let target = db[mime];
  if (!target) {
    target = db[mime] = {};
  }
  if (!target.extensions) {
    target.extensions = [];
  }

  // update extensions
  const newExtensions = new Set((function* () {
    if (important) {
      yield* extensions;
      yield* target.extensions;
    } else {
      yield* target.extensions;
      yield* extensions;
    }
  })());
  target.extensions.length = 0;
  target.extensions.push(...newExtensions);

  // update types
  if (!minor) {
    for (const ext of extensions) {
      types[ext] = mime;
    }
  }

  Object.assign(target, kwargs);
}

/**
 * Lookup a MIME type based on extension
 */
function lookup(path, fallback) {
  const ext = path.replace(LOOKUP_REPLACE_REGEX, '').toLowerCase();
  return types[ext] || fallback || "application/octet-stream";
}

/**
 * Return the first file extension associated with a MIME type
 */
function extension(mime) {
  const type = mime.match(EXTENSION_MATCH_REGEX)[1].toLowerCase();
  if (db[type] && db[type].extensions) {
    return db[type].extensions[0];
  }
  return null;
}

/**
 * Return the file extensions associated with a MIME type
 */
function allExtensions(mime) {
  const type = mime.match(EXTENSION_MATCH_REGEX)[1].toLowerCase();
  if (db[type] && db[type].extensions) {
    return db[type].extensions.slice(0);
  }
  return [];
}

function isCompressible(mime) {
  if (!mime) {
    return false;
  }

  const value = db[mime]?.compressible;
  if (value != null) {
    return value;
  }

  if (mime.startsWith('text/')) {
    return true;
  }

  for (const suffix of COMPRESSIBLE_SUFFIXES) {
    if (mime.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

export {
  db,
  types,
  extend,
  lookup,
  extension,
  allExtensions,
  isCompressible,
};
