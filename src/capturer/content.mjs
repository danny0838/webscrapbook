/******************************************************************************
 * Content script for capturer functionality.
 *
 * @modifies capturer
 *****************************************************************************/

import {isDebug} from "../utils/debug.mjs";
import * as utils from "../utils/common.mjs";
import {capturer} from "./common.mjs";

/**
 * Invoke a capturer method from another script.
 *
 * - To invoke a background script, provide details.missionId or
 *   args.settings.missionId.
 * - To invoke a content script method in a frame, provide
 *   details.frameWindow.
 *
 * @memberof capturer
 * @variation 2
 * @param {string} method - The capturer method to invoke.
 * @param {*} [args] - The arguments to pass to the capturer method.
 * @param {Object} [details] - Data to determine invocation behavior.
 * @param {Window} [details.frameWindow]
 * @param {string} [details.missionId]
 * @return {Promise<*>}
 */
capturer.invoke = async function (method, args, details = {}) {
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
};

/**
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.downloadFile}.
 * @return {Promise<downloadBlobResponse>}
 */
capturer.downloadFile = async function (params) {
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

  return await capturer.invoke("downloadFile", [params]);
};

/**
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.fetchCss}.
 * @return {Promise<fetchCssResponse>}
 */
capturer.fetchCss = async function (params) {
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

  return await capturer.invoke("fetchCss", [params]);
};

/**
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.captureUrl}.
 * @return {Promise<captureDocumentResponse|transferableBlob|null>}
 */
capturer.captureUrl = async function (params) {
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

  return await capturer.invoke("captureUrl", [params]);
};

/**
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.saveDocument}.
 * @return {Promise<saveMainDocumentResponse|downloadBlobResponse|transferableBlob>}
 */
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  // pass blob data to the extention script through cache
  params.data.blob = await capturer.saveBlobCache(params.data.blob);

  return await capturer.invoke("saveDocument", [params]);
};

export * from "./common.mjs";
