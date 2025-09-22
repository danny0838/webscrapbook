/******************************************************************************
 * Base handler class for modal dialog windows.
 *****************************************************************************/

import * as utils from "../utils/common.mjs";

class Dialog {
  resolve = () => {};

  /**
   * A shortcut to return a new instance with init run.
   */
  static init() {
    const dialog = new this();
    dialog.init();
    return dialog;
  }

  init() {
    document.body.hidden = true;

    utils.loadLanguages(document);

    utils.addMessageListener((message, sender) => {
      if (!message.cmd.startsWith("dialog.")) { return false; }
      return true;
    });

    document.addEventListener('DOMContentLoaded', (event) => {
      this.onLoad(event);
    });

    window.addEventListener('keydown', (event) => {
      this.onKeyDown(event);
    });
  }

  async start({message, defaultValue} = {}) {
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
  }

  close(value = null) {
    this.resolve(value);
  }

  onLoad(event) {
    document.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.onSubmit(event);
    });

    document.querySelector('#cancel').addEventListener('click', (event) => {
      event.preventDefault();
      this.close();
    });
  }

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
  }

  onKeyDown(event) {
    // skip if there's a modifier
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.code === "Escape") {
      event.preventDefault();
      this.close();
    }
  }
}

export {
  Dialog,
};
