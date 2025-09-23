/******************************************************************************
 * Content script for capturer functionality.
 *****************************************************************************/

import {isDebug} from "../utils/debug.mjs";
import * as utils from "../utils/common.mjs";
import {BaseCapturer} from "./common.mjs";

class ContentCapturer extends BaseCapturer {
  /**
   * Invoke a capturer method from another script.
   *
   * - To invoke a background script, provide details.missionId or
   *   args.settings.missionId.
   * - To invoke a content script method in a frame, provide
   *   details.frameWindow.
   *
   * @param {string} method - The capturer method to invoke.
   * @param {*} [args] - The arguments to pass to the capturer method.
   * @param {Object} [details] - Data to determine invocation behavior.
   * @param {Window} [details.frameWindow]
   * @param {string} [details.missionId]
   * @return {Promise<*>}
   */
  async invoke(method, args, details = {}) {
    const {frameWindow, missionId} = details;
    if (frameWindow) {
      // to frame
      const cmd = "capturer." + method;
      return await utils.invokeFrameScript({frameWindow, cmd, args});
    } else {
      // to capturer.html page
      const id = missionId || args?.[0]?.settings?.missionId;
      if (!id) {
        throw new Error(`missionId is required to invoke from a content script.`);
      }
      const cmd = "capturer." + method;
      return await utils.invokeExtensionScript({id, cmd, args});
    }
  }

  /**
   * @param {Object} params - See {@link Capturer.downloadFile}.
   * @return {Promise<downloadBlobResponse>}
   */
  async downloadFile(params) {
    isDebug && console.debug("call: downloadFile", params);

    const {url} = params;

    // In Firefox, the background script cannot download a blob URI in a
    // content page, pass the blob object as overrideBlob to workaround that.
    if (url.startsWith('blob:') && utils.userAgent.is('gecko')) {
      try {
        const xhr = await utils.xhr({
          url,
          responseType: 'blob',
          allowAnyStatus: true,
        });
        const overrideBlob = xhr.response;
        params = Object.assign({}, params, {overrideBlob});
      } catch (ex) {
        // skip Error when the blob is not retrievable
      }
    }

    return await this.invoke("downloadFile", [params]);
  }

  /**
   * @param {Object} params - See {@link Capturer.fetchCss}.
   * @return {Promise<fetchCssResponse>}
   */
  async fetchCss(params) {
    isDebug && console.debug("call: fetchCss", params);

    const {url} = params;

    // In Firefox, the background script cannot download a blob URI in a
    // content page, pass the blob object as overrideBlob to workaround that.
    if (url.startsWith('blob:') && utils.userAgent.is('gecko')) {
      try {
        const xhr = await utils.xhr({
          url,
          responseType: 'blob',
          allowAnyStatus: true,
        });
        const overrideBlob = xhr.response;
        params = Object.assign({}, params, {overrideBlob});
      } catch (ex) {
        // skip Error when the blob is not retrievable
      }
    }

    return await this.invoke("fetchCss", [params]);
  }

  /**
   * @param {Object} params - See {@link Capturer.captureUrl}.
   * @return {Promise<captureDocumentResponse|transferableBlob|null>}
   */
  async captureUrl(params) {
    isDebug && console.debug("call: captureUrl", params);

    const {url} = params;

    // In Firefox, the background script cannot download a blob URI in a
    // content page, pass the blob object as overrideBlob to workaround that.
    if (url.startsWith('blob:') && utils.userAgent.is('gecko')) {
      try {
        const xhr = await utils.xhr({
          url,
          responseType: 'blob',
          allowAnyStatus: true,
        });
        const overrideBlob = xhr.response;
        params = Object.assign({}, params, {overrideBlob});
      } catch (ex) {
        // skip Error when the blob is not retrievable
      }
    }

    return await this.invoke("captureUrl", [params]);
  }

  /**
   * @param {Object} params - See {@link Capturer.saveDocument}.
   * @return {Promise<saveMainDocumentResponse|downloadBlobResponse|transferableBlob>}
   */
  async saveDocument(params) {
    isDebug && console.debug("call: saveDocument", params);

    // pass blob data to the extention script through cache
    params.data.blob = await this.saveBlobCache(params.data.blob);

    return await this.invoke("saveDocument", [params]);
  }
}

const capturer = new ContentCapturer();

export * from "./common.mjs";
export {
  ContentCapturer,
  capturer,
};
