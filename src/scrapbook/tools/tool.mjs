/******************************************************************************
 * Shared script for a SSE-based scrapbook tool.
 *****************************************************************************/

import {scrapbook} from "../../utils/common.mjs";
import "../../utils/options-auto.mjs";
import {server} from "../server.mjs";

class ScrapbookTool {
  constructor(doc = document) {
    this.doc = doc;
  }

  get head() {
    const value = this.doc.head;
    Object.defineProperty(this, 'head', {value});
    return value;
  }

  get logger() {
    const value = this.doc.getElementById('logger');
    Object.defineProperty(this, 'logger', {value});
    return value;
  }

  log(info) {
    const span = this.doc.createElement('span');
    span.className = info.type;
    span.appendChild(this.doc.createTextNode(info.msg + '\n'));
    this.logger.appendChild(span);
  }

  async run() {
    scrapbook.loadLanguages(this.doc);
    this.logger.textContent = '';

    const params = this.getParams();
    if (!params.get('debug')) {
      const elem = this.head.appendChild(this.doc.createElement('style'));
      elem.textContent = '.debug { display: none; }';
    }

    try {
      await scrapbook.loadOptionsAuto;
      const query = this.getQuery(params);
      const onMessage = (info) => {
        this.log(info);
      };
      await server.init();
      return await server.requestSse({
        query,
        onMessage,
      });
    } catch (ex) {
      console.error(ex);
      this.log({type: 'critical', msg: `${ex.message}`});
    }
  }

  getParams() {
    return new URLSearchParams(new URL(this.doc.URL).search);
  }

  getQuery(params) {
    return params;
  }
}

export {
  ScrapbookTool,
};
