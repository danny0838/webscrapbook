/******************************************************************************
 * Script for check.html
 *****************************************************************************/

import {ScrapbookTool} from "./tool.mjs";

class Tool extends ScrapbookTool {
  getQuery(params) {
    const query = params;
    query.set('a', 'check');
    return query;
  }
}

new Tool().run();  // async
