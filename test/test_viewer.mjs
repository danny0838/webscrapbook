import {By, until} from "selenium-webdriver";
import assert from "assert/strict";

import {POLL_INTERVAL, context as testContext, modifyOptions} from "./browser-runner.js";

if (!testContext) {
  throw new Error("test context not initialized");
}

const {driver, extensionUrl, config, grep, reporter} = testContext;

describe('Automated viewer tests', function () {
  this.timeout(30000);
  this.slow(10000);
  this.retries(2);

  const port = config.server_port;
  const portStr = (port === 80) ? '' : `:${port}`;
  const localhost = `http://localhost${portStr}`;

  async function resetTabs() {
    // close all current tabs and switch to a new tab
    await driver.switchTo().newWindow("tab");
    await driver.get(`${extensionUrl}test/utils.html`);
    await driver.executeScript(async () => {
      const {id: tabId} = await browser.tabs.getCurrent();
      const tabIds = (await browser.tabs.query({}))
        .filter(t => t.id !== tabId)
        .map(t => t.id);
      await browser.tabs.remove(tabIds);
    });
  }

  before('Initialize driver', async function () {
    await driver.get(localhost);
  });

  beforeEach(resetTabs);

  after(resetTabs);

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
      const iframe = await driver.wait(until.elementLocated(By.css('iframe[data-loaded="true"]')), 5000);

      const params = new URL(await driver.getCurrentUrl()).searchParams;
      for (const [key, value] of Object.entries(expectedParams)) {
        assert.strictEqual(params.get(key), value, `URL search param "${key}" not matched`);
      }

      await driver.switchTo().frame(iframe);
      const imgHash = await driver.executeScript(async (fnStr) => {
        const fetchDigestHex = new Function(`return ${fnStr}`)();
        const url = (document.contentType === "image/svg+xml") ?
          document.querySelector('image').href.baseVal :
          document.querySelector('img').src;
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
        await driver.sleep(1500);

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
        await driver.sleep(1500);

        await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
        const charset2 = await driver.executeScript(() => document.characterSet);
        const content2 = await driver.executeScript(() => document.body.textContent.trim());
        assert.strictEqual(charset2, 'UTF-8');
        assert.strictEqual(content2, '简体中文文件');
      });
    });

    context('links handling', function () {
      it('should ensure links and back/forward button work', async function () {
        await driver.get(`${localhost}/viewer_interlink/interlink.py`);
        await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
        const iframe = await driver.wait(until.elementLocated(By.css('iframe[data-loaded="true"]')), 5000);
        await driver.switchTo().frame(iframe);

        {
          const anchors = await driver.findElements(By.css('a'));
          await anchors[0].click();
          await driver.sleep(1000);
          const result = await driver.executeScript(() => {
            const {innerWidth, innerHeight} = window;
            const {top, right, left, bottom} = document.querySelector('[id="123"]').getBoundingClientRect();
            return {innerWidth, innerHeight, top, right, left, bottom};
          });
          assert.ok(0 <= result.top && result.top < result.innerHeight, "element `#123` is not visible");
        }

        {
          await driver.navigate().back();
          await driver.switchTo().defaultContent();
          await driver.sleep(1000);
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const result = await driver.executeScript(() => {
            const {innerWidth, innerHeight} = window;
            const {top, right, left, bottom} = document.querySelector('a').getBoundingClientRect();
            return {innerWidth, innerHeight, top, right, left, bottom};
          });
          assert.ok(0 <= result.top && result.top < result.innerHeight, "element `a` is not visible");
        }

        {
          const anchors = await driver.findElements(By.css('a'));
          await anchors[1].click();
          await driver.switchTo().defaultContent();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'linked.html');
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const result = await driver.executeScript(() => {
            const {innerWidth, innerHeight} = window;
            const {top, right, left, bottom} = document.querySelector('[id="456"]').getBoundingClientRect();
            return {innerWidth, innerHeight, top, right, left, bottom};
          });
          assert.ok(0 <= result.top && result.top < result.innerHeight, "element `#456` is not visible");
        }

        {
          const anchor = await driver.findElement(By.css('[id="456"] a'));
          await anchor.click();
          await driver.switchTo().defaultContent();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'index.html');
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const result = await driver.executeScript(() => {
            const {innerWidth, innerHeight} = window;
            const {top, right, left, bottom} = document.querySelector('a[name="456"]').getBoundingClientRect();
            return {innerWidth, innerHeight, top, right, left, bottom};
          });
          assert.ok(0 <= result.top && result.top < result.innerHeight, 'element `a[name="456"]` is not visible');
        }

        {
          await driver.switchTo().defaultContent();
          await driver.navigate().back();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'linked.html');
        }

        {
          await driver.switchTo().defaultContent();
          await driver.navigate().back();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'index.html');
        }

        {
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const anchors = await driver.findElements(By.css('a'));
          await anchors[2].click();
          await driver.switchTo().defaultContent();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'text.txt');
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const text = await driver.executeScript(() => document.body.textContent.trim());
          assert.strictEqual(text, 'Text file content.');
        }

        {
          await driver.switchTo().defaultContent();
          await driver.navigate().back();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'index.html');
        }

        {
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const anchors = await driver.findElements(By.css('a'));
          await anchors[3].click();
          await driver.switchTo().defaultContent();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'index.html');
          await driver.get(`${extensionUrl}test/utils.html`);
          await driver.sleep(2000);
          const download = await driver.executeScript(async () => {
            const downloads = await browser.downloads.search({});
            await Promise.all(downloads.map(({id}) => browser.downloads.removeFile(id)));
            await browser.downloads.erase({});
            return downloads[0];
          });
          assert.strictEqual(download.state, "complete");
          assert.strictEqual(download.mime, "text/plain");
          assert.ok(download.filename.match(/[//\\]text-download\.txt$/));
          assert.strictEqual(download.fileSize, 18);
        }

        {
          await driver.switchTo().defaultContent();
          await driver.navigate().back();
          await driver.sleep(1000);
          const u = new URL(await driver.getCurrentUrl());
          assert.strictEqual(u.searchParams.get('p'), 'index.html');
        }

        {
          await driver.switchTo().frame(await driver.findElement(By.css('iframe')));
          const anchors = await driver.findElements(By.css('a'));
          await anchors[4].click();
          await driver.switchTo().defaultContent();
          await driver.wait(until.urlIs('https://example.com/?id=123#456'), 5000);
        }
      });
    });
  });

  context('options["viewer.viewAttachments"] handling', function () {
    const attachmentUrl = `${localhost}/viewer_attachment/attachment.py`;

    let origPageLoad;

    before(async function () {
      ({pageLoad: origPageLoad} = await driver.manage().getTimeouts());
      await driver.manage().setTimeouts({pageLoad: 3000});
    });

    after(async function () {
      await driver.manage().setTimeouts({pageLoad: origPageLoad});
    });

    afterEach(async function () {
      await modifyOptions({driver, extensionUrl, options: {
        "viewer.viewAttachments": false,
      }});
    });

    it('should not view attachment HTZ/MAFF when options["viewer.viewAttachments"] is falsy', async function () {
      await driver.get("about:blank");
      const origUrl = await driver.getCurrentUrl();

      // In some browser (e.g., Firefox) the driver hangs forever when visiting
      // an attachment since there is no page load.  Guard with a short page
      // load timeout (see before hook) and catch the error.
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
      // load timeout (see before hook) and catch the error.
      await driver.get(attachmentUrl).catch(() => {});

      await driver.wait(async () => isViewPage(await driver.getCurrentUrl()), 5000);
    });
  });
});
