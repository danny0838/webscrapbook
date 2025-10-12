/******************************************************************************
 * Common capture utilities shared among background and content scripts.
 *****************************************************************************/

import {isDebug} from "../utils/debug.mjs";
import * as utils from "../utils/common.mjs";
import {StorageCache, serializeObject, deserializeObject} from "../utils/cache.mjs";
import {CaptureDocumentRewriter, PresaveDocumentRewriter, RetrieveDocumentRewriter} from "./doc-handler.mjs";

/**
 * Settings of the current capture.
 *
 * @typedef {Object} captureSettings
 * @property {string} missionId - mission ID for the current capture tasks
 * @property {string} timeId - scrapbook ID for the current capture task
 * @property {?string} documentName - document name for registering
 * @property {?string} indexFilename - index filename of the current capture task
 * @property {string[]} recurseChain
 * @property {number} depth
 * @property {boolean} isMainPage
 * @property {boolean} isMainFrame
 * @property {boolean} fullPage - force to capture the full page
 * @property {string} type - item type
 * @property {string} title - item title
 * @property {string} favIconUrl - item favicon
 */

/**
 * Options of the current capture which is the "capture.*" subgroup of
 * scrapbookOptions.
 *
 * @typedef {scrapbookOptions} captureOptions
 */

/**
 * Base capturer class.
 */
class BaseCapturer {
  /**
   * @param {Object} params
   * @param {Document} [params.doc]
   * @param {string} [params.docUrl] - an overriding document URL
   * @param {string} [params.envDocUrl] - the environment document URL
   * @param {string} [params.baseUrl] - the environment base URL
   * @param {string} [params.refUrl] - the referrer URL
   * @param {string} [params.refPolicy] - the environment referrer policy
   * @param {captureSettings} params.settings
   * @param {string} [params.settings.title] - item title
   * @param {string} [params.settings.favIconUrl] - item favicon
   * @param {captureOptions} params.options
   * @return {Promise<captureDocumentResponse|downloadBlobResponse|transferableBlob>}
   */
  async captureDocumentOrFile(params) {
    isDebug && console.debug("call: captureDocumentOrFile", params);

    const {doc = document, docUrl, envDocUrl, baseUrl, refUrl, refPolicy, settings, options} = params;

    // if not HTML|SVG document, capture as file
    if (!["text/html", "application/xhtml+xml", "image/svg+xml"].includes(doc.contentType)) {
      // handle saveFileAsHtml
      // if the document can be rendered as HTML, save as a normal HTML file
      if (doc.documentElement.nodeName.toLowerCase() === "html" && options["capture.saveFileAsHtml"]) {
        return await this.captureDocument({
          doc,
          docUrl,
          envDocUrl,
          baseUrl,
          refPolicy,
          mime: "text/html",
          settings,
          options,
        });
      }

      return await this.invoke("captureFile", [{
        url: docUrl || doc.URL,
        refUrl,
        refPolicy,
        charset: doc.characterSet,
        settings: Object.assign({}, settings, {
          title: settings.title || doc.title,
        }),
        options,
      }]);
    }

    // otherwise, capture as document
    return await this.captureDocument({
      doc,
      docUrl,
      envDocUrl,
      baseUrl,
      refPolicy,
      settings,
      options,
    });
  }

  /**
   * @typedef {saveMainDocumentResponse|registerDocumentResponse} captureDocumentResponse
   * @property {string} url - URL of the saved filename (with hash).
   */

  /**
   * @param {Object} params
   * @param {Document} [params.doc]
   * @param {string} [params.docUrl] - an overriding document URL
   * @param {string} [params.envDocUrl] - the environment document URL (for
   *   request referrers for about: document)
   * @param {string} [params.baseUrl] - the environment base URL (for
   *   resolving relative URLs for about: document)
   * @param {string} [params.refPolicy] - the environment referrer policy (
   *   the default referrer policy for about: document)
   * @param {string} [params.mime] - an overriding document contentType
   * @param {captureSettings} params.settings
   * @param {string} [params.settings.title] - item title
   * @param {string} [params.settings.favIconUrl] - item favicon
   * @param {captureOptions} params.options
   * @return {Promise<captureDocumentResponse|transferableBlob>}
   */
  async captureDocument(params) {
    isDebug && console.debug("call: captureDocument", params);

    const {duplicate, rewriter, registry} = await this._captureDocument(params);

    if (duplicate) {
      const {docUrlHash, envDocUrl} = duplicate;
      return Object.assign({}, registry, {
        url: this.getRedirectedUrl(registry.url, docUrlHash),
        sourceUrl: envDocUrl,
      });
    }

    const {
      doc,
      settings, options,
      docUrlHash, envDocUrl,
      mime, title,
      requireBasicLoader,
      favIconUrl,
    } = rewriter;
    const {filename: documentFileName} = registry;

    // common pre-save process
    await this.preSaveProcess({
      doc,
      isMainDocument: settings.isMainPage && settings.isMainFrame,
      deleteErased: options["capture.deleteErasedOnCapture"],
      requireBasicLoader,
      insertInfoBar: options["capture.insertInfoBar"],
    });

    // save document
    const content = utils.documentToString(doc, options["capture.prettyPrint"]);
    const blob = new Blob([content], {type: `${mime};charset=UTF-8`});
    const response = await this.saveDocument({
      sourceUrl: this.getRedirectedUrl(envDocUrl, docUrlHash),
      documentFileName,
      settings,
      options,
      data: {
        blob,
        title: settings.title || title,
        favIconUrl: settings.favIconUrl || favIconUrl,
      },
    });

    return Object.assign({}, response, {
      url: this.getRedirectedUrl(response.url, docUrlHash),
      sourceUrl: envDocUrl,
    });
  }

  async _captureDocument(params) {
    const {doc = document, settings, options} = params;
    const {isMainPage, isMainFrame} = settings;
    const isHeadless = !doc.defaultView;

    // determine docUrl, baseUrl, etc.
    const [docUrl, docUrlHash] = utils.splitUrlByAnchor(params.docUrl || doc.URL);
    const envDocUrl = (this.isAboutUrl(docUrl) && params.envDocUrl) ?
      utils.splitUrlByAnchor(params.envDocUrl)[0] :
      docUrl;

    // baseUrl: updates dynamically when the first base[href] is parsed.
    // baseUrlFallback: the initial baseUrl, used for resolving base elements.
    // baseUrlFinal: the final baseUrl, used for resolving links etc.
    // refUrl: used as the referrer when retrieving resources. Actually same
    //     as envDocUrl.
    //
    // URLs in the document are usually resolved using baseUrl, which can be
    // dynamically changed when the first <base href="..."> element is parsed
    // or when it's "href" attribute changes.
    //
    // Nevertheless, links and citations should be updated when the baseUrl
    // changes, such as a[href], a[ping], q[cite]. As a result, they should
    // be resolved using baseUrlFinal.
    //
    // Normally baseUrl should be equivalent to baseUrlFinal as base[href]
    // should appear at first according to spec. Though we still implement
    // dynamic baseUrl for a bad document with an URL before base[href].
    //
    // ref: https://html.spec.whatwg.org/#dynamic-changes-to-base-urls
    const baseUrlFallback = (this.isAboutUrl(docUrl) && params.baseUrl) ?
      utils.splitUrlByAnchor(params.baseUrl)[0] :
      envDocUrl;
    let baseUrl = baseUrlFallback;
    const baseUrlFinal = (() => {
      let base = baseUrlFallback;
      for (const elem of doc.querySelectorAll('base[href]')) {
        if (elem.closest('svg, math')) { continue; }
        base = new URL(elem.getAttribute('href'), baseUrlFallback).href;
        base = utils.splitUrlByAnchor(base)[0];
        break;
      }
      return base;
    })();
    const refUrl = envDocUrl;

    // determine mime
    const mime = params.mime || doc.contentType;

    let docRefPolicy = this.isAboutUrl(docUrl) ? (params.refPolicy || "") : "";

    if (isMainPage && isMainFrame) {
      settings.type ??= (parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options['capture.saveAs'] !== 'singleHtml') ?
        'site' :
        '';
      settings.indexFilename = settings.indexFilename || await this.invoke("formatIndexFilename", [{
        title: settings.title || doc.title || utils.filenameParts(utils.urlToFilename(envDocUrl))[0] || "untitled",
        sourceUrl: envDocUrl,
        isFolder: options["capture.saveAs"] === "folder",
        settings,
        options,
      }]);
    }

    // register the main document before parsing so that it goes before
    // sub-frame documents.
    const registry = await this.invoke("registerDocument", [{
      docUrl: envDocUrl,
      mime,
      role: (options["capture.saveAs"] === "singleHtml" || (envDocUrl.startsWith("data:") && !options["capture.saveDataUriAsFile"])) ? undefined :
          (isMainFrame || (isHeadless && !this.isAboutUrl(docUrl))) ? "document" :
          `document-${utils.getUuid()}`,
      settings,
      options,
    }]);

    // if a previous registry exists, return with a `duplicate` object (except
    // for the main document, which should only happen during a merge capture)
    if (registry.isDuplicate && !(isMainPage && isMainFrame)) {
      return {
        duplicate: {docUrl, docUrlHash, envDocUrl},
        registry,
      };
    }

    // group sub-frames with same filename
    if (isMainFrame) {
      settings.documentName = utils.filenameParts(registry.filename)[0];
    }

    // clone the document and rewrite content
    const rewriter = await CaptureDocumentRewriter.runWithClone(doc, {
      capturer: this,
      settings, options,
      isHeadless,
      docUrl, docUrlHash, envDocUrl,
      baseUrl, baseUrlFinal, baseUrlFallback,
      refUrl, docRefPolicy,
      mime,
    });

    return {rewriter, registry};
  }

  /**
   * @typedef {Object} retrieveDocumentContentResponseItem
   * @property {Blob} blob
   * @property {Object} info
   * @property {string} info.isMainFrame
   * @property {string} info.title
   * @property {Object} resources
   * @property {string} resources.uuid
   * @property {string} resources.url
   */

  /**
   * @typedef {Object<string~docUrl, retrieveDocumentContentResponseItem>} retrieveDocumentContentResponse
   */

  /**
   * @param {Object} params
   * @param {Document} [params.doc]
   * @param {boolean} [params.internalize]
   * @param {boolean} params.isMainPage
   * @param {Object} params.item
   * @param {captureOptions} params.options
   * @return {Promise<retrieveDocumentContentResponse>}
   */
  async retrieveDocumentContent(params) {
    isDebug && console.debug("call: retrieveDocumentContent", params);

    const {doc = document, internalize = false, isMainPage, item, options} = params;

    const data = {};
    const docs = utils.flattenFrames(doc);
    for (let i = 0, I = docs.length; i < I; i++) {
      const doc = docs[i];
      const docUrl = utils.normalizeUrl(utils.splitUrl(doc.URL)[0]);
      if (docUrl in data) { continue; }

      // skip non-HTML documents
      if (!["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
        continue;
      }

      const {contentType: mime, characterSet: charset} = doc;
      const isMainFrame = i === 0;

      const rewriter = await RetrieveDocumentRewriter.runWithClone(doc, {
        capturer: this,
        internalize, item,
        isMainPage, isMainFrame,
        includeShadowDom: true,
      });
      const {doc: newDoc, info, resources, requireBasicLoader} = rewriter;

      // common pre-save process
      await this.preSaveProcess({
        doc: newDoc,
        isMainDocument: isMainPage && isMainFrame,
        deleteErased: options["capture.deleteErasedOnSave"],
        requireBasicLoader,
        insertInfoBar: options["capture.insertInfoBar"],
      });

      const content = utils.documentToString(newDoc, options["capture.prettyPrint"]);
      let blob = new Blob([content], {type: `${mime};charset=${charset}`});
      blob = await this.saveBlobCache(blob);

      data[docUrl] = {
        blob,
        info,
        resources,
      };
    }
    return data;
  }

  /**
   * Process DOM before capture or resave.
   *
   * @param {Object} params
   * @param {Document} params.doc
   * @param {boolean} params.isMainDocument
   * @param {boolean} params.deleteErased
   * @param {boolean} params.requireBasicLoader
   * @param {boolean} params.insertInfoBar
   * @return {Promise<Object>}
   */
  async preSaveProcess(params) {
    isDebug && console.debug("call: preSaveProcess", params);

    const {doc, isMainDocument, deleteErased, requireBasicLoader, insertInfoBar} = params;

    PresaveDocumentRewriter.run(doc, {isMainDocument, deleteErased, requireBasicLoader, insertInfoBar});
  }

  /**
   * @param {Object} params
   * @param {Document} [params.doc]
   * @param {string} [params.select]
   * @param {string[]} [params.filter]
   * @return {Promise<Array>}
   */
  async retrieveSelectedLinks({
    doc = document,
    select = 'auto',
    filter = ['http:', 'https:'],
  } = {}) {
    switch (select) {
      case 'selected':
      case 'all':
        break;
      default:
        select = utils.getSelection().type !== 'Range' ? 'all' : 'selected';
        break;
    }

    let nodes;
    switch (select) {
      case 'selected': {
        nodes = utils.getSelectedNodes({
          whatToShow: NodeFilter.SHOW_ELEMENT,
          nodeFilter: (node) => {
            return node.matches('a[href], area[href]');
          },
          fuzzy: true,
        });
        break;
      }
      case 'all': {
        nodes = doc.querySelectorAll('a[href], area[href]');
        break;
      }
    }

    let rv = Array.prototype.map.call(nodes, a => ({
      url: a.href,
      title: a.textContent,
    }));

    if (filter) {
      rv = rv.filter(x => filter.some(f => x.url.startsWith(f)));
    }

    return rv;
  }

  getRedirectedUrl(redirectedUrl, sourceUrlHash) {
    const [redirectedUrlMain, redirectedUrlHash] = utils.splitUrlByAnchor(redirectedUrl);

    // Some browsers may encounter an error for a data URL with hash.
    if (redirectedUrl.startsWith('data:')) {
      return redirectedUrlMain;
    }

    // @FIXME:
    // Browsers usually take the redirected URL hash if it exists.
    // Unfortunately, XMLHttpRequest and fetch does not keep response URL hash,
    // and thus this may not actually happen.
    if (redirectedUrlHash) {
      return redirectedUrl;
    }

    // Browsers usually keep source URL hash if the redirected URL has no hash.
    return redirectedUrlMain + sourceUrlHash;
  }

  resolveRelativeUrl(url, baseUrl, {skipLocal = true} = {}) {
    // do not resolve an empty or pure hash URL
    if (skipLocal) {
      if (!url || url.startsWith("#")) {
        return url;
      }
    }

    try {
      return new URL(url, baseUrl).href;
    } catch (ex) {
      return url;
    }
  }

  /**
   * Check if the URL matches about:blank or about:srcdoc
   *
   * ref: https://html.spec.whatwg.org/#determining-the-origin
   */
  isAboutUrl(url) {
    if (/^about:srcdoc(?=#|$)/.test(url)) {
      return true;
    }
    if (/^about:blank(?=[?#]|$)/.test(url)) {
      return true;
    }
    return false;
  }

  isJavascriptUrl(url) {
    try {
      return new URL(url).protocol === "javascript:";
    } catch {
      return false;
    }
  }

  getErrorUrl(sourceUrl, options) {
    if (!options?.["capture.linkUnsavedUri"]) {
      if (['http:', 'https:', 'file:', 'about:'].some(p => sourceUrl.startsWith(p))) {
        return `urn:scrapbook:download:error:${sourceUrl}`;
      } else if (sourceUrl.startsWith("data:")) {
        return `urn:scrapbook:download:error:data:`;
      } else if (sourceUrl.startsWith("blob:")) {
        return `urn:scrapbook:download:error:blob:`;
      }
    }
    return sourceUrl;
  }

  /**
   * @typedef {Object} blobCacheObject
   * @property {string} __key__ - UUID to retrieve the Blob data
   */

  /**
   * An object that can be transmitted through messaging.
   *
   * @typedef {Blob|serializedBlob|blobCacheObject} transferableBlob
   */

  /**
   * Save a Blob in the cache and return a transferableBlob.
   *
   * @param {Blob} blob
   * @param {number} threshold - cache only when size greater than this
   * @return {Promise<transferableBlob>}
   */
  async saveBlobCache(blob, threshold = 32 * 1024 * 1024) {
    // Return the original Blob if the browser supports tramsmitting Blob
    // through message natively.
    if (utils.userAgent.is('gecko')) {
      return blob;
    }

    // for a small Blob, simply serialize to an object
    if (blob.size < threshold) {
      return await serializeObject(blob);
    }

    const uuid = utils.getUuid();
    const key = {table: "blobCache", key: uuid};
    await StorageCache.set(key, blob);
    return {__key__: uuid};
  }

  /**
   * Load a Blob from a transferableBlob.
   *
   * @param {transferableBlob} blob
   * @return {Promise<Blob>}
   */
  async loadBlobCache(blob) {
    if (blob instanceof Blob) {
      return blob;
    }

    if (blob.__type__) {
      return await deserializeObject(blob);
    }

    const key = {table: "blobCache", key: blob.__key__};
    const rv = await StorageCache.get(key);
    await StorageCache.remove(key);
    return rv;
  }
}

export {
  BaseCapturer,
};
