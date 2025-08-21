/******************************************************************************
 * Script for cache.html
 *****************************************************************************/

import {scrapbook} from "../../utils/common.mjs";
import {ScrapbookTool} from "./tool.mjs";

class Tool extends ScrapbookTool {
  getQuery(params) {
    const query = params;
    query.set('a', 'cache');
    query.set('locale', scrapbook.lang('@@ui_locale'));
    return query;
  }
}

new Tool().run();  // async
