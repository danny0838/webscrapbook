/******************************************************************************
 * @requires browser
 * @requires mocha
 *****************************************************************************/

import {escapeRegExp} from "./unittest.mjs";
import * as suite from "./extension.mjs";

// Top-level await is available only in Chromium >=89 and Firefox >= 89
(async () => {
  await suite.init();

  // initialize mocha and expose global methods such as describe(), it()
  const query = new URL(location.href).searchParams;
  const grep = query.get('grep');
  const fgrep = query.get('fgrep');
  const dryRun = Boolean(query.get('dryrun')) && !(grep || fgrep);
  if (dryRun) {
    document.title = `(DRY-RUN) ${document.title}`;
  }
  mocha.setup({
    ui: 'bdd',
    checkLeaks: true,
    timeout: 0,
    slow: 10000,
    grep: (() => {
      if (dryRun) {
        return '(?:)';
      }
      if (!(grep || fgrep)) {
        const tests = suite.config["tests"];
        if (Array.isArray(tests)) {
          return tests.map(t => escapeRegExp(t)).join('|');
        }
        return tests;
      }
      return undefined;
    })(),
    ...(dryRun && {dryRun}),
    noHighlighting: true,
  });

  // import all tests
  await import('./test_lib_mime.mjs');
  await import('./test_lib_referrer.mjs');
  await import('./test_lib_map-with-default.mjs');
  await import('./test_lib_strftime.mjs');
  await import('./test_src_utils_common.mjs');
  await import('./test_src_utils_zip.mjs');
  await import('./test_src_capturer_common.mjs');
  await import('./test_capture.mjs');
  await import('./test_manual.mjs');

  mocha.run();
})();
