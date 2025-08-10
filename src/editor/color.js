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

const dialogOnLoad = dialog.onLoad;

const fieldControllers = new WeakMap();

Object.assign(dialog, {
  async init(data) {
    document.body.hidden = false;

    const {promise, resolve} = Promise.withResolvers();
    this.resolve = resolve;
    return await promise;
  },

  onLoad(event) {
    dialogOnLoad.call(this);

    for (const elem of document.querySelectorAll('input[type="checkbox"]')) {
      elem.addEventListener('change', onChangeCheckbox);
    }

    for (const elem of document.querySelectorAll('input[type="color"]')) {
      elem.addEventListener('change', onChangeColor);
    }

    for (const elem of document.querySelectorAll('input[type="text"]')) {
      const debounced = scrapbook.debounce(onInputText, {withCancler: true});
      fieldControllers.set(elem, debounced);
      elem.addEventListener('input', (event) => {
        event.currentTarget.setCustomValidity('');
        debounced(event);
      });
    }
  },

  onSubmit(event) {
    for (const elem of document.querySelectorAll('input[type="text"]')) {
      validateColorText(elem);
      fieldControllers.get(elem).cancel();
    }
    if (!event.currentTarget.reportValidity()) {
      return;
    }

    const value = {
      fg: document.querySelector('#fg').value,
      bg: document.querySelector('#bg').value,
      fgUse: document.querySelector('#fg-use').checked,
      bgUse: document.querySelector('#bg-use').checked,
    };
    this.close(value);
  },
});

function validateColorText(elem) {
  const target = document.getElementById(elem.dataset.for);

  if (elem.value) {
    const sample = document.createElement('span');
    sample.style.color = elem.value;

    if (!sample.style.color) {
      elem.setCustomValidity(scrapbook.lang('ErrorEditorButtonHtmlEditorColorInvalid'));
      target.value = '#000000';
      return;
    }

    document.documentElement.appendChild(sample);
    const result = window.getComputedStyle(sample).getPropertyValue('color');
    sample.remove();
    target.value = rgbToHex(result);
  }
}

function rgbToHex(rgb) {
  let result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  if (!result) {
    result = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgb);
  }
  const r = parseInt(result[1]).toString(16).padStart(2, '0');
  const g = parseInt(result[2]).toString(16).padStart(2, '0');
  const b = parseInt(result[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function onChangeCheckbox(event) {
  const elem = event.target;
  const target = document.getElementById(elem.dataset.for);
  target.disabled = !elem.checked;
}

function onChangeColor(event) {
  const elem = event.target;
  const target = document.getElementById(elem.dataset.for);
  target.value = elem.value;
  target.setCustomValidity('');
}

function onInputText(event) {
  const elem = event.target;
  validateColorText(elem);
}

}));
