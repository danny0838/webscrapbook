/******************************************************************************
 *
 * Background script for capturer functionality.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    console,
  );
}(this, async function (isDebug, browser, scrapbook, console) {

  'use strict';

  // clear capturer caches
  {
    const items = await scrapbook.cache.getAll({table: "captureMissionCache"});
    await scrapbook.cache.remove(Object.keys(items));
  }

  {
    const items = await scrapbook.cache.getAll({table: "batchCaptureMissionCache"});
    await scrapbook.cache.remove(Object.keys(items));
  }

}));
