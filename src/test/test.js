/******************************************************************************
 * @requires browser
 * @requires mocha
 *****************************************************************************/

import * as suite from "./extension.mjs";
import {escapeRegExp} from "../utils/common.mjs";

// Top-level await is available only in Chromium >=89 and Firefox >= 89
(async () => {
  globalThis.__TEST_SUITE__ = null;
  globalThis.__TEST_QUEUE__ = [];

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
  await import('./test_utils_common.mjs');
  await import('./test_utils_doc-cloner.mjs');
  await import('./test_utils_doc-handler.mjs');
  await import('./test_utils_cache.mjs');
  await import('./test_utils_datauri.mjs');
  await import('./test_utils_zip.mjs');
  await import('./test_capturer_common.mjs');
  await import('./test_capturer_doc-handler.mjs');
  await import('./test_capturer_css-handler.mjs');
  await import('./test_capturer_helper-handler.mjs');
  await import('./test_capturer_capturer.mjs');
  await import('./test_scrapbook_sitemap.mjs');
  await import('./test_capture.mjs');
  await import('./test_external.mjs');

  // run tests and expose global information
  {
    function buildSuiteTree(suite) {
      const extractHooks = (hooksArray, type) => {
        return hooksArray.map((hook, index) => ({
          id: hook.id,
          type: type,
          title: hook.title.replace(/^.*? hook(?:: |$)/, ''),
        }));
      };

      return {
        title: suite.title,
        hooks: [
          ...extractHooks(suite._beforeAll, 'before'),
          ...extractHooks(suite._beforeEach, 'beforeEach'),
          ...extractHooks(suite._afterEach, 'afterEach'),
          ...extractHooks(suite._afterAll, 'after'),
        ],
        tests: suite.tests.map((test) => {
          return {
            id: test.id,
            title: test.title,
          };
        }),
        suites: suite.suites.map(buildSuiteTree),
      };
    }

    globalThis.__TEST_SUITE__ = buildSuiteTree(mocha.suite);

    const runner = mocha.run();
    const {EVENT_TEST_END, EVENT_TEST_FAIL, EVENT_HOOK_END, EVENT_RUN_END} = runner.constructor.constants;
    runner.on(EVENT_TEST_END, (test) => {
      globalThis.__TEST_QUEUE__.push({
        id: test.id,
        state: test.state,
        ...(test.state === 'failed' && {error: {
          message: test.err.message,
          stack: test.err.stack,
        }}),
      });
    });
    runner.on(EVENT_TEST_FAIL, (test) => {
      if (test.type === "hook") {
        globalThis.__TEST_QUEUE__.push({
          id: test.id,
          state: test.state,
          ...(test.state === 'failed' && {error: {
            message: test.err.message,
            stack: test.err.stack,
          }}),
        });
      }
    });
    runner.on(EVENT_HOOK_END, (hook) => {
      globalThis.__TEST_QUEUE__.push({
        id: hook.id,
        state: hook.state,
      });
    });
    runner.on(EVENT_RUN_END, () => {
      globalThis.__TEST_QUEUE__.push({
        done: true,
      });
    });
  }
})();
