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
    const tableSet = new Set(["captureMissionCache", "batchCaptureMissionCache"]);
    const items = await scrapbook.cache.getAll((obj) => {
      return tableSet.has(obj.table);
    });
    await scrapbook.cache.remove(Object.keys(items));
  }

}));
