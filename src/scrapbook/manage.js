/******************************************************************************
 *
 * Script for manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} tree
 * @require {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.tree,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, tree, window, console) {

  'use strict';

  tree.mode = "manage";

}));
