import {POLL_INTERVAL, context as testContext} from "./browser-runner.js";

if (!testContext) {
  throw new Error("test context not initiated");
}

await buildAndRunTests(testContext);

async function buildAndRunTests({driver, extensionUrl, grep, reporter}) {
  const testPromises = new Map();

  const testPath = `test/test.html?grep=${encodeURIComponent(grep)}`;
  await driver.get(`${extensionUrl}${testPath}`);
  await driver.wait(async () => {
    return await driver.executeScript(() => {
      return !!globalThis.__TEST_SUITE__;
    });
  }, 10000);
  const suite = await driver.executeScript(() => {
    return globalThis.__TEST_SUITE__;
  });

  function renderSuiteTree(suiteNode) {
    suiteNode.hooks.forEach((hookNode) => {
      const {promise, resolve, reject} = Promise.withResolvers();
      testPromises.set(hookNode.id, {promise, resolve, reject});
      globalThis[hookNode.type](hookNode.title, async function () {
        const result = await promise;
        switch (result.state) {
          case "pending": {
            this.skip();
            break;
          }
          case "failed": {
            const err = new Error(result.error.message || 'unexpected hook failure');
            err.stack = result.error.stack;
            throw err;
          }
        }
      });
    });

    suiteNode.tests.forEach((test) => {
      const {promise, resolve, reject} = Promise.withResolvers();
      testPromises.set(test.id, {promise, resolve, reject});
      it(test.title, async function () {
        const result = await promise;
        switch (result.state) {
          case "pending": {
            this.skip();
            break;
          }
          case "failed": {
            const err = new Error(result.error.message || 'unexpected test failure');
            err.stack = result.error.stack;
            throw err;
          }
        }
      });
    });

    suiteNode.suites.forEach((childSuite) => {
      describe(childSuite.title, function () {
        renderSuiteTree(childSuite);
      });
    });
  }

  before(async function () {
    this.timeout(0);
    (async () => {
      try {
        while (true) {
          const newResults = await driver.executeScript(() => {
            return globalThis.__TEST_QUEUE__.splice(0, globalThis.__TEST_QUEUE__.length);
          });

          for (const result of newResults) {
            if (result.done) { return; }
            const {resolve} = testPromises.get(result.id);
            resolve(result);
          }

          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        }
      } finally {
        for (const [id, {resolve}] of testPromises) {
          resolve({id, state: "pending"});
        }
      }
    })();
  });

  renderSuiteTree(suite);
}
