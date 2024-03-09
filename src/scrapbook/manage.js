/******************************************************************************
 *
 * Script for manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} sidebar
 * @override {string} sidebar.mode
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
    global.sidebar,
  );
}(this, function (isDebug, scrapbook, sidebar) {

  'use strict';

  sidebar.mode = "manage";

}));
