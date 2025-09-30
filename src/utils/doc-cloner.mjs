import {getShadowRoot, getSelectionRanges} from "../utils/common.mjs";

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
    const {contentType: mime} = doc;
    const newDoc = (new DOMParser()).parseFromString(
      '<html></html>',
      DOMPARSER_SUPPORT_TYPES.has(mime) ? mime : 'text/html',
    );
    let child;
    while (child = newDoc.firstChild) {
      newDoc.removeChild(child);
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
  static cloneNode(node, deep = false, {
    newDoc = node.ownerDocument,
    origNodeMap,
    clonedNodeMap,
    includeShadowDom = false,
  } = {}) {
    return this._cloneNode(node, deep, {
      newDoc,
      origNodeMap,
      clonedNodeMap,
      includeShadowDom,
    });
  }

  static _cloneNode(node, deep, options) {
    const {newDoc, origNodeMap, clonedNodeMap, includeShadowDom} = options;

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

  /**
   * @param {Node} node
   * @param {Node} newNode
   * @param {Object} options
   * @param {Document} options.newDoc
   * @param {Map|WeakMap} options.origNodeMap
   * @param {Map|WeakMap} options.clonedNodeMap
   * @param {boolean} options.includeShadowDom
   */
  static cloneShadowDom(node, newNode, options) {
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

class PartialDocumentCloner extends DocumentCloner {
  static clone(doc, {
    selection = doc.getSelection(),
    origNodeMap,
    clonedNodeMap,
    includeShadowDom,
    hookBeforeRange,
    hookAfterRange,
    hookBetweenText,
    hookBetweenComment,
    hookBetweenCdata,
  } = {}) {
    const ranges = getSelectionRanges(selection);
    return this.cloneSelection(doc, {
      ranges,
      origNodeMap,
      clonedNodeMap,
      includeShadowDom,
      hookBeforeRange,
      hookAfterRange,
      hookBetweenText,
      hookBetweenComment,
      hookBetweenCdata,
    });
  }

  /**
   * @param {Document} doc
   * @param {Object} [options]
   * @param {Range[]} options.ranges - Expect tidied Ranges that follows DOM
   *   order and with no overlapping.
   * @param {Map|WeakMap} [options.origNodeMap]
   * @param {Map|WeakMap} options.clonedNodeMap
   * @param {boolean} options.includeShadowDom
   * @param {Function} [options.hookBeforeRange]
   * @param {Function} [options.hookAfterRange]
   * @param {Function} [options.hookBetweenText]
   * @param {Function} [options.hookBetweenComment]
   * @param {Function} [options.hookBetweenCdata]
   * @return {Document} The cloned document.
   */
  static cloneSelection(doc, {
    ranges,
    origNodeMap,
    clonedNodeMap,
    includeShadowDom,
    hookBeforeRange,
    hookAfterRange,
    hookBetweenText,
    hookBetweenComment,
    hookBetweenCdata,
  } = {}) {
    const newDoc = this.cloneDocument(doc, {origNodeMap, clonedNodeMap});
    const options = {newDoc, origNodeMap, clonedNodeMap, includeShadowDom};

    // @FIXME: handle sparsely selected table cells
    let curRange, caNode, scNode, ecNode, lastTextNode;
    for (curRange of ranges) {
      // skip a collapsed range
      if (curRange.collapsed) {
        continue;
      }

      caNode = curRange.commonAncestorContainer;

      // @TODO:
      // A selection in a shadow root requires special care.
      // Currently treat as selecting the topmost host for simplicity and
      // prevent an issue if capturing shadow DOM is disabled.
      handleShadowRoot: {
        let selNode = caNode;
        let selNodeRoot = selNode.getRootNode();
        while (selNodeRoot instanceof ShadowRoot) {
          selNode = selNodeRoot.host;
          selNodeRoot = selNode.getRootNode();
        }
        if (selNode !== caNode) {
          curRange = new Range();
          curRange.selectNode(selNode);
          caNode = curRange.commonAncestorContainer;
        }
      }

      scNode = curRange.startContainer;
      ecNode = curRange.endContainer;

      // Clone nodes from root to common ancestor.
      // (with special handling of text nodes)
      const refNode = (this.isTextNode(caNode)) ? caNode.parentNode : caNode;
      let clonedRefNode = clonedNodeMap.get(refNode);
      if (!clonedRefNode) {
        this.cloneNodeAndAncestors(refNode, options);
        clonedRefNode = clonedNodeMap.get(refNode);
      }

      // Add splitter between multiple ranges of the same text-like node.
      if (scNode === lastTextNode) {
        switch (scNode.nodeType) {
          case Node.TEXT_NODE: {
            hookBetweenText?.(clonedRefNode);
            break;
          }
          case Node.CDATA_SECTION_NODE: {
            hookBetweenCdata?.(clonedRefNode);
            break;
          }
          case Node.COMMENT_NODE: {
            hookBetweenComment?.(clonedRefNode);
            break;
          }
        }
      }

      // Clone sparingly selected nodes in the common ancestor.
      // (with special handling of text nodes)
      hookBeforeRange?.(clonedRefNode);

      const iterator = doc.createNodeIterator(refNode, NodeFilter.SHOW_ALL & ~NodeFilter.SHOW_DOCUMENT);
      let node;
      let nodeRange = doc.createRange();
      while (node = iterator.nextNode()) {
        nodeRange.selectNode(node);

        if (nodeRange.compareBoundaryPoints(Range.START_TO_START, curRange) < 0) {
          // before start
          if (node === scNode && this.isTextNode(node) &&
              nodeRange.compareBoundaryPoints(Range.START_TO_END, curRange) > 0) {
            let start = curRange.startOffset;
            let end = (node === ecNode) ? curRange.endOffset : undefined;
            this.cloneNodeAndAncestors(node.parentNode, options);
            const newParentNode = clonedNodeMap.get(node.parentNode);
            const newNode = node.cloneNode(false);
            newNode.nodeValue = node.nodeValue.slice(start, end);
            newParentNode.appendChild(newNode);
            lastTextNode = node;
          }
          continue;
        }

        if (nodeRange.compareBoundaryPoints(Range.END_TO_END, curRange) > 0) {
          // after end
          if (node === ecNode && this.isTextNode(node) &&
              nodeRange.compareBoundaryPoints(Range.END_TO_START, curRange) < 0) {
            let start = 0;
            let end = curRange.endOffset;
            this.cloneNodeAndAncestors(node.parentNode, options);
            const newParentNode = clonedNodeMap.get(node.parentNode);
            const newNode = node.cloneNode(false);
            newNode.nodeValue = node.nodeValue.slice(start, end);
            newParentNode.appendChild(newNode);
            lastTextNode = node;
          }
          continue;
        }

        // clone the node
        this.cloneNodeAndAncestors(node, options);
      }

      hookAfterRange?.(clonedRefNode);
    }

    return newDoc;
  }

  /**
   * @param {Node} node
   * @param {Object} options
   * @param {Document} options.newDoc
   * @param {Map|WeakMap} options.origNodeMap
   * @param {Map|WeakMap} options.clonedNodeMap
   * @param {boolean} options.includeShadowDom
   */
  static cloneNodeAndAncestors(node, options) {
    const {clonedNodeMap} = options;

    const nodeChain = [];
    let tmpNode = node;

    while (!clonedNodeMap.has(tmpNode)) {
      nodeChain.unshift(tmpNode);
      tmpNode = tmpNode.parentNode;
    }

    for (tmpNode of nodeChain) {
      const newParentNode = clonedNodeMap.get(tmpNode.parentNode);
      const newNode = this.cloneNode(tmpNode, false, options);
      newParentNode.appendChild(newNode);
    }
  }

  static isTextNode(node) {
    return [3, 4, 8].includes(node.nodeType);
  }
}

export {
  DOMPARSER_SUPPORT_TYPES,
  DocumentCloner,
  PartialDocumentCloner,
};
