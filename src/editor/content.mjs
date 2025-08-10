/******************************************************************************
 * Content script for editor functionality.
 *
 * @external isDebug
 * @requires scrapbook
 * @requires Strftime
 * @requires core
 * @module editor
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  if (global.hasOwnProperty('editor')) { return; }
  global.editor = factory(
    global.isDebug,
    global.scrapbook,
    global.Strftime,
    global.core,
  );
}(this, function (isDebug, scrapbook, Strftime, core) {

'use strict';

// https://mimesniff.spec.whatwg.org/
const SCRIPT_TYPES = new Set([
  "",
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

const ALLOWED_SCRAPBOOK_SCRIPTS = new Set([
  "basic-loader",
  "annotation-loader",
  "shadowroot-loader", // WebScrapBook < 0.69
  "canvas-loader", // WebScrapBook < 0.69
  "infobar-loader",
  "custom-elements-loader",
  "custom-script-safe",
]);

const LINEMARKABLE_ELEMENTS = `img, picture, canvas, input[type="image"]`;

const NON_ERASABLE_ELEMENTS = [
  'html', 'head', 'body',
  'scrapbook-toolbar', 'scrapbook-toolbar *',
  '[data-scrapbook-elem="annotation-css"]',
  '[data-scrapbook-elem="custom-css"]',
  '[data-scrapbook-elem="custom-script"]',
  ...[...ALLOWED_SCRAPBOOK_SCRIPTS].map(x => `[data-scrapbook-elem="${x}"]`),
].join(',');

const editor = {
  element: null,
  internalElement: null,
  inScrapBook: false,
  isScripted: false,
  serverUrl: null,
  erasedContents: new WeakMap(),
  lastWindowFocusTime: -1,
  lastWindowBlurTime: -1,
  directToolbarClick: false,

  get active() {
    return document.documentElement.hasAttribute('data-scrapbook-toolbar-active');
  },

  /**
   * @return {Object<integer~hWidth, integer~vWidth>}
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


/****************************************************************************
 * Invokables
 ***************************************************************************/

/**
 * @type invokable
 */
editor.init = async function ({willActive = !editor.active, force = false} = {}) {
  if (!willActive) {
    return editor.close();
  }

  if (editor.element) {
    return editor.open();
  }

  // do not load the toolbar if the document cannot be load as HTML
  if (document.documentElement.nodeName.toLowerCase() !== "html") {
    return;
  }

  // do not load the toolbar for non-HTML document (unless forced)
  if (!force && !/html?|xht(?:ml)?/i.test(document.location.pathname)) {
    return;
  }

  // do checks
  editor.isScripted = editor.isDocumentScripted(document);

  await scrapbook.loadOptionsAuto;
  editor.serverUrl = scrapbook.getOption("server.url");
  editor.inScrapBook = editor.serverUrl
      && document.URL.startsWith(editor.serverUrl)
      && !document.location.search;

  // more accurately check whether the current document is really under dataDir of a book
  if (editor.inScrapBook) {
    try {
      const bookId = await scrapbook.invokeExtensionScript({
        cmd: "background.findBookIdFromUrl",
        args: {url: document.URL},
      });

      if (typeof bookId !== 'string') {
        editor.inScrapBook = false;
      }
    } catch (ex) {
      console.error(ex);
      editor.inScrapBook = false;
    }
  }

  // if not in scrapbook, don't load unless forced
  if (!editor.inScrapBook && !force) {
    return;
  }

  // generate toolbar content
  const host = editor.element = document.documentElement.appendChild(document.createElement("scrapbook-toolbar"));
  host.setAttribute('data-scrapbook-elem', 'toolbar');

  // Attach a shadowRoot.
  const shadow = host.attachShadow({mode: 'closed'});

  // this needs to be XHTML compatible
  shadow.innerHTML = (`\
<style>
:host {
  all: initial !important;
  position: absolute !important;
}

#toolbar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 2147483647;
  display: block;
  box-sizing: border-box;
  height: 40px;
  border: 0 solid rgb(204, 204, 204);
  border-width: 1px 0 0 0;
  padding: 1px;
  background: rgba(240, 240, 240, 0.9);
  font-family: sans-serif;
  white-space: nowrap;
}

#toolbar.top {
  inset: 0 0 auto 0;
  border-width: 0 0 1px 0;
}

#toolbar > div {
  display: inline-block;
}

#toolbar > div[hidden] {
  display: none;
}

#toolbar > div > button {
  all: unset;
  user-select: none;
  display: inline-block;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  background: center / 24px no-repeat transparent;
}

#toolbar > div > button:enabled {
  cursor: pointer;
}

#toolbar > div > button:enabled:hover,
#toolbar > div > button:enabled:focus {
  border-color: #CCC;
  background-color: #FFF;
}

#toolbar > div > button:enabled:active {
  border-style: inset;
}

#toolbar > div > button:disabled {
  filter: grayscale(100%);
  opacity: 0.3;
}

#toolbar > div > button[checked] {
  box-shadow: 0px 0px 10px 0px #909090 inset;
}

#toolbar > div > button[hidden] {
  display: none;
}

#toolbar #toolbar-locate > button {
  background-image: url("${browser.runtime.getURL("resources/edit-locate.svg")}");
}

#toolbar #toolbar-marker > button {
  background-image: url("${browser.runtime.getURL("resources/edit-marker.png")}");
}

#toolbar #toolbar-annotation > button {
  background-image: url("${browser.runtime.getURL("resources/edit-annotation.png")}");
}

#toolbar #toolbar-eraser > button {
  background-image: url("${browser.runtime.getURL("resources/edit-eraser.png")}");
}

#toolbar #toolbar-domEraser > button {
  background-image: url("${browser.runtime.getURL("resources/edit-dom-eraser.png")}");
}

#toolbar #toolbar-htmlEditor > button {
  background-image: url("${browser.runtime.getURL("resources/edit-html.png")}");
}

#toolbar #toolbar-undo > button {
  background-image: url("${browser.runtime.getURL("resources/edit-undo.png")}");
}

#toolbar #toolbar-save > button {
  background-image: url("${browser.runtime.getURL("resources/edit-save.png")}");
}

#toolbar #toolbar-close {
  position: absolute;
  ${scrapbook.lang('@@bidi_end_edge')}: 0;
}

#toolbar #toolbar-close > button {
  background-image: url("${browser.runtime.getURL("resources/edit-exit.svg")}");
  opacity: 0.3;
}

#toolbar #toolbar-close > button:enabled:hover,
#toolbar #toolbar-close > button:enabled:focus {
  opacity: 1;
}

#toolbar > div > ul {
  all: unset;
  position: absolute;
  overflow: auto;
  box-sizing: border-box;
  list-style: none;
  bottom: 40px;
  border: 1px solid #999;
  border-radius: 2px;
  box-shadow: 0 0 4px 1px rgba(0, 0, 0, 0.3);
  padding: 1px;
  background: white;
  max-height: calc(100vh - 40px - ${editor.scrollbar.vWidth}px - 2px);
}

#toolbar.top > div > ul {
  top: 40px;
  bottom: auto;
}

#toolbar > div > ul[hidden] {
  display: none;
}

#toolbar > div > ul > li {
  all: unset;
  display: block;
}

#toolbar > div > ul > li > button {
  all: unset;
  user-select: none;
  display: block;
  box-sizing: border-box;
  padding: 4px 8px;
  width: 100%;
  font-size: 14px;
  color: #333;
}

#toolbar > div > ul > li > button:enabled:focus {
  outline: 1px solid rgba(125, 162, 206, 0.8);
  background: linear-gradient(rgba(235, 244, 253, 0.3), rgba(196, 221, 252, 0.8));
}

#toolbar > div > ul > li > button:enabled:hover {
  background-color: rgba(202, 202, 202, 0.8);
}

#toolbar > div > ul > li > button:enabled:active {
  background-image: radial-gradient(rgba(0, 0, 0, 0.9), rgba(64, 64, 64, 0.9));
  color: #FFFFFF;
}

#toolbar > div > ul > li > button:disabled {
  filter: grayscale(100%);
  opacity: 0.3;
}

#toolbar > div > ul > li > button[checked] {
  box-shadow: 0px 0px 10px 0px #909090 inset;
}

#toolbar > div > ul > hr {
  all: unset;
  display: block;
  border: 1px inset #EEE;
}
</style>
<div id="toolbar" dir="${scrapbook.lang('@@bidi_dir')}">
  <div id="toolbar-locate" title="${scrapbook.lang('EditorButtonLocate')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-locate-viewSitemap">${scrapbook.lang('EditorButtonLocateViewSitemap')}</button></li>
      <li><button id="toolbar-locate-viewDirectory">${scrapbook.lang('EditorButtonLocateViewDirectory')}</button></li>
      <li><button id="toolbar-locate-viewSource">${scrapbook.lang('EditorButtonLocateViewSource')}</button></li>
    </ul>
  </div>
  <div id="toolbar-marker" title="${scrapbook.lang('EditorButtonMarker')}">
    <button></button>
    <ul hidden="" title="">
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [1])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [2])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [3])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [4])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [5])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [6])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [7])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [8])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [9])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [10])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [11])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp data-scrapbook-elem="toolbar-samp">${scrapbook.lang('EditorButtonMarkerItem', [12])}</scrapbook-toolbar-samp></button></li>
    </ul>
  </div>
  <div id="toolbar-annotation" title="${scrapbook.lang('EditorButtonAnnotation')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-annotation-view">${scrapbook.lang('EditorButtonAnnotationView')}</button></li>
      <li><button id="toolbar-annotation-prev">${scrapbook.lang('EditorButtonAnnotationPrev')}</button></li>
      <li><button id="toolbar-annotation-next">${scrapbook.lang('EditorButtonAnnotationNext')}</button></li>
      <hr/>
      <li><button id="toolbar-annotation-link">${scrapbook.lang('EditorButtonAnnotationLink')}</button></li>
      <li><button id="toolbar-annotation-sticky">${scrapbook.lang('EditorButtonAnnotationSticky')}</button></li>
      <li><button id="toolbar-annotation-sticky-richtext">${scrapbook.lang('EditorButtonAnnotationStickyRichText')}</button></li>
    </ul>
  </div>
  <div id="toolbar-eraser" title="${scrapbook.lang('EditorButtonEraser')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-eraser-eraseSelection">${scrapbook.lang('EditorButtonEraserSelection')}</button></li>
      <li><button id="toolbar-eraser-eraseSelector">${scrapbook.lang('EditorButtonEraserSelector')}...</button></li>
      <li><button id="toolbar-eraser-eraseSelectorAll">${scrapbook.lang('EditorButtonEraserSelectorAll')}...</button></li>
      <li><button id="toolbar-eraser-eraseXpath">${scrapbook.lang('EditorButtonEraserXpath')}...</button></li>
      <li><button id="toolbar-eraser-eraseXpathAll">${scrapbook.lang('EditorButtonEraserXpathAll')}...</button></li>
      <hr/>
      <li><button id="toolbar-eraser-uneraseSelection">${scrapbook.lang('EditorButtonEraserRevertSelection')}</button></li>
      <li><button id="toolbar-eraser-uneraseAll">${scrapbook.lang('EditorButtonEraserRevertAll')}</button></li>
      <hr/>
      <li><button id="toolbar-eraser-removeEditsSelected">${scrapbook.lang('EditorButtonRemoveEditsSelection')}</button></li>
      <li><button id="toolbar-eraser-removeEditsAll">${scrapbook.lang('EditorButtonRemoveEditsAll')}</button></li>
    </ul>
  </div>
  <div id="toolbar-domEraser" title="${scrapbook.lang('EditorButtonDOMEraser')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-domEraser-expand">${scrapbook.lang('EditorButtonDOMEraserExpand', ['W'])}</button></li>
      <li><button id="toolbar-domEraser-shrink">${scrapbook.lang('EditorButtonDOMEraserShrink', ['N'])}</button></li>
      <li><button id="toolbar-domEraser-erase">${scrapbook.lang('EditorButtonDOMEraserErase', ['R'])}</button></li>
      <li><button id="toolbar-domEraser-isolate">${scrapbook.lang('EditorButtonDOMEraserIsolate', ['I'])}</button></li>
    </ul>
  </div>
  <div id="toolbar-htmlEditor" title="${scrapbook.lang('EditorButtonHtmlEditor')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-htmlEditor-strong">${scrapbook.lang('EditorButtonHtmlEditorStrong')}</button></li>
      <li><button id="toolbar-htmlEditor-em">${scrapbook.lang('EditorButtonHtmlEditorEm')}</button></li>
      <li><button id="toolbar-htmlEditor-underline">${scrapbook.lang('EditorButtonHtmlEditorUnderline')}</button></li>
      <li><button id="toolbar-htmlEditor-strike">${scrapbook.lang('EditorButtonHtmlEditorStrike')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-superscript">${scrapbook.lang('EditorButtonHtmlEditorSuperscript')}</button></li>
      <li><button id="toolbar-htmlEditor-subscript">${scrapbook.lang('EditorButtonHtmlEditorSubscript')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-color">${scrapbook.lang('EditorButtonHtmlEditorColor')}...</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-formatBlockP">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockP')}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH1">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [1])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH2">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [2])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH3">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [3])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH4">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [4])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH5">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [5])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockH6">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [6])}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockDiv">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockDiv')}</button></li>
      <li><button id="toolbar-htmlEditor-formatBlockPre">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockPre')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-listUnordered">${scrapbook.lang('EditorButtonHtmlEditorListUnordered')}</button></li>
      <li><button id="toolbar-htmlEditor-listOrdered">${scrapbook.lang('EditorButtonHtmlEditorListOrdered')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-outdent">${scrapbook.lang('EditorButtonHtmlEditorOutdent')}</button></li>
      <li><button id="toolbar-htmlEditor-indent">${scrapbook.lang('EditorButtonHtmlEditorIndent')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-justifyLeft">${scrapbook.lang('EditorButtonHtmlEditorJustifyLeft')}</button></li>
      <li><button id="toolbar-htmlEditor-justifyCenter">${scrapbook.lang('EditorButtonHtmlEditorJustifyCenter')}</button></li>
      <li><button id="toolbar-htmlEditor-justifyRight">${scrapbook.lang('EditorButtonHtmlEditorJustifyRight')}</button></li>
      <li><button id="toolbar-htmlEditor-justifyFull">${scrapbook.lang('EditorButtonHtmlEditorJustifyFull')}</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-createLink">${scrapbook.lang('EditorButtonHtmlEditorCreateLink')}...</button></li>
      <li><button id="toolbar-htmlEditor-hr">${scrapbook.lang('EditorButtonHtmlEditorHr')}</button></li>
      <li><button id="toolbar-htmlEditor-todo">${scrapbook.lang('EditorButtonHtmlEditorTodo')}</button></li>
      <li><button id="toolbar-htmlEditor-insertDate">${scrapbook.lang('EditorButtonHtmlEditorInsertDate')}</button></li>
      <li><button id="toolbar-htmlEditor-insertHtml">${scrapbook.lang('EditorButtonHtmlEditorInsertHtml')}...</button></li>
      <hr/>
      <li><button id="toolbar-htmlEditor-removeFormat">${scrapbook.lang('EditorButtonHtmlEditorRemoveFormat')}</button></li>
      <li><button id="toolbar-htmlEditor-unlink">${scrapbook.lang('EditorButtonHtmlEditorUnlink')}</button></li>
    </ul>
  </div>
  <div id="toolbar-undo" title="${scrapbook.lang('EditorButtonUndo')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-undo-toggle" checked="">${scrapbook.lang('EditorButtonUndoToggle')}</button></li>
    </ul>
  </div>
  <div id="toolbar-save" title="${scrapbook.lang('EditorButtonSave')}">
    <button></button>
    <ul hidden="" title="">
      <li><button id="toolbar-save-deleteErased">${scrapbook.lang('EditorButtonSaveDeleteErased')}</button></li>
      <li><button id="toolbar-save-internalize">${scrapbook.lang('EditorButtonSaveInternalize')}</button></li>
      <li><button id="toolbar-save-createSubPage">${scrapbook.lang('EditorButtonSaveCreateSubPage')}...</button></li>
      <hr/>
      <li><button id="toolbar-save-editTitle">${scrapbook.lang('EditorButtonSaveEditTitle')}...</button></li>
      <li><button id="toolbar-save-setViewport">${scrapbook.lang('EditorButtonSaveSetViewport')}...</button></li>
      <hr/>
      <li><button id="toolbar-save-pinTop">${scrapbook.lang('EditorButtonSavePinTop')}</button></li>
    </ul>
  </div>
  <div id="toolbar-close" title="${scrapbook.lang('EditorButtonClose')}">
    <button></button>
  </div>
</div>
`);
  const wrapper = editor.internalElement = shadow.getElementById('toolbar');

  // locate
  var elem = wrapper.querySelector('#toolbar-locate > button');
  elem.addEventListener("click", (event) => {
    editor.locate();
  }, {passive: true});
  elem.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    const elem = event.currentTarget;
    editor.showContextMenu(elem.nextElementSibling, event);
  });
  elem.disabled = elem.hidden = !editor.inScrapBook;

  var elem = wrapper.querySelector('#toolbar-locate-viewSitemap');
  elem.addEventListener("click", (event) => {
    const u = new URL(browser.runtime.getURL("scrapbook/sitemap.html"));
    u.searchParams.append('url', document.location.href);
    document.location.assign(u.href);
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-locate-viewDirectory');
  elem.addEventListener("click", (event) => {
    document.location.assign('.');
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-locate-viewSource');
  elem.addEventListener("click", (event) => {
    const url = document.documentElement.getAttribute('data-scrapbook-source');
    try {
      if (!url) {
        throw new Error('Source URL record not found.');
      }

      // The browser may block this if url is file: protocol etc.
      // However, some browsers (such as Chromium) do not throw an error.
      document.location.assign(url);
    } catch (ex) {
      alert(ex.message);
    }
  }, {passive: true});

  // marker
  var elem = wrapper.querySelector('#toolbar-marker > button');
  elem.addEventListener("click", async (event) => {
    await editor.updateLineMarkers();
    const marker = wrapper.querySelector('#toolbar-marker ul button[checked] scrapbook-toolbar-samp');
    editor.lineMarker(marker.getAttribute('style'));
  }, {passive: true});
  elem.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    const elem = event.currentTarget;
    await editor.updateLineMarkers();
    editor.showContextMenu(elem.nextElementSibling, event);
  });

  for (const elem of wrapper.querySelectorAll('#toolbar-marker ul button')) {
    elem.addEventListener("click", (event) => {
      const elem = event.currentTarget;
      const idx = Array.prototype.indexOf.call(wrapper.querySelectorAll('#toolbar-marker ul button'), elem);
      scrapbook.cache.set(editor.getStatusKey('lineMarkerSelected'), idx, 'storage'); // async
      editor.lineMarker(elem.querySelector('scrapbook-toolbar-samp').getAttribute('style'));
    }, {passive: true});
  }

  // annotation
  var elem = wrapper.querySelector('#toolbar-annotation > button');
  elem.addEventListener("click", (event) => {
    editor.createSticky();
  }, {passive: true});
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editor.showContextMenu(event.currentTarget.nextElementSibling, event);
  });

  var elem = wrapper.querySelector('#toolbar-annotation-view');
  elem.addEventListener("click", (event) => {
    editor.viewAnnotations();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-annotation-prev');
  elem.addEventListener("click", (event) => {
    editor.locateAnnotation(-1);
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-annotation-next');
  elem.addEventListener("click", (event) => {
    editor.locateAnnotation(1);
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-annotation-link');
  elem.addEventListener("click", (event) => {
    editor.createLink();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-annotation-sticky');
  elem.addEventListener("click", (event) => {
    editor.createSticky();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-annotation-sticky-richtext');
  elem.addEventListener("click", (event) => {
    editor.createSticky(true);
  }, {passive: true});

  // eraser
  var elem = wrapper.querySelector('#toolbar-eraser > button');
  elem.addEventListener("click", (event) => {
    if (event.ctrlKey) {
      editor.removeEdits(true);
      return;
    }
    editor.eraseNodes();
  }, {passive: true});
  elem.addEventListener("mousedown", (event) => {
    // middle click
    if (event.button !== 1) { return; }
    event.preventDefault();
    editor.removeEdits(true);
  });
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editor.showContextMenu(event.currentTarget.nextElementSibling, event);
  });

  var elem = wrapper.querySelector('#toolbar-eraser-eraseSelection');
  elem.addEventListener("click", (event) => {
    editor.eraseNodes();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-eraseSelector');
  elem.addEventListener("click", (event) => {
    editor.eraseSelector();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-eraseSelectorAll');
  elem.addEventListener("click", (event) => {
    editor.eraseSelector(true);
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-eraseXpath');
  elem.addEventListener("click", (event) => {
    editor.eraseXpath();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-eraseXpathAll');
  elem.addEventListener("click", (event) => {
    editor.eraseXpath(true);
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-uneraseSelection');
  elem.addEventListener("click", (event) => {
    editor.uneraseNodes();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-uneraseAll');
  elem.addEventListener("click", (event) => {
    editor.uneraseAllNodes();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-removeEditsSelected');
  elem.addEventListener("click", (event) => {
    editor.removeEdits();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-eraser-removeEditsAll');
  elem.addEventListener("click", (event) => {
    editor.removeAllEdits();
  }, {passive: true});

  // DOMEraser
  var elem = wrapper.querySelector('#toolbar-domEraser > button');
  elem.addEventListener("click", (event) => {
    editor.toggleDomEraser();
  }, {passive: true});
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const elem = event.currentTarget;
    const menuElem = elem.nextElementSibling;
    for (const el of menuElem.querySelectorAll('button')) {
      el.disabled = !elem.hasAttribute('checked');
    }
    editor.showContextMenu(menuElem, event);
  });

  var elem = wrapper.querySelector('#toolbar-domEraser-expand');
  elem.addEventListener("click", domEraser.expandTarget.bind(domEraser), {passive: true});

  var elem = wrapper.querySelector('#toolbar-domEraser-shrink');
  elem.addEventListener("click", domEraser.shrinkTarget.bind(domEraser), {passive: true});

  var elem = wrapper.querySelector('#toolbar-domEraser-erase');
  elem.addEventListener("click", domEraser.eraseTarget.bind(domEraser), {passive: true});

  var elem = wrapper.querySelector('#toolbar-domEraser-isolate');
  elem.addEventListener("click", domEraser.isolateTarget.bind(domEraser), {passive: true});

  // htmlEditor
  var elem = wrapper.querySelector('#toolbar-htmlEditor > button');
  elem.addEventListener("click", (event) => {
    editor.toggleHtmlEditor();
  }, {passive: true});
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const elem = event.currentTarget;
    const menuElem = elem.nextElementSibling;
    for (const el of menuElem.querySelectorAll('button')) {
      el.disabled = !elem.hasAttribute('checked');
    }
    editor.updateHtmlEditorMenu();
    editor.showContextMenu(menuElem, event);
  });

  var elem = wrapper.querySelector('#toolbar-htmlEditor-strong');
  elem.addEventListener("click", htmlEditor.strong, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-em');
  elem.addEventListener("click", htmlEditor.em, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-underline');
  elem.addEventListener("click", htmlEditor.underline, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-strike');
  elem.addEventListener("click", htmlEditor.strike, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-superscript');
  elem.addEventListener("click", htmlEditor.superscript, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-subscript');
  elem.addEventListener("click", htmlEditor.subscript, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-color');
  elem.addEventListener("click", htmlEditor.color, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockP');
  elem.addEventListener("click", htmlEditor.formatBlockP, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH1');
  elem.addEventListener("click", htmlEditor.formatBlockH1, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH2');
  elem.addEventListener("click", htmlEditor.formatBlockH2, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH3');
  elem.addEventListener("click", htmlEditor.formatBlockH3, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH4');
  elem.addEventListener("click", htmlEditor.formatBlockH4, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH5');
  elem.addEventListener("click", htmlEditor.formatBlockH5, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockH6');
  elem.addEventListener("click", htmlEditor.formatBlockH6, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockDiv');
  elem.addEventListener("click", htmlEditor.formatBlockDiv, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-formatBlockPre');
  elem.addEventListener("click", htmlEditor.formatBlockPre, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-listUnordered');
  elem.addEventListener("click", htmlEditor.listUnordered, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-listOrdered');
  elem.addEventListener("click", htmlEditor.listOrdered, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-outdent');
  elem.addEventListener("click", htmlEditor.outdent, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-indent');
  elem.addEventListener("click", htmlEditor.indent, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-justifyLeft');
  elem.addEventListener("click", htmlEditor.justifyLeft, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-justifyCenter');
  elem.addEventListener("click", htmlEditor.justifyCenter, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-justifyRight');
  elem.addEventListener("click", htmlEditor.justifyRight, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-justifyFull');
  elem.addEventListener("click", htmlEditor.justifyFull, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-createLink');
  elem.addEventListener("click", htmlEditor.createLink, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-hr');
  elem.addEventListener("click", htmlEditor.hr, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-todo');
  elem.addEventListener("click", htmlEditor.todo, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-insertDate');
  elem.addEventListener("click", htmlEditor.insertDate, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-insertHtml');
  elem.addEventListener("click", htmlEditor.insertHtml, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-removeFormat');
  elem.addEventListener("click", htmlEditor.removeFormat, {passive: true});

  var elem = wrapper.querySelector('#toolbar-htmlEditor-unlink');
  elem.addEventListener("click", htmlEditor.unlink, {passive: true});

  // undo
  var elem = wrapper.querySelector('#toolbar-undo > button');
  elem.addEventListener("click", (event) => {
    editor.undo();
  }, {passive: true});
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editor.showContextMenu(event.currentTarget.nextElementSibling, event);
  });

  var elem = wrapper.querySelector('#toolbar-undo-toggle');
  elem.addEventListener("click", (event) => {
    editor.toggleMutationHandler();
  }, {passive: true});

  // save
  var elem = wrapper.querySelector('#toolbar-save > button');
  elem.addEventListener("click", (event) => {
    editor.save();
  }, {passive: true});
  elem.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editor.showContextMenu(event.currentTarget.nextElementSibling, event);
  });

  var elem = wrapper.querySelector('#toolbar-save-deleteErased');
  elem.addEventListener("click", (event) => {
    editor.deleteErased();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-save-internalize');
  elem.addEventListener("click", (event) => {
    editor.save({internalize: true});
  }, {passive: true});
  elem.disabled = !editor.inScrapBook;

  var elem = wrapper.querySelector('#toolbar-save-createSubPage');
  elem.addEventListener("click", (event) => {
    editor.createSubPage();
  }, {passive: true});
  elem.disabled = !editor.inScrapBook;

  var elem = wrapper.querySelector('#toolbar-save-editTitle');
  elem.addEventListener("click", (event) => {
    editor.editTitle();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-save-setViewport');
  elem.addEventListener("click", (event) => {
    editor.setViewport();
  }, {passive: true});

  var elem = wrapper.querySelector('#toolbar-save-pinTop');
  elem.addEventListener("click", (event) => {
    editor.pinTop();
  }, {passive: true});

  // close
  var elem = wrapper.querySelector('#toolbar-close > button');
  elem.addEventListener("click", (event) => {
    event.preventDefault();
    editor.close();
  });

  return editor.open();
};

/**
 * @type invokable
 */
editor.initFrame = async function ({
  active = true,
  annotatorActive = true,
  domEraserActive = false,
  htmlEditorActive = false,
  mutationHandlerActive = true,
}) {
  if (active) {
    document.documentElement.setAttribute('data-scrapbook-toolbar-active', '');
  } else {
    document.documentElement.removeAttribute('data-scrapbook-toolbar-active');
  }
  editor.annotator.toggle({willActive: annotatorActive});
  editor.domEraser.toggle({willActive: domEraserActive});
  editor.htmlEditor.toggle({willActive: htmlEditorActive});
  editor.mutationHandler.toggle({willActive: mutationHandlerActive});
};

/**
 * @type invokable
 */
editor.getStatus = function () {
  return {
    active: this.active,
    annotatorActive: editor.annotator.active,
    domEraserActive: editor.domEraser.active,
    htmlEditorActive: editor.htmlEditor.active,
    mutationHandlerActive: editor.mutationHandler.active,
  };
};

/**
 * @type invokable
 */
editor.openInternal = function () {
  document.documentElement.setAttribute('data-scrapbook-toolbar-active', '');
};

/**
 * @type invokable
 */
editor.closeInternal = function () {
  document.documentElement.removeAttribute('data-scrapbook-toolbar-active');
};

/**
 * @type invokable
 */
editor.getFocusedFrameIdInternal = function () {
  return {frameId: core.frameId, time: editor.lastWindowBlurTime};
};

/**
 * @type invokable
 */
editor.lineMarkerInternal = function ({tagName = 'span', attrs = {}} = {}) {
  editor.addHistory();

  const hElem = document.createElement(tagName);
  for (const [name, value] of Object.entries(attrs)) {
    hElem.setAttribute(name, value);
  }

  for (const range of scrapbook.getSelectionRanges()) {
    // tweak the range
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      let startNode = range.startContainer;
      if (range.startOffset) {
        startNode = range.startContainer.splitText(range.startOffset);
      }
      range.setStartBefore(startNode);
    }
    if (range.endContainer.nodeType === Node.TEXT_NODE) {
      let endNode = range.endContainer;
      if (range.endOffset) {
        endNode.splitText(range.endOffset);
        range.setEndAfter(endNode);
      }
    }

    const selectedNodes = scrapbook.getSelectedNodes({
      query: [range],
      whatToShow: NodeFilter.SHOW_ELEMENT + NodeFilter.SHOW_TEXT,

      // Allow text nodes and LINEMARKABLE_ELEMENTS.
      // Skip elements in a shadow root.
      nodeFilter: node => (node.nodeType === 3 || node.matches(LINEMARKABLE_ELEMENTS)) && !(node.getRootNode() instanceof ShadowRoot),
    });

    // reverse the order as a range may be altered when changing a node before it
    let firstWrapper = null;
    let lastWrapper = null;
    for (const node of selectedNodes.reverse()) {
      if (node.nodeType === 3 && !scrapbook.trim(node.nodeValue)) {
        continue;
      }

      const wrapper = hElem.cloneNode(false);
      node.parentNode.insertBefore(wrapper, node);
      wrapper.appendChild(node);

      if (!lastWrapper) {
        lastWrapper = wrapper;
      }

      firstWrapper = wrapper;
    }

    // mark first and last valid node
    if (firstWrapper) {
      firstWrapper.classList.add('first');
      range.setStartBefore(firstWrapper);
    }
    if (lastWrapper) {
      lastWrapper.classList.add('last');
      range.setEndAfter(lastWrapper);
    }
  }
};

function getAnnotationElems({
  root = document,
  includeHidden = false,
} = {}) {
  const rv = [];
  const checkedIds = new Set();
  const doc = root.ownerDocument || root;
  const nodeIterator = doc.createNodeIterator(
    root,
    NodeFilter.SHOW_ELEMENT,
  );
  let elem;
  while (elem = nodeIterator.nextNode()) {
    if (!(scrapbook.getScrapBookObjectRemoveType(elem) > 0)) {
      continue;
    }

    // check the first element among those with the same ID
    const id = elem.getAttribute('data-scrapbook-id');
    if (id !== null) {
      if (checkedIds.has(id)) {
        continue;
      }
      checkedIds.add(id);
      elem = root.querySelector(`[data-scrapbook-id="${CSS.escape(id)}"]`);
    }

    if (!(includeHidden ? elem.isConnected : elem.offsetParent)) {
      continue;
    }

    rv.push(elem);
  }
  return rv;
}

function getAnnotationRange(elem) {
  const range = document.createRange();
  range.selectNode(elem);

  const id = elem.getAttribute('data-scrapbook-id');
  if (id !== null) {
    const otherRange = document.createRange();
    for (const elem of document.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`)) {
      if (!(scrapbook.getScrapBookObjectRemoveType(elem) > 0)) {
        continue;
      }

      otherRange.selectNode(elem);
      if (otherRange.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
        range.setEndAfter(elem);
      }
    }
  }

  return range;
}

function getCurrentAnnotationIndex(annotationElems, refSelection = null) {
  if (!refSelection) {
    return -0.5;
  }

  const currentRange = getCurrentAnnotationIndexValidRange(refSelection);
  if (!currentRange) {
    return -0.5;
  }

  const range = document.createRange();
  for (let i = 0, I = annotationElems.length; i < I; i++) {
    const elem = annotationElems[i];
    range.selectNode(elem);
    const delta = range.compareBoundaryPoints(Range.START_TO_START, currentRange);
    if (delta === 0) {
      return i;
    }
    if (delta > 0) {
      return i - 0.5;
    }
  }

  return annotationElems.length - 0.5;
}

function getCurrentAnnotationIndexValidRange(sel) {
  for (let i = 0, I = sel.rangeCount; i < I; i++) {
    let range = sel.getRangeAt(i);
    let ca = range.commonAncestorContainer;

    // Firefox may include selection ranges for elements inside the toolbar.
    // Exclude them to prevent an error.
    if (editor.internalElement?.contains(ca)) {
      continue;
    }

    // if range is inside a shadow root, treat as selecting the topmost shadow host.
    let node = ca, host;
    while (host = node.getRootNode().host) {
      node = host;
    }
    if (node !== ca) {
      range = new Range();
      range.selectNode(node);
    }

    return range;
  }
  return null;
}

function getAnnotationsSummary(annotationElems) {
  const sel = scrapbook.getSelection();
  const currentIndex = getCurrentAnnotationIndex(annotationElems, sel);
  const currentElem = annotationElems[currentIndex];

  const rv = [];
  for (const elem of annotationElems) {
    const id = elem.getAttribute('data-scrapbook-id');
    const type = elem.getAttribute('data-scrapbook-elem');

    switch (type) {
      case 'linemarker': {
        if (!id) { break; }
        rv.push({
          id,
          type,
          text: Array.prototype.reduce.call(
            document.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`),
            (acc, elem) => acc + elem.textContent,
            "",
          ),
          note: elem.title,
          style: elem.style.cssText,
          ...(elem === currentElem && {highlighted: true}),
        });
        break;
      }
      case 'sticky': {
        rv.push({
          id,
          type,
          note: elem.textContent,
          classes: Array.from(elem.classList),
          ...(elem === currentElem && {highlighted: true}),
        });
        break;
      }
      case 'link-url': {
        rv.push({
          id,
          type,
          text: elem.textContent,
          note: elem.href,
          ...(elem === currentElem && {highlighted: true}),
        });
        break;
      }
      case 'custom': {
        rv.push({
          id,
          type,
          note: elem.textContent,
          ...(elem === currentElem && {highlighted: true}),
        });
        break;
      }
      case 'custom-wrapper': {
        rv.push({
          id,
          type,
          text: Array.prototype.reduce.call(
            document.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`),
            (acc, elem) => acc + elem.textContent,
            "",
          ),
          ...(elem === currentElem && {highlighted: true}),
        });
        break;
      }
    }
  }
  return rv;
}

/**
 * @type invokable
 */
editor.highlightAnnotation = function ({elem, id, sel}) {
  if (!elem && id) {
    elem = document.querySelector(`[data-scrapbook-id="${CSS.escape(id)}"]`);
  }
  if (!sel) {
    sel = scrapbook.getSelection();
  }

  const range = getAnnotationRange(elem);
  sel.removeAllRanges();
  sel.addRange(range);
  elem.scrollIntoView();
};

/**
 * @type invokable
 */
editor.viewAnnotationsInternal = async function () {
  const annotationElems = getAnnotationElems({includeHidden: true});
  const annotations = getAnnotationsSummary(annotationElems);
  await scrapbook.openModalWindow({
    url: browser.runtime.getURL('editor/annotations.html'),
    args: {
      annotations,
    },
    senderProp: 'source',
    windowCreateData: {width: 600, height: 600},
  });
};

/**
 * @type invokable
 */
editor.locateAnnotationInternal = function ({offset = 0} = {}) {
  // collect valid annotation elements
  const annotationElems = getAnnotationElems();
  if (!annotationElems.length) {
    return;
  }

  // find current annotation index
  const sel = scrapbook.getSelection();
  let index = getCurrentAnnotationIndex(annotationElems, sel);
  index = offset > 0 ? Math.floor(index) : Math.ceil(index);

  // apply offset
  index = (index + offset) % annotationElems.length;
  if (index < 0) { index += annotationElems.length; }

  // highlight found annotation
  const elem = annotationElems[index];
  editor.highlightAnnotation({elem, sel});
};

/**
 * @type invokable
 */
editor.eraseNodesInternal = function () {
  editor.addHistory();

  // reverse the order as a range may be altered when changing a node before it
  const timeId = scrapbook.dateToId();
  for (const range of scrapbook.getSafeSelectionRanges().reverse()) {
    if (!range.collapsed && !(range.commonAncestorContainer.getRootNode() instanceof ShadowRoot)) {
      editor.eraseRange(range, timeId);
    }
  }
};

/**
 * @type invokable
 */
editor.eraseSelectorInternal = function ({selector}) {
  editor.addHistory();

  const timeId = scrapbook.dateToId();
  const elems = document.querySelectorAll(selector);

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of Array.from(elems).reverse()) {
    if (elem.matches(NON_ERASABLE_ELEMENTS)) { continue; }

    editor.eraseNode(elem, timeId);
  }
};

/**
 * @type invokable
 */
editor.eraseXpathInternal = function ({selector}) {
  editor.addHistory();

  const timeId = scrapbook.dateToId();
  const evaluator = document.evaluate(selector, document, null);
  const elems = [];
  let nextElem;
  while (nextElem = evaluator.iterateNext()) {
    elems.push(nextElem);
  }

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of elems.reverse()) {
    if (elem.matches(NON_ERASABLE_ELEMENTS)) { continue; }

    editor.eraseNode(elem, timeId);
  }
};

/**
 * @type invokable
 */
editor.uneraseNodesInternal = function () {
  editor.addHistory();

  // get selected element nodes with tweaks for boundary selection cases
  const selectedNodes = scrapbook.getSelectedNodes({
    whatToShow: NodeFilter.SHOW_COMMENT,
  });

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    editor.removeScrapBookObject(elem);
  }
};

/**
 * @type invokable
 */
editor.uneraseAllNodesInternal = function () {
  editor.addHistory();

  const unerase = () => {
    let unerased = false;
    const selectedNodes = [];
    const nodeIterator = document.createNodeIterator(
      document.documentElement,
      NodeFilter.SHOW_COMMENT,
    );
    let node;
    while (node = nodeIterator.nextNode()) {
      selectedNodes.push(node);
    }

    // handle descendant node first as it may be altered when handling ancestor
    for (const elem of selectedNodes.reverse()) {
      if (editor.removeScrapBookObject(elem) === 3) {
        unerased = true;
      }
    }

    return unerased;
  };

  while (unerase()) {}
};

/**
 * @type invokable
 */
editor.removeEditsInternal = function () {
  editor.addHistory();

  // get selected element nodes with tweaks for boundary selection cases
  const selectedNodes = scrapbook.getSelectedNodes({
    whatToShow: NodeFilter.SHOW_ELEMENT,
    fuzzy: true,
  });

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    editor.removeScrapBookObject(elem);
  }
};

/**
 * @type invokable
 */
editor.removeAllEditsInternal = function () {
  editor.addHistory();

  const selectedNodes = [];
  const nodeIterator = document.createNodeIterator(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT,
  );
  let node;
  while (node = nodeIterator.nextNode()) {
    selectedNodes.push(node);
  }

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    editor.removeScrapBookObject(elem);
  }
};

/**
 * @type invokable
 */
editor.undoInternal = function () {
  if (!document.body) { return; }

  mutationHandler.applyRestorePoint();
};

/**
 * @type invokable
 */
editor.deleteErasedInternal = function () {
  editor.addHistory();

  const selectedNodes = [];
  const nodeIterator = document.createNodeIterator(
    document.documentElement,
    NodeFilter.SHOW_COMMENT,
    node => scrapbook.getScrapBookObjectRemoveType(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  );
  let node;
  while (node = nodeIterator.nextNode()) {
    selectedNodes.push(node);
  }

  // handle descendant node first as it may be altered when handling ancestor
  for (const elem of selectedNodes.reverse()) {
    elem.remove();
  }
};

/**
 * @type invokable
 */
editor.editTitleInternal = function () {
  let title = prompt(scrapbook.lang('EditorButtonSaveEditTitlePrompt'), document.title);
  if (title === null) { return; }
  document.title = title;
};

/**
 * @type invokable
 */
editor.setViewportInternal = function () {
  let viewportElem = document.querySelector('meta[name="viewport"i]');
  let viewportDeclaration = viewportElem ? viewportElem.getAttribute('content') : 'width=device-width, initial-scale=1.0';
  if (viewportElem) {
    viewportDeclaration = prompt(scrapbook.lang('EditorButtonSaveSetViewportPromptModify'), viewportDeclaration);
  } else {
    viewportDeclaration = prompt(scrapbook.lang('EditorButtonSaveSetViewportPromptCreate'), viewportDeclaration);
  }

  // cancel
  if (viewportDeclaration === null) {
    return;
  }

  if (viewportElem) {
    if (viewportDeclaration) {
      viewportElem.setAttribute('content', viewportDeclaration);
    } else {
      viewportElem.remove();
    }

    return;
  }

  // no value
  if (!viewportDeclaration) {
    return;
  }

  viewportElem = document.head.appendChild(document.createElement('meta'));
  viewportElem.setAttribute('name', 'viewport');
  viewportElem.setAttribute('content', viewportDeclaration);
};


/****************************************************************************
 * Event handlers / Toolbar controllers
 ***************************************************************************/

editor.locate = async function () {
  const response = await scrapbook.invokeExtensionScript({
    cmd: "background.locateItem",
    args: {url: document.URL},
  });
  if (response === false) {
    alert(scrapbook.lang("ErrorLocateSidebarNotOpened"));
  } else if (response === null) {
    alert(scrapbook.lang("ErrorLocateNotFound"));
  }
  return response;
};

editor.lineMarker = async function (style) {
  const args = {
    tagName: scrapbook.getOption("editor.useNativeTags") ? 'span' : 'scrapbook-linemarker',
    attrs: {
      'data-scrapbook-id': scrapbook.dateToId(),
      'data-scrapbook-elem': 'linemarker',
      'style': style,
    },
  };
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.lineMarkerInternal",
      args,
    },
  });
};

editor.viewAnnotations = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.viewAnnotationsInternal",
    },
  });
};

editor.locateAnnotation = async function (offset) {
  const frameId = await editor.getFocusedFrameId();
  const args = {
    offset,
  };
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId,
      cmd: "editor.locateAnnotationInternal",
      args,
    },
  });
};

editor.createLink = async function () {
  const frameId = await editor.getFocusedFrameId();
  const url = prompt(scrapbook.lang('EditorButtonAnnotationLinkPrompt'));
  if (!url) { return; }
  const args = {
    tagName: 'a',
    attrs: {
      'data-scrapbook-id': scrapbook.dateToId(),
      'data-scrapbook-elem': 'link-url',
      'href': url,
    },
  };
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId,
      cmd: "editor.lineMarkerInternal",
      args,
    },
  });
};

editor.createSticky = async function (richText, refNode) {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.annotator.createSticky",
      args: {
        richText,
        refNode,
      },
    },
  });
};

editor.eraseNodes = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.eraseNodesInternal",
      args: {},
    },
  });
};

editor.eraseSelector = async function (allFrames = false) {
  const frameId = allFrames ? undefined : await editor.getFocusedFrameId();
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
    cmd: "background.invokeEditorCommand",
    args: {
      frameId,
      cmd: "editor.eraseSelectorInternal",
      args: {selector},
    },
  });
};

editor.eraseXpath = async function (allFrames = false) {
  const frameId = allFrames ? undefined : await editor.getFocusedFrameId();
  const selector = prompt(scrapbook.lang('EditorButtonEraserXpathPrompt'));

  if (!selector) {
    return;
  }

  let evaluator;
  try {
    document.evaluate(selector, document, null);
  } catch (ex) {
    alert(scrapbook.lang('ErrorEditorButtonEraserXpathInvalid', [selector]));
    return;
  }

  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId,
      cmd: "editor.eraseXpathInternal",
      args: {selector},
    },
  });
};

editor.uneraseNodes = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.uneraseNodesInternal",
      args: {},
    },
  });
};

editor.uneraseAllNodes = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.uneraseAllNodesInternal",
      args: {},
    },
  });
};

editor.removeEdits = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.removeEditsInternal",
      args: {},
    },
  });
};

editor.removeAllEdits = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.removeAllEditsInternal",
      args: {},
    },
  });
};

editor.toggleAnnotator = async function (willActive) {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.annotator.toggle",
      args: {willActive},
    },
  });
};

editor.toggleDomEraser = async function (willActive, ignoreAnnotator = false) {
  const editElem = editor.internalElement.querySelector('#toolbar-domEraser > button');

  if (typeof willActive === "undefined") {
    willActive = !editElem.hasAttribute("checked");
  }

  if (willActive) {
    if (editElem.hasAttribute("checked")) {
      // already active or is doing async activating
      return;
    }
    editElem.setAttribute("checked", "");
  } else {
    if (!editElem.hasAttribute("checked")) {
      // already inactive or is doing async deactivating
      return;
    }
    editElem.removeAttribute("checked");
  }

  for (const elem of editor.internalElement.querySelectorAll([
    '#toolbar-locate > button',
    '#toolbar-marker > button',
    '#toolbar-annotation > button',
    '#toolbar-eraser > button',
    '#toolbar-htmlEditor > button',
    '#toolbar-undo > button',
    '#toolbar-save > button',
  ].join(','))) {
    elem.disabled = willActive;
  }

  if (willActive && !ignoreAnnotator) {
    await editor.toggleAnnotator(false);
  }

  await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.domEraser.toggle",
      args: {willActive},
    },
  });

  if (!willActive && !ignoreAnnotator) {
    await editor.toggleAnnotator(true);
  }
};

editor.toggleHtmlEditor = async function (willActive, ignoreAnnotator = false) {
  const editElem = editor.internalElement.querySelector('#toolbar-htmlEditor > button');

  if (typeof willActive === "undefined") {
    willActive = !editElem.hasAttribute("checked");
  }

  if (willActive) {
    if (editElem.hasAttribute("checked")) {
      // already active or is doing async activating
      return;
    }
    editElem.setAttribute("checked", "");
  } else {
    if (!editElem.hasAttribute("checked")) {
      // already inactive or is doing async deactivating
      return;
    }
    editElem.removeAttribute("checked");
  }

  for (const elem of editor.internalElement.querySelectorAll([
    '#toolbar-marker > button',
    '#toolbar-annotation > button',
    '#toolbar-eraser > button',
    '#toolbar-domEraser > button',
    '#toolbar-undo > button',
  ].join(','))) {
    elem.disabled = willActive;
  }

  if (willActive && !ignoreAnnotator) {
    await editor.toggleAnnotator(false);
  }

  await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.htmlEditor.toggle",
      args: {willActive},
    },
  });

  if (!willActive && !ignoreAnnotator) {
    await editor.toggleAnnotator(true);
  }
};

editor.toggleMutationHandler = async function (willActive) {
  const editElem = editor.internalElement.querySelector('#toolbar-undo-toggle');

  if (typeof willActive === "undefined") {
    willActive = !editElem.hasAttribute("checked");
  }

  if (willActive) {
    if (editElem.hasAttribute("checked")) {
      // already active or is doing async activating
      return;
    }
    editElem.setAttribute("checked", "");
  } else {
    if (!editElem.hasAttribute("checked")) {
      // already inactive or is doing async deactivating
      return;
    }
    editElem.removeAttribute("checked");
  }

  await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.mutationHandler.toggle",
      args: {willActive},
    },
  });
};

editor.undo = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.undoInternal",
      args: {},
    },
  });
};

editor.save = async function (params = {}) {
  mutationHandler.addSavePoint();

  if (editor.inScrapBook) {
    // prompt a confirm if this page is scripted
    if (editor.isScripted) {
      if (!confirm(scrapbook.lang("EditConfirmScriptedDocument"))) {
        return;
      }
    }

    await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        cmd: "editor.annotator.saveAll",
        args: {},
      },
    });
    return await scrapbook.invokeExtensionScript({
      cmd: "background.captureCurrentTab",
      args: {mode: params.internalize ? "internalize" : "resave"},
    });
  } else {
    await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        cmd: "editor.annotator.saveAll",
        args: {},
      },
    });
    return await scrapbook.invokeExtensionScript({
      cmd: "background.captureCurrentTab",
    });
  }
};

editor.deleteErased = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.deleteErasedInternal",
      args: {},
    },
  });
};

editor.createSubPage = async function () {
  const title = prompt(scrapbook.lang('EditorButtonSaveCreateSubPagePrompt'));
  if (!title) { return; }

  try {
    await scrapbook.invokeExtensionScript({
      cmd: "background.createSubPage",
      args: {
        url: location.href,
        title,
      },
    });
  } catch (ex) {
    console.error(ex);
    alert(ex.message);
  }
};

editor.editTitle = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.editTitleInternal",
      args: {},
    },
  });
};

editor.setViewport = async function () {
  return await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      frameId: await editor.getFocusedFrameId(),
      cmd: "editor.setViewportInternal",
      args: {},
    },
  });
};

editor.pinTop = async function (willActive) {
  const editElem = editor.internalElement.querySelector('#toolbar-save-pinTop');

  if (typeof willActive === "undefined") {
    willActive = !editElem.hasAttribute("checked");
  }

  if (willActive) {
    if (editElem.hasAttribute("checked")) {
      // already active or is doing async activating
      return;
    }
    editElem.setAttribute("checked", "");
    editor.internalElement.classList.add('top');
  } else {
    if (!editElem.hasAttribute("checked")) {
      // already inactive or is doing async deactivating
      return;
    }
    editElem.removeAttribute("checked");
    editor.internalElement.classList.remove('top');
  }
};

editor.open = async function () {
  if (editor.active) { return; }

  document.documentElement.setAttribute('data-scrapbook-toolbar-active', '');
  document.documentElement.appendChild(editor.element);
  await scrapbook.invokeExtensionScript({
    cmd: "background.registerActiveEditorTab",
    args: {
      willEnable: true,
    },
  });
  await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.openInternal",
      frameIdExcept: 0,
    },
  });
  await editor.toggleAnnotator(true);
};

editor.close = async function () {
  if (!editor.active) { return; }

  document.documentElement.removeAttribute('data-scrapbook-toolbar-active');

  // remove possible stale elements due to a disabled/removed extension
  for (const elem of document.querySelectorAll('scrapbook-toolbar')) {
    elem.remove();
  }

  await scrapbook.invokeExtensionScript({
    cmd: "background.registerActiveEditorTab",
    args: {
      willEnable: false,
    },
  });
  await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.closeInternal",
      frameIdExcept: 0,
    },
  });
  await editor.toggleDomEraser(false, true);
  await editor.toggleHtmlEditor(false, true);
  await editor.toggleAnnotator(false);
};

/**
 * Shows a context menu.
 *
 * @param {HTMLElement} elem - The context menu element.
 */
editor.showContextMenu = function (elem, pos = {}) {
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

    switch (event.code) {
      case "Escape":
      case "F10": {
        event.preventDefault();
        exitContextMenu();
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const elems = Array.from(elem.querySelectorAll('li > button:enabled'));
        const focusIdx = elems.findIndex((elem) => elem.matches(':focus'));
        let idx = (focusIdx === -1) ? 0 : focusIdx - 1;
        if (idx < 0) { idx = elems.length - 1; }
        const target = elems[idx];
        target?.focus();
        break;
      }
      case "ArrowDown": {
        event.preventDefault();
        const elems = Array.from(elem.querySelectorAll('li > button:enabled'));
        const focusIdx = elems.findIndex((elem) => elem.matches(':focus'));
        let idx = (focusIdx === -1) ? 0 : focusIdx + 1;
        if (idx >= elems.length) { idx = 0; }
        const target = elems[idx];
        target?.focus();
        break;
      }
    }
  };

  const exitContextMenu = () => {
    elem.removeEventListener("focusout", onFocusOut);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    elem.hidden = true;
  };

  elem.addEventListener("focusout", onFocusOut, {passive: true});
  // Firefox has an issue that focusout isn't fired when designMode is on.
  // Catch any click as a fallback for any click in the window (not work for
  // a click in a frame, though).
  // Use capture to prevent fired by bubbling of the click event that opens
  // the context menu.
  window.addEventListener("click", onClick, {passive: true, capture: true});
  window.addEventListener("keydown", onKeyDown, true);
  elem.hidden = false;

  // adjust horizonital position to avoid wrapping
  {
    const toolbarBorderPadding = 2;
    const toolbarButtonWidth = 36;
    const toolbarHeight = 40;
    const {clientX = 0, clientY = 0} = pos;
    const viewport = scrapbook.getViewport(window);

    // reposition to leftmost to get correct offsetWidth
    elem.style.setProperty('left', 0 + 'px');

    const offsetX = Math.min(Math.max(clientX - toolbarButtonWidth, 0), viewport.width - toolbarBorderPadding - elem.offsetWidth);
    elem.style.setProperty('left', offsetX + 'px');
  }

  // Focus on the context menu element for focusout event to work when the user
  // clicks outside.
  const sel = scrapbook.getSelection();
  const ranges = scrapbook.getSelectionRanges(sel);
  const wasCollapsed = sel.isCollapsed;

  if (!elem.hasAttribute('tabindex')) {
    elem.setAttribute('tabindex', -1);
  }
  elem.focus();

  if (!wasCollapsed && sel.isCollapsed) {
    // Restore selection after focus if the browser clears it.
    ranges.forEach(r => sel.addRange(r));
  }
};


/****************************************************************************
 * Helpers
 ***************************************************************************/

/**
 * @return {boolean} Whether the document has a working script.
 */
editor.isDocumentScripted = function (doc) {
  for (const fdoc of scrapbook.flattenFrames(doc)) {
    for (const elem of fdoc.querySelectorAll("*")) {
      // check <script> elements
      if (elem.nodeName.toLowerCase() === 'script') {
        if (SCRIPT_TYPES.has(elem.type.toLowerCase()) &&
            !ALLOWED_SCRAPBOOK_SCRIPTS.has(scrapbook.getScrapbookObjectType(elem))) {
          if (elem.src) {
            return true;
          } else if (!/^\s*(?:(?:\/\*[^*]*(?:\*(?!\/)[^*]*)*\*\/|\/\/.*)\s*)*$/.test(elem.textContent)) {
            return true;
          }
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

editor.getStatusKey = function (key) {
  return {table: "scrapbookEditorStatus", key};
};

editor.updateLineMarkers = async function () {
  for (const [i, elem] of editor.internalElement.querySelectorAll('#toolbar-marker ul scrapbook-toolbar-samp').entries()) {
    const style = scrapbook.getOption(`editor.lineMarker.style.${i + 1}`);
    elem.setAttribute('style', style);
    elem.title = style;
  }

  const buttons = Array.from(editor.internalElement.querySelectorAll('#toolbar-marker ul button'));
  for (const elem of buttons) {
    elem.removeAttribute('checked');
  }
  let idx = await scrapbook.cache.get(editor.getStatusKey('lineMarkerSelected'), 'storage');
  idx = Math.min(parseInt(idx, 10) || 0, buttons.length - 1);
  buttons[idx].setAttribute('checked', '');
};

editor.updateHtmlEditorMenu = function () {
  const elem = editor.internalElement.querySelector('#toolbar-htmlEditor-insertDate');
  const format = scrapbook.getOption("editor.insertDateFormat");
  const isUtc = scrapbook.getOption("editor.insertDateFormatIsUtc");
  const sample = Strftime.format(format, {isUtc});
  elem.title = format + '\n' + sample;
};

editor.getFocusedFrameId = async function () {
  if (!editor.directToolbarClick) {
    return 0;
  }

  const arr = await scrapbook.invokeExtensionScript({
    cmd: "background.invokeEditorCommand",
    args: {
      cmd: "editor.getFocusedFrameIdInternal",
      frameIdExcept: 0,
    },
  });

  const lastFrame = arr.reduce((acc, cur) => {
    if (cur?.time > acc.time) {
      return cur;
    }
    return acc;
  }, {frameId: 0, time: -1});

  if (lastFrame.frameId !== 0 && editor.lastWindowFocusTime - lastFrame.time < 50) {
    return lastFrame.frameId;
  }

  return 0;
};

editor.eraseRange = function (range, timeId = scrapbook.dateToId()) {
  scrapbook.eraseRange(range, {timeId, mapCommentToWrapper: editor.erasedContents});
};

editor.eraseNode = function (node, timeId = scrapbook.dateToId()) {
  scrapbook.eraseNode(node, {timeId, mapCommentToWrapper: editor.erasedContents});
};

/**
 * Remove a scrapbook object.
 *
 * @return {integer} Scrapbook object remove type of the element.
 */
editor.removeScrapBookObject = function (node) {
  try {
    // not in the DOM tree, skip
    if (!node.isConnected) { return -1; }
  } catch (ex) {
    // not an element or a dead object, skip
    return -1;
  }
  let type = scrapbook.getScrapBookObjectRemoveType(node);
  switch (type) {
    case 1: {
      for (const part of scrapbook.getScrapBookObjectElems(node)) {
        part.remove();
      }
      break;
    }
    case 2: {
      for (const part of scrapbook.getScrapBookObjectElems(node)) {
        scrapbook.unwrapNode(part);
      }
      break;
    }
    case 3: {
      const unerased = scrapbook.uneraseNode(node, {
        mapCommentToWrapper: editor.erasedContents,
      });
      if (!unerased) {
        // this shouldn't happen
        return -1;
      }
      break;
    }
  }
  return type;
};

editor.addHistory = () => {
  // Save active editing in prior to prevent restoring to an editing state.
  annotator.saveAll();

  mutationHandler.addRestorePoint();
};


const annotator = editor.annotator = (function () {
  const STICKY_DEFAULT_WIDTH = 250;
  const STICKY_DEFAULT_HEIGHT = 100;
  const POINTER_SIZE = 10;

  const draggingData = {};

  const onMouseDown = (event) => {
    // A mousedown during a dragging caould be pressing another mouse button,
    // or a touch with another finger. In either case the current dragging
    // should be stopped and no new dragging should be initiated.
    if (draggingData.target) {
      stopDrag(event);
      return;
    }

    let target = event.target;
    let objectType = scrapbook.getScrapbookObjectType(target);
    switch (objectType) {
      case 'sticky': {
        if (target.shadowRoot) {
          const innerTarget = event.composedPath()[0];
          if (innerTarget.matches('header')) {
            if (target.classList.contains('relative')) {
              break;
            }

            if (!event.touches) {
              startDrag(event);
            } else {
              if (event.touches.length === 1) {
                startDrag(event);
              } else {
                stopDrag(event);
              }
            }
          } else if (innerTarget.matches('.resizer')) {
            if (!event.touches) {
              startDrag(event, new Set([...innerTarget.classList]));
            } else {
              if (event.touches.length === 1) {
                startDrag(event, new Set([...innerTarget.classList]));
              } else {
                stopDrag(event);
              }
            }
          }
          break;
        }
        break;
      }
    }
  };

  const onMouseMove = (event) => {
    if (draggingData.target) {
      moveDrag(event);
    }
  };

  const onMouseUp = (event) => {
    if (draggingData.target) {
      stopDrag(event);
    }
  };

  const onClick = (event) => {
    let target = event.target;
    let objectType = scrapbook.getScrapbookObjectType(target);
    while (!objectType) {
      target = target.parentNode;
      if (!target) { return; }
      objectType = scrapbook.getScrapbookObjectType(target);
    }
    switch (objectType) {
      case 'linemarker':
      case 'inline': {
        // A click event fires when mouse down and up in the same element,
        // including a selection. Exclude selection as the user probably
        // doesn't want a popup when he makes a selection.
        if (scrapbook.getSelection().type === 'Range') { break; }

        event.preventDefault();

        annotator.editLineMarker(target);
        break;
      }

      case 'sticky': {
        if (scrapbook.getSelection().type === 'Range') { break; }
        if (target.shadowRoot) { break; }

        event.preventDefault();

        annotator.editSticky(target);
        break;
      }
    }
  };

  const startDrag = (event, resizeClass = false) => {
    event.preventDefault();
    event.stopPropagation();

    const target = draggingData.target = event.target;
    draggingData.target.classList.add('dragging');
    draggingData.resizeClass = resizeClass;

    const {clientX, clientY} = getEventPositionObject(event);
    const rect = target.getBoundingClientRect();
    draggingData.deltaX = clientX - rect.left;
    draggingData.deltaY = clientY - rect.top;

    // create a whole page mask to prevent mouse event be trapped by an iframe
    const maskElem = draggingData.mask = document.createElement('scrapbook-toolbar-mask');
    maskElem.setAttribute('data-scrapbook-elem', 'toolbar-mask');
    maskElem.style.setProperty('all', 'initial', 'important');
    maskElem.style.setProperty('position', 'fixed', 'important');
    maskElem.style.setProperty('z-index', '2147483647', 'important');
    maskElem.style.setProperty('inset', 0, 'important');
    document.documentElement.appendChild(maskElem);

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("touchmove", onMouseMove, {capture: true, passive: false});
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("touchend", onMouseUp, {capture: true, passive: false});
  };

  const moveDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const {clientX, clientY} = getEventPositionObject(event);
    const mainElem = draggingData.target;
    const resizeClass = draggingData.resizeClass;
    if (resizeClass) {
      const rect = mainElem.getBoundingClientRect();
      if (resizeClass.has('nwse')) {
        mainElem.style.width = clientX - rect.left + 'px';
        mainElem.style.height = clientY - rect.top + 'px';
      } else if (resizeClass.has('ns')) {
        mainElem.style.height = clientY - rect.top + 'px';
      } else if (resizeClass.has('ew')) {
        mainElem.style.width = clientX - rect.left + 'px';
      }
    } else {
      const pos = scrapbook.getAnchoredPosition(mainElem, {
        clientX: Math.max(clientX - draggingData.deltaX, 0),
        clientY: Math.max(clientY - draggingData.deltaY, 0),
      });
      mainElem.style.left = pos.left + 'px';
      mainElem.style.top = pos.top + 'px';
    }
  };

  const stopDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("touchmove", onMouseMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("touchend", onMouseUp, true);

    draggingData.mask.remove();
    draggingData.target.classList.remove('dragging');
    draggingData.target = null;
  };

  const getEventPositionObject = (event) => {
    return event.changedTouches ? event.changedTouches[0] : event;
  };

  const annotator = {
    active: false,

    /**
     * @type invokable
     */
    toggle({willActive = !this.active} = {}) {
      if (willActive) {
        if (!this.active) {
          this.active = true;
          this.updateAnnotationCss();
          window.addEventListener("click", onClick, true);
          window.addEventListener("mousedown", onMouseDown, true);
          window.addEventListener("touchstart", onMouseDown, {capture: true, passive: false});
        }
      } else {
        if (this.active) {
          this.active = false;
          window.removeEventListener("click", onClick, true);
          window.removeEventListener("mousedown", onMouseDown, true);
          window.removeEventListener("touchstart", onMouseDown, true);
          this.saveAll();
        }
      }
    },

    updateAnnotationCss() {
      this.clearAnnotationCss();
      const css = document.createElement("style");
      css.setAttribute("data-scrapbook-elem", "annotation-css");
      css.textContent = scrapbook.ANNOTATION_CSS;
      document.documentElement.appendChild(css);
    },

    clearAnnotationCss() {
      for (const elem of document.querySelectorAll(`style[data-scrapbook-elem="annotation-css"]`)) {
        elem.remove();
      }
    },

    saveAll() {
      for (const elem of document.querySelectorAll('[data-scrapbook-elem="toolbar-prompt"]')) {
        elem.remove();
      }
      for (const elem of document.querySelectorAll('[data-scrapbook-elem="sticky"].editing')) {
        this.saveSticky(elem);
      }
    },

    /**
     * @type invokable
     */
    async editLineMarker(elem) {
      // this is unexpected
      if (elem.shadowRoot) { return; }

      const content = await scrapbook.prompt(scrapbook.lang('EditorEditAnnotation'), elem.title);

      if (content == null) {
        return;
      }

      editor.addHistory();

      // Retrieve element ID. Generate a new one if none.
      let id = elem.getAttribute('data-scrapbook-id');
      if (!id) {
        id = scrapbook.dateToId();
        elem.setAttribute('data-scrapbook-id', id);
      }

      for (const part of scrapbook.getScrapBookObjectElems(elem)) {
        if (content.trim()) {
          part.setAttribute('title', content);
        } else {
          part.removeAttribute('title');
        }
      }
    },

    /**
     * @type invokable
     * @param {boolean} [richText] - Whether content is rich text.
     * @param {Node|false} [refNode] - The ref node to create a sticky note
     *   around. Auto-detected by selection when unspecified. False to not
     *   create a relative note.
     */
    createSticky({richText, refNode} = {}) {
      editor.addHistory();

      const useNativeTags = scrapbook.getOption("editor.useNativeTags");
      const mainElem = document.createElement(useNativeTags ? 'div' : 'scrapbook-sticky');
      mainElem.setAttribute('data-scrapbook-id', scrapbook.dateToId());
      mainElem.setAttribute('data-scrapbook-elem', 'sticky');
      mainElem.dir = scrapbook.lang('@@bidi_dir');
      mainElem.classList.add('styled');
      if (!richText) {
        mainElem.classList.add('plaintext');
      }

      if (!refNode && refNode !== false) {
        const sel = scrapbook.getSelection();
        if (sel.type === 'Range') {
          refNode = sel.anchorNode;
        }

        // Don't allow a relative sticky note in a shadow root, which makes
        // the annotation CSS not apply on it.
        if (refNode?.getRootNode() instanceof ShadowRoot) {
          refNode = false;
        }
      }

      if (refNode) {
        // relative
        mainElem.classList.add('relative');
        refNode = findBlockRefNode(refNode);
        if (refNode.matches('body')) {
          refNode.appendChild(mainElem);
        } else {
          refNode.parentNode.insertBefore(mainElem, refNode.nextSibling);
        }
      } else {
        // absolute
        mainElem.style.left = window.scrollX + Math.round((window.innerWidth - STICKY_DEFAULT_WIDTH) / 2) + 'px';
        mainElem.style.top = window.scrollY + Math.round((window.innerHeight - STICKY_DEFAULT_HEIGHT) / 2) + 'px';
        mainElem.style.width = STICKY_DEFAULT_WIDTH + 'px';
        mainElem.style.height = STICKY_DEFAULT_HEIGHT + 'px';

        document.body.appendChild(mainElem);
      }

      this.editSticky(mainElem, true);

      function findBlockRefNode(node) {
        // must be one of these block elements
        let refNode = node;

        if (refNode.nodeType !== 1) {
          refNode = refNode.parentNode;
        }

        refNode = refNode.closest(`body, main, section, article, aside, header, footer, div, blockquote, pre, p, table, li, dt, dd`);

        // if it's before a (relative) sticky note, move it to be after
        let nextNode;
        while ((nextNode = refNode.nextSibling)
            && scrapbook.getScrapbookObjectType(nextNode) === "sticky") {
          refNode = refNode.nextSibling;
        }

        return refNode;
      }
    },

    async editSticky(mainElem, skipHistory = false) {
      if (mainElem.shadowRoot) { return; }

      if (!mainElem.classList.contains('styled')) {
        const attr = mainElem.classList.contains('plaintext') ? 'textContent' : 'innerHTML';
        const content = await scrapbook.prompt(scrapbook.lang('EditorEditAnnotation'), mainElem[attr]);
        if (content === null) {
          return;
        }

        if (!skipHistory) {
          editor.addHistory();
        }

        mainElem[attr] = content;
        return;
      }

      if (!skipHistory) {
        editor.addHistory();
      }

      // Replace mainElem with a clone to prevent attaching shadow root,
      // which will show up inconsistently after an undo.
      const mainElemNew = mainElem.cloneNode(true);
      mainElem.replaceWith(mainElemNew);
      mainElem = mainElemNew;

      const shadowRoot = mainElem.attachShadow({mode: 'open'});
      mainElem.classList.add('editing');

      const styleElem = shadowRoot.appendChild(document.createElement('style'));
      styleElem.textContent = `\
:host {
  padding: 0 !important;
  overflow: visible !important;
  cursor: inherit !important;
}
:host > form {
  position: relative;
  width: 100%;
  height: 100%;
}
:host > form > header {
  position: absolute;
  display: flex;
  box-sizing: border-box;
  top: -1.25em;
  height: 1.25em;
  width: 100%;
  justify-content: flex-end;
  cursor: ${mainElem.classList.contains('relative') ? 'inherit' : 'move'};
}
:host > form > header img {
  margin: .1em;
  width: 1em;
  height: 1em;
  cursor: pointer;
}
:host > form > header button {
  margin: .125em;
  border: 0;
  padding: 0;
  width: 1em;
  height: 1em;
  cursor: pointer;
}
:host > form > header button.save {
  background: url("${browser.runtime.getURL("resources/edit-sticky-save.gif")}") center/contain;
}
:host > form > header button.delete {
  background: url("${browser.runtime.getURL("resources/edit-sticky-delete.gif")}") center/contain;
}
:host > form > textarea,
:host > form > article {
  box-sizing: border-box;
  border: none;
  padding: .25em;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: transparent;
  resize: none;
  font: inherit;
}
:host > form > textarea:focus,
:host > form > article:focus {
  outline: none;
}
:host > form > .resizer {
  position: absolute;
  box-sizing: border-box;
}
:host > form > .resizer.ns {
  right: 9px;
  bottom: -6px;
  left: -6px;
  height: 15px;
  cursor: ns-resize;
}
:host > form > .resizer.ew {
  right: -6px;
  bottom: 9px;
  top: 0;
  width: 15px;
  cursor: ew-resize;
}
:host > form > .resizer.nwse {
  right: -6px;
  bottom: -6px;
  width: 15px;
  height: 15px;
  cursor: nwse-resize;
}
`;

      const formElem = shadowRoot.appendChild(document.createElement('form'));
      formElem.addEventListener('keydown', (event) => {
        if (event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.cancelSticky(mainElem);
        } else if (event.code === 'KeyS' && event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          this.saveSticky(mainElem);
        }
      });

      let bodyElem;
      if (mainElem.classList.contains('plaintext')) {
        bodyElem = formElem.appendChild(document.createElement('textarea'));
        bodyElem.textContent = mainElem.textContent;
      } else {
        bodyElem = formElem.appendChild(document.createElement('article'));
        bodyElem.setAttribute('contenteditable', 'true');
        bodyElem.innerHTML = mainElem.innerHTML;
      }

      const headerElem = formElem.appendChild(document.createElement('header'));

      const saveElem = headerElem.appendChild(document.createElement('button'));
      saveElem.classList.add('save');
      saveElem.title = scrapbook.lang('EditorStickySave', ['Alt+S']);
      saveElem.addEventListener('click', (event) => { this.saveSticky(mainElem); });

      const deleteElem = headerElem.appendChild(document.createElement('button'));
      deleteElem.classList.add('delete');
      deleteElem.title = scrapbook.lang('EditorStickyDelete');
      deleteElem.addEventListener('click', (event) => { this.deleteSticky(mainElem); });

      const resizerElemNS = formElem.appendChild(document.createElement('div'));
      resizerElemNS.classList.add('resizer');
      resizerElemNS.classList.add('ns');

      const resizerElemEW = formElem.appendChild(document.createElement('div'));
      resizerElemEW.classList.add('resizer');
      resizerElemEW.classList.add('ew');

      const resizerElemNWSE = formElem.appendChild(document.createElement('div'));
      resizerElemNWSE.classList.add('resizer');
      resizerElemNWSE.classList.add('nwse');

      bodyElem.focus();
    },

    saveSticky(mainElem) {
      if (!mainElem.shadowRoot) { return; }

      const newElem = mainElem.cloneNode(false);
      newElem.classList.remove('editing');
      if (!newElem.classList.length) { newElem.removeAttribute('class'); }
      if (mainElem.classList.contains('plaintext')) {
        let bodyElem = mainElem.shadowRoot.querySelector('textarea');
        newElem.textContent = bodyElem.value;
      } else {
        let bodyElem = mainElem.shadowRoot.querySelector('article'), node;
        while (node = bodyElem.firstChild) {
          newElem.appendChild(node);
        }
      }
      mainElem.parentNode.replaceChild(newElem, mainElem);
    },

    cancelSticky(mainElem) {
      if (!mainElem.shadowRoot) { return; }

      const newElem = mainElem.cloneNode(true);
      mainElem.parentNode.replaceChild(newElem, mainElem);
    },

    deleteSticky(mainElem) {
      mainElem.remove();
    },
  };

  return annotator;
})();


const domEraser = editor.domEraser = (function () {
  const FORBID_NODES = `scrapbook-toolbar, scrapbook-toolbar *`;
  const TOOLTIP_NODES = `scrapbook-toolbar-tooltip, scrapbook-toolbar-tooltip *`;
  const SKIP_NODES = `html, head, body, ${FORBID_NODES}, ${TOOLTIP_NODES}`;
  const ATOMIC_NODES = `svg, math`;

  let lastTarget = null;
  let lastTouchTarget = null;
  let tooltipElem = null;
  const mapMarkedNodes = new Map();
  let mapExpandStack = new WeakMap();

  const onTouchStart = (event) => {
    lastTouchTarget = event.target;
  };

  const onMouseOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    let elem = event.target;

    // don't set target for a simulated mouseover for a touch,
    // so that the click event will reset the target as it gets no lastTarget.
    if (elem === lastTouchTarget) { return; }

    if (elem.matches(TOOLTIP_NODES)) { return; }

    elem = domEraser.adjustTarget(elem);
    domEraser.setTarget(elem);
    mapExpandStack = new WeakMap();
  };

  const onMouseDown = (event) => {
    if (event.button !== 1) { return; }
    if (event.target.matches(FORBID_NODES)) { return; }

    event.preventDefault();
    event.stopPropagation();

    if (!lastTarget) { return; }
    domEraser.isolateTarget(lastTarget);
  };

  const onClick = (event) => {
    if (event.target.matches(FORBID_NODES)) { return; }

    event.preventDefault();
    event.stopPropagation();

    // if the click is triggered via a touch, update target for the first
    // time, and perform action when for the second time.
    if (event.target === lastTouchTarget) {
      const target = domEraser.adjustTarget(event.target);
      if (target !== lastTarget && !target.matches(TOOLTIP_NODES)) {
        domEraser.setTarget(target);
        mapExpandStack = new WeakMap();
        return;
      }
    }

    if (!lastTarget) { return; }

    if (event.ctrlKey) {
      domEraser.isolateTarget();
    } else {
      domEraser.eraseTarget();
    }
  };

  const onKeyDown = (event) => {
    // skip if there's a modifier
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.code === "Escape" || event.code === "F10") {
      event.preventDefault();
      event.stopPropagation();
      editor.toggleDomEraser(false);
    } else if (event.code === "KeyW") {
      event.preventDefault();
      event.stopPropagation();
      domEraser.expandTarget();
    } else if (event.code === "KeyN") {
      event.preventDefault();
      event.stopPropagation();
      domEraser.shrinkTarget();
    } else if (event.code === "KeyR") {
      event.preventDefault();
      event.stopPropagation();
      domEraser.eraseTarget();
    } else if (event.code === "KeyI") {
      event.preventDefault();
      event.stopPropagation();
      domEraser.isolateTarget();
    }
  };

  const domEraser = {
    active: false,

    /**
     * @type invokable
     */
    toggle({willActive = !this.active} = {}) {
      if (willActive) {
        if (!this.active) {
          this.active = true;
          window.addEventListener('touchstart', onTouchStart, true);
          window.addEventListener('mouseover', onMouseOver, true);
          window.addEventListener('mousedown', onMouseDown, true);
          window.addEventListener('click', onClick, true);
          window.addEventListener("keydown", onKeyDown, true);
          mutationHandler.startSpecialMode();
        }
      } else {
        if (this.active) {
          this.active = false;
          domEraser.clearTarget();
          mutationHandler.endSpecialMode();
          window.removeEventListener('touchstart', onTouchStart, true);
          window.removeEventListener('mouseover', onMouseOver, true);
          window.removeEventListener('mousedown', onMouseDown, true);
          window.removeEventListener('click', onClick, true);
          window.removeEventListener("keydown", onKeyDown, true);
        }
      }
    },

    adjustTarget(elem) {
      if (!elem) { return elem; }

      // Special handling for special elements,
      // as their inner elements cannot be tooltiped and handled,
      // or should be treated as a whole.
      let checkElem;
      while ((checkElem = elem.closest(ATOMIC_NODES)) && checkElem !== elem) {
        elem = checkElem;
      }

      return elem;
    },

    setTarget(elem) {
      // do nothing if the new target is same as the current one
      if (lastTarget === elem) { return; }

      // remove tooltip in other frames
      (async () => {
        scrapbook.invokeExtensionScript({
          cmd: "background.invokeEditorCommand",
          args: {
            cmd: "editor.domEraser.clearTarget",
            frameIdExcept: core.frameId,
          },
        });
      })();

      domEraser.clearTarget();

      // skip if the new target is invalid
      if (elem.matches(SKIP_NODES)) { return; }

      lastTarget = elem;

      let outlineStyle;
      let labelBody;
      if (scrapbook.getScrapBookObjectRemoveType(elem) <= 0) {
        const id = elem.id;
        const classText = Array.from(elem.classList.values()).map(x => '.' + x).join(''); // elements like svg doesn't support .className property
        outlineStyle = '2px solid red';
        labelBody = document.createDocumentFragment();
        const b = labelBody.appendChild(document.createElement('b'));
        b.style = 'all: unset !important; font-weight: bold !important;';
        b.textContent = elem.tagName.toLowerCase();
        if (id) {
          labelBody.appendChild(document.createTextNode("#" + id));
        }
        if (classText) {
          labelBody.appendChild(document.createTextNode(classText));
        }
      } else {
        outlineStyle = '2px dashed blue';
        labelBody = document.createTextNode(scrapbook.lang("EditorButtonDOMEraserRemoveEdit"));
      }

      mutationHandler.addIgnoreStartPoint();

      // outline
      for (const elem of scrapbook.getScrapBookObjectElems(lastTarget)) {
        // elements like math doesn't implement the .style property and could throw an error
        if (elem.style) {
          mapMarkedNodes.set(elem, {
            hasStyle: elem.hasAttribute('style'),
            outline: elem.style.getPropertyValue('outline'),
            outlinePriority: elem.style.getPropertyPriority('outline'),
            cursor: elem.style.getPropertyValue('cursor'),
            cursorPriority: elem.style.getPropertyPriority('cursor'),
          });
          elem.style.setProperty('outline', outlineStyle, 'important');
          elem.style.setProperty('cursor', 'pointer', 'important');
        }
      }

      // tooltip
      const labelElem = document.createElement("scrapbook-toolbar-tooltip");
      labelElem.setAttribute('data-scrapbook-elem', 'toolbar-tooltip');
      labelElem.style.setProperty('all', 'initial', 'important');
      labelElem.style.setProperty('position', 'absolute', 'important');
      labelElem.style.setProperty('z-index', '2147483644', 'important');
      labelElem.style.setProperty('display', 'block', 'important');
      labelElem.style.setProperty('border', '2px solid black', 'important');
      labelElem.style.setProperty('border-radius', '6px', 'important');
      labelElem.style.setProperty('padding', '2px 5px 2px 5px', 'important');
      labelElem.style.setProperty('background-color', '#fff0cc', 'important');
      labelElem.style.setProperty('font-size', '12px', 'important');
      labelElem.style.setProperty('font-family', 'sans-serif', 'important');
      labelElem.appendChild(labelBody);
      document.body.appendChild(labelElem);

      const boundingRect = elem.getBoundingClientRect();
      const viewport = scrapbook.getViewport(window);
      const toolbarHeight = editor.internalElement ? editor.internalElement.offsetHeight : 0;
      const availX = viewport.width - labelElem.offsetWidth;
      const availY = viewport.height - toolbarHeight - labelElem.offsetHeight;
      let x = boundingRect.left;
      let y = boundingRect.top - labelElem.offsetHeight;
      if (y < 0 && boundingRect.bottom <= availY) { y = boundingRect.bottom; }
      const anchorPos = scrapbook.getAnchoredPosition(labelElem, {
        clientX: Math.min(Math.max(x, 0), availX),
        clientY: Math.min(Math.max(y, 0), availY),
      }, viewport);
      labelElem.style.setProperty('left', anchorPos.left + 'px', 'important');
      labelElem.style.setProperty('top', anchorPos.top + 'px', 'important');

      mutationHandler.addIgnoreEndPoint();

      tooltipElem = labelElem;
      return lastTarget;
    },

    clearTarget() {
      let elem = lastTarget;
      if (!elem) { return; }

      mutationHandler.addIgnoreStartPoint();

      // outline
      for (const [elem, info] of mapMarkedNodes) {
        // elements like math doesn't implement the .style property and could throw an error
        if (elem.style) {
          elem.style.setProperty('outline', info.outline, info.outlinePriority);
          elem.style.setProperty('cursor', info.cursor, info.cursorPriority);
          if (!elem.getAttribute('style') && !info.hasStyle) { elem.removeAttribute('style'); }
        }
      }
      mapMarkedNodes.clear();

      // tooltip
      if (tooltipElem) {
        tooltipElem.remove();
        tooltipElem = null;
      }

      mutationHandler.addIgnoreEndPoint();

      // unset lastTarget
      lastTarget = null;
    },

    expandTarget() {
      const elem = lastTarget;
      if (!elem) { return; }

      let target = elem.parentElement;
      if (!target || target.matches(SKIP_NODES)) { return; }
      target = this.setTarget(target);
      if (!target) { return; }
      mapExpandStack.set(target, elem);
    },

    shrinkTarget() {
      const elem = lastTarget;
      if (!elem) { return; }

      let target = mapExpandStack.get(elem);
      if (!target) { return; }
      this.setTarget(target);
    },

    eraseTarget() {
      const elem = lastTarget;
      if (!elem) { return; }

      domEraser.clearTarget();
      editor.addHistory();

      let type = editor.removeScrapBookObject(elem);
      if (type <= 0) {
        editor.eraseNode(elem);
      }
    },

    isolateTarget() {
      let elem = lastTarget;
      if (!elem) { return; }

      domEraser.clearTarget();
      editor.addHistory();

      const timeId = scrapbook.dateToId();
      while (!elem.matches(SKIP_NODES)) {
        const parent = elem.parentNode;
        if (!parent) { break; }

        for (const child of parent.childNodes) {
          if (child === elem) { continue; }
          if (child.nodeType === 1 && child.matches(SKIP_NODES)) { continue; }
          editor.eraseNode(child, timeId);
        }

        elem = parent;
      }
    },
  };

  return domEraser;
})();


const htmlEditor = editor.htmlEditor = {
  active: false,

  /**
   * @type invokable
   */
  async toggle({willActive = !this.active} = {}) {
    if (willActive) {
      if (!this.active) {
        this.active = true;
        editor.addHistory();
        document.designMode = "on";
      }
    } else {
      if (this.active) {
        this.active = false;
        document.designMode = "off";
      }
    }
  },

  async strong() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._strong",
      },
    });
  },

  _strong() {
    document.execCommand('bold', false, null);
  },

  async em() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._em",
      },
    });
  },

  _em() {
    document.execCommand('italic', false, null);
  },

  async underline() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._underline",
      },
    });
  },

  _underline() {
    document.execCommand('underline', false, null);
  },

  async strike() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._strike",
      },
    });
  },

  _strike() {
    document.execCommand('strikeThrough', false, null);
  },

  async superscript() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._superscript",
      },
    });
  },

  _superscript() {
    document.execCommand('superscript', false, null);
  },

  async subscript() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._subscript",
      },
    });
  },

  _subscript() {
    document.execCommand('subscript', false, null);
  },

  async color() {
    const frameId = await editor.getFocusedFrameId();
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId,
        cmd: "editor.htmlEditor._color",
      },
    });
  },

  async _color() {
    const sel = scrapbook.getSelection();

    // backup current selection ranges
    const ranges = scrapbook.getSelectionRanges(sel);

    const result = await scrapbook.openModalWindow({
      url: browser.runtime.getURL('editor/color.html'),
      windowCreateData: {width: 400, height: 200},
    });

    // restore selection ranges after await
    sel.removeAllRanges();
    for (const range of ranges) {
      sel.addRange(range);
    }

    if (!result) { return; }

    document.execCommand('styleWithCSS', false, true);
    if (result.fgUse && result.fg) { document.execCommand('foreColor', false, result.fg); }
    if (result.bgUse && result.bg) { document.execCommand('hiliteColor', false, result.bg); }
  },

  async formatBlockP() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockP",
      },
    });
  },

  _formatBlockP() {
    document.execCommand('formatBlock', false, 'p');
  },

  async formatBlockH1() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH1",
      },
    });
  },

  _formatBlockH1() {
    document.execCommand('formatBlock', false, 'h1');
  },

  async formatBlockH2() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH2",
      },
    });
  },

  _formatBlockH2() {
    document.execCommand('formatBlock', false, 'h2');
  },

  async formatBlockH3() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH3",
      },
    });
  },

  _formatBlockH3() {
    document.execCommand('formatBlock', false, 'h3');
  },

  async formatBlockH4() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH4",
      },
    });
  },

  _formatBlockH4() {
    document.execCommand('formatBlock', false, 'h4');
  },

  async formatBlockH5() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH5",
      },
    });
  },

  _formatBlockH5() {
    document.execCommand('formatBlock', false, 'h5');
  },

  async formatBlockH6() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockH6",
      },
    });
  },

  _formatBlockH6() {
    document.execCommand('formatBlock', false, 'h6');
  },

  async formatBlockDiv() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockDiv",
      },
    });
  },

  _formatBlockDiv() {
    document.execCommand('formatBlock', false, 'div');
  },

  async formatBlockPre() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._formatBlockPre",
      },
    });
  },

  _formatBlockPre() {
    document.execCommand('formatBlock', false, 'pre');
  },

  async listUnordered() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._listUnordered",
      },
    });
  },

  _listUnordered() {
    document.execCommand('insertUnorderedList', false, null);
  },

  async listOrdered() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._listOrdered",
      },
    });
  },

  _listOrdered() {
    document.execCommand('insertOrderedList', false, null);
  },

  async outdent() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._outdent",
      },
    });
  },

  _outdent() {
    document.execCommand('outdent', false, null);
  },

  async indent() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._indent",
      },
    });
  },

  _indent() {
    document.execCommand('indent', false, null);
  },

  async justifyLeft() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._justifyLeft",
      },
    });
  },

  _justifyLeft() {
    document.execCommand('justifyLeft', false, null);
  },

  async justifyCenter() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._justifyCenter",
      },
    });
  },

  _justifyCenter() {
    document.execCommand('justifyCenter', false, null);
  },

  async justifyRight() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._justifyRight",
      },
    });
  },

  _justifyRight() {
    document.execCommand('justifyRight', false, null);
  },

  async justifyFull() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._justifyFull",
      },
    });
  },

  _justifyFull() {
    document.execCommand('justifyFull', false, null);
  },

  async createLink() {
    const frameId = await editor.getFocusedFrameId();
    const url = prompt(scrapbook.lang('EditorButtonHtmlEditorCreateLinkPrompt'));
    if (!url) { return; }
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId,
        cmd: "editor.htmlEditor._createLink",
        args: {url},
      },
    });
  },

  _createLink({url}) {
    document.execCommand('createLink', false, url);
  },

  async hr() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._hr",
      },
    });
  },

  _hr() {
    document.execCommand('insertHorizontalRule', false, null);
  },

  async todo() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._todo",
      },
    });
  },

  _todo() {
    document.execCommand('insertHTML', false, '<input type="checkbox" data-scrapbook-elem="todo"/>');
  },

  async insertDate() {
    const format = scrapbook.getOption("editor.insertDateFormat");
    const isUtc = scrapbook.getOption("editor.insertDateFormatIsUtc");
    const dateStr = Strftime.format(format, {isUtc});
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._insertDate",
        args: {dateStr},
      },
    });
  },

  _insertDate({dateStr}) {
    document.execCommand('insertText', false, dateStr);
  },

  async insertHtml() {
    const frameId = await editor.getFocusedFrameId();

    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId,
        cmd: "editor.htmlEditor._insertHtml",
      },
    });
  },

  async _insertHtml() {
    const sel = scrapbook.getSelection();

    // backup current selection ranges
    const ranges = scrapbook.getSelectionRanges(sel);

    const collapsed = ranges[0].collapsed;

    const data = {
      preTag: "",
      preContext: "",
      value: "",
      postContext: "",
      postTag: "",
    };

    let ac;
    if (!collapsed) {
      // get selection area to edit
      const range = ranges[0];
      ac = getReplaceableNode(range.commonAncestorContainer);
      const source = ac.outerHTML;
      const sourceInner = ac.innerHTML;
      const istart = source.lastIndexOf(sourceInner, source.lastIndexOf('<'));
      const start = scrapbook.getOffsetInSource(ac, range.startContainer, range.startOffset);
      const end = scrapbook.getOffsetInSource(ac, range.endContainer, range.endOffset);
      const iend = istart + sourceInner.length;
      data.preTag = source.substring(0, istart);
      data.preContext = source.substring(istart, start);
      data.value = source.substring(start, end);
      data.postContext = source.substring(end, iend);
      data.postTag = source.substring(iend);
    }

    const result = await scrapbook.openModalWindow({
      url: browser.runtime.getURL('editor/insert-html.html'),
      args: data,
      windowCreateData: {width: 600, height: 600},
    });

    // restore selection ranges after await
    sel.removeAllRanges();
    for (const range of ranges) {
      sel.addRange(range);
    }

    if (!result) { return; }

    let html;
    if (!collapsed) {
      const range = document.createRange();

      // replace the whole tag in some cases to prevent a bad result
      if (["TABLE", "A"].includes(ac.nodeName)) {
        html = data.preTag + result.preContext + result.value + result.postContext + data.postTag;
        range.selectNode(ac);
      } else {
        html = result.preContext + result.value + result.postContext;
        range.selectNodeContents(ac);
      }

      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      html = result.value;
    }

    document.execCommand("insertHTML", false, html);

    function getReplaceableNode(node) {
      // replacing these nodes could get a bad and not-undoable result
      const forbiddenList = ["#text", "THEAD", "TBODY", "TFOOT", "TR"];
      while (forbiddenList.includes(node.nodeName)) {
        node = node.parentNode;
      }
      return node;
    }
  },

  async removeFormat() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._removeFormat",
      },
    });
  },

  _removeFormat() {
    document.execCommand('removeFormat', false, null);
  },

  async unlink() {
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.htmlEditor._unlink",
      },
    });
  },

  _unlink() {
    document.execCommand('unlink', false, null);
  },
};


const mutationHandler = editor.mutationHandler = (function () {
  const MUTATION_COMMAND_NAME = 'scrapbook-command';

  const MUTATION_OBSERVER_OPTIONS = {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
  };

  const MUTATION_OBSERVER = new MutationObserver((mutationList, observer) => {
    for (const mutation of mutationList) {
      mutationHandler.history.push(mutation);
    }
  });

  const mutationHandler = {
    active: true,
    history: [],

    /**
     * @type invokable
     */
    toggle({willActive = !this.active} = {}) {
      if (willActive) {
        if (!this.active) {
          this.active = true;
        }
      } else {
        if (this.active) {
          this.active = false;
          this.flushPendingMutations();
          MUTATION_OBSERVER.disconnect();
          this.history = [];
        }
      }
    },

    flushPendingMutations() {
      for (const entry of MUTATION_OBSERVER.takeRecords()) {
        this.history.push(entry);
      }
    },

    /**
     * Start the special mode, in which ignored mutations can be defined.
     *
     * All ignored mutations should sum up to null mutation when
     * the special mode ends.
     */
    startSpecialMode() {
      if (!this.active) { return; }

      this.flushPendingMutations();

      // start observing since first add
      if (!this.history.length) {
        MUTATION_OBSERVER.observe(document.body, MUTATION_OBSERVER_OPTIONS);
      }

      this.history.push({
        type: MUTATION_COMMAND_NAME,
        name: 'special',
        timestamp: Date.now(),
      });
    },

    /**
     * End special mode and tidy ignored mutations out of the history.
     */
    endSpecialMode() {
      if (!this.active) { return; }
      if (!this.history.length) { return; }

      this.flushPendingMutations();

      let i = this.history.length - 1;
      while (i >= 0) {
        const entry = this.history[i];
        if (entry.type === MUTATION_COMMAND_NAME && entry.name === 'special') {
          break;
        }
        i--;
      }
      if (i < 0) { return; }

      const targetPoint = i;

      // disconnect mutation observer
      MUTATION_OBSERVER.disconnect();

      // tidy ignored history during special mode
      const historyTidied = [];
      let ignoring = false;
      for (i = this.history.length - 1; i >= targetPoint; i--) {
        const entry = this.history.pop();
        if (entry.type === MUTATION_COMMAND_NAME) {
          if (entry.name === 'ignore-end') {
            ignoring = true;
            continue;
          }
          if (entry.name === 'ignore-start') {
            ignoring = false;
            continue;
          }
          if (entry.name === 'special') {
            break;
          }
        }

        if (!ignoring) {
          historyTidied.push(entry);
        }
      }

      for (const entry of historyTidied.reverse()) {
        this.history.push(entry);
      }

      // re-observe if there are still history
      if (this.history.length) {
        MUTATION_OBSERVER.observe(document.body, MUTATION_OBSERVER_OPTIONS);
      }
    },

    addIgnoreStartPoint() {
      if (!this.active) { return; }
      if (!this.history.length) { return; }

      this.flushPendingMutations();

      this.history.push({
        type: MUTATION_COMMAND_NAME,
        name: 'ignore-start',
        timestamp: Date.now(),
      });
    },

    addIgnoreEndPoint() {
      if (!this.active) { return; }
      if (!this.history.length) { return; }

      this.flushPendingMutations();

      this.history.push({
        type: MUTATION_COMMAND_NAME,
        name: 'ignore-end',
        timestamp: Date.now(),
      });
    },

    addRestorePoint() {
      if (!this.active) { return; }

      this.flushPendingMutations();

      // start observing since first add
      if (!this.history.length) {
        MUTATION_OBSERVER.observe(document.body, MUTATION_OBSERVER_OPTIONS);
      }

      this.history.push({
        type: MUTATION_COMMAND_NAME,
        name: 'point',
        timestamp: Date.now(),
      });
    },

    applyRestorePoint() {
      if (!this.active) { return; }
      if (!this.history.length) { return; }

      this.flushPendingMutations();

      let i = this.history.length - 1;
      while (i >= 0) {
        const entry = this.history[i];
        if (entry.type === MUTATION_COMMAND_NAME && entry.name === 'point') {
          break;
        }
        i--;
      }
      if (i < 0) { return; }

      const targetPoint = i;

      // disconnect mutation observer
      MUTATION_OBSERVER.disconnect();

      // apply restore point
      for (i = this.history.length - 1; i >= targetPoint; i--) {
        const entry = this.history.pop();
        if (entry.type === MUTATION_COMMAND_NAME) { continue; }

        switch (entry.type) {
          case 'attributes': {
            if (entry.oldValue === null) {
              entry.target.removeAttributeNS(entry.attributeNamespace, entry.attributeName);
            } else {
              entry.target.setAttributeNS(entry.attributeNamespace, entry.attributeName, entry.oldValue);
            }
            break;
          }
          case 'characterData': {
            entry.target.textContent = entry.oldValue;
            break;
          }
          case 'childList': {
            if (entry.addedNodes.length) {
              for (const node of entry.addedNodes) {
                node.remove();
              }
            }

            if (entry.removedNodes.length) {
              for (const node of entry.removedNodes) {
                entry.target.insertBefore(node, entry.nextSibling);
              }
            }

            break;
          }
        }
      }

      // re-observe if there are still history
      if (this.history.length) {
        MUTATION_OBSERVER.observe(document.body, MUTATION_OBSERVER_OPTIONS);
      }
    },

    addSavePoint() {
      if (!this.active) { return; }
      if (!this.history.length) { return; }

      this.flushPendingMutations();

      this.history.push({
        type: MUTATION_COMMAND_NAME,
        name: 'save',
        timestamp: Date.now(),
      });
    },
  };

  return mutationHandler;
})();


window.addEventListener("focus", (event) => {
  // in Firefox, window of the content script is a sandbox object,
  // so use document.defaultView instead.
  if (event.target === document.defaultView) {
    editor.lastWindowFocusTime = Date.now();
  } else if (event.target.closest && event.target.closest('scrapbook-toolbar')) {
    editor.directToolbarClick = Date.now() - editor.lastWindowFocusTime < 50;
  }
}, {capture: true, passive: true});

window.addEventListener("blur", (event) => {
  if (event.target === document.defaultView) {
    editor.lastWindowBlurTime = Date.now();
  }
}, {capture: true, passive: true});

return editor;

}));
