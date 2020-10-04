/******************************************************************************
 *
 * Script for cache.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, document, console) {

  'use strict';

  let logger;

  function log(info) {
    const span = document.createElement('span');
    span.className = info.type;
    span.appendChild(document.createTextNode(info.msg + '\n'));
    logger.appendChild(span);
  }

  async function load() {
    scrapbook.loadLanguages(document);
    await scrapbook.loadOptionsAuto;
    logger = document.getElementById('logger');
    logger.textContent = '';

    try {
      await server.init();

      // handle URL actions
      const params = new URL(document.URL).searchParams;
      const u = new URL(server.serverRoot);
      for (const [k, v] of params.entries()) {
        u.searchParams.append(k, v);
      }
      u.searchParams.set('locale', scrapbook.lang('@@ui_locale'));
      u.searchParams.set('a', 'cache');

      return await server.requestSse({
        url: u.href,
        onMessage(info) {
          log(info);
        },
      });
    } catch (ex) {
      console.error(ex);
      log({type: 'critical', msg: `${ex.message}`});
    }
  }

  document.addEventListener("DOMContentLoaded", load);

}));
