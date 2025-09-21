/******************************************************************************
 * Common utilities for content scripts.
 *****************************************************************************/

let frameId = null;

/**
 * Initialize value for frameId.
 *
 * @type invokable
 */
async function init({frameId: newFrameId}) {
  frameId = newFrameId;
}

/**
 * Return true to confirm that content script is loaded.
 *
 * @type invokable
 */
async function isScriptLoaded() {
  return true;
}

export {
  frameId,
  init,
  isScriptLoaded,
};
