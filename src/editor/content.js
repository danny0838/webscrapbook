/******************************************************************************
 *
 * Content script for editor functionality.
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 *****************************************************************************/

((window, document, browser) => {

const editor = {
  element: null,
  internalElement: null,
  inScrapBook: false,
  isScripted: false,
  serverUrl: null,
  history: [],

  /**
   * @return {Object<number~hWidth, number~vWidth>}
   */
  get scrollbar() {
    const elem = document.createElement('div');
    elem.style = `
display: block;
position: absolute;
top: -200vh;
overflow: scroll;
width: 100vw;
height: 100vh;`;
    document.body.appendChild(elem);
    const result = {
      hWidth: elem.offsetWidth - elem.clientWidth,
      vWidth: elem.offsetHeight - elem.clientHeight,
    };
    elem.remove();
    delete editor.scrollbar;
    return editor.scrollbar = result;
  },
};


/******************************************************************************
 * Invokables
 *****************************************************************************/

/**
 * @kind invokable
 */
editor.init = async function ({willOpen, force = false}) {
  let wrapper = editor.element = editor.element || document.querySelector("web-scrapbook");

  if (typeof willOpen === "undefined") {
    willOpen = !(wrapper && wrapper.parentNode);
  }

  if (!willOpen) {
    return editor.close();
  }

  if (wrapper) {
    if (!wrapper.parentNode) {
      document.documentElement.appendChild(wrapper);
    }
    return;
  }

  // do not load the toolbar if the document cannot be load as HTML
  if (document.documentElement.nodeName.toLowerCase() !== "html") {
    return;
  }

  // do not load the toolbar for non-HTML document (unless forced)
  if (!force && !["text/html", "application/xhtml+xml"].includes(document.contentType)) {
    return;
  }

  // do checks
  editor.isScripted = editor.isDocumentScripted(document);

  await scrapbook.loadOptionsAuto;
  editor.serverUrl = scrapbook.getOption("server.url");
  editor.inScrapBook = editor.serverUrl && document.URL.startsWith(editor.serverUrl);

  // generate toolbar content
  const uuid = scrapbook.getUuid();
  editor.element = wrapper = document.documentElement.appendChild(document.createElement("web-scrapbook"));
  wrapper.id = uuid;
  wrapper.setAttribute('dir', scrapbook.lang('@@bidi_dir'));
  wrapper.style = `\
all: initial !important;
position: fixed !important;
display: block !important;
${scrapbook.lang('@@bidi_start_edge')}: 0px !important;
bottom: 0px !important;
width: 100% !important;
height: 32px !important;
z-index: 2147483645 !important;
`;

  // Attach a shadowRoot if supported; otherwise fallback with an ID selector.
  let sRoot;
  if (wrapper.attachShadow) {
    editor.internalElement = wrapper = wrapper.attachShadow({mode: 'open'});
    sRoot = '';
  } else {
    editor.internalElement = wrapper;
    sRoot = `#${CSS.escape(uuid)} `;
  }

  // this needs to be XHTML compatible
  wrapper.innerHTML = `\
<style>
${sRoot}*:not(web-scrapbook-samp) {
  visibility: unset !important;
  opacity: unset !important;
  position: unset !important;
  overflow: unset !important;
  z-index: unset !important;
  outline: unset !important;
  margin: unset !important;
  border: unset !important;
  padding: unset !important;
  width: unset !important;
  height: unset !important;
  max-width: unset !important;
  max-height: unset !important;
  min-width: unset !important;
  min-height: unset !important;
  top: unset !important;
  bottom: unset !important;
  left: unset !important;
  right: unset !important;
  background: unset !important;
  color: unset !important;
  font: unset !important;
  text-align: unset !important;
  vertical-align: unset !important;
}

${sRoot}web-scrapbook-samp {
  all: unset;
}

${sRoot}.toolbar {
  display: block !important;
  position: relative !important;
  box-sizing: border-box !important;
  padding: 1px !important;
  border: 1px solid rgb(204, 204, 204) !important;
  background: rgba(240, 240, 240, 0.9) none repeat scroll 0% 0% !important;
  width: 100% !important;
  height: 100% !important;
  font-family: sans-serif !important;
}

${sRoot}.toolbar > div {
  display: inline-block !important;
}

${sRoot}.toolbar > div > button {
  display: inline-block !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 1px solid transparent !important;
  width: 28px !important;
  height: 28px !important;
  cursor: pointer !important;
  background-size: 16px 16px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

${sRoot}.toolbar > div > button:hover,
${sRoot}.toolbar > div > button:focus {
  border-color: #CCC !important;
  background-color: #DBDBDB !important;
}

${sRoot}.toolbar > div > button:active {
  border-style: inset !important;
}

${sRoot}.toolbar > div > button[disabled] {
  filter: grayscale(100%) !important;
}

${sRoot}.toolbar > div > button[checked] {
  box-shadow: 0px 0px 10px 0px #909090 inset !important;
}

${sRoot}.toolbar > div > button[hidden] {
  display: none !important;
}

${sRoot}.toolbar > div > button:nth-of-type(2) {
  background-image: url("${browser.runtime.getURL("resources/caret-down.svg")}") !important;
  width: 20px !important;
}

${sRoot}.toolbar .toolbar-locate > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-locate.svg")}") !important;
}

${sRoot}.toolbar .toolbar-marker > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-marker.png")}") !important;
}

${sRoot}.toolbar .toolbar-eraser > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-eraser.png")}") !important;
}

${sRoot}.toolbar .toolbar-htmlEditor > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-html.png")}") !important;
}

${sRoot}.toolbar .toolbar-undo > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-undo.png")}") !important;
}

${sRoot}.toolbar .toolbar-save > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-save.png")}") !important;
}

${sRoot}.toolbar > div > ul {
  display: block !important;
  position: absolute !important;
  overflow: auto !important;
  box-sizing: border-box !important;
  list-style: none !important;
  bottom: 32px !important;
  margin: 0 !important;
  border: 1px solid #999 !important;
  border-radius: 2px !important;
  box-shadow: 0 0 4px 1px rgba(0, 0, 0, 0.3) !important;
  padding: 0 !important;
  background: white !important;
  max-height: calc(100vh - 32px - ${editor.scrollbar.vWidth}px - 2px) !important;
}

${sRoot}.toolbar > div > ul[hidden] {
  display: none !important;
}

${sRoot}.toolbar > div > ul > li {
  display: block !important;
}

${sRoot}.toolbar > div > ul > li > button {
  display: block !important;
  padding: 4px 8px !important;
  width: 100% !important;
  font-size: 14px !important;
  color: #333 !important;
  cursor: pointer !important;
}

${sRoot}.toolbar > div > ul > li > button:focus {
  outline: 1px solid rgb(77, 144, 254) !important;
}

${sRoot}.toolbar > div > ul > li > button:hover {
  background-image: radial-gradient(rgba(176, 176, 176, 0.9), rgba(238, 238, 238, 0.9)) !important;
}

${sRoot}.toolbar > div > ul > li > button:active {
  background-image: radial-gradient(rgba(0, 0, 0, 0.9), rgba(64, 64, 64, 0.9)) !important;
  color: #FFFFFF !important;
}

${sRoot}.toolbar > div > ul > li > button[checked] {
  box-shadow: 0px 0px 10px 0px #909090 inset !important;
}

${sRoot}.toolbar > div > ul > hr {
  display: block !important;
  border: 1px inset #EEE !important;
}

${sRoot}.toolbar .toolbar-close {
  display: block !important;
  position: absolute !important;
  top: 0 !important;
  ${scrapbook.lang('@@bidi_end_edge')}: 0 !important;
  margin: 3px !important;
  width: 24px !important;
  height: 24px !important;
  opacity: 0.3 !important;
}

${sRoot}.toolbar .toolbar-close::before,
${sRoot}.toolbar .toolbar-close::after {
  content: "" !important;
  position: absolute !important;
  height: 4px !important;
  width: 100% !important;
  top: 50% !important;
  margin-top: -2px !important;
  background: #000 !important;
}

${sRoot}.toolbar .toolbar-close::before {
  transform: rotate(45deg) !important;
}

${sRoot}.toolbar .toolbar-close::after {
  transform: rotate(-45deg) !important;
}

${sRoot}.toolbar .toolbar-close:hover {
  opacity: 1 !important;
}
</style>
<div class="toolbar">
  <div class="toolbar-locate" title="${scrapbook.lang('EditorButtonLocate')}">
    <button></button>
  </div>
  <div class="toolbar-marker" title="${scrapbook.lang('EditorButtonMarker')}">
    <button></button><button></button>
    <ul hidden="" title="">
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [1])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [2])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [3])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [4])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [5])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [6])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [7])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [8])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [9])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [10])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [11])}</web-scrapbook-samp></button></li>
      <li><button><web-scrapbook-samp>${scrapbook.lang('EditorButtonMarkerItem', [12])}</web-scrapbook-samp></button></li>
    </ul>
  </div>
  <div class="toolbar-eraser" title="${scrapbook.lang('EditorButtonEraser')}">
    <button></button><button></button>
    <ul hidden="" title="">
      <li><button class="toolbar-eraser-eraseSelection">${scrapbook.lang('EditorButtonEraserSelection')}</button></li>
      <li><button class="toolbar-eraser-eraseSelector">${scrapbook.lang('EditorButtonEraserSelector')}</button></li>
      <hr/>
      <li><button class="toolbar-eraser-uneraseSelection">${scrapbook.lang('EditorButtonEraserRevertSelection')}</button></li>
      <li><button class="toolbar-eraser-uneraseAll">${scrapbook.lang('EditorButtonEraserRevertAll')}</button></li>
      <hr/>
      <li><button class="toolbar-eraser-removeEditsSelected">${scrapbook.lang('EditorButtonRemoveEditsSelection')}</button></li>
      <li><button class="toolbar-eraser-removeEditsAll">${scrapbook.lang('EditorButtonRemoveEditsAll')}</button></li>
    </ul>
  </div>
  <div class="toolbar-htmlEditor" title="${scrapbook.lang('EditorButtonHtmlEditor')}">
    <button></button>
  </div>
  <div class="toolbar-undo" title="${scrapbook.lang('EditorButtonUndo')}">
    <button disabled=""></button>
  </div>
  <div class="toolbar-save" title="${scrapbook.lang('EditorButtonSave')}">
    <button></button>
  </div>
  <a class="toolbar-close" href="javascript:" title="${scrapbook.lang('EditorButtonClose')}"></a>
</div>
`;

  // locate
  var elem = wrapper.querySelector('.toolbar-locate > button:first-of-type');
  elem.addEventListener("click", (event) => {
    editor.locate();
  }, {passive: true});
  elem.disabled = elem.hidden = !editor.inScrapBook;

  // marker
  var elem = wrapper.querySelector('.toolbar-marker > button:first-of-type');
  elem.addEventListener("click", (event) => {
    editor.updateLineMarkers();
    const buttons = Array.from(wrapper.querySelectorAll('.toolbar-marker ul button'));
    let idx = scrapbook.getOption('editor.lineMarker.checked');
    idx = Math.min(parseInt(idx, 10) || 0, buttons.length - 1);
    editor.lineMarker(buttons[idx].querySelector('web-scrapbook-samp').style.cssText);
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-marker > button:last-of-type');
  elem.addEventListener("click", (event) => {
    editor.updateLineMarkers();
    editor.showContextMenu(event.currentTarget.parentElement.querySelector('ul'));
  }, {passive: true});

  for (const elem of wrapper.querySelectorAll('.toolbar-marker ul button')) {
    elem.addEventListener("click", (event) => {
      const idx = Array.prototype.indexOf.call(wrapper.querySelectorAll('.toolbar-marker ul button'), event.currentTarget);
      scrapbook.setOption('editor.lineMarker.checked', idx);
      editor.lineMarker(event.currentTarget.querySelector('web-scrapbook-samp').style.cssText);
    }, {passive: true});
  }

  // eraser
  var elem = wrapper.querySelector('.toolbar-eraser > button:first-of-type');
  elem.addEventListener("click", (event) => {
    if (event.ctrlKey) {
      editor.removeEdits(true);
      return;
    }
    editor.eraseNodes();
  }, {passive: true});
  elem.addEventListener("mousedown", (event) => {
    if (event.button !== 1) { return; }
    event.preventDefault();
    editor.removeEdits(true);
  });

  var elem = wrapper.querySelector('.toolbar-eraser > button:last-of-type');
  elem.addEventListener("click", (event) => {
    editor.showContextMenu(event.currentTarget.parentElement.querySelector('ul'));
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-eraseSelection');
  elem.addEventListener("click", (event) => {
    editor.eraseNodes();
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-eraseSelector');
  elem.addEventListener("click", (event) => {
    editor.eraseSelector();
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-uneraseSelection');
  elem.addEventListener("click", (event) => {
    editor.uneraseNodes(true);
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-uneraseAll');
  elem.addEventListener("click", (event) => {
    editor.uneraseNodes(false);
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-removeEditsSelected');
  elem.addEventListener("click", (event) => {
    editor.removeEdits(true);
  }, {passive: true});

  var elem = wrapper.querySelector('.toolbar-eraser-removeEditsAll');
  elem.addEventListener("click", (event) => {
    editor.removeEdits(false);
  }, {passive: true});

  // htmlEditor
  var elem = wrapper.querySelector('.toolbar-htmlEditor > button:first-of-type');
  elem.addEventListener("click", (event) => {
    editor.htmlEditor();
  }, {passive: true});

  // undo
  var elem = wrapper.querySelector('.toolbar-undo > button:first-of-type');
  elem.addEventListener("click", (event) => {
    editor.undo();
  }, {passive: true});

  // save
  var elem = wrapper.querySelector('.toolbar-save > button:first-of-type');
  elem.addEventListener("click", (event) => {
    editor.save();
  }, {passive: true});

  // close
  var elem = wrapper.querySelector('.toolbar-close');
  elem.addEventListener("click", (event) => {
    editor.close();
  }, {passive: true});
};

/**
 * @kind invokable
 */
editor.lineMarkerInternal = function ({style}) {
  editor.addHistory();

  const hElem = document.createElement('span');
  hElem.setAttribute('data-scrapbook-id', Date.now());
  hElem.setAttribute('data-scrapbook-elem', 'linemarker');
  hElem.style = style;

  for (const range of editor.getSelectionRanges()) {
    const selectedNodes = editor.getSelectedNodes({
      range,
      rangeTweaker: (range) => {
        if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset) {
          let newNode = range.startContainer.splitText(range.startOffset);
          range.setStartBefore(newNode);
        }
        if (range.endContainer.nodeType === Node.TEXT_NODE && range.endOffset) {
          let endNode = range.endContainer;
          endNode.splitText(range.endOffset);
          range.setEndAfter(endNode);
        }
      },
      nodeFilter: (node) => {
        return node.nodeType === Node.TEXT_NODE;
      }
    });

    // reverse the order as a range may be altered when changing a node before it
    const firstNode = selectedNodes[0];
    const lastNode = selectedNodes[selectedNodes.length - 1];
    for (const node of selectedNodes.reverse()) {
      if (/[^ \f\n\r\t\v]/.test(node.nodeValue)) {
        const wrapper = hElem.cloneNode(false);
        node.parentNode.replaceChild(wrapper, node);
        wrapper.appendChild(node);

        if (node === firstNode) {
          range.setStartBefore(wrapper);
        }

        if (node === lastNode) {
          range.setEndAfter(wrapper);
        }
      }
    }
  }
};

/**
 * @kind invokable
 */
editor.eraseNodesInternal = function () {
  editor.addHistory();

  // reverse the order as a range may be altered when changing a node before it
  for (const range of editor.getSafeSelectionRanges().reverse()) {
    if (!range.collapsed) {
      const wrapper = document.createElement('scrapbook-erased');
      range.surroundContents(wrapper);
      wrapper.parentNode.replaceChild(document.createComment(`scrapbook-erased=${scrapbook.escapeHtmlComment(wrapper.innerHTML)}`), wrapper);
    }
  }
};

/**
 * @kind invokable
 */
editor.eraseSelectorInternal = function ({selector}) {
  const FORBIDDEN_NODES = 'html, head, body';
  const fn = editor.eraseSelectorInternal = ({selector}) => {
    editor.addHistory();

    const elems = document.querySelectorAll(selector);

    // handle descendant node first as it may be altered when handling ancestor
    for (const elem of Array.from(elems).reverse()) {
      if (elem.matches(FORBIDDEN_NODES)) { continue; }

      elem.parentNode.replaceChild(document.createComment(`scrapbook-erased=${scrapbook.escapeHtmlComment(elem.outerHTML)}`), elem);
    }
  };
  return fn({selector});
};

/**
 * @kind invokable
 */
editor.uneraseNodesInternal = function ({inSelection}) {
  editor.addHistory();

  let selectedNodes = [];
  if (inSelection) {
    // get selected element nodes with tweaks for boundary selection cases
    selectedNodes = editor.getSelectedNodes({
      nodeFilter: (node) => {
        return node.nodeType === Node.COMMENT_NODE;
      }
    });
  } else {
    const nodeIterator = document.createNodeIterator(
      document.documentElement,
      NodeFilter.SHOW_COMMENT,
    );
    let node;
    while (node = nodeIterator.nextNode()) {
      selectedNodes.push(node);
    }
  }

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    editor.removeScrapBookObject(elem);
  }
};

/**
 * @kind invokable
 */
editor.removeEditsInternal = function ({inSelection}) {
  editor.addHistory();

  let selectedNodes = [];
  if (inSelection) {
    // get selected element nodes with tweaks for boundary selection cases
    selectedNodes = editor.getSelectedNodes({
      rangeTweaker: (range) => {
        const startNode = range.startContainer;
        if ([3, 4, 8].includes(startNode.nodeType)) {
          // <span>[foo => start from <span> rather than #text(foo)
          // <span>f[oo => start from <span> rather than #text(foo)
          // <p><span>foo</span>[bar => start from #text(bar)
          // <p><span>foo</span>b[ar => start from #text(bar)
          if (!startNode.previousSibling) {
            range.setStartBefore(startNode.parentNode);
          }
        }
      },
      nodeFilter: (node) => {
        return node.nodeType === Node.ELEMENT_NODE;
      }
    });
  } else {
    const nodeIterator = document.createNodeIterator(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT,
    );
    let node;
    while (node = nodeIterator.nextNode()) {
      selectedNodes.push(node);
    }
  }

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    editor.removeScrapBookObject(elem);
  }
};

/**
 * @kind invokable
 */
editor.toggleHtmlEditor = function ({willEditable}) {
  if (willEditable && document.designMode) {
    editor.addHistory();
  }

  document.designMode = willEditable ? "on" : "off";
};


/******************************************************************************
 * Event handlers / Toolbar controllers
 *****************************************************************************/

editor.locate = async function () {
  const response = await scrapbook.invokeExtensionScript({
    cmd: "background.locateCurrentTab",
  });
  if (response === false) {
    alert(scrapbook.lang("ErrorLocateSidebarNotOpened"));
  } else if (response === null) {
    alert(scrapbook.lang("ErrorLocateNotFound"));
  }
  return response;
};

editor.lineMarker = async function (style) {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.lineMarker",
    args: {style},
  });
};

editor.eraseNodes = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.eraseNodes",
    args: {},
  });
};

editor.eraseSelector = async function () {
  const selector = prompt(scrapbook.lang('EditorButtonEraserSelectorPrompt'));

  if (!selector) {
    return;
  }

  try {
    document.querySelector(selector);
  } catch (ex) {
    alert(scrapbook.lang('ErrorEditorButtonEraserSelectorInvalid', [selector]));
    return;
  }

  return await scrapbook.invokeExtensionScript({
    cmd: "background.eraseSelector",
    args: {selector},
  });
};

editor.uneraseNodes = async function (inSelection) {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.uneraseNodes",
    args: {inSelection},
  });
};

editor.removeEdits = async function (inSelection) {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.removeEdits",
    args: {inSelection},
  });
};

editor.htmlEditor = async function (willEditable) {
  if (!editor.element && editor.element.parentNode) { return; }

  const editElem = editor.internalElement.querySelector('.toolbar-htmlEditor > button');

  if (typeof willEditable === "undefined") {
    willEditable = !editElem.hasAttribute("checked");
  }

  willEditable ? editElem.setAttribute("checked", "") : editElem.removeAttribute("checked");

  return await scrapbook.invokeExtensionScript({
    cmd: "background.toggleHtmlEditor",
    args: {willEditable},
  });
};

/**
 * @TODO: Current implementation cannot undo each edit of frame content
 * (an undo renews the main document and reloads all frames).
 */
editor.undo = async function () {
  if (!editor.history.length) { return; }
  if (!document.body) { return; }

  document.body.parentNode.replaceChild(editor.history.pop(), document.body);

  // update disabled status of the undo button
  if (editor.internalElement && !editor.history.length) {
    const button = editor.internalElement.querySelector('.toolbar-undo > button:first-of-type');
    button.disabled = true;
  }
};

editor.save = async function () {
  if (!editor.element && editor.element.parentNode) { return; }

  if (editor.inScrapBook) {
    // prompt a confirm if this page is scripted
    if (editor.isScripted) {
      if (!confirm(scrapbook.lang("EditConfirmScriptedDocument"))) {
        return;
      }
    }

    return await scrapbook.invokeExtensionScript({
      cmd: "background.saveCurrentTab",
    });
  } else {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.captureCurrentTab",
    });
  }
};

editor.close = async function () {
  if (!editor.element && editor.element.parentNode) { return; }

  await editor.htmlEditor(false);
  editor.element.remove();
};

/**
 * Shows a context menu.
 *
 * @param {HTMLElement} elem - The context menu element.
 */
editor.showContextMenu = function (elem) {
  const onFocusOut = (event) => {
    // skip when focusing another descendant of the context menu element
    if (elem.contains(event.relatedTarget)) {
      return;
    }

    exitContextMenu();
  };

  const onClick = (event) => {
    exitContextMenu();
  };

  const onKeyDown = (event) => {
    // skip if there's a modifier
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.code === "Escape" || event.code === "F10") {
      event.preventDefault();
      exitContextMenu();
    }
  };

  const exitContextMenu = () => {
    elem.hidden = true;
    elem.removeEventListener("focusout", onFocusOut);
    elem.removeEventListener("click", onClick);
    window.removeEventListener("keydown", onKeyDown, true);
  };

  elem.hidden = false;
  elem.addEventListener("focusout", onFocusOut, {passive: true});
  elem.addEventListener("click", onClick, {passive: true});
  window.addEventListener("keydown", onKeyDown, true);

  // Focus on the context menu element for focusout event to work when the user
  // clicks outside.
  const sel = window.getSelection();
  const wasCollapsed = sel.isCollapsed;
  const ranges = editor.getSelectionRanges();

  if (!elem.hasAttribute('tabindex')) {
    elem.setAttribute('tabindex', -1);
  }
  elem.focus();

  if (!wasCollapsed && sel.isCollapsed) {
    // Restore selection after focus if the browser clears it.
    ranges.forEach(r => sel.addRange(r));
  }
};


/******************************************************************************
 * Helpers
 *****************************************************************************/

/**
 * @return {boolean} Whether the document has a working script.
 */
editor.isDocumentScripted = function (doc) {
  for (const fdoc of scrapbook.flattenFrames(doc)) {
    for (const elem of fdoc.querySelectorAll("*")) {
      // check <script> elements
      if (elem.matches('script[src]')) {
        return true;
      }
      if (elem.matches('script:not([src])')) {
        if (!/^(?:\s|\/\*.*\*\/)*$/.test(elem.textContent)) {
          return true;
        }
      }

      // check on* attributes
      for (const attr of elem.attributes) {
        if (attr.name.toLowerCase().startsWith("on")) {
          return true;
        }
      }
    }
  }
  return false;
};

editor.updateLineMarkers = function () {
  Array.prototype.forEach.call(
    editor.internalElement.querySelectorAll('.toolbar-marker ul web-scrapbook-samp'),
    (elem, i) => {
      elem.style = scrapbook.getOption(`editor.lineMarker.style.${i + 1}`);
      elem.title = elem.style.cssText;
    });

  const buttons = Array.from(editor.internalElement.querySelectorAll('.toolbar-marker ul button'));
  buttons.forEach((elem) => {
    elem.removeAttribute('checked');
  });
  let idx = scrapbook.getOption('editor.lineMarker.checked');
  idx = Math.min(parseInt(idx, 10) || 0, buttons.length - 1);
  buttons[idx].setAttribute('checked', '');
};

/**
 * linemarker (span)
 * inline (span)
 * annotation (span) (for downward compatibility with SBX 1.12.0a - 1.12.0a45)
 * link-url (a)
 * link-inner (a)
 * link-file (a)
 * freenote (div)
 * freenote-header
 * freenote-body
 * freenote-footer
 * freenote-save
 * freenote-delete
 * sticky (div) (for downward compatibility with SBX <= 1.12.0a34)
 * sticky-header
 * sticky-footer
 * sticky-save
 * sticky-delete
 * block-comment (div) (for downward compatibility with SB <= 0.17.0)
 *
 * title (*)
 * title-src (*)
 * stylesheet (link, style)
 * stylesheet-temp (link, style)
 * todo (input, textarea)
 * fulltext
 *
 * custom (*) (custom objects to be removed by the eraser)
 * custom-wrapper (*) (custom objects to be unwrapped by the eraser)
 *
 * @return {false|string} Scrapbook object type of the element; or false.
 */
editor.getScrapbookObjectType = function (elem) {
  if (elem.nodeType === 8) {
    const m = elem.nodeValue.match(/^scrapbook-(.*?)(?:-\d+)?=/);
    if (m) {
      return m[1];
    }
    return false;
  }

  if (elem.nodeType !== 1) { return false; }

  let type = elem.getAttribute("data-scrapbook-elem");
  if (type) { return type; }

  // for downward compatibility with legacy ScrapBook (X)
  type = elem.getAttribute("data-sb-obj");
  if (type) { return type; }

  switch (elem.className) {
    case "linemarker-marked-line":
      return "linemarker";
    case "scrapbook-inline":
      return "inline";
    case "scrapbook-sticky":
    case "scrapbook-sticky scrapbook-sticky-relative":
      return "sticky";
    case "scrapbook-sticky-header":
      return "sticky-header";
    case "scrapbook-sticky-footer":
      return "sticky-footer";
    case "scrapbook-block-comment":
      return "block-comment";
  }

  if (elem.id == "scrapbook-sticky-css") {
    return "stylesheet";
  }

  return false;
};

/**
 * @return {integer} Scrapbook object remove type of the element.
 *     -1: not a scrapbook object
 *      0: not removable
 *      1: should remove
 *      2: should unwrap
 *      3: should uncomment
 */
editor.getScrapBookObjectRemoveType = function (elem) {
  let type = editor.getScrapbookObjectType(elem);
  if (!type) { return -1; }
  if (["title", "title-src", "stylesheet", "stylesheet-temp", "todo"].includes(type)) { return 0; }
  if (["linemarker", "inline", "link-url", "link-inner", "link-file", "custom-wrapper"].includes(type)) { return 2; }
  if (["erased"].includes(type)) { return 3; }
  if (elem.nodeType === 8) { return 0; }
  return 1;
};

/**
 * @return {Array<Element>} Related elements having the shared ID; or the
 *     original element.
 */
editor.getScrapBookObjectsById = function (elem) {
  let id = elem.getAttribute("data-scrapbook-id");
  if (id) {
    return elem.ownerDocument.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`);
  }

  // for downward compatibility with legacy ScrapBook (X)
  id = elem.getAttribute("data-sb-id");
  if (id) {
    return elem.ownerDocument.querySelectorAll(`[data-sb-id="${CSS.escape(id)}"]`);
  }

  return [elem];
};

/**
 * Remove a scrapbook object.
 *
 * @return {integer} Scrapbook object remove type of the element.
 */
editor.removeScrapBookObject = function (elem) {
  try {
    // not in the DOM tree, skip
    if (!elem.parentNode) { return -1; }
  } catch(ex) {
    // not an element or a dead object, skip
    return -1;
  }
  let type = editor.getScrapBookObjectRemoveType(elem);
  switch (type) {
    case 1: {
      for (const part of editor.getScrapBookObjectsById(elem)) {
        part.remove();
      }
      break;
    }
    case 2: {
      for (const part of editor.getScrapBookObjectsById(elem)) {
        editor.unwrapNode(part);
      }
      break;
    }
    case 3: {
      const m = elem.nodeValue.match(/^.+?=([\s\S]*)$/);
      if (m) {
        const t = document.createElement('template');
        t.innerHTML = scrapbook.unescapeHtmlComment(m[1]);
        elem.parentNode.replaceChild(document.importNode(t.content, true), elem);
      } else {
        // this shouldn't happen
        return -1;
      }
      break;
    }
  }
  return type;
};

/**
 * Remove the element while keeping all children.
 */
editor.unwrapNode = function (elem) {
  let childs = elem.childNodes;
  let parent = elem.parentNode;
  while (childs.length) { parent.insertBefore(childs[0], elem); }
  elem.remove();
  parent.normalize();
};

/**
 * Get nodes in the selected range(s).
 *
 * @param {Object} params
 * @param {Range} params.range - The Range object to get selected node within.
 * @param {Function} params.rangeTweaker - A function to tweak ranges.
 * @param {Function} params.nodeFilter - A function to filter returned nodes.
 * @return {Array<Element>} Elements in the selected range(s).
 */
editor.getSelectedNodes = function ({range, rangeTweaker, nodeFilter}) {
  const result = [];
  const ranges = range ? [range] : editor.getSelectionRanges();
  for (range of ranges) {
    if (range.collapsed) {
      continue;
    }

    if (typeof rangeTweaker === "function") {
      rangeTweaker(range);
    }

    const nodeIterator = document.createNodeIterator(
      range.commonAncestorContainer,
      -1
    );
    let startNode = range.startContainer;
    if (![3, 4, 8].includes(startNode.nodeType)) {
      // <p>[<span> => start from <span> rather than <p>
      startNode = startNode.childNodes[range.startOffset];
    }
    let endNode = range.endContainer;
    if (![3, 4, 8].includes(endNode.nodeType)) {
      // <p><span>foo</span>]<em>bar => ends at <span> rather than <p>
      // <p>]foo => ends at <p>
      if (range.endOffset > 0) {
        endNode = endNode.childNodes[range.endOffset - 1];
      }
    }
    let node, start = false;
    while (node = nodeIterator.nextNode()) {
      if (!start) {
        if (node === startNode) {
          start = true;
        }
      }
      if (start) {
        if (typeof nodeFilter !== "function" || nodeFilter(node)) {
          result.push(node);
        }
        if (node === endNode) {
          break;
        }
      }
    }
  }
  return result;
};

editor.getSelectionRanges = function () {
  let result = [];
  const sel = window.getSelection();
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      result.push(sel.getRangeAt(i));
    }
  }
  return result;
};

/**
 * See editor.getSafeRanges() for details.
 */
editor.getSafeSelectionRanges = function () {
  let result = [];
  const sel = window.getSelection();
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      result = result.concat(editor.getSafeRanges(range));
    }
  }
  return result;
};

/**
 * Get splitted selection range parts which do not cross an element boundary.
 *
 * Revised from:
 * https://stackoverflow.com/a/12823606/1667884
 */
editor.getSafeRanges = (dangerous) => {
  const ca = dangerous.commonAncestorContainer;

  // Start -- Work inward from the start, selecting the largest safe range
  const s = [], rs = [];
  if (dangerous.startContainer != ca) {
    for (let i = dangerous.startContainer; i != ca; i = i.parentNode) {
      s.push(i)
    }
  }
  if (0 < s.length) {
    for (let i = 0; i < s.length; i++) {
      const xs = document.createRange();
      if (i) {
        xs.setStartAfter(s[i-1]);
        xs.setEndAfter(s[i].lastChild);
      } else {
        xs.setStart(s[i], dangerous.startOffset);
        xs.setEndAfter(s[i].nodeType === Node.TEXT_NODE ? s[i] : s[i].lastChild);
      }
      rs.push(xs);
    }
  }

  // End -- basically the same code reversed
  const e = [], re = [];
  if (dangerous.endContainer != ca) {
    for (let i = dangerous.endContainer; i != ca; i = i.parentNode) {
      e.push(i)
    }
  }
  if (0 < e.length) {
    for (let i = 0; i < e.length; i++) {
      const xe = document.createRange();
      if (i) {
        xe.setStartBefore(e[i].firstChild);
        xe.setEndBefore(e[i-1]);
      } else {
        xe.setStartBefore(e[i].nodeType === Node.TEXT_NODE ? e[i] : e[i].firstChild);
        xe.setEnd(e[i], dangerous.endOffset);
      }
      re.unshift(xe);
    }
  }

  // Middle -- the uncaptured middle
  if ((0 < s.length) && (0 < e.length)) {
    const xm = document.createRange();
    xm.setStartAfter(s[s.length - 1]);
    xm.setEndBefore(e[e.length - 1]);
    rs.push(xm);
  } else {
    return [dangerous];
  }

  return rs.concat(re);
};

editor.addHistory = () => {
  if (!document.body) { return; }

  editor.history.push(document.body.cloneNode(true));

  // update disabled status of the undo button
  if (editor.internalElement && editor.history.length === 1) {
    const button = editor.internalElement.querySelector('.toolbar-undo > button:first-of-type');
    button.disabled = false;
  }
};

window.editor = editor;

})(this, this.document, this.browser);
