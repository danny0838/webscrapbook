/******************************************************************************
 * Shared script for modal dialog windows.
 *
 * @requires scrapbook
 * @module dialog
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.dialog = factory(global.scrapbook);
}(this, function (scrapbook) {

'use strict';

const dialog = {
  resolve: () => {},

  async init({message, defaultValue} = {}) {
    if (message) { document.title = message; }

    const msgElem = document.getElementById('message');
    if (msgElem && message) { msgElem.textContent = message; }

    const inputElem = document.getElementById('input');
    if (inputElem && defaultValue) { inputElem.textContent = defaultValue; }

    document.body.hidden = false;

    if (inputElem) { inputElem.focus(); }

    const {promise, resolve} = Promise.withResolvers();
    this.resolve = resolve;
    return await promise;
  },

  close(value = null) {
    this.resolve(value);
  },

  onLoad(event) {
    scrapbook.loadLanguages(document);

    document.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.onSubmit(event);
    });

    document.querySelector('#cancel').addEventListener('click', (event) => {
      event.preventDefault();
      this.close();
    });
  },

  onSubmit(event) {
    const value = {};
    for (const elem of document.querySelectorAll('form [name]')) {
      if (elem.matches('input[type="checkbox"]')) {
        value[elem.name] = elem.checked;
      } else if (elem.matches('input[type="radio"]')) {
        if (elem.checked) {
          value[elem.name] = elem.value;
        }
      } else if (elem.matches('input[type="number"]')) {
        value[elem.name] = elem.valueAsNumber;
      } else {
        value[elem.name] = elem.value;
      }
    }

    this.close(value);
  },

  onKeyDown(event) {
    // skip if there's a modifier
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.code === "Escape") {
      event.preventDefault();
      this.close();
    }
  },
};

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("dialog.")) { return false; }
  return true;
});

document.addEventListener('DOMContentLoaded', (event) => {
  dialog.onLoad(event);
});

window.addEventListener('keydown', (event) => {
  dialog.onKeyDown(event);
});

return dialog;

}));
