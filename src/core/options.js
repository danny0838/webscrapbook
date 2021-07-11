/******************************************************************************
 *
 * Script for options.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  const OPTION_PREFIX = "opt_";

  async function initOptions() {
    const options = await scrapbook.getOptions();
    for (const key in options) {
      setOptionToDocument(key, options[key]);
    }
  }

  function getOptionFromDocument(key) {
    const elem = document.getElementById(OPTION_PREFIX + key);
    if (!elem) { return; }

    if (elem.matches('input[type="checkbox"]')) {
      return elem.checked;
    } else if (elem.matches('input[type="number"]')) {
      return elem.validity.valid && elem.value !== "" ? elem.valueAsNumber : null;
    } else {
      return elem.value;
    }
  }

  function setOptionToDocument(key, value, includeHidden) {
    let elem = document.getElementById(OPTION_PREFIX + key);

    // If the given option is not in the form, create a hidden element to allow
    // reseting hidden values or do some hacking.
    if (!elem) {
      if (!includeHidden) { return; }

      const wrapper = document.getElementById('options');
      if (typeof value === 'string') {
        elem = document.createElement('input');
        elem.type = 'text';
        elem.value = value;
      } else if (typeof value === 'boolean') {
        elem = document.createElement('input');
        elem.type = 'checkbox';
        elem.checked = value;
      } else if (typeof value === 'number') {
        elem = document.createElement('input');
        elem.type = 'number';
        elem.value = value;
      } else if (value === null) {
        // null is only used for an unset number
        elem = document.createElement('input');
        elem.type = 'number';
      }
      elem.id = OPTION_PREFIX + key;
      elem.hidden = true;
      wrapper.appendChild(elem);
    }

    if (elem.matches('input[type="checkbox"]')) {
      elem.checked = !!value;
    } else {
      elem.value = value;

      // If the given value is not included in the options,
      // generate a hidden option element for it, so that
      // importing hacking value is allowed.
      if (elem.matches('select') && elem.value != value) {
        const c = elem.appendChild(document.createElement('option'));
        c.hidden = true;
        c.value = c.textContent = value;
        elem.value = value;
      }
    }
  }

  function resetOptions(file) {
    for (const key in scrapbook.DEFAULT_OPTIONS) {
      setOptionToDocument(key, scrapbook.DEFAULT_OPTIONS[key], true);
    }
  }

  async function exportOptions() {
    const blob = new Blob([JSON.stringify(await scrapbook.getOptions(), null, 2)], {type: "application/json"});
    const filename = `webscrapbook.options.${scrapbook.dateToId().slice(0, 8)}.json`;

    if (scrapbook.userAgent.is('gecko')) {
      // Firefox has a bug that the screen turns unresponsive
      // when an addon page is redirected to a blob URL.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
      //
      // Workaround by creating the anchor in an iframe.
      const iDoc = document.getElementById('downloader').contentDocument;
      const a = iDoc.createElement('a');
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      iDoc.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const elem = document.createElement('a');
    elem.download = filename;
    elem.href = URL.createObjectURL(blob);
    document.body.appendChild(elem);
    elem.click();
    elem.remove();
  }

  async function importOptions(file) {
    document.getElementById("import-input").value = null;

    try {
      const options = JSON.parse(await scrapbook.readFileAsText(file));
      for (const key in options) {
        setOptionToDocument(key, options[key], true);
      }
      alert(scrapbook.lang("OptionsImportSuccess"));
    } catch (ex) {
      alert(scrapbook.lang("ErrorImportOptions", [ex.message]));
    }
  }

  async function closeWindow() {
    const tab = await browser.tabs.getCurrent();
    if (!tab) {
      // options.html is a prompt diaglog
      window.close();
    } else if (tab.url.startsWith(browser.runtime.getURL(""))) {
      // options.html is in a tab (or Firefox Android)
      // close the tab
      return await browser.tabs.remove(tab.id);
    } else {
      // options.html is embedded in about:addon in Firefox
      // do not close the tab
    }
  }

  function getDetailStatusKey() {
      return {table: "optionDetailStatus"};
  }

  async function loadDetailStatus() {
    const status = await scrapbook.cache.get(getDetailStatusKey(), 'storage');
    if (!status) { return; }

    for (const id in status) {
      const elem = document.getElementById(id);
      if (elem) {
        elem.open = status[id];
      }
    }
  }

  async function saveDetailStatus() {
    const status = {};
    for (const elem of document.querySelectorAll('details')) {
      status[elem.id] = elem.open;
    }
    await scrapbook.cache.set(getDetailStatusKey(), status, 'storage');
  }

  function refreshForm() {
    renewCaptureSaveToDetails();
    renewCaptureSaveAsDetails();
    verifySaveFolder();
    verifySaveFilename();
    renewCaptureDownLinkDetails();
    verifyDownLinkFileExtFilter();
    verifyDownLinkDocUrlFilter();
    verifyDownLinkUrlFilter();
    verifyCaptureHelpers();
    verifyAutoCapture();
    document.getElementById('options').reportValidity();
  }

  function renewCaptureSaveToDetails() {
    const mode = document.getElementById("opt_capture.saveTo").value;

    for (const elem of document.querySelectorAll('.captureScrapbookFolder')) {
      elem.hidden = mode !== 'folder';
    }

    var elem = document.getElementById('opt_capture.saveAs');
    elem.querySelector('[value="folder"]').disabled = mode === 'file';
    if (elem.value === 'folder' && mode === 'file') {
      elem.querySelector(':enabled').selected = true;
    }
  }

  function renewCaptureSaveAsDetails() {
    const mode = document.getElementById("opt_capture.saveAs").value;

    for (const elem of document.querySelectorAll('.captureMergeCssResources')) {
      elem.hidden = mode !== 'singleHtml';
    }
    for (const elem of document.querySelectorAll('.captureSaveDataUriAsFile')) {
      elem.hidden = mode === 'singleHtml';
    }
  }

  function verifySavePath(elem) {
    if (elem.value) {
      // make sure it's a valid path for browser.downloads.download
      elem.value = elem.value.split(/[\\\/]/).map(x => scrapbook.validateFilename(x)).join('/');
    } else {
      // reset value to placeholder
      elem.value = elem.placeholder;
    }
  }

  function verifySaveFolder() {
    const elem = document.getElementById("opt_capture.saveFolder");
    verifySavePath(elem);
  }

  function verifySaveFilename() {
    const elem = document.getElementById("opt_capture.saveFilename");
    verifySavePath(elem);
  }

  function renewCaptureDownLinkDetails() {
    var input = document.getElementById("opt_capture.downLink.file.mode");
    for (const elem of document.querySelectorAll('.captureDownLinkFileExtFilter')) {
      elem.hidden = elem.disabled = input.value === 'none';
    }

    var input = document.getElementById("opt_capture.downLink.doc.depth");
    for (const elem of document.querySelectorAll('.captureDownLinkDocUrlFilter')) {
      elem.hidden = elem.disabled = !(input.valueAsNumber > 0);
    }
  }

  function verifyDownLinkRules(srcText) {
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const fn = verifyDownLinkRules = (source) => {
      // linefeeds are always '\n' for textarea value
      const lines = source.split('\n');
      for (let i = 0, I = lines.length; i < I; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith("#")) { continue; }

        if (REGEX_PATTERN.test(line)) {
          try {
            new RegExp(RegExp.$1, RegExp.$2);
          } catch (ex) {
            return `Line ${i + 1}: ${ex.message}`;
          }
        }
      }
      return '';
    };
    return fn(srcText);
  }

  function verifyDownLinkUrlRules(srcText) {
    const REGEX_SPACES = /\s+/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const fn = verifyDownLinkUrlRules = (source) => {
      // linefeeds are always '\n' for textarea value
      const lines = source.split('\n');
      for (let i = 0, I = lines.length; i < I; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith("#")) { continue; }

        line = line.split(REGEX_SPACES)[0];
        if (REGEX_PATTERN.test(line)) {
          try {
            new RegExp(RegExp.$1, RegExp.$2);
          } catch (ex) {
            return `Line ${i + 1}: ${ex.message}`;
          }
        } else {
          line = scrapbook.splitUrlByAnchor(line)[0];
          try {
            new URL(line);
          } catch (ex) {
            return `Line ${i + 1}: Invalid URL: ${line}`;
          }
        }
      }
      return '';
    };
    return fn(srcText);
  }

  function verifyDownLinkFileExtFilter() {
    const elem = document.getElementById("opt_capture.downLink.file.extFilter");
    elem.setCustomValidity(verifyDownLinkRules(elem.value));
  }

  function verifyDownLinkDocUrlFilter() {
    const elem = document.getElementById("opt_capture.downLink.doc.urlFilter");
    elem.setCustomValidity(verifyDownLinkUrlRules(elem.value));
  }

  function verifyDownLinkUrlFilter() {
    const elem = document.getElementById("opt_capture.downLink.urlFilter");
    elem.setCustomValidity(verifyDownLinkUrlRules(elem.value));
  }

  function verifyCaptureHelpers() {
    const enabled = document.getElementById("opt_capture.helpersEnabled").checked;

    const elem = document.getElementById("opt_capture.helpers");
    elem.required = enabled;

    const json = elem.value;
    if (json) {
      try {
        const configs = JSON.parse(json);
        if (!Array.isArray(configs)) {
          throw new Error('Invalid array');
        }

        for (let i = 0, I = configs.length; i < I; i++) {
          try {
            const config = configs[i];
            if (typeof config !== 'object' || config === null || Array.isArray(config)) {
              throw new Error(`Invalid object`);
            }
            if (config.pattern) {
              if (typeof config.pattern !== 'string') {
                throw new Error(`Pattern must be a string`);
              }
              if (/^\/(.*)\/([a-z]*)$/.test(config.pattern)) {
                try {
                  new RegExp(RegExp.$1, RegExp.$2);
                } catch (ex) {
                  throw new Error(`Invalid pattern: ${ex.message}`);
                }
              } else {
                throw new Error(`Invalid pattern: Unsupported format.`);
              }
            }
          } catch (ex) {
            throw new Error(`Helper[${i}]: ${ex.message}`);
          }
        }
      } catch (ex) {
        elem.setCustomValidity(ex.message);
        return;
      }
    }

    elem.setCustomValidity('');
  }

  function verifyAutoCapture() {
    const enabled = document.getElementById("opt_autocapture.enabled").checked;

    const elem = document.getElementById("opt_autocapture.rules");
    elem.required = enabled;

    const json = elem.value;
    if (json) {
      try {
        const configs = JSON.parse(json);
        if (!Array.isArray(configs)) {
          throw new Error('Invalid array');
        }

        for (let i = 0, I = configs.length; i < I; i++) {
          try {
            const config = configs[i];
            if (typeof config !== 'object' || config === null || Array.isArray(config)) {
              throw new Error(`Invalid object`);
            }
            if (config.pattern) {
              if (typeof config.pattern !== 'string') {
                throw new Error(`Pattern must be a string`);
              }
              if (/^\/(.*)\/([a-z]*)$/.test(config.pattern)) {
                try {
                  new RegExp(RegExp.$1, RegExp.$2);
                } catch (ex) {
                  throw new Error(`Invalid pattern: ${ex.message}`);
                }
              } else {
                throw new Error(`Invalid pattern: Unsupported format.`);
              }
            }
          } catch (ex) {
            throw new Error(`Config[${i}]: ${ex.message}`);
          }
        }
      } catch (ex) {
        elem.setCustomValidity(ex.message);
        return;
      }
    }

    elem.setCustomValidity('');
  }

  async function openIndexer() {
    const u = new URL(browser.runtime.getURL("scrapbook/cache.html"));
    const params = u.searchParams;
    if (getOptionFromDocument('indexer.fulltextCache')) {
      params.append('fulltext', 1);
    }
    if (getOptionFromDocument('indexer.fulltextCacheFrameAsPageContent')) {
      params.append('inclusive_frames', 1);
    }
    if (getOptionFromDocument('indexer.fulltextCacheRecreate')) {
      params.append('recreate', 1);
    }
    if (getOptionFromDocument('indexer.createStaticSite')) {
      params.append('static_site', 1);
    }
    if (getOptionFromDocument('indexer.createStaticIndex')) {
      params.append('static_index', 1);
    }
    if (getOptionFromDocument('indexer.createRssFeed')) {
      const rssRoot = getOptionFromDocument('indexer.createRssFeedBase') ||
          getOptionFromDocument('server.url');
      params.append('rss_root', rssRoot);
      params.append('rss_item_count', getOptionFromDocument('indexer.createRssFeedCount'));
    }
    if (!getOptionFromDocument('indexer.makeBackup')) {
      params.append('no_backup', 1);
    }

    return await scrapbook.visitLink({
      url: u.href,
      newTab: true,
      singleton: true,
    });
  }

  async function openChecker() {
    const u = new URL(browser.runtime.getURL("scrapbook/check.html"));
    const params = u.searchParams;
    if (getOptionFromDocument('checker.resolveInvalidId')) {
      params.append('resolve_invalid_id', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingIndex')) {
      params.append('resolve_missing_index', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingIndexFile')) {
      params.append('resolve_missing_index_file', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingDate')) {
      params.append('resolve_missing_date', 1);
    }
    if (getOptionFromDocument('checker.resolveOlderMtime')) {
      params.append('resolve_older_mtime', 1);
    }
    if (getOptionFromDocument('checker.resolveTocUnreachable')) {
      params.append('resolve_toc_unreachable', 1);
    }
    if (getOptionFromDocument('checker.resolveTocInvalid')) {
      params.append('resolve_toc_invalid', 1);
    }
    if (getOptionFromDocument('checker.resolveTocEmptySubtree')) {
      params.append('resolve_toc_empty_subtree', 1);
    }
    if (getOptionFromDocument('checker.resolveUnindexedFiles')) {
      params.append('resolve_unindexed_files', 1);
    }
    if (getOptionFromDocument('checker.resolveAbsoluteIcon')) {
      params.append('resolve_absolute_icon', 1);
    }
    if (getOptionFromDocument('checker.resolveUnusedIcon')) {
      params.append('resolve_unused_icon', 1);
    }
    if (!getOptionFromDocument('checker.makeBackup')) {
      params.append('no_backup', 1);
    }

    return await scrapbook.visitLink({
      url: u.href,
      newTab: true,
      singleton: true,
    });
  }

  function toggleTooltip(elem) {
    if (!toggleTooltip.tooltipMap) {
      toggleTooltip.tooltipMap = new WeakMap();
    }
    const tooltipMap = toggleTooltip.tooltipMap;

    let tooltip = tooltipMap.get(elem);
    if (tooltip) {
      tooltip.remove();
      tooltipMap.set(elem, null);
    } else {
      tooltip = elem.parentNode.insertBefore(document.createElement("div"), elem.nextSibling);
      tooltip.className = "tooltip";
      tooltip.textContent = elem.getAttribute("data-tooltip");
      tooltipMap.set(elem, tooltip);
    }
  }

  function onOpenIndexerClick(event) {
    event.preventDefault();
    openIndexer();
  }

  function onOpenCheckerClick(event) {
    event.preventDefault();
    openChecker();
  }

  async function onSubmit(event) {
    event.preventDefault();

    // verify the form
    refreshForm();

    // save options
    const keys = {};
    for (const key in scrapbook.DEFAULT_OPTIONS) {
      // Overwrite only keys with a defined value so that
      // keys not listed in the options page are not nullified.
      // In Chromium, storageArea.set({key: undefined}) does not store to key.
      // In Firefox, storageArea.set({key: undefined}) stores null to key.
      const value = getOptionFromDocument(key);
      if (typeof value !== "undefined") {
        keys[key] = value;
      }
    }
    await scrapbook.setOptions(keys);
    return closeWindow();
  }

  function onResetClick(event) {
    event.preventDefault();
    resetOptions();
    refreshForm();
  }

  function onExportClick(event) {
    event.preventDefault();
    exportOptions();
  }

  function onImportClick(event) {
    event.preventDefault();
    document.getElementById("import-input").click();
  }

  async function onImportInputChange(event) {
    event.preventDefault();
    const file = event.target.files[0];
    await importOptions(file);
    refreshForm();
  }

  function onDetailsToggle(event) {
    saveDetailStatus();
  }

  function onTooltipClick(event) {
    event.preventDefault();
    const elem = event.currentTarget;
    toggleTooltip(elem);
  }

  function onInvalid(event) {
    const elem = event.target;
    const closedParentDetails = elem.closest('details:not([open])');
    if (closedParentDetails) {
      closedParentDetails.setAttribute('open', '');
    }
  }

  window.addEventListener("DOMContentLoaded", async (event) => {
    // load languages
    scrapbook.loadLanguages(document);
    document.getElementById("optionServerUrlTooltip").setAttribute('data-tooltip', scrapbook.lang('OptionServerUrlTooltip', [scrapbook.BACKEND_MIN_VERSION]));

    // hide unsupported options
    if (!browser.browserAction || !browser.browserAction.setBadgeText) {
      for (const elem of document.querySelectorAll('.uiNotifyPageCaptured')) {
        elem.hidden = true;
      }
    }

    // load default options
    await initOptions();

    // load detail status
    await loadDetailStatus();

    // event handlers
    document.getElementById("opt_capture.saveTo").addEventListener("change", renewCaptureSaveToDetails);
    document.getElementById("opt_capture.saveAs").addEventListener("change", renewCaptureSaveAsDetails);
    document.getElementById("opt_capture.saveFolder").addEventListener("change", verifySaveFolder);
    document.getElementById("opt_capture.saveFilename").addEventListener("change", verifySaveFilename);

    document.getElementById("opt_capture.downLink.file.mode").addEventListener("change", renewCaptureDownLinkDetails);
    document.getElementById("opt_capture.downLink.doc.depth").addEventListener("change", renewCaptureDownLinkDetails);
    document.getElementById("opt_capture.downLink.file.extFilter").addEventListener("change", verifyDownLinkFileExtFilter);
    document.getElementById("opt_capture.downLink.doc.urlFilter").addEventListener("change", verifyDownLinkDocUrlFilter);
    document.getElementById("opt_capture.downLink.urlFilter").addEventListener("change", verifyDownLinkUrlFilter);

    document.getElementById("opt_capture.helpersEnabled").addEventListener("change", verifyCaptureHelpers);
    document.getElementById("opt_capture.helpers").addEventListener("change", verifyCaptureHelpers);
    document.getElementById("opt_autocapture.enabled").addEventListener("change", verifyAutoCapture);
    document.getElementById("opt_autocapture.rules").addEventListener("change", verifyAutoCapture);

    document.getElementById("openIndexer").addEventListener("click", onOpenIndexerClick);
    document.getElementById("openChecker").addEventListener("click", onOpenCheckerClick);

    document.getElementById("options").addEventListener("submit", onSubmit);
    document.getElementById("reset").addEventListener("click", onResetClick);
    document.getElementById("export").addEventListener("click", onExportClick);
    document.getElementById("import").addEventListener("click", onImportClick);
    document.getElementById("import-input").addEventListener("change", onImportInputChange);

    for (const elem of document.querySelectorAll('details')) {
      elem.addEventListener("toggle", onDetailsToggle);
    }

    for (const elem of document.querySelectorAll('a[data-tooltip]')) {
      elem.addEventListener("click", onTooltipClick);
    }

    for (const elem of document.querySelectorAll(':valid, :invalid')) {
      elem.addEventListener("invalid", onInvalid);
    }

    // refresh form
    refreshForm();
  });

}));

