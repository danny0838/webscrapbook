import {getShadowRoot} from "../utils/common.mjs";

const DOMPARSER_SUPPORT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml']);

class DocumentCloner {
  /**
   * Clone a document with all nodes and generate relation mapping.
   */
  static clone(doc, {origNodeMap, clonedNodeMap, includeShadowDom} = {}) {
    const newDoc = this.cloneDocument(doc, {origNodeMap, clonedNodeMap});
    for (const node of doc.childNodes) {
      const newNode = this.cloneNode(node, true, {
        newDoc, origNodeMap, clonedNodeMap, includeShadowDom,
      });
      newDoc.appendChild(newNode);
    }
    return newDoc;
  }

  /**
   * Clone a document and generate relation mapping.
   *
   * @param {Document} doc
   * @param {Object} [options]
   * @param {Map|WeakMap} [options.origNodeMap]
   * @param {Map|WeakMap} [options.clonedNodeMap]
   * @return {Document} The cloned document.
   */
  static cloneDocument(doc, {origNodeMap, clonedNodeMap} = {}) {
    const {contentType: mime, documentElement: docElemNode} = doc;
    const newDoc = (new DOMParser()).parseFromString(
      '<' + docElemNode.nodeName.toLowerCase() + '/>',
      DOMPARSER_SUPPORT_TYPES.has(mime) ? mime : 'text/html',
    );
    while (newDoc.firstChild) {
      newDoc.removeChild(newDoc.firstChild);
    }
    origNodeMap?.set(newDoc, doc);
    clonedNodeMap?.set(doc, newDoc);
    return newDoc;
  }

  /**
   * Clone a node and generate relation mapping.
   *
   * @param {Node} node
   * @param {boolean} [deep]
   * @param {Object} [options]
   * @param {Document} [options.newDoc]
   * @param {Map|WeakMap} [options.origNodeMap]
   * @param {Map|WeakMap} [options.clonedNodeMap]
   * @param {boolean} [options.includeShadowDom]
   * @return {Node} The cloned node.
   */
  static cloneNode(node, deep = false, options = {}) {
    const {
      newDoc = node.ownerDocument,
      origNodeMap,
      clonedNodeMap,
      includeShadowDom,
    } = options;

    const newNode = newDoc.importNode(node, deep);

    if (deep) {
      const walker1 = node.ownerDocument.createNodeIterator(node);
      const walker2 = newDoc.createNodeIterator(newNode);
      let node1 = walker1.nextNode();
      let node2 = walker2.nextNode();
      while (node1) {
        origNodeMap?.set(node2, node1);
        clonedNodeMap?.set(node1, node2);
        includeShadowDom && this.cloneShadowDom(node1, node2, options);
        node1 = walker1.nextNode();
        node2 = walker2.nextNode();
      }
    } else {
      origNodeMap?.set(newNode, node);
      clonedNodeMap?.set(node, newNode);
      includeShadowDom && this.cloneShadowDom(node, newNode, options);
    }

    return newNode;
  }

  static cloneShadowDom(node, newNode, options = {}) {
    const shadowRoot = getShadowRoot(node);
    if (!shadowRoot) { return; }
    const {origNodeMap, clonedNodeMap, includeShadowDom} = options;
    let newShadowRoot = getShadowRoot(newNode);
    if (newShadowRoot) {
      // shadowRoot already cloned (when shadowRoot.clonable = true)
      // map the shadowRoot and descendant nodes
      const walker1 = shadowRoot.ownerDocument.createNodeIterator(shadowRoot);
      const walker2 = newShadowRoot.ownerDocument.createNodeIterator(newShadowRoot);
      let node1 = walker1.nextNode();
      let node2 = walker2.nextNode();
      while (node1) {
        origNodeMap?.set(node2, node1);
        clonedNodeMap?.set(node1, node2);
        includeShadowDom && this.cloneShadowDom(node1, node2, options);
        node1 = walker1.nextNode();
        node2 = walker2.nextNode();
      }
    } else {
      newShadowRoot = newNode.attachShadow({
        mode: shadowRoot.mode,
        clonable: shadowRoot.clonable,
        delegatesFocus: shadowRoot.delegatesFocus,
        serializable: shadowRoot.serializable,
        slotAssignment: shadowRoot.slotAssignment,
      });
      origNodeMap?.set(newShadowRoot, shadowRoot);
      clonedNodeMap?.set(shadowRoot, newShadowRoot);
      for (const node of shadowRoot.childNodes) {
        newShadowRoot.appendChild(this.cloneNode(node, true, options));
      }
    }
  }
}

export {
  DOMPARSER_SUPPORT_TYPES,
  DocumentCloner,
};
