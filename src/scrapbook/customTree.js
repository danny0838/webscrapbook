/******************************************************************************
 *
 * CustomTree UI controller class.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @require {Class} Tree
 * @public {Class} CustomTree
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.CustomTree = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.Tree,
  );
}(this, function (isDebug, scrapbook, server, Tree) {

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
