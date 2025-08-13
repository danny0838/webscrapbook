/******************************************************************************
 * Shared utilities for most content scripts.
 *****************************************************************************/

import {scrapbook} from "../utils/common.mjs";
import "../utils/options-auto.mjs";
import {core} from "./core.mjs";
import {capturer} from "../capturer/common.mjs";
import {editor} from "../editor/content.mjs";

/**
 * Return frameId of the frame of this content script.
 *
 * - Do not receive and react to a command here to prevent an Xray vision
 *   issue of the passed data in Firefox and a security harzard from a page
 *   script that knows about the extension.
 * - Check for extension URL rather than ID as it's encrypted in some
 *   browsers (e.g. Firefox) and not known by a page script.
 */
window.addEventListener("message", async (event) => {
  try {
    if (event.data !== browser.runtime.getURL('')) {
      throw new Error('Not extension context.');
    }
  } catch (ex) {
    // browser.runtime.getURL() may trigger an error if extension is reloaded
    return;
  }

  event.ports[0].postMessage({frameId: core.frameId});
}, false);

scrapbook.addMessageListener();

/** @global */
globalThis.scrapbook = scrapbook;

/** @global */
globalThis.core = core;

/** @global */
globalThis.capturer = capturer;

/** @global */
globalThis.editor = editor;
