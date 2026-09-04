import {By, until} from "selenium-webdriver";
import assert from "assert/strict";

import {POLL_INTERVAL, context as testContext, modifyOptions} from "./browser-runner.js";

if (!testContext) {
  throw new Error("test context not initiated");
}

const {driver, extensionUrl, config, grep, reporter} = testContext;

describe('Viewer tests', function () {
  const port = config.server_port;
  const portStr = (port === 80) ? '' : `:${port}`;
  const localhost = `http://localhost${portStr}`;

  function isLoadPage(url) {
    try {
      const u = typeof url === 'string' ? new URL(url) : url;
      return u.protocol.includes("-extension:") && u.pathname === "/viewer/load.html";
    } catch (ex) {
      // invalid URL
      return false;
    }
  }

  function isViewPage(url) {
    try {
      const u = typeof url === 'string' ? new URL(url) : url;
      return u.protocol.includes("-extension:") && u.pathname === "/viewer/view.html";
    } catch (ex) {
      // invalid URL
      return false;
    }
  }

  beforeEach(async function () {
    // close additional tabs and reset to the first tab
    const handles = await driver.getAllWindowHandles();
    for (let i = handles.length - 1; i >= 1; i--) {
      await driver.switchTo().window(handles[i]);
      try {
        await driver.close();
      } catch (ex) {
        if (ex.name !== "NoSuchWindowError") {
          throw ex;
        }
      }
    }
    await driver.switchTo().window(handles[0]);
  });

  context('basic', function () {
    async function assertArchiveViewable(url) {
      await driver.get(url);
      await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
    }

    async function assertArchiveNonViewable(url, pattern = /No available page found/) {
      await driver.get(url);
      await driver.wait(async () => isLoadPage(await driver.getCurrentUrl()), 5000);
      const elems = await driver.wait(until.elementsLocated(By.css('span.error')), 5000);
      if (pattern) {
        const texts = await Promise.all(elems.map(x => x.getText()));
        assert.ok(texts.find(x => pattern.test(x)));
      }
    }

    it('should view an HTZ that conforms to the spec', async function () {
      await assertArchiveViewable(`${localhost}/viewer_validate_good/htz_good.py`);
    });

    it('should view a MAFF that conforms to the spec', async function () {
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_elementary_type_html.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_elementary_type_xhtml.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_elementary_type_png.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_elementary_type_svg.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_basic_type_html.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_basic_type_xhtml.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_basic_type_png.py`);
      await assertArchiveViewable(`${localhost}/viewer_validate_good/test_basic_type_svg.py`);
    });

    it('should error out when an HTZ does not conform to the spec', async function () {
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/htz_bad.py`);
    });

    it('should error out when a MAFF does not conform to the spec', async function () {
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_1_empty.maff`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_2_no_dir.py`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_3_dir_rdf_malformed.py`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_4_dir_rdf_no_index.py`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_5_dir_rdf_to_nonexist_index.py`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_6_dir_rdf_to_invalid_index.py`);
      await assertArchiveNonViewable(`${localhost}/viewer_validate_bad/maff_bad_7_dir_no_index.py`);
    });

    it('should view a MAFF with multiple pages in tabs', async function () {
      await driver.get(`${localhost}/viewer_validate_good/maff_multiple.py`);
      await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);

      const tabs = await driver.executeScript(
        () => browser.tabs.query({}).then(tabs => tabs.map(tab => {
          const {id, index, url} = tab;
          return {id, index, url};
        })),
      );

      try {
        assert.strictEqual(tabs.length, 3);
        const tabUrlObjs = tabs.map(tab => new URL(tab.url));
        assert.ok(tabUrlObjs.every(u => isViewPage(u)));
        const params = tabUrlObjs.map(u => {
          const pp = u.searchParams;
          return {d: pp.get('d'), p: pp.get('p')};
        }).sort((a, b) => a.d.localeCompare(b.d) || a.p.localeCompare(b.p));
        assert.deepEqual(params, [
          {d: '20171225172746364', p: '20171225172746364/index.html'},
          {d: '20171225172746512', p: '20171225172746512/index.png'},
          {d: '20171225172746808', p: '20171225172746808/index.html'},
        ]);
      } finally {
        await driver.executeScript(
          (ids) => browser.tabs.remove(ids),
          tabs.filter(tab => tab.index !== 0).map(tab => tab.id),
        );
      }
    });
  });

  context('charset handling', function () {
    it('should handle document charset correctly for HTZ', async function () {
      await driver.get(`${localhost}/viewer_encoding/encoding_htz.py`);
      await driver.wait(() => driver.getCurrentUrl().then(url => isViewPage(url)), 5000);
      const iframe = await driver.wait(until.elementLocated(By.css('iframe[data-loaded="true"]')), 5000);

      await driver.switchTo().frame(iframe);
      const charset = await driver.executeScript(() => document.characterSet);
      const title = await driver.executeScript(() => document.title);
      const content = await driver.executeScript(() => document.querySelector('p').textContent);
      assert.strictEqual(charset, 'UTF-8');
      assert.strictEqual(title, '中文文件');
      assert.strictEqual(content, '繁體中文文件');

      await driver.executeScript(() => document.querySelector('a').click());
      await driver.switchTo().defaultContent();
      await driver.sleep(3000);

      await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
      const charset2 = await driver.executeScript(() => document.characterSet);
      const content2 = await driver.executeScript(() => document.body.textContent.trim());
      assert.strictEqual(charset2, 'UTF-8');
      assert.strictEqual(content2, '简体中文文件');
    });

    it('should handle document charset correctly for MAFF', async function () {
      await driver.get(`${localhost}/viewer_encoding/encoding_maff.py`);
      await driver.wait(() => driver.getCurrentUrl().then(url => isViewPage(url)), 5000);
      const iframe = await driver.wait(until.elementLocated(By.css('iframe[data-loaded="true"]')), 5000);

      await driver.switchTo().frame(iframe);
      const charset = await driver.executeScript(() => document.characterSet);
      const title = await driver.executeScript(() => document.title);
      const content = await driver.executeScript(() => document.querySelector('p').textContent);
      assert.strictEqual(charset, 'UTF-8');
      assert.strictEqual(title, '中文文件');
      assert.strictEqual(content, '繁體中文文件');

      await driver.executeScript(() => document.querySelector('a').click());
      await driver.switchTo().defaultContent();
      await driver.sleep(3000);

      await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
      const charset2 = await driver.executeScript(() => document.characterSet);
      const content2 = await driver.executeScript(() => document.body.textContent.trim());
      assert.strictEqual(charset2, 'UTF-8');
      assert.strictEqual(content2, '简体中文文件');
    });
  });

  context('options["viewer.viewAttachments"] handling', function () {
    const attachmentUrl = `${localhost}/viewer_attachment/attachment.py`;

    let origPageLoad;
    let origTab;
    let newTab;

    beforeEach(async function () {
      ({pageLoad: origPageLoad} = await driver.manage().getTimeouts());
      await driver.manage().setTimeouts({pageLoad: 2000});
      origTab = await driver.getWindowHandle();
      await driver.switchTo().newWindow('tab');
      newTab = await driver.getWindowHandle();
      await driver.get(`${extensionUrl}/test/tests.html`);
      await driver.executeScript((urlToBlock) => {
        chrome.downloads.onCreated.addListener(({id, url}) => {
          if (url === urlToBlock) {
            chrome.downloads.cancel(id);
          }
        });
      }, attachmentUrl);
      await driver.switchTo().window(origTab);
    });

    afterEach(async function () {
      await driver.manage().setTimeouts({pageLoad: origPageLoad});
      await modifyOptions({driver, extensionUrl, options: {
        "viewer.viewAttachments": false,
      }});
      try {
        await driver.switchTo().window(newTab);
        await driver.close();
      } catch {}
      await driver.switchTo().window(origTab);
    });

    it('should not view attachment HTZ/MAFF when options["viewer.viewAttachments"] is falsy', async function () {
      await driver.get(`${extensionUrl}/test/tests.html`);
      const origUrl = await driver.getCurrentUrl();

      // In some browser (e.g., Firefox) the driver hangs forever when visiting
      // an attachment since there is no page load.  Guard with a short page
      // load timeout (see beforeEach hook) and catch the error.
      await driver.get(attachmentUrl).catch(() => {});

      assert.strictEqual(await driver.getCurrentUrl(), origUrl);
    });

    it('should view attachment HTZ/MAFF when options["viewer.viewAttachments"] is truthy', async function () {
      await modifyOptions({driver, extensionUrl, options: {
        "viewer.viewAttachments": true,
      }});

      await driver.get(`${extensionUrl}/test/tests.html`);

      // In some browser (e.g., Firefox) the driver hangs forever when visiting
      // an attachment since there is no page load.  Guard with a short page
      // load timeout (see beforeEach hook) and catch the error.
      await driver.get(attachmentUrl).catch(() => {});

      await driver.wait(() => driver.getCurrentUrl().then(url => isViewPage(url)), 5000);
    });
  });
});
