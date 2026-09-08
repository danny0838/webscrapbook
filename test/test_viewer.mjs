import {By, until} from "selenium-webdriver";
import assert from "assert/strict";

import {POLL_INTERVAL, context as testContext, modifyOptions} from "./browser-runner.js";

if (!testContext) {
  throw new Error("test context not initialized");
}

const {driver, extensionUrl, config, grep, reporter} = testContext;

describe('Automated viewer tests', function () {
  this.timeout(60000);
  this.slow(10000);
  this.retries(2);

  const port = config.server_port;
  const portStr = (port === 80) ? '' : `:${port}`;
  const localhost = `http://localhost${portStr}`;

  before('Initialize driver', async function () {
    await driver.get(localhost);
  });

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

  context('basic', function () {
    async function assertConformingArchive({archiveUrl, resourceImageUrl, expectedParams}) {
      await driver.get(archiveUrl);
      await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);

      const params = new URL(await driver.getCurrentUrl()).searchParams;
      for (const [key, value] of Object.entries(expectedParams)) {
        assert.strictEqual(params.get(key), value, `URL search param "${key}" not matched`);
      }

      const imgHash = await driver.executeScript(async (fnStr) => {
        const fetchDigestHex = new Function(`return ${fnStr}`)();
        const iDoc = document.querySelector('iframe').contentDocument;
        const url = (iDoc.contentType === "image/svg+xml") ?
          iDoc.querySelector('image').href.baseVal :
          iDoc.querySelector('img').src;
        return await fetchDigestHex(url);
      }, fetchDigestHex);
      assert.deepEqual(imgHash, await fetchDigestHex(resourceImageUrl));
    }

    async function assertNonConformingArchive({archiveUrl, errorMsgPatterns}) {
      await driver.get(archiveUrl);
      await driver.wait(async () => isLoadPage(await driver.getCurrentUrl()), 5000);
      const elems = await driver.wait(until.elementsLocated(By.css('span.error')), 5000);
      assert.ok(elems.length > 0);
      if (errorMsgPatterns) {
        const texts = await Promise.all(elems.map(x => x.getText()));
        for (const pattern of errorMsgPatterns) {
          assert.ok(texts.find(x => pattern.test(x)), `Matching error message not found: ${pattern}`);
        }
      }
    }

    async function fetchDigestHex(url) {
      const ab = await fetch(url).then(r => r.arrayBuffer());
      const hash = await crypto.subtle.digest("SHA-256", ab);
      return Array.prototype.map.call(
        new Uint8Array(hash),
        b => b.toString(16).padStart(2, "0"),
      ).join('');
    }

    context('HTZ', function () {
      it('should view a conforming HTZ archive', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/htz_good.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/htz_good/red.bmp`,
          expectedParams: {"p": "index.html"},
        });
      });

      it('should not view a non-conforming HTZ archive', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/htz_bad.py`,
          errorMsgPatterns: [/No available page found/],
        });
      });

      it('should view documents with UTF-8 encoding for an HTZ archive', async function () {
        await driver.get(`${localhost}/viewer_encoding/encoding_htz.py`);
        await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
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
        await driver.sleep(1000);

        await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
        const charset2 = await driver.executeScript(() => document.characterSet);
        const content2 = await driver.executeScript(() => document.body.textContent.trim());
        assert.strictEqual(charset2, 'UTF-8');
        assert.strictEqual(content2, '简体中文文件');
      });
    });

    context('MAFF', function () {
      it('should view a conforming MAFF archive (elementary HTML)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_elementary_type_html.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_elementary_type_html/1269184827724_474/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184827724_474/index.html",
            "d": "1269184827724_474",
          },
        });
      });

      it('should view a conforming MAFF archive (elementary XHTML)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_elementary_type_xhtml.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_elementary_type_xhtml/1269184839791_914/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184839791_914/index.xhtml",
            "d": "1269184839791_914",
          },
        });
      });

      it('should view a conforming MAFF archive (elementary PNG)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_elementary_type_png.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_elementary_type_png/1269184832034_375/index.png`,
          expectedParams: {
            "p": "1269184832034_375/index.png",
            "d": "1269184832034_375",
          },
        });
      });

      it('should view a conforming MAFF archive (elementary SVG)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_elementary_type_svg.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_elementary_type_svg/1269184836529_277/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184836529_277/index.svg",
            "d": "1269184836529_277",
          },
        });
      });

      it('should view a conforming MAFF archive (basic HTML)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_basic_type_html.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_basic_type_html/1269184802698_598/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184802698_598/index.html",
            "d": "1269184802698_598",
          },
        });
      });

      it('should view a conforming MAFF archive (basic XHTML)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_basic_type_xhtml.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_basic_type_xhtml/1269184815484_901/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184815484_901/index.xhtml",
            "d": "1269184815484_901",
          },
        });
      });

      it('should view a conforming MAFF archive (basic PNG)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_basic_type_png.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_basic_type_png/1269184807448_171/index.png`,
          expectedParams: {
            "p": "1269184807448_171/index.png",
            "d": "1269184807448_171",
          },
        });
      });

      it('should view a conforming MAFF archive (basic SVG)', async function () {
        await assertConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_good/test_basic_type_svg.py`,
          resourceImageUrl: `${localhost}/viewer_validate_good/test_basic_type_svg/1269184811769_549/index_files/test-image.png`,
          expectedParams: {
            "p": "1269184811769_549/index.svg",
            "d": "1269184811769_549",
          },
        });
      });

      it('should not view a non-conforming MAFF archive (empty)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_1_empty.maff`,
          errorMsgPatterns: [/No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (no directory)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_2_no_dir.py`,
          errorMsgPatterns: [/No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (RDF malformed)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_3_dir_rdf_malformed.py`,
          errorMsgPatterns: [/Unable to get index file in directory: '20170627151254191\/'/, /No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (RDF has no index element)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_4_dir_rdf_no_index.py`,
          errorMsgPatterns: [/Unable to get index file in directory: '20171225171812833\/'/, /No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (RDF defines nonexist index file)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_5_dir_rdf_to_nonexist_index.py`,
          errorMsgPatterns: [/Unable to get index file in directory: '20171225171812833\/'/, /No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (RDF defines invalid index file)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_6_dir_rdf_to_invalid_index.py`,
          errorMsgPatterns: [/Unable to get index file in directory: '20171225171812833\/'/, /No available page found/],
        });
      });

      it('should not view a non-conforming MAFF archive (no index file)', async function () {
        await assertNonConformingArchive({
          archiveUrl: `${localhost}/viewer_validate_bad/maff_bad_7_dir_no_index.py`,
          errorMsgPatterns: [/Unable to get index file in directory: '20171225171812833\/'/, /No available page found/],
        });
      });

      it('should view a multi-page MAFF archive in tabs', async function () {
        await driver.get(`${localhost}/viewer_validate_good/maff_multiple.py`);
        await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);

        const tabs = await driver.executeScript(async () => {
          return (await browser.tabs.query({})).map(tab => {
            const {id, index, url} = tab;
            return {id, index, url};
          });
        });

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

      it('should view documents with UTF-8 encoding for a MAFF archive', async function () {
        await driver.get(`${localhost}/viewer_encoding/encoding_maff.py`);
        await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
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
        await driver.sleep(1000);

        await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
        const charset2 = await driver.executeScript(() => document.characterSet);
        const content2 = await driver.executeScript(() => document.body.textContent.trim());
        assert.strictEqual(charset2, 'UTF-8');
        assert.strictEqual(content2, '简体中文文件');
      });
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
      await driver.get(`${extensionUrl}test/utils.html`);
      await driver.executeScript((urlToBlock) => {
        browser.downloads.onCreated.addListener(({id, url}) => {
          if (url === urlToBlock) {
            browser.downloads.cancel(id);
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
      await driver.get("about:blank");
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

      await driver.get("about:blank");

      // In some browser (e.g., Firefox) the driver hangs forever when visiting
      // an attachment since there is no page load.  Guard with a short page
      // load timeout (see beforeEach hook) and catch the error.
      await driver.get(attachmentUrl).catch(() => {});

      await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
    });
  });
});
