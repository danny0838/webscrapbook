/******************************************************************************
 *
 * Script for manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} scrapbookUi
 * @require {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.scrapbookUi,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, scrapbookUi, window, console) {

  'use strict';

  scrapbookUi.mode = "manage";

}));
