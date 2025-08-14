/******************************************************************************
 * Script for cache.html
 *
 * @requires scrapbook
 * @requires server
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
    global.server,
  );
}(this, function (isDebug, scrapbook, server) {

  'use strict';

  const LOGGING_LEVELS = {debug: 1, info: 2, warn: 3, error: 4, critical: 5};

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

    const params = new URLSearchParams(new URL(document.URL).search);

    const logLevel = LOGGING_LEVELS[params.get('debug')] || 2;
    const css = Object.entries(LOGGING_LEVELS).reduce((css, [name, level]) => {
      if (level < logLevel) {
        css.push(`.${name} { display: none; }`);
      }
      return css;
    }, []);
    const elem = document.head.appendChild(document.createElement('style'));
    elem.textContent = css.join('\n');

    try {
      await server.init();

      // handle URL actions
      const query = params;
      query.set('a', 'cache');
      query.set('locale', scrapbook.lang('@@ui_locale'));

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
