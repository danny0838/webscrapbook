import fs from "fs";
import path from "path";
import {tmpdir} from "os";
import {fileURLToPath} from "url";
import {parseArgs} from "util";
import {execFileSync} from "child_process";

import Mocha from 'mocha';
import {Builder, By, until} from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import firefox from "selenium-webdriver/firefox.js";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.dirname(currentFile);
const srcDir = path.resolve(rootDir, path.join("..", "src"));
const srcDirExternal = path.resolve(rootDir, "external");

const POLL_INTERVAL = 300;

let context = null;

async function launchDriver({profileDirectory, browserName, exePath, headless, manifest}) {
  if (browserName === "chromium") {
    const options = new chrome.Options();
    if (headless) { options.addArguments("--headless=new"); }
    if (exePath) { options.setBinaryPath(exePath); }
    options.addArguments(`--user-data-dir=${profileDirectory}`);
    options.addArguments(`--load-extension=${srcDir},${srcDirExternal}`);
    options.addArguments("--log-level=3");
    options.addArguments("--no-first-run");
    options.addArguments("--disable-backgrounding-occluded-windows");
    options.addArguments("--disable-background-timer-throttling");
    options.addArguments("--disable-background-networking");
    options.addArguments("--disable-default-apps");

    // CLI argument to allow MV2 extension (for Chromium < 150)
    if (manifest.manifest_version === 2) {
      options.addArguments("--disable-features=ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled");
    }

    return {
      driver: await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build(),
      options,
    };
  }

  if (browserName === "firefox") {
    const version = (() => {
      if (exePath) {
        const output = execFileSync(exePath, ["--version"], {
          encoding: "utf8",
          windowsHide: true,
        });
        const match = output.match(/\b(\d+)\./);
        if (match) {
          return Number(match[1]);
        }
      }

      return null;
    })();

    const service = new firefox.ServiceBuilder();
    if (version == null || version >= 138) {
      service.addArguments("--allow-system-access");
    }

    const options = new firefox.Options();
    if (headless) { options.addArguments("-headless"); }
    if (exePath) { options.setBinary(exePath); }
    options.addArguments("-profile", profileDirectory);

    // disable auto update
    options.setPreference("app.update.auto", false);
    options.setPreference("app.update.enabled", false);
    options.setPreference("app.update.silent", false);
    options.setPreference('app.update.mode', 0);
    options.setPreference('app.update.service.enabled', false);
    options.setPreference('app.update.background.interval', 0);

    return {
      driver: await new Builder()
        .forBrowser("firefox")
        .setFirefoxService(service)
        .setFirefoxOptions(options)
        .build(),
      version,
      options,
    };
  }

  throw new Error(`Unsupported browser: ${browserName}`);
}

async function loadExtensions({driver, browserName, manifest, version, options}) {
  if (browserName === "chromium") {
    const {extensionId, extensionUrl} = await (async () => {
      const timeout = 8000;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const result = await driver.sendAndGetDevToolsCommand("Target.getTargets", {});
        const targets = result.targetInfos.filter(t => (
          ["service_worker", "background_page"].includes(t.type) &&
          t.url.startsWith("chrome-extension://")
        ));
        if (targets.length) {
          let extensionId, extensionUrl, extensionIdExt;
          for (const target of targets) {
            const u = new URL(target.url);
            if (target.title === "WebScrapBook External Test" || u.pathname === '/background.js') {
              extensionIdExt = u.host;
            } else {
              extensionId = u.host;
              extensionUrl = `${u.protocol}//${u.host}/`;
            }
          }
          return {extensionId, extensionUrl, extensionIdExt};
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
      throw new Error("Unable to find the installed extension.");
    })();

    // add CLI argument to allow webRequestBlocking permission in MV3
    if (manifest.manifest_version === 3) {
      await driver.quit();
      options.addArguments(`--allowlisted-extension-id=${extensionId}`);
      driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();
    }

    return {driver, extensionId, extensionUrl};
  }

  if (browserName === "firefox") {
    const extensionId = await driver.installAddon(srcDir, true);
    await driver.installAddon(srcDirExternal, true);

    await driver.setContext("chrome");
    const extensionUrl = await driver.executeScript((extId) => {
      // eslint-disable-next-line
      return WebExtensionPolicy.getByID(extId).getURL("");
    }, extensionId);
    await driver.setContext("content");

    // grant host permission for MV3 extension in older Firefox
    if (manifest.manifest_version === 3 && (version != null && version < 127)) {
      await driver.get("about:addons");
      const tab = await driver.wait(
        until.elementLocated(By.css('button[role="tab"][name="extension"]')),
        5000,
      );
      tab.click();
      const cardAnchor = await driver.wait(
        until.elementLocated(By.css(`[addon-id="${extensionId}"] h3 a`)),
        5000,
      );
      await driver.executeScript(e => e.click(), cardAnchor);
      const permBtn = await driver.wait(
        until.elementLocated(By.css(`[addon-id="${extensionId}"] button[name="permissions"]`)),
        5000,
      );
      permBtn.click();
      const permInput = await driver.wait(
        until.elementLocated(By.css(`[addon-id="${extensionId}"] input[type="checkbox"][permission-all-sites]`)),
        5000,
      );
      await driver.executeScript(e => e.click(), permInput);
    }

    return {driver, extensionId, extensionUrl};
  }

  throw new Error(`Unsupported browser: ${browserName}`);
}

async function modifyOptions({driver, extensionUrl, options}) {
  const optionsPath = "core/options.html";
  await driver.get(`${extensionUrl}${optionsPath}`);
  await driver.wait(until.elementLocated(By.css('#options > fieldset:enabled')), 5000);
  await driver.executeScript((opts) => globalThis.utils.setOptions(opts), options);
}

async function runTestSuite({browserName, exePath, headless, grep, reporter, keepOpen}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, "manifest.json"), "utf8"));

  const profileDirectory = await fs.mkdtempSync(path.join(tmpdir(), "webscrapbook-tests-"));

  let driver = null;
  let failed = false;

  try {
    console.log("Launching browser with profile: %s", profileDirectory);
    const {driver: newDriver, version, options} = await launchDriver({profileDirectory, browserName, exePath, headless, manifest});
    driver = newDriver;

    const {driver: updatedDriver, extensionId, extensionUrl} = await loadExtensions({driver, browserName, manifest, version, options});
    driver = updatedDriver;

    // load config
    const config = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(srcDir, "test", "config.json"), "utf8"));
      } catch {
        throw new Error("Unable to load test config.");
      }
    })();
    const config2 = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(srcDir, "test", "config.local.json"), "utf8"));
      } catch {
        // pass
      }
    })();
    Object.assign(config, config2);

    // set options
    const port = config.backend_port;
    const portStr = (port === 80) ? '' : `:${port}`;
    const serverUrl = `http://localhost${portStr}/`;
    await modifyOptions({driver, extensionUrl, options: {
      "server.url": serverUrl,
    }});

    // run tests
    context = {driver, extensionUrl, grep, reporter};
    const mocha = new Mocha({
      grep,
      reporter,
      timeout: 90000,
      slow: 10000,
    });
    mocha.addFile(path.resolve(rootDir, "./test_browser.mjs"));

    await mocha.loadFilesAsync();
    const failures = await new Promise((resolve) => mocha.run(resolve));
    failed = failures > 0;
  } catch (ex) {
    console.error(ex);
    failed = true;
  } finally {
    if (driver) {
      if (keepOpen) {
        console.debug("Waiting for browser shutdown ...");
        while (true) {
          try {
            await driver.getAllWindowHandles();
          } catch {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        }
      } else {
        console.debug("Shutting down browser ...");
        await driver.quit();
      }
    }

    console.debug("Post-test clean up ...");
    await fs.rmSync(profileDirectory, {recursive: true, force: true});
  }

  return failed;
}

function isMain() {
  const entryFile = process.argv[1];
  if (!entryFile) { return false; }
  return currentFile === path.resolve(entryFile);
}

async function main() {
  const args = parseArgs({
    options: {
      "help": {
        type: "boolean",
        short: "h",
      },
      "browser": {
        type: "string",
        default: "chromium",
        short: "b",
      },
      "exe-path": {
        type: "string",
        short: "e",
      },
      "headless": {
        type: "boolean",
      },
      "keep": {
        type: "boolean",
      },
      "grep": {
        type: "string",
        default: "^(?!Manual tests)",
        short: "g",
      },
      "verbose": {
        type: "boolean",
        short: "v",
      },
    },
  });

  if (args.values.help) {
    const usage = `\
Usage: node ./test/browser-runner.js [options ...]

Options:
  -h, --help             Display usage help.
  -b, --browser BROWSER  The browser to test. {chromium,firefox}
  -e, --exe-path PATH    The browser executable path.
  --headless             Launch the browser headlessly.
  --keep                 Keep the browser open after tests done.
  -g, --grep PATTERN     The matching regex pattern for tests to run.
  -v, --verbose          Show verbose output.
`;
    process.stdout.write(usage);
    process.exit(0);
  }

  const failed = await runTestSuite({
    browserName: args.values["browser"],
    exePath: args.values["exe-path"],
    headless: args.values["headless"],
    keepOpen: args.values["keep"] && !args.values["headless"],
    grep: args.values["grep"],
    reporter: args.values["verbose"] ? "spec" : "dot",
  });

  if (failed) {
    process.exitCode = 1;
  }
}

if (isMain()) {
  main();
}

export {
  POLL_INTERVAL,
  context,
  modifyOptions,
};
