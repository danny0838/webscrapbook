/******************************************************************************
 * CustomTree UI controller class.
 *****************************************************************************/

import {Tree} from "./tree.mjs";

class CustomTree extends Tree {
  rebuild() {
    super.rebuild();

    const rootElem = this.treeElem.appendChild(document.createElement('div'));
    rootElem.setAttribute('data-id', this.rootId);
    rootElem.container = rootElem.appendChild(document.createElement('ul'));
    rootElem.container.classList.add('container');
  }
}

export {
  CustomTree,
};
