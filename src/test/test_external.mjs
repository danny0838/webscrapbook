import {MochaQuery as $, assert} from "./unittest.mjs";
import * as utils from "../utils/common.mjs";

const $describe = $(describe);

$describe.skipIf($.noExtensionBrowser)('External messaging tests', function () {
  let extensionId;

  before(async function init() {
    const extension = (await browser.management.getAll()).find(x => (
      x.type === "extension" &&
      x.name === "WebScrapBook External Test" &&
      x.enabled
    ));
    if (!extension) {
      throw new Error("External extension not installed and enabled.");
    }
    extensionId = extension.id;
  });

  describe('ping', function () {
    it('should return true', async function () {
      const message = {
        cmd: 'sendExternalMessage',
        args: [{
          cmd: 'ping',
        }],
      };
      const {result} = await browser.runtime.sendMessage(extensionId, message);
      assert.isTrue(result);
    });
  });

  describe('invokeCapture', function () {
    it('should run `invokeCapture`', async function () {
      const message = {
        cmd: 'sendExternalMessage',
        args: [{
          cmd: 'invokeCapture',
          args: [[]],
        }],
      };
      const {result} = await browser.runtime.sendMessage(extensionId, message);
      assert.isNumber(result.id);
      await browser.tabs.remove(result.id);
    });
  });

  describe('invokeCaptureEx', function () {
    it('should run `invokeCaptureEx`', async function () {
      const message = {
        cmd: 'sendExternalMessage',
        args: [{
          cmd: 'invokeCaptureEx',
          args: [{
            taskInfo: {
              tasks: [],
              autoClose: 'always',
            },
          }],
        }],
      };
      const response = await browser.runtime.sendMessage(extensionId, message);

      // Chromiun >= 147: response has prepended "Uncaught Error: ".
      // ref: https://crbug.com/553141297
      assert.include(response.error.message, 'Nothing to capture.');
    });
  });

  describe('unknown', function () {
    it('should throw when invoking an unknown command', async function () {
      const message = {
        cmd: 'sendExternalMessage',
        args: [{
          cmd: 'nonexist',
        }],
      };
      const response = await browser.runtime.sendMessage(extensionId, message);
      assert.strictEqual(response.error.message, "Unable to invoke unknown command 'nonexist'.");
    });
  });
});
