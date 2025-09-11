/******************************************************************************
 * SHA related utilities.
 *****************************************************************************/

/* global jsSHA */

import "../lib/sha.js";

// ensure module loaded (may be external when bundled)
if (!globalThis.jsSHA) {
  throw new Error('Failed to load global jsSHA');
}

/**
 * @param {*} data
 * @param {string} type - HEX, TEXT, B64, BYTES, or ARRAYBUFFER
 */
function sha1(data, type) {
  const shaObj = new jsSHA("SHA-1", type);
  shaObj.update(data);
  return shaObj.getHash("HEX");
}

export {
  sha1,
};
