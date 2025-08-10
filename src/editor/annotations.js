/******************************************************************************
 * Shared script for modal dialog windows.
 *
 * @requires scrapbook
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(global.scrapbook, global.dialog);
}(this, function (scrapbook, dialog) {

'use strict';

Object.assign(dialog, {
  async init({annotations, source: {tab: {id: tabId}, frameId}}) {
    await annotationViewer.init({annotations, tabId, frameId});

    document.body.hidden = false;

    const {promise, resolve} = Promise.withResolvers();
    this.resolve = resolve;
    return await promise;
  },

  onLoad(event) {
    scrapbook.loadLanguages(document);

    document.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.onSubmit(event);
    });
  },

  onSubmit(event) {
    this.close();
  },
});

const annotationViewer = {
  tabId: null,
  frameId: null,

  async init({annotations, tabId, frameId}) {
    this.tabId = tabId;
    this.frameId = frameId;

    const main = document.querySelector('main');

    const createAnnotation = (annotation) => {
      const elem = document.createElement("div");
      elem.classList.add('annotation');
      elem.dataset.id = annotation.id;
      elem.dataset.type = annotation.type;
      elem.tabIndex = 0;
      if (annotation.id) {
        elem.addEventListener('click', this.onClick);
        elem.addEventListener('keydown', this.onKeyDown);
      }
      if (annotation.highlighted) {
        elem.setAttribute('autofocus', '');
      }
      return elem;
    };

    for (const annotation of annotations) {
      switch (annotation.type) {
        case 'linemarker': {
          const elem = createAnnotation(annotation);

          const div = elem.appendChild(document.createElement("div"));
          div.classList.add('linemarker');

          const span = div.appendChild(document.createElement("span"));
          span.textContent = annotation.text;
          span.setAttribute('style', annotation.style);

          if (annotation.note.trim()) {
            const note = elem.appendChild(document.createElement("div"));
            note.classList.add('note');
            note.textContent = annotation.note;
          }

          main.appendChild(elem);
          break;
        }
        case 'sticky': {
          const elem = createAnnotation(annotation);

          const note = elem.appendChild(document.createElement("div"));
          note.classList.add('sticky');
          note.textContent = annotation.note;

          main.appendChild(elem);
          break;
        }
        case 'link-url': {
          const elem = createAnnotation(annotation);

          const div = elem.appendChild(document.createElement("div"));
          div.classList.add('link-url');

          const span = div.appendChild(document.createElement("span"));
          span.textContent = annotation.text;
          span.setAttribute('style', annotation.style);

          if (annotation.note.trim()) {
            const note = elem.appendChild(document.createElement("div"));
            note.classList.add('note');
            note.textContent = annotation.note;
          }

          main.appendChild(elem);
          break;
        }
        case 'custom': {
          const elem = createAnnotation(annotation);

          const note = elem.appendChild(document.createElement("div"));
          note.classList.add('custom');
          note.textContent = annotation.note;

          main.appendChild(elem);
          break;
        }
        case 'custom-wrapper': {
          const elem = createAnnotation(annotation);

          const note = elem.appendChild(document.createElement("div"));
          note.classList.add('custom-wrapper');
          note.textContent = annotation.text;

          main.appendChild(elem);
          break;
        }
      }
    }
  },

  async locateAnnotation(elem) {
    const id = elem.dataset.id;
    await scrapbook.invokeContentScript({
      tabId: annotationViewer.tabId,
      frameId: annotationViewer.frameId,
      cmd: "editor.highlightAnnotation",
      args: {id},
    });
  },

  onClick(event) {
    const elem = event.currentTarget;
    annotationViewer.locateAnnotation(elem);
  },

  onKeyDown(event) {
    // skip if there's a modifier
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (["Enter", "Space"].includes(event.code)) {
      event.preventDefault();
      const elem = event.currentTarget;
      annotationViewer.locateAnnotation(elem);
    }
  },
};

return annotationViewer;

}));
