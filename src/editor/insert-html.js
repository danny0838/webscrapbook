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
  async init(data) {
    const preTagElem = document.querySelector('form [name="pre-tag"]');
    const preContextElem = document.querySelector('form [name="pre-context"]');
    const valueElem = document.querySelector('form [name="value"]');
    const postContextElem = document.querySelector('form [name="post-context"]');
    const postTagElem = document.querySelector('form [name="post-tag"]');

    preTagElem.value = data.preTag;
    preContextElem.value = data.preContext;
    valueElem.value = data.value;
    postContextElem.value = data.postContext;
    postTagElem.value = data.postTag;

    if (!preTagElem.value) { preTagElem.hidden = true; }
    if (!preContextElem.value) { preContextElem.hidden = true; }
    if (!postContextElem.value) { postContextElem.hidden = true; }
    if (!postTagElem.value) { postTagElem.hidden = true; }

    document.body.hidden = false;

    preContextElem.select();  // scroll to the end
    valueElem.select();

    const {promise, resolve} = Promise.withResolvers();
    this.resolve = resolve;
    return await promise;
  },

  onSubmit(event) {
    const value = {
      preContext: document.querySelector('form [name="pre-context"]').value,
      value: document.querySelector('form [name="value"]').value,
      postContext: document.querySelector('form [name="post-context"]').value,
    };
    this.close(value);
  },
});

}));
