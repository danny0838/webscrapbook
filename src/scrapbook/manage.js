/******************************************************************************
 *
 * Script for manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} sidebar
 * @override {string} sidebar.mode
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.sidebar,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, sidebar, window, console) {

  'use strict';

  sidebar.mode = "manage";

}));
