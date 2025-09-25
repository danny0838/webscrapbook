import {MochaQuery as $, assert} from "./unittest.mjs";
import {config, checkExtension} from "./extension.mjs";
import * as utils from "../utils/common.mjs";

const $describe = $(describe);

$describe.skipIf($.noExtensionBrowser)('External messaging tests', function () {
  let extension_id;

  before(async function init() {
    await checkExtension();
    extension_id = config["extension_id"];
  });

  describe('ping', function () {
    it('should return true', async function () {
      const message = {
        cmd: 'sendExternalMessage',
        args: [{
          cmd: 'ping',
        }],
      };
      const {result} = await browser.runtime.sendMessage(extension_id, message);
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
      const {result} = await browser.runtime.sendMessage(extension_id, message);
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
      const response = await browser.runtime.sendMessage(extension_id, message);
      assert.strictEqual(response.error.message, 'Nothing to capture.');
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
      const response = await browser.runtime.sendMessage(extension_id, message);
      assert.strictEqual(response.error.message, "Unable to invoke unknown command 'nonexist'.");
    });
  });
});
