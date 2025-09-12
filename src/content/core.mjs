/******************************************************************************
 * Common utilities for content scripts.
 *****************************************************************************/

const core = {
  frameId: null,
};

/**
 * Initialize value for core.frameId.
 *
 * @type invokable
 */
core.init = async function ({frameId}) {
  core.frameId = frameId;
};

/**
 * Return true to confirm that content script is loaded.
 *
 * @type invokable
 */
core.isScriptLoaded = async function (params) {
  return true;
};

export {
  core,
};
