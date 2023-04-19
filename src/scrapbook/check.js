/******************************************************************************
 *
 * Script for check.html
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
      const query = new URLSearchParams(new URL(document.URL).search);
      query.set('a', 'check');

      return await server.requestSse({
        query,
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
