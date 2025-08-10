/******************************************************************************
 * Script for manage.html.
 *
 * @requires scrapbook
 * @requires sidebar
 * @modifies sidebar
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
