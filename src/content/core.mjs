/******************************************************************************
 * Common utilities for content scripts.
 *****************************************************************************/

const core = {};

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
