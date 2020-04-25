/******************************************************************************
 *
 * Content script for editor functionality.
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('editor')) { return; }
  root.editor = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, document, console) {

  'use strict';

  const LINEMARKABLE_ELEMENTS = `img, picture, canvas, input[type="image"]`;

  const editor = {
    element: null,
    internalElement: null,
    inScrapBook: false,
    isScripted: false,
    serverUrl: null,
    erasedContents: new WeakMap(),
    history: [],
    lastWindowFocusTime: -1,
    lastWindowBlurTime: -1,
    directToolbarClick: false,

    get active() {
      return document.documentElement.hasAttribute('data-scrapbook-toolbar-active');
    },

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


  /****************************************************************************
   * Invokables
   ***************************************************************************/

  /**
   * @kind invokable
   */
  editor.init = async function ({willActive, force = false}) {
    if (typeof willActive === "undefined") {
      willActive = !editor.active;
    }

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
        await server.init(true);
        const bookId = await server.findBookIdFromUrl(document.URL);
        if (typeof bookId === 'undefined') {
          editor.inScrapBook = false;
          if (!force) {
            return;
          }
        }
      } catch (ex) {}
    }

    // generate toolbar content
    const uid = 'scrapbook-' + scrapbook.getUuid();
    let wrapper = editor.element = document.documentElement.appendChild(document.createElement("scrapbook-toolbar"));
    wrapper.id = uid;
    wrapper.setAttribute('dir', scrapbook.lang('@@bidi_dir'));

    // Attach a shadowRoot if supported; otherwise fallback with an ID selector.
    let sHost;
    let sRoot;
    if (wrapper.attachShadow) {
      editor.internalElement = wrapper = wrapper.attachShadow({mode: 'open'});
      sHost = `:host`;
      sRoot = '';
    } else {
      editor.internalElement = wrapper;
      sHost = `#${uid}`;
      sRoot = `#${uid} `;
    }

    // this needs to be XHTML compatible
    wrapper.innerHTML = `\
<style>
${sHost} {
  all: initial !important;
  position: fixed !important;
  display: block !important;
  ${scrapbook.lang('@@bidi_start_edge')}: 0px !important;
  bottom: 0px !important;
  width: 100% !important;
  height: 32px !important;
  z-index: 2147483645 !important;
}

${sHost} style {
  display: none !important;
}

${sRoot}*:not(scrapbook-toolbar-samp) {
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

${sRoot}scrapbook-toolbar-samp {
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
  background-size: 16px 16px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

${sRoot}.toolbar > div > button:enabled {
  cursor: pointer !important;
}

${sRoot}.toolbar > div > button:enabled:hover,
${sRoot}.toolbar > div > button:enabled:focus {
  border-color: #CCC !important;
  background-color: #FFF !important;
}

${sRoot}.toolbar > div > button:enabled:active {
  border-style: inset !important;
}

${sRoot}.toolbar > div > button:disabled {
  filter: grayscale(100%) !important;
  opacity: 0.3 !important;
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

${sRoot}.toolbar .toolbar-domEraser > button:first-of-type {
  background-image: url("${browser.runtime.getURL("resources/edit-dom-eraser.png")}") !important;
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
  padding: 1px !important;
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
}

${sRoot}.toolbar > div > ul > li > button:enabled:focus {
  outline: 1px solid rgba(125, 162, 206, 0.8) !important;
  background: linear-gradient(rgba(235, 244, 253, 0.3), rgba(196, 221, 252, 0.8)) !important;
}

${sRoot}.toolbar > div > ul > li > button:enabled:hover {
  background-color: rgba(202, 202, 202, 0.8) !important;
}

${sRoot}.toolbar > div > ul > li > button:enabled:active {
  background-image: radial-gradient(rgba(0, 0, 0, 0.9), rgba(64, 64, 64, 0.9)) !important;
  color: #FFFFFF !important;
}

${sRoot}.toolbar > div > ul > li > button:disabled {
  filter: grayscale(100%) !important;
  opacity: 0.3 !important;
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
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [1])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [2])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [3])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [4])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [5])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [6])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [7])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [8])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [9])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [10])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [11])}</scrapbook-toolbar-samp></button></li>
      <li><button><scrapbook-toolbar-samp>${scrapbook.lang('EditorButtonMarkerItem', [12])}</scrapbook-toolbar-samp></button></li>
    </ul>
  </div>
  <div class="toolbar-eraser" title="${scrapbook.lang('EditorButtonEraser')}">
    <button></button><button></button>
    <ul hidden="" title="">
      <li><button class="toolbar-eraser-eraseSelection">${scrapbook.lang('EditorButtonEraserSelection')}</button></li>
      <li><button class="toolbar-eraser-eraseSelector">${scrapbook.lang('EditorButtonEraserSelector')}</button></li>
      <li><button class="toolbar-eraser-eraseSelectorAll">${scrapbook.lang('EditorButtonEraserSelectorAll')}</button></li>
      <hr/>
      <li><button class="toolbar-eraser-uneraseSelection">${scrapbook.lang('EditorButtonEraserRevertSelection')}</button></li>
      <li><button class="toolbar-eraser-uneraseAll">${scrapbook.lang('EditorButtonEraserRevertAll')}</button></li>
      <hr/>
      <li><button class="toolbar-eraser-removeEditsSelected">${scrapbook.lang('EditorButtonRemoveEditsSelection')}</button></li>
      <li><button class="toolbar-eraser-removeEditsAll">${scrapbook.lang('EditorButtonRemoveEditsAll')}</button></li>
    </ul>
  </div>
  <div class="toolbar-domEraser" title="${scrapbook.lang('EditorButtonDomEraser')}">
    <button></button>
  </div>
  <div class="toolbar-htmlEditor" title="${scrapbook.lang('EditorButtonHtmlEditor')}">
    <button></button><button disabled=""></button>
    <ul hidden="" title="">
      <li><button class="toolbar-htmlEditor-strong">${scrapbook.lang('EditorButtonHtmlEditorStrong')}</button></li>
      <li><button class="toolbar-htmlEditor-em">${scrapbook.lang('EditorButtonHtmlEditorEm')}</button></li>
      <li><button class="toolbar-htmlEditor-underline">${scrapbook.lang('EditorButtonHtmlEditorUnderline')}</button></li>
      <li><button class="toolbar-htmlEditor-strike">${scrapbook.lang('EditorButtonHtmlEditorStrike')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-superscript">${scrapbook.lang('EditorButtonHtmlEditorSuperscript')}</button></li>
      <li><button class="toolbar-htmlEditor-subscript">${scrapbook.lang('EditorButtonHtmlEditorSubscript')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-fgColor">${scrapbook.lang('EditorButtonHtmlEditorFgColor')}</button></li>
      <li><button class="toolbar-htmlEditor-bgColor">${scrapbook.lang('EditorButtonHtmlEditorBgColor')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-formatBlockP">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockP')}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH1">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [1])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH2">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [2])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH3">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [3])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH4">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [4])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH5">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [5])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockH6">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockH', [6])}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockDiv">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockDiv')}</button></li>
      <li><button class="toolbar-htmlEditor-formatBlockPre">${scrapbook.lang('EditorButtonHtmlEditorFormatBlockPre')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-listUnordered">${scrapbook.lang('EditorButtonHtmlEditorListUnordered')}</button></li>
      <li><button class="toolbar-htmlEditor-listOrdered">${scrapbook.lang('EditorButtonHtmlEditorListOrdered')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-outdent">${scrapbook.lang('EditorButtonHtmlEditorOutdent')}</button></li>
      <li><button class="toolbar-htmlEditor-indent">${scrapbook.lang('EditorButtonHtmlEditorIndent')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-justifyLeft">${scrapbook.lang('EditorButtonHtmlEditorJustifyLeft')}</button></li>
      <li><button class="toolbar-htmlEditor-justifyCenter">${scrapbook.lang('EditorButtonHtmlEditorJustifyCenter')}</button></li>
      <li><button class="toolbar-htmlEditor-justifyRight">${scrapbook.lang('EditorButtonHtmlEditorJustifyRight')}</button></li>
      <li><button class="toolbar-htmlEditor-justifyFull">${scrapbook.lang('EditorButtonHtmlEditorJustifyFull')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-createLink">${scrapbook.lang('EditorButtonHtmlEditorCreateLink')}</button></li>
      <li><button class="toolbar-htmlEditor-hr">${scrapbook.lang('EditorButtonHtmlEditorHr')}</button></li>
      <li><button class="toolbar-htmlEditor-todo">${scrapbook.lang('EditorButtonHtmlEditorTodo')}</button></li>
      <li><button class="toolbar-htmlEditor-insertDate">${scrapbook.lang('EditorButtonHtmlEditorInsertDate')}</button></li>
      <li><button class="toolbar-htmlEditor-insertHtml">${scrapbook.lang('EditorButtonHtmlEditorInsertHtml')}</button></li>
      <hr/>
      <li><button class="toolbar-htmlEditor-removeFormat">${scrapbook.lang('EditorButtonHtmlEditorRemoveFormat')}</button></li>
      <li><button class="toolbar-htmlEditor-unlink">${scrapbook.lang('EditorButtonHtmlEditorUnlink')}</button></li>
    </ul>
  </div>
  <div class="toolbar-undo" title="${scrapbook.lang('EditorButtonUndo')}">
    <button></button>
  </div>
  <div class="toolbar-save" title="${scrapbook.lang('EditorButtonSave')}">
    <button></button><button></button>
    <ul hidden="" title="">
      <li><button class="toolbar-save-deleteErased">${scrapbook.lang('EditorButtonSaveDeleteErased')}</button></li>
      <li><button class="toolbar-save-internalize">${scrapbook.lang('EditorButtonSaveInternalize')}</button></li>
    </ul>
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
    elem.addEventListener("click", async (event) => {
      await editor.updateLineMarkers();
      const marker = wrapper.querySelector('.toolbar-marker ul button[checked] scrapbook-toolbar-samp');
      editor.lineMarker(marker.getAttribute('style'));
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-marker > button:last-of-type');
    elem.addEventListener("click", async (event) => {
      const elem = event.currentTarget;
      await editor.updateLineMarkers();
      editor.showContextMenu(elem.parentElement.querySelector('ul'));
    }, {passive: true});

    for (const elem of wrapper.querySelectorAll('.toolbar-marker ul button')) {
      elem.addEventListener("click", (event) => {
        const elem = event.currentTarget;
        const idx = Array.prototype.indexOf.call(wrapper.querySelectorAll('.toolbar-marker ul button'), elem);
        scrapbook.cache.set(editor.getStatusKey('lineMarkerSelected'), idx, 'storage'); // async
        editor.lineMarker(elem.querySelector('scrapbook-toolbar-samp').getAttribute('style'));
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

    var elem = wrapper.querySelector('.toolbar-eraser-eraseSelectorAll');
    elem.addEventListener("click", (event) => {
      editor.eraseSelector(true);
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-eraser-uneraseSelection');
    elem.addEventListener("click", (event) => {
      editor.uneraseNodes();
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-eraser-uneraseAll');
    elem.addEventListener("click", (event) => {
      editor.uneraseAllNodes();
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-eraser-removeEditsSelected');
    elem.addEventListener("click", (event) => {
      editor.removeEdits();
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-eraser-removeEditsAll');
    elem.addEventListener("click", (event) => {
      editor.removeAllEdits();
    }, {passive: true});

    // DOMEraser
    var elem = wrapper.querySelector('.toolbar-domEraser > button:first-of-type');
    elem.addEventListener("click", (event) => {
      editor.toggleDomEraser();
    }, {passive: true});

    // htmlEditor
    var elem = wrapper.querySelector('.toolbar-htmlEditor > button:first-of-type');
    elem.addEventListener("click", (event) => {
      editor.toggleHtmlEditor();
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor > button:last-of-type');
    elem.addEventListener("click", (event) => {
      editor.updateHtmlEditorMenu();
      editor.showContextMenu(event.currentTarget.parentElement.querySelector('ul'));
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-strong');
    elem.addEventListener("click", htmlEditor.strong, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-em');
    elem.addEventListener("click", htmlEditor.em, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-underline');
    elem.addEventListener("click", htmlEditor.underline, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-strike');
    elem.addEventListener("click", htmlEditor.strike, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-superscript');
    elem.addEventListener("click", htmlEditor.superscript, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-subscript');
    elem.addEventListener("click", htmlEditor.subscript, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-fgColor');
    elem.addEventListener("click", htmlEditor.foreColor, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-bgColor');
    elem.addEventListener("click", htmlEditor.hiliteColor, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockP');
    elem.addEventListener("click", htmlEditor.formatBlockP, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH1');
    elem.addEventListener("click", htmlEditor.formatBlockH1, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH2');
    elem.addEventListener("click", htmlEditor.formatBlockH2, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH3');
    elem.addEventListener("click", htmlEditor.formatBlockH3, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH4');
    elem.addEventListener("click", htmlEditor.formatBlockH4, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH5');
    elem.addEventListener("click", htmlEditor.formatBlockH5, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockH6');
    elem.addEventListener("click", htmlEditor.formatBlockH6, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockDiv');
    elem.addEventListener("click", htmlEditor.formatBlockDiv, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-formatBlockPre');
    elem.addEventListener("click", htmlEditor.formatBlockPre, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-listUnordered');
    elem.addEventListener("click", htmlEditor.listUnordered, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-listOrdered');
    elem.addEventListener("click", htmlEditor.listOrdered, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-outdent');
    elem.addEventListener("click", htmlEditor.outdent, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-indent');
    elem.addEventListener("click", htmlEditor.indent, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-justifyLeft');
    elem.addEventListener("click", htmlEditor.justifyLeft, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-justifyCenter');
    elem.addEventListener("click", htmlEditor.justifyCenter, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-justifyRight');
    elem.addEventListener("click", htmlEditor.justifyRight, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-justifyFull');
    elem.addEventListener("click", htmlEditor.justifyFull, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-createLink');
    elem.addEventListener("click", htmlEditor.createLink, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-hr');
    elem.addEventListener("click", htmlEditor.hr, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-todo');
    elem.addEventListener("click", htmlEditor.todo, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-insertDate');
    elem.addEventListener("click", htmlEditor.insertDate, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-insertHtml');
    elem.addEventListener("click", htmlEditor.insertHtml, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-removeFormat');
    elem.addEventListener("click", htmlEditor.removeFormat, {passive: true});

    var elem = wrapper.querySelector('.toolbar-htmlEditor-unlink');
    elem.addEventListener("click", htmlEditor.unlink, {passive: true});

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

    var elem = wrapper.querySelector('.toolbar-save > button:last-of-type');
    elem.addEventListener("click", (event) => {
      editor.showContextMenu(event.currentTarget.parentElement.querySelector('ul'));
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-save-deleteErased');
    elem.addEventListener("click", (event) => {
      editor.deleteErased();
    }, {passive: true});

    var elem = wrapper.querySelector('.toolbar-save-internalize');
    elem.addEventListener("click", (event) => {
      editor.save({internalize: true});
    }, {passive: true});
    elem.disabled = !editor.inScrapBook;

    // close
    var elem = wrapper.querySelector('.toolbar-close');
    elem.addEventListener("click", (event) => {
      event.preventDefault();
      editor.close();
    });

    return editor.open();
  };

  /**
   * @kind invokable
   */
  editor.lineMarkerInternal = function ({tagName = 'span', attrs = {}}) {
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
        }
        range.setEndAfter(endNode);
      }

      const selectedNodes = scrapbook.getSelectedNodes({
        range,
        whatToShow: NodeFilter.SHOW_ELEMENT + NodeFilter.SHOW_TEXT,
        nodeFilter: node => node.nodeType === 3 || node.matches(LINEMARKABLE_ELEMENTS),
      });

      // reverse the order as a range may be altered when changing a node before it
      let firstWrapper = null;
      let lastWrapper = null;
      for (const node of selectedNodes.reverse()) {
        if (node.nodeType === 3 && /^[ \f\n\r\t\v]*$/.test(node.nodeValue)) {
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

  /**
   * @kind invokable
   */
  editor.eraseNodesInternal = function () {
    editor.addHistory();

    // reverse the order as a range may be altered when changing a node before it
    const timeId = scrapbook.dateToId();
    for (const range of scrapbook.getSafeSelectionRanges().reverse()) {
      if (!range.collapsed) {
        editor.eraseRange(range, timeId);
      }
    }
  };

  /**
   * @kind invokable
   */
  editor.eraseSelectorInternal = function ({selector}) {
    const FORBID_NODES = `\
html, head, body,
scrapbook-toolbar, scrapbook-toolbar *,
[data-scrapbook-elem="basic-loader"],
[data-scrapbook-elem="shadowroot-loader"],
[data-scrapbook-elem="canvas-loader"]`;
    const fn = editor.eraseSelectorInternal = ({selector}) => {
      editor.addHistory();

      const timeId = scrapbook.dateToId();
      const elems = document.querySelectorAll(selector);

      // handle descendant node first as it may be altered when handling ancestor
      for (const elem of Array.from(elems).reverse()) {
        if (elem.matches(FORBID_NODES)) { continue; }

        editor.eraseNode(elem, timeId);
      }
    };
    return fn({selector});
  };

  /**
   * @kind invokable
   */
  editor.uneraseNodesInternal = function ({}) {
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
   * @kind invokable
   */
  editor.uneraseAllNodesInternal = function ({}) {
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
        if (editor.removeScrapBookObject(elem) !== -1) {
          unerased = true;
        }
      }

      return unerased;
    };

    while (unerase()) {};
  };

  /**
   * @kind invokable
   */
  editor.removeEditsInternal = function ({}) {
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
   * @kind invokable
   */
  editor.removeAllEditsInternal = function ({}) {
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
   * @kind invokable
   */
  editor.undoInternal = function ({}) {
    if (!editor.history.length) { return; }
    if (!document.body) { return; }

    document.body.parentNode.replaceChild(editor.history.pop(), document.body);
  };

  /**
   * @kind invokable
   */
  editor.deleteErasedInternal = function ({}) {
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
    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        frameId: await editor.getFocusedFrameId(),
        cmd: "editor.lineMarkerInternal",
        args: {
          tagName: 'span',
          attrs: {
            'data-scrapbook-id': scrapbook.dateToId(),
            'data-scrapbook-elem': 'linemarker',
            'style': style,
          },
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

  editor.toggleDomEraser = async function (willActive) {
    const editElem = editor.internalElement.querySelector('.toolbar-domEraser > button');

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
          '.toolbar-marker > button',
          '.toolbar-eraser > button',
          '.toolbar-htmlEditor > button',
          '.toolbar-undo > button',
          '.toolbar-save > button',
        ].join(','))) {
      elem.disabled = willActive;
    }

    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        cmd: "editor.domEraser.toggle",
        args: {willActive},
      },
    });
  };

  editor.toggleHtmlEditor = async function (willActive) {
    const editElem = editor.internalElement.querySelector('.toolbar-htmlEditor > button');

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

    editor.internalElement.querySelector('.toolbar-htmlEditor > button:last-of-type').disabled = !willActive;
    for (const elem of editor.internalElement.querySelectorAll([
          '.toolbar-marker > button',
          '.toolbar-eraser > button',
          '.toolbar-domEraser > button',
          '.toolbar-undo > button'
        ].join(','))) {
      elem.disabled = willActive;
    }

    return await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        cmd: "editor.htmlEditor.toggle",
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
    if (editor.inScrapBook) {
      // prompt a confirm if this page is scripted
      if (editor.isScripted) {
        if (!confirm(scrapbook.lang("EditConfirmScriptedDocument"))) {
          return;
        }
      }

      return await scrapbook.invokeExtensionScript({
        cmd: "background.captureCurrentTab",
        args: {mode: params.internalize ? "internalize" : "resave"},
      });
    } else {
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

  editor.open = async function () {
    if (editor.active) { return; }

    document.documentElement.setAttribute('data-scrapbook-toolbar-active', '');
    document.documentElement.appendChild(editor.element);
  };

  editor.close = async function () {
    if (!editor.active) { return; }

    document.documentElement.removeAttribute('data-scrapbook-toolbar-active');
    editor.element.remove();
    await editor.toggleDomEraser(false);
    await editor.toggleHtmlEditor(false);
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

    // Focus on the context menu element for focusout event to work when the user
    // clicks outside.
    const sel = window.getSelection();
    const wasCollapsed = sel.isCollapsed;
    const ranges = scrapbook.getSelectionRanges();

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
    const LOADER_TYPES = new Set([
      "basic-loader",
      "shadowroot-loader", // WebScrapBook < 0.69
      "canvas-loader", // WebScrapBook < 0.69
    ]);

    for (const fdoc of scrapbook.flattenFrames(doc)) {
      for (const elem of fdoc.querySelectorAll("*")) {
        // check <script> elements
        if (elem.nodeName.toLowerCase() === 'script') {
          if (SCRIPT_TYPES.has(elem.type.toLowerCase()) &&
              !LOADER_TYPES.has(scrapbook.getScrapbookObjectType(elem))) {
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
    Array.prototype.forEach.call(
      editor.internalElement.querySelectorAll('.toolbar-marker ul scrapbook-toolbar-samp'),
      (elem, i) => {
        let style = scrapbook.getOption(`editor.lineMarker.style.${i + 1}`);
        elem.setAttribute('style', style);
        elem.title = style;
      });

    const buttons = Array.from(editor.internalElement.querySelectorAll('.toolbar-marker ul button'));
    buttons.forEach((elem) => {
      elem.removeAttribute('checked');
    });
    let idx = await scrapbook.cache.get(editor.getStatusKey('lineMarkerSelected'), 'storage');
    idx = Math.min(parseInt(idx, 10) || 0, buttons.length - 1);
    buttons[idx].setAttribute('checked', '');
  };

  editor.updateHtmlEditorMenu = function () {
    {
      const elem = editor.internalElement.querySelector('.toolbar-htmlEditor-insertDate');
      const format = scrapbook.getOption("editor.insertDateFormat");
      const sample = strftime(format);
      elem.title = format + '\n' + sample;
    }
  };

  editor.getFocusedFrameId = async function () {
    if (!editor.directToolbarClick) {
      return 0;
    }

    const arr = await scrapbook.invokeExtensionScript({
      cmd: "background.invokeEditorCommand",
      args: {
        code: "({frameId: core.frameId, time: editor.lastWindowBlurTime})",
        frameIdExcept: 0,
      },
    });

    const lastFrame = arr.reduce((acc, cur) => {
      if (cur) {
        cur = cur[0];
        if (cur.time > acc.time) {
          return cur;
        }
      }
      return acc;
    }, {frameId: 0, time: -1});

    if (lastFrame.frameId !== 0 && editor.lastWindowFocusTime - lastFrame.time < 50) {
      return lastFrame.frameId;
    }

    return 0;
  };

  editor.eraseRange = function (range, timeId = scrapbook.dateToId()) {
    const doc = range.commonAncestorContainer.ownerDocument;
    const wrapper = doc.createElement('scrapbook-erased');
    range.surroundContents(wrapper);
    const comment = document.createComment(`scrapbook-erased-${timeId}=${scrapbook.escapeHtmlComment(wrapper.innerHTML)}`);
    editor.erasedContents.set(comment, wrapper);
    wrapper.parentNode.replaceChild(comment, wrapper);
  };

  editor.eraseNode = function (node, timeId = scrapbook.dateToId()) {
    const range = new Range();
    range.selectNode(node);
    return editor.eraseRange(range, timeId);
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
    let type = scrapbook.getScrapBookObjectRemoveType(elem);
    switch (type) {
      case 1: {
        for (const part of scrapbook.getScrapBookObjectsById(elem)) {
          part.remove();
        }
        break;
      }
      case 2: {
        for (const part of scrapbook.getScrapBookObjectsById(elem)) {
          scrapbook.unwrapElement(part);
        }
        break;
      }
      case 3: {
        let wrapper = editor.erasedContents.get(elem);

        // if the erased nodes are still in the stack, recover it
        if (wrapper) {
          const frag = elem.ownerDocument.createDocumentFragment();
          let child;
          while (child = wrapper.firstChild) { frag.appendChild(child); }
          elem.parentNode.replaceChild(frag, elem);
          break;
        }

        // otherwise, recover from recorded HTML
        const m = elem.nodeValue.match(/^.+?=([\s\S]*)$/);
        if (m) {
          const doc = elem.ownerDocument;
          const parent = elem.parentNode;
          const t = doc.createElement('template');
          t.innerHTML = scrapbook.unescapeHtmlComment(m[1]);
          parent.replaceChild(doc.importNode(t.content, true), elem);
          parent.normalize();
        } else {
          // this shouldn't happen
          return -1;
        }
        break;
      }
    }
    return type;
  };

  editor.addHistory = () => {
    if (!document.body) { return; }

    editor.history.push(document.body.cloneNode(true));
  };


  const domEraser = editor.domEraser = (function () {
    const FORBID_NODES = `scrapbook-toolbar, scrapbook-toolbar *`;
    const TOOLTIP_NODES = `scrapbook-toolbar-tooltip, scrapbook-toolbar-tooltip *`;
    const SKIP_NODES = `html, head, body, ${FORBID_NODES}, ${TOOLTIP_NODES}`;

    const mapElemOutline = new WeakMap();
    const mapElemOutlinePriority = new WeakMap();
    const mapElemCursor = new WeakMap();
    const mapElemCursorPriority = new WeakMap();
    const mapElemHadStyleAttr = new WeakMap();
    const mapElemTooltip = new WeakMap();

    let lastTarget = null;
    let lastTouchTarget = null;
    let tooltipElem = null;

    const onTouchStart = (event) => {
      lastTouchTarget = event.target;
    };

    const onMouseOver = (event) => {
      let elem = event.target;
      if (elem.matches(SKIP_NODES)) { return; }

      event.preventDefault();
      event.stopPropagation();

      // don't set target for a simulated mouseover for a touch,
      // so that the click event will reset the target as it gets no lastTarget.
      if (elem === lastTouchTarget) { return; }

      elem = domEraser.adjustTarget(elem);
      domEraser.setTarget(elem);
    };

    const onMouseOut = (event) => {
      if (event.target.matches(FORBID_NODES)) { return; }

      // don't consider a true mouseout when the mouse moves into the tooltip
      if (event.relatedTarget && event.relatedTarget.matches(TOOLTIP_NODES)) { return; }

      event.preventDefault();
      event.stopPropagation();

      domEraser.clearTarget();
    };

    const onMouseDown = (event) => {
      if (event.button !== 1) { return; }
      if (event.target.matches(FORBID_NODES)) { return; }

      event.preventDefault();
      event.stopPropagation();

      const elem = lastTarget;
      if (!elem) { return; }
      domEraser.isolateTarget(elem);
    };

    const onClick = (event) => {
      if (event.target.matches(FORBID_NODES)) { return; }

      event.preventDefault();
      event.stopPropagation();

      const elem = lastTarget;
      const target = domEraser.adjustTarget(event.target);

      // domEraser may happen if it's a keybord enter or touch,
      // reset the target rather than performing the erase.
      if (target !== elem && !target.matches(FORBID_NODES) && !target.matches(TOOLTIP_NODES)) {
        if (target.matches(SKIP_NODES)) { return; }
        domEraser.setTarget(target);
        return;
      }

      if (!elem) { return; }

      if (event.ctrlKey) {
        domEraser.isolateTarget(elem);
      } else {
        domEraser.eraseTarget(elem);
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
      }
    };

    const domEraser = {
      active: false,

      /**
       * @kind invokable
       */
      toggle({willActive}) {
        if (typeof willActive === 'undefined') {
          willActive = !this.active;
        }

        if (willActive) {
          if (!this.active) {
            this.active = true;
            window.addEventListener('touchstart', onTouchStart, true);
            window.addEventListener('mouseover', onMouseOver, true);
            window.addEventListener('mouseout', onMouseOut, true);
            window.addEventListener('mousedown', onMouseDown, true);
            window.addEventListener('click', onClick, true);
            window.addEventListener("keydown", onKeyDown, true);
          }
        } else {
          if (this.active) {
            this.active = false;
            domEraser.clearTarget();
            window.removeEventListener('touchstart', onTouchStart, true);
            window.removeEventListener('mouseover', onMouseOver, true);
            window.removeEventListener('mouseout', onMouseOut, true);
            window.removeEventListener('mousedown', onMouseDown, true);
            window.removeEventListener('click', onClick, true);
            window.removeEventListener("keydown", onKeyDown, true);
          }
        }
      },

      adjustTarget(elem) {
        let checkElem;

        // Special handling for special elements,
        // as their inner elements cannot be tooltiped and handled,
        // or should be treated as a whole.
        while ((checkElem = elem.closest([
              'svg, math',
              '[data-sb-obj="freenote"]', // SBX
              '[data-sb-obj="annotation"]', // 1.12.0a <= SBX <= 1.12.0a45
              '.scrapbook-sticky', // SB, SBX <= 1.12.0a34
              '.scrapbook-block-comment', // SB < 0.19?
            ].join(', '))) && checkElem !== elem) {
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
        })()

        domEraser.clearTarget();
        lastTarget = elem;

        if (scrapbook.getScrapBookObjectRemoveType(elem) <= 0) {
          const id = elem.id;
          const classText = Array.from(elem.classList.values()).join(' '); // elements like svg doesn't support .className property
          var outlineStyle = '2px solid red';
          var labelHtml = `<b style="all: unset !important; font-weight: bold !important;">${scrapbook.escapeHtml(elem.tagName.toLowerCase(), false, false, true)}</b>` + 
              (id ? ", id: " + scrapbook.escapeHtml(id, false, false, true) : "") + 
              (classText ? ", class: " + scrapbook.escapeHtml(classText, false, false, true) : "");
        } else {
          var outlineStyle = '2px dashed blue';
          var labelHtml = scrapbook.escapeHtml(scrapbook.lang("EditorButtonDOMEraserRemoveEdit"), false, false, true);
        }

        // outline
        // elements like math doesn't implement the .style property and could throw an error
        try {
          mapElemHadStyleAttr.set(elem, elem.hasAttribute('style'));
          mapElemOutline.set(elem, elem.style.getPropertyValue('outline'));
          mapElemOutlinePriority.set(elem, elem.style.getPropertyPriority('outline'));
          mapElemCursor.set(elem, elem.style.getPropertyValue('cursor'));
          mapElemCursorPriority.set(elem, elem.style.getPropertyPriority('cursor'));
          elem.style.setProperty('outline', outlineStyle, 'important');
          elem.style.setProperty('cursor', 'pointer', 'important');
        } catch (ex) {
          // pass
        }

        // tooltip
        const viewport = scrapbook.getViewportDimensions(window);
        const boundingRect = elem.getBoundingClientRect();
        let x = viewport.scrollX + boundingRect.left;
        let y = viewport.scrollY + boundingRect.bottom;

        const labelElem = document.body.appendChild(document.createElement("scrapbook-toolbar-tooltip"));
        labelElem.style.setProperty('all', 'initial', 'important');
        labelElem.style.setProperty('position', 'absolute', 'important');
        labelElem.style.setProperty('z-index', '2147483647', 'important');
        labelElem.style.setProperty('display', 'block', 'important');
        labelElem.style.setProperty('border', '2px solid black', 'important');
        labelElem.style.setProperty('border-radius', '6px', 'important');
        labelElem.style.setProperty('padding', '2px 5px 2px 5px', 'important');
        labelElem.style.setProperty('background-color', '#fff0cc', 'important');
        labelElem.style.setProperty('font-size', '12px', 'important');
        labelElem.style.setProperty('font-family', 'sans-serif', 'important');
        labelElem.innerHTML = labelHtml;

        // fix label position to prevent overflowing the viewport
        const availWidth = viewport.scrollX + viewport.width;
        const labelWidth = labelElem.offsetWidth;
        x = Math.max(x, 0);
        x = Math.min(x, availWidth - labelWidth);
        
        const availHeight = viewport.scrollY + viewport.height;
        const labelHeight = labelElem.offsetHeight;
        y = Math.max(y, 0);
        y = Math.min(y, availHeight - labelHeight);

        labelElem.style.setProperty('left', x + 'px', 'important');
        labelElem.style.setProperty('top', y + 'px', 'important');

        tooltipElem = labelElem;
      },

      clearTarget() {
        let elem = lastTarget;
        if (!elem) { return; }

        // outline
        // elements like math doesn't implement the .style property and could throw an error
        try {
          elem.style.setProperty('outline', mapElemOutline.get(elem), mapElemOutlinePriority.get(elem));
          elem.style.setProperty('cursor', mapElemCursor.get(elem), mapElemCursorPriority.get(elem));
          if (!elem.getAttribute('style') && !mapElemHadStyleAttr.get(elem)) { elem.removeAttribute('style'); }
        } catch (ex) {
          // pass
        }

        // tooltip
        if (tooltipElem) {
          tooltipElem.remove();
          tooltipElem = null;
        }

        // unset lastTarget
        lastTarget = null;
      },

      eraseTarget(elem) {
        domEraser.clearTarget();
        editor.addHistory();

        let type = editor.removeScrapBookObject(elem);
        if (type <= 0) {
          editor.eraseNode(elem);
        }
      },

      isolateTarget(elem) {
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
     * @kind invokable
     */
    async toggle({willActive}) {
      if (typeof willActive === 'undefined') {
        willActive = !this.active;
      }

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
          code: `document.execCommand('bold', false, null);`,
        },
      });
    },

    async em() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('italic', false, null);`,
        },
      });
    },

    async underline() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('underline', false, null);`,
        },
      });
    },

    async strike() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('strikeThrough', false, null);`,
        },
      });
    },

    async superscript() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('superscript', false, null);`,
        },
      });
    },

    async subscript() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('subscript', false, null);`,
        },
      });
    },

    async foreColor() {
      const color = prompt(scrapbook.lang('EditorButtonHtmlEditorFgColorPrompt'));
      if (!color) { return; }
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, "${scrapbook.escapeQuotes(color)}");`,
        },
      });
    },

    async hiliteColor() {
      const color = prompt(scrapbook.lang('EditorButtonHtmlEditorBgColorPrompt'));
      if (!color) { return; }
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, "${scrapbook.escapeQuotes(color)}");`,
        },
      });
    },

    async formatBlockP() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'p');`,
        },
      });
    },

    async formatBlockH1() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h1');`,
        },
      });
    },

    async formatBlockH2() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h2');`,
        },
      });
    },

    async formatBlockH3() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h3');`,
        },
      });
    },

    async formatBlockH4() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h4');`,
        },
      });
    },

    async formatBlockH5() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h5');`,
        },
      });
    },

    async formatBlockH6() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'h6');`,
        },
      });
    },

    async formatBlockDiv() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'div');`,
        },
      });
    },

    async formatBlockPre() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('formatBlock', false, 'pre');`,
        },
      });
    },

    async listUnordered() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertUnorderedList', false, null);`,
        },
      });
    },

    async listOrdered() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertOrderedList', false, null);`,
        },
      });
    },

    async outdent() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('outdent', false, null);`,
        },
      });
    },

    async indent() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('indent', false, null);`,
        },
      });
    },

    async justifyLeft() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('justifyLeft', false, null);`,
        },
      });
    },

    async justifyCenter() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('justifyCenter', false, null);`,
        },
      });
    },

    async justifyRight() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('justifyRight', false, null);`,
        },
      });
    },

    async justifyFull() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('justifyFull', false, null);`,
        },
      });
    },

    async createLink() {
      const url = prompt(scrapbook.lang('EditorButtonHtmlEditorCreateLinkPrompt'));
      if (!url) { return; }
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('createLink', false, "${scrapbook.escapeQuotes(url)}");`,
        },
      });
    },

    async hr() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertHorizontalRule', false, null);`,
        },
      });
    },

    async todo() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertHTML', false, '<input type="checkbox" data-scrapbook-elem="todo"/>');`,
        },
      });
    },

    async insertDate() {
      const format = scrapbook.getOption("editor.insertDateFormat");
      const dateStr = strftime(format);
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertText', false, "${scrapbook.escapeQuotes(dateStr)}");`,
        },
      });
    },

    async insertHtml() {
      const html = prompt(scrapbook.lang('EditorButtonHtmlEditorInsertHtmlPrompt'));
      if (!html) { return; }
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('insertHTML', false, "${scrapbook.escapeQuotes(html)}");`,
        },
      });
    },

    async removeFormat() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('removeFormat', false, null);`,
        },
      });
    },

    async unlink() {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeEditorCommand",
        args: {
          frameId: await editor.getFocusedFrameId(),
          code: `document.execCommand('unlink', false, null);`,
        },
      });
    },
  };


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

  {
    const frameNodeSelector = 'frame, iframe';
    const frameAddObserver = (elem) => {
      elem.addEventListener("load", (event) => {
        // console.warn('frame load', event);
        // init content scripts for all descendant frames as we can hardly
        // get this specific frame
        return scrapbook.invokeExtensionScript({
          cmd: "background.invokeEditorCommand",
          args: {
            frameIdExcept: 0,
            code: `core.frameId;`,
          },
        });
      });
    }

    const docObserver = new MutationObserver((mutations) => {
      for (let mutation of mutations) {
        // console.warn("DOM update", mutation);
        for (let node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches(frameNodeSelector)) {
              frameAddObserver(node);
            } else {
              Array.prototype.forEach.call(node.querySelectorAll(frameNodeSelector), (elem) => {
                frameAddObserver(elem);
              });
            }
          }
        }
      }
    });
    const docObserverConf = {childList: true, subtree: true};

    docObserver.observe(document.documentElement, docObserverConf);
    Array.prototype.forEach.call(document.querySelectorAll(frameNodeSelector), (elem) => {
      frameAddObserver(elem);
    });
  }

  return editor;

}));
