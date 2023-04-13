/******************************************************************************
 *
 * CustomTree UI controller class.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @require {Class} Tree
 * @public {Class} CustomTree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.CustomTree = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.Tree,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, Tree, window, document, console) {

  'use strict';

  class CustomTree extends Tree {
    rebuild() {
      super.rebuild();

      const rootElem = this.treeElem.appendChild(document.createElement('div'));
      rootElem.setAttribute('data-id', this.rootId);
      rootElem.container = rootElem.appendChild(document.createElement('ul'));
      rootElem.container.classList.add('container');
    }
  }

  return CustomTree;

}));
