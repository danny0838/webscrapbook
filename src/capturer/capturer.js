/******************************************************************************
 * Script of the main capturer (capturer.html).
 *****************************************************************************/

import {isDebug} from "../utils/debug.mjs";
import * as utils from "../utils/extension.mjs";
import {Cache} from "../utils/cache.mjs";
import {Capturer} from "./capturer.mjs";

class WorkerCapturer extends Capturer {
  _promise = (() => {
    const {promise, resolve, reject} = Promise.withResolvers();
    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
  })();

  _autoClose;
  _autoCloseDelay = 1000;

  logger = document.getElementById('logger');

  addMessageListener() {
    return null;
  }

  async run() {
    super.addMessageListener();

    this._promise.resolve(this._run());
    const results = await this._promise;

    const hasFailure = !results || results.some(x => x.error);

    switch (this._autoClose) {
      case "nowarn": {
        if (this.logger.querySelector('.warn, .error')) {
          break;
        }
      }
      // eslint-disable-next-line no-fallthrough
      case "noerror": {
        if (this.logger.querySelector('.error')) {
          break;
        }
      }
      // eslint-disable-next-line no-fallthrough
      case "nofailure": {
        if (hasFailure) {
          break;
        }
      }
      // eslint-disable-next-line no-fallthrough
      case "always": {
        await this.exit();
        break;
      }
      case "none":
      default: {
        break;
      }
    }
  }

  async _run() {
    const urlObj = new URL(document.URL);
    const s = urlObj.searchParams;

    // use missionId provided from URL params to read task data
    const missionId = this.missionId = s.get('mid');

    utils.loadLanguages(document);

    await utils.loadOptions();

    this._autoClose = utils.getOption("ui.autoCloseCaptureDialog");

    if (!missionId) {
      this.error(`Error: Mission ID not set.`);
      return;
    }

    const key = {table: "captureMissionCache", id: missionId};
    const taskInfo = await Cache.get(key);
    await Cache.remove(key);
    if (!taskInfo || !taskInfo.tasks) {
      this.error(`Error: missing task data for mission "${missionId}".`);
      return;
    }

    if (typeof taskInfo.autoClose === 'string') {
      this._autoClose = taskInfo.autoClose;
    }

    if (!taskInfo.tasks.length) {
      this.error(`Error: nothing to capture.`);
      return;
    }

    try {
      return await super.run(taskInfo, {ignoreTitle: false});
    } catch (ex) {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
      return;
    }
  }

  async getMissionResult() {
    return this._promise;
  }

  async exit() {
    await utils.delay(this._autoCloseDelay);
    const tab = await browser.tabs.getCurrent();
    return await browser.tabs.remove(tab.id);
  }
}

const capturer = new WorkerCapturer();
capturer.run(); // async

/** @global */
globalThis.capturer = capturer;
