/******************************************************************************
 * MIME related utilities.
 *****************************************************************************/

/* global Mime */

import "../lib/mime.js";

// ensure module loaded (may be external when bundled)
if (!globalThis.Mime) {
  throw new Error('Failed to load global Mime');
}

const {db} = Mime;

/**
 * Reverse map from extension to mimetype
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

  // handle extensions
  const method = important ? Array.prototype.unshift : Array.prototype.push;
  method.apply(target.extensions, extensions);

  if (!minor) {
    for (const ext of extensions) {
      types[ext] = mime;
    }
  }

  Object.assign(target, {...kwargs});
}

/**
 * Lookup a mime type based on extension
 */
function lookup(path, fallback) {
  const ext = path.replace(/.*[./\\]/, '').toLowerCase();
  return types[ext] || fallback || "application/octet-stream";
}

/**
 * Return the first file extension associated with a mime type
 */
function extension(mimeType) {
  const type = mimeType.match(/^\s*([^;\s]*)(?:;|\s|$)/)[1].toLowerCase();
  if (db[type] && db[type].extensions) {
    return db[type].extensions[0];
  }
  return null;
}

/**
 * Return the file extensions associated with a mime type
 */
function allExtensions(mimeType) {
  const type = mimeType.match(/^\s*([^;\s]*)(?:;|\s|$)/)[1].toLowerCase();
  if (db[type] && db[type].extensions) {
    return db[type].extensions.slice(0);
  }
  return [];
}

export {
  db,
  types,
  extend,
  lookup,
  extension,
  allExtensions,
};
