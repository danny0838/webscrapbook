import {By, until} from "selenium-webdriver";
import assert from "assert/strict";

import {MochaQuery as $} from "../src/test/lib/mocha-query.mjs";
import {POLL_INTERVAL, context as testContext, modifyOptions} from "./browser-runner.js";

if (!testContext) {
  throw new Error("test context not initialized");
}

const {driver, extensionUrl, config, grep, resources, reporter} = testContext;
const $describe = $(describe);

async function runManualTestTab({url, timeout}) {
  if (!Number.isFinite(timeout)) {
    timeout = Infinity;
  }

  const testTabHandle = await driver.getWindowHandle();
  await driver.get(url);
  const initialUrl = await driver.getCurrentUrl();

  await driver.executeScript(() => {
    const host = document.createElement("div");
    host.style.cssText = `
      width: 100%;
      box-sizing: border-box;
    `;

    const shadow = host.attachShadow({mode: "open"});

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: unset;
      }
      .banner-container {
        background-color: #1e1e2e;
        color: #cdd6f4;
        padding: 8px 10px;
        font-size: 20px;
        line-height: 1.5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
        width: 100%;
      }
      .instruction-text {
        flex: 1;
        margin-right: 15px;
        color: #cdd6f4;
      }
      .button-group {
        display: flex;
        gap: 10px;
      }
      button {
        outline: none;
        border: none;
        padding: 8px 12px;
        font-weight: bold;
        font-size: 16px;
        border-radius: 4px;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      button:hover, button:focus {
        opacity: 0.85;
      }
      button#btn-pass {
        background-color: #a6e3a1;
      }
      button#btn-fail {
        background-color: #f38ba8;
      }
    `;

    const container = document.createElement("div");
    container.className = "banner-container";
    container.innerHTML = `
      <div class="instruction-text">
        Does it work?
      </div>
      <div class="button-group">
        <button id="btn-pass">✔️ PASS</button>
        <button id="btn-fail">❌ FAIL</button>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    document.body.insertBefore(host, document.body.firstChild);

    window.__TEST_RESULT__ = null;
    shadow.getElementById("btn-pass").onclick = () => { window.__TEST_RESULT__ = "PASS"; };
    shadow.getElementById("btn-fail").onclick = () => { window.__TEST_RESULT__ = "FAIL"; };
  });

  try {
    const startTime = Date.now();
    let testStatus = null;

    while (Date.now() - startTime < timeout) {
      if (!(await driver.getAllWindowHandles()).includes(testTabHandle)) {
        throw new Error("Tab has been closed.");
      }

      const currentHandle = await driver.getWindowHandle();
      if (currentHandle !== testTabHandle) {
        await driver.switchTo().window(testTabHandle);
      }

      try {
        if (await driver.getCurrentUrl() !== initialUrl) {
          testStatus = "NAVIGATED_AWAY";
          break;
        }

        testStatus = await driver.executeScript(() => window.__TEST_RESULT__);

        if (testStatus) {
          break;
        }

        if (testStatus !== null) {
          testStatus = "NAVIGATED_AWAY";
          break;
        }
      } catch (err) {
        testStatus = "NAVIGATED_AWAY";
        break;
      } finally {
        if (currentHandle !== testTabHandle && (await driver.getAllWindowHandles()).includes(currentHandle)) {
          await driver.switchTo().window(currentHandle);
        }
      }

      await driver.sleep(300);
    }

    if (testStatus === "NAVIGATED_AWAY") {
      throw new Error("Tab has been navigated away.");
    }

    if (!testStatus) {
      throw new Error(`Timeout over ${timeout / 1000} seconds.`);
    }

    if (testStatus === "FAIL") {
      throw new Error("FAIL has been checked.");
    }
  } finally {
    const handles = await driver.getAllWindowHandles();
    if (handles.includes(testTabHandle)) {
      await driver.switchTo().window(testTabHandle);
    } else {
      await driver.switchTo().window(handles[0] ?? "");
      await driver.switchTo().newWindow("tab");
    }
  }
}

$describe.skipIf(
  !resources.includes('manual'),
  'requires "manual" resource',
)('Manual tests', function () {
  this.timeout(600000);
  this.slow(60000);

  const port = config.server_port;
  const portStr = (port === 80) ? '' : `:${port}`;
  const localhost = `http://localhost${portStr}`;

  before('Initialize driver', async function () {
    await driver.get(localhost);
  });

  describe('Test capture', function () {
    it('should be able to handle rather large data', async function () {
      return await runManualTestTab({
        url: `${localhost}/capturex_huge/index.html`,
        timeout: this.timeout(),
      });
    });
  });

  describe('Test viewer', function () {
    it('should ensure links and back/forward button work', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_interlink/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should target the correct frame for links', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_interlink_frame/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should block form submission', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_interlink_frame_form/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should apply CSS rules correctly', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_css_rules/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should handle meta refresh (blocked in newer browsers)', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_metaRefresh/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should view HTZ/MAFF in frames', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_archive_in_frame/index.html`,
        timeout: this.timeout(),
      });
    });

    it('should block scripts', async function () {
      return await runManualTestTab({
        url: `${localhost}/viewer_csp/index.html`,
        timeout: this.timeout(),
      });
    });
  });
});
