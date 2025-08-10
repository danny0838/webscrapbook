/******************************************************************************
 * MIME related utilities.
 *****************************************************************************/

/* global Mime */

import "../lib/mime.js";

// ensure module loaded (may be external when bundled)
if (!globalThis.Mime) {
  throw new Error('Failed to load global Mime');
}

const {
  db,
  types,
  extend,
  lookup,
  extension,
  allExtensions,
} = Mime;

export {
  db,
  types,
  extend,
  lookup,
  extension,
  allExtensions,
};
