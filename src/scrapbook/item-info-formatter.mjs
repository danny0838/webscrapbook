/******************************************************************************
 * Shared class for item info formatting.
 *****************************************************************************/

import * as utils from "../utils/common.mjs";
import {Strftime} from "../lib/strftime.mjs";

class ItemInfoFormatter {
  constructor(item, {book} = {}) {
    this.item = item;
    this.book = book;

    this._pattern = /%([\w:-]*)%/g;
    this._formatKey = (_, keyFormat) => {
      const [key, ...formats] = keyFormat.split(':');
      let rv = this.formatKey(key);
      for (const format of formats) {
        rv = this.formatFormat(rv, format);
      }
      return rv;
    };
    this._formatters = {};
  }

  /**
   * @param {Object} item - A scrapbook item object.
   * @param {string} template
   * @param {Object} context
   * @param {Book} [context.book] - A scrapbook Book object.
   */
  static format(item, template, context) {
    const formatter = new this(item, context);
    return formatter.format(template);
  }

  format(template) {
    return template.replace(this._pattern, this._formatKey);
  }

  formatKey(key) {
    const [keyMain, ...keySubs] = key.split('-');
    const fn = this[`format_${keyMain.toLowerCase()}`];
    if (typeof fn === 'function') {
      try {
        return fn.apply(this, keySubs) || '';
      } catch (ex) {
        console.error(`Failed to format "${key}": ${ex.message}`, this.item);
      }
      return '';
    }
    return '';
  }

  formatFormat(text, format) {
    if (typeof format !== 'string') {
      return text;
    }
    switch (format.toLowerCase()) {
      case "oneline": {
        return text.replace(/[\r\n][\S\s]+$/, '');
      }
      case "collapse": {
        return utils.split(text).join(' ');
      }
      case "url": {
        return encodeURIComponent(text);
      }
      case "escape_html": {
        return utils.escapeHtml(text);
      }
      case "escape_html_space": {
        return utils.escapeHtml(text, undefined, undefined, true);
      }
      case "escape_css": {
        return CSS.escape(text);
      }
      case "json": {
        return JSON.stringify(text);
      }
    }
    return text;
  }

  formatDate(id, key, mode) {
    const date = utils.idToDate(id);
    if (!date) {
      return '';
    }
    if (typeof key !== 'string') {
      return date.toLocaleString();
    }

    const isUtc = mode?.toLowerCase() === 'utc';
    const k = id + (isUtc ? '-utc' : '');
    const formatter = this._formatters[k] = this._formatters[k] || new Strftime({date, isUtc});
    return formatter.formatKey(key);
  }

  getItemUrl() {
    const {item, book} = this;
    switch (item.type) {
      case 'folder': {
        if (book) {
          const u = new URL(browser.runtime.getURL("scrapbook/folder.html"));
          u.searchParams.append('id', item.id);
          u.searchParams.append('bookId', book.id);
          return u.href;
        }
        break;
      }
      case 'postit': {
        if (book && item.index) {
          const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
          u.searchParams.append('id', item.id);
          u.searchParams.append('bookId', book.id);
          return u.href;
        }
        break;
      }
      case 'bookmark': {
        if (item.source) {
          return new URL(item.source).href;
        } else if (book && item.index) {
          return new URL(book.dataUrl + utils.escapeFilename(item.index)).href;
        }
        break;
      }
      default: {
        if (book && item.index) {
          return new URL(book.dataUrl + utils.escapeFilename(item.index)).href;
        }
        break;
      }
    }
    return '';
  }

  format_() {
    return '%';
  }

  format_id(keySub) {
    switch (keySub) {
      case 'legacy': {
        return utils.dateToIdOld(utils.idToDate(this.item.id));
      }
      default: {
        return this.item.id;
      }
    }
  }

  format_index() {
    return this.item.index;
  }

  format_comment() {
    return this.item.comment;
  }

  format_title() {
    return this.item.title;
  }

  format_source(key, searchKey) {
    switch (key) {
      case "protocol": {
        const u = new URL(this.item.source);
        return u.protocol.slice(0, -1);
      }
      case "host": {
        const u = new URL(this.item.source);
        return u.host;
      }
      case "hostname": {
        const u = new URL(this.item.source);
        return u.hostname;
      }
      case "port": {
        const u = new URL(this.item.source);
        return u.port;
      }
      case "pathname": {
        const u = new URL(this.item.source);
        return u.pathname.slice(1);
      }
      case "search": {
        const u = new URL(this.item.source);
        if (typeof searchKey !== 'undefined') {
          return u.searchParams.get(searchKey);
        }
        return u.search.slice(1);
      }
      case "hash": {
        const u = new URL(this.item.source);
        return u.hash.slice(1);
      }
      case "file": {
        return utils.urlToFilename(this.item.source);
      }
      case "page": {
        return utils.filenameParts(utils.urlToFilename(this.item.source))[0];
      }
      default: {
        return this.item.source;
      }
    }
  }

  format_url() {
    return this.getItemUrl();
  }

  format_create(key, mode) {
    return this.formatDate(this.item.create, key, mode);
  }

  format_modify(key, mode) {
    return this.formatDate(this.item.modify, key, mode);
  }

  format_recycled(key, mode) {
    return this.formatDate(this.item.recycled, key, mode);
  }
}

export {
  ItemInfoFormatter,
};
