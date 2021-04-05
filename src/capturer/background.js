/******************************************************************************
 *
 * Background script for capturer functionality.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    console,
  );
}(this, async function (isDebug, browser, scrapbook, console) {

  'use strict';

  // clear capturer caches
  {
    const tableSet = new Set(["captureMissionCache", "batchCaptureMissionCache", "fetchCache"]);
    const items = await scrapbook.cache.getAll((obj) => {
      return tableSet.has(obj.table);
    });
    await scrapbook.cache.remove(Object.keys(items));
  }

  initAutoCapture: {
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/i;

    const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();

    /**
     * @typedef {Object} autoCaptureConfig
     * @property {string} name
     * @property {string} description
     * @property {boolean} disabled
     * @property {boolean} debug
     * @property {number} tabId
     * @property {string} pattern
     * @property {number} delay
     * @property {number} repeat
     * @property {boolean} allowDuplicate
     * @property {Object} taskInfo
     * @property {Object} eachTaskInfo
     */

    /**
     * @type {Array<autoCaptureConfig>}
     */
    let autoCaptureConfigs = [];

    /**
     * @typedef {Object} autoCaptureInfo
     * @property {Array<timeout>} delay
     * @property {Array<interval>} repeat
     */

    /**
     * @type {Map<number~tabId, autoCaptureInfo>}
     */
    const autoCaptureInfos = new Map();
    const autoCapturedUrls = new Set();

    async function invokeCapture(tabInfo, config, isRepeat) {
      // check if the tab still exists
      try {
        await browser.tabs.get(tabInfo.id)
      } catch (ex) {
        purgeInfo(tabInfo.id);
        return;
      }

      const taskInfo = Object.assign({
        autoClose: "always",
        tasks: [Object.assign({
         tabId: tabInfo.id,
        }, config.eachTaskInfo)],
      }, config.taskInfo);

      const args = {
        taskInfo,
        windowCreateData: {
          focused: false,
        },
        tabCreateData: {
          active: false,
        },
        waitForResponse: false,
      };

      // Firefox does not support browser.windows.create({focused}),
      // such call never returns.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1213484
      if (scrapbook.userAgent.is('gecko')) {
        delete args.windowCreateData;
      }

      const captureTab = await scrapbook.invokeCaptureEx(args);
      if (browser.windows) {
        await browser.windows.update(captureTab.windowId, {
          focused: false,
          state: 'minimized',
        });
      }

      if (isRepeat) {
        return;
      }

      if (!config.allowDuplicate) {
        autoCapturedUrls.add(tabInfo.url);
      }

      if (config.repeat >= 0) {
        let info = autoCaptureInfos.get(tabInfo.id);
        if (!info) {
          info = {};
          autoCaptureInfos.set(tabInfo.id, info);
        }
        if (!info.repeat) {
          info.repeat = [];
        }
        const t = setInterval(() => {
          invokeCapture(tabInfo, config, true);
        }, config.repeat);
        info.repeat.push(t);
      }
    }

    function onUpdated(tabId, changeInfo, tabInfo) {
      // reset timer if tab closed
      if (changeInfo.status === 'loading' || changeInfo.discarded || changeInfo.hidden) {
        // note that tab id is changed when a tab is discarded in Chromium
        purgeInfo(tabInfo.id);
        return;
      }

      // skip if not loading event
      if (changeInfo.status !== 'complete') {
        return;
      }

      // remove hash from URL
      tabInfo.url = scrapbook.splitUrlByAnchor(tabInfo.url)[0];

      // skip URLs that are not content page
      if (!scrapbook.isContentPage(tabInfo.url, allowFileAccess)) {
        return;
      }

      // skip URLs in the backend server
      const serverUrl = scrapbook.getOption("server.url");
      if (serverUrl && tabInfo.url.startsWith(serverUrl)) {
        return;
      }

      // check config
      for (let i = 0, I = autoCaptureConfigs.length; i < I; ++i) {
        const config = autoCaptureConfigs[i];

        try {
          // skip disabled config
          if (config.disabled) {
            continue;
          }

          // check tabId
          if (Number.isInteger(config.tabId) && tabInfo.id !== config.tabId) {
            continue;
          }

          // check pattern
          if (config.pattern && !config.pattern.test(tabInfo.url)) {
            continue;
          }

          // skip if duplicated
          if (!config.allowDuplicate && autoCapturedUrls.has(tabInfo.url)) {
            continue;
          }

          // setup capture task
          if (config.delay >= 0) {
            let info = autoCaptureInfos.get(tabInfo.id);
            if (!info) {
              info = {};
              autoCaptureInfos.set(tabInfo.id, info);
            }
            if (!info.delay) {
              info.delay = [];
            }
            const t = setTimeout(() => {
              invokeCapture(tabInfo, config, false);
            }, config.delay);
            info.delay.push(t);
          } else {
            invokeCapture(tabInfo, config, false);
          }
        } catch (ex) {
          const nameStr = (config && config.name) ? ` (${config.name})` : '';
          console.error(`Failed to run auto-capture config[${i}]${nameStr} for tab[${tabInfo.id}] (${tabInfo.url}): ${ex.message}`);
        }
      }
    }

    function onRemoved(tabId, removeInfo) {
      purgeInfo(tabId);
    }

    function enableAutoCapture(willEnable) {
      purgeInfoAll();
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      if (willEnable) {
        browser.tabs.onUpdated.addListener(onUpdated);
        browser.tabs.onRemoved.addListener(onRemoved);
      }
    }

    function configAutoCapture(rulesText) {
      if (!rulesText) {
        autoCaptureConfigs = [];
        return;
      }

      try {
        autoCaptureConfigs = JSON.parse(rulesText);
        if (!Array.isArray(autoCaptureConfigs)) {
          throw new Error(`Configs is not an array.`);
        }
      } catch (ex) {
        console.error(`Skipped auto-capture config of due to invalid definition: ${ex.message}`);
        autoCaptureConfigs = [];
        return;
      }

      for (let i = 0, I = autoCaptureConfigs.length; i < I; ++i) {
        const config = autoCaptureConfigs[i];

        try {
          if (typeof config !== 'object') {
            throw new Error('Invalid object')
          }
          if (config.pattern) {
            config.pattern = parseRegexStr(config.pattern);
          }
        } catch (ex) {
          const nameStr = (config && config.name) ? ` (${config.name})` : '';
          console.error(`Disabled auto-capture config[${i}]${nameStr}: ${ex.message}`);
          autoCaptureConfigs[i] = {disabled: true};
        }
      }
    }

    function purgeInfoAll() {
      for (const [tabId, info] of autoCaptureInfos) {
        purgeInfo(tabId, info);
      }
    }

    function purgeInfo(tabId, info) {
      info = info || autoCaptureInfos.get(tabId);
      if (!info) { return; }

      let t;
      if (info.delay) {
        for (const t of info.delay) {
          clearTimeout(t);
        }
      }
      if (info.repeat) {
        for (const t of info.repeat) {
          clearInterval(t);
        }
      }
      autoCaptureInfos.delete(tabId);
    }

    function parseRegexStr(str) {
      const m = str.match(REGEX_PATTERN);
      if (m) {
        return new RegExp(m[1], m[2]);
      }
      return null;
    }

    browser.storage.onChanged.addListener(async (changes, areaName) => {
      if ("autocapture.rules" in changes) {
        configAutoCapture(changes["autocapture.rules"].newValue);
      }
      if ("autocapture.enabled" in changes) {
        enableAutoCapture(changes["autocapture.enabled"].newValue);
      }
    });

    await scrapbook.loadOptionsAuto;
    configAutoCapture(scrapbook.getOption("autocapture.rules"));
    enableAutoCapture(scrapbook.getOption("autocapture.enabled"));
  }

}));
