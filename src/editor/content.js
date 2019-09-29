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
};

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

  // do not load the toolbar for non-HTML document (unless forced)
  if (!force && !["text/html", "application/xhtml+xml"].includes(document.contentType)) {
    return;
  }

  // do checks
  editor.isScripted = editor.isDocumentScripted(document);

  await scrapbook.loadOptions();
  editor.serverUrl = scrapbook.getOption("server.url");
  editor.inScrapBook = editor.serverUrl && document.URL.startsWith(editor.serverUrl);

  // generate toolbar content
  editor.element = wrapper = document.documentElement.appendChild(document.createElement("web-scrapbook"));
  wrapper.style = `
all: initial !important;
position: fixed !important;
display: block !important;
left: 0px !important;
bottom: 0px !important;
width: 100% !important;
height: 32px !important;
z-index: 2147483645 !important;
`;

  // Attach a shadowRoot if supported; otherwise use iframe as a fallback.
  let iwrapper;
  if (wrapper.attachShadow) {
    iwrapper = wrapper.attachShadow({mode: 'open'});
  } else {
    const iframe = wrapper.appendChild(document.createElement("iframe"));
    iframe.style = `
all: initial !important;
display: block !important;
overflow: hidden !important;
box-sizing: border-box !important;
width: 100% !important;
height: 100% !important;
`;

    await scrapbook.delay(0);

    const html = iframe.contentDocument.documentElement;
    html.style = `width: 100%; height: 100%;`;

    const body = iframe.contentDocument.body;
    body.style = `width: 100%; height: 100%; margin: 0; padding: 0;`;

    iwrapper = body;
  }
  editor.internalElement = iwrapper;

  const style = iwrapper.appendChild(document.createElement("style"));
  style.textContent = `
#toolbar {
  position: relative;
  box-sizing: border-box;
  padding: 3px;
  border: 1px solid rgb(204, 204, 204);
  background: rgba(240, 240, 240, 0.9) none repeat scroll 0% 0%;
  width: 100%;
  height: 100%;
}

#toolbar button {
  margin: 0 0.25em;
  padding: 2px;
  font-variant: small-caps;
}

#toolbar button[checked] {
  box-shadow: 0px 0px 10px 0px #909090 inset !important;
}

#toolbar-close {
  display: block;
  position: absolute;
  top: 0;
  right: 0;
  margin: 3px;
  width: 24px;
  height: 24px;
  opacity: 0.3;
}

#toolbar-close::before,
#toolbar-close::after {
  content: "";
  position: absolute;
  height: 4px;
  width: 100%;
  top: 50%;
  left: 0;
  margin-top: -2px;
  background: #000;
}

#toolbar-close::before {
  transform: rotate(45deg);
}

#toolbar-close::after {
  transform: rotate(-45deg);
}

#toolbar #toolbar-close:hover {
  opacity: 1;
}
`;

  const toolbar = iwrapper.appendChild(document.createElement("div"));
  toolbar.id = "toolbar";

  const locate = toolbar.appendChild(document.createElement("button"));
  locate.id = "toolbar-locate";
  locate.textContent = 'locate';
  locate.addEventListener("click", async (event) => {
    editor.locate();
  });
  locate.disabled = locate.hidden = !editor.inScrapBook;

  const edit = toolbar.appendChild(document.createElement("button"));
  edit.id = "toolbar-edit";
  edit.textContent = 'edit';
  edit.addEventListener("click", (event) => {
    editor.edit();
  });

  const save = toolbar.appendChild(document.createElement("button"));
  save.id = "toolbar-save";
  save.textContent = 'save';
  save.addEventListener("click", (event) => {
    editor.save();
  });

  const close = toolbar.appendChild(document.createElement("a"));
  close.id = "toolbar-close";
  close.href = "javascript:";
  close.addEventListener("click", (event) => {
    editor.close();
  });
};

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

editor.edit = async function (willEditable) {
  if (!editor.element && editor.element.parentNode) { return; }

  const editElem = editor.internalElement.querySelector('#toolbar-edit');

  if (typeof willEditable === "undefined") {
    willEditable = !editElem.hasAttribute("checked");
  }

  willEditable ? editElem.setAttribute("checked", "") : editElem.removeAttribute("checked");

  return await scrapbook.invokeExtensionScript({
    cmd: "background.toggleDocumentEditable",
    args: {designMode: willEditable ? "on" : "off"},
  });
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

  await editor.edit(false);
  editor.element.remove();
};

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

window.editor = editor;

})(this, this.document, this.browser);
