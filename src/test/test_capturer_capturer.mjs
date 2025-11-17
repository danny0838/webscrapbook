import {
  MochaQuery as $, assert,
  RED_BMP_B64, GREEN_BMP_B64, BLUE_BMP_B64, YELLOW_BMP_B64,
  RED_BMP_BYTES, GREEN_BMP_BYTES, BLUE_BMP_BYTES, YELLOW_BMP_BYTES,
  getToken, getRulesFromCssText, rawRegex, encodeText, getAttributes,
  createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {TestCapturerOffline as TestCapturer, stubXhr, stubServer} from "./extension.mjs";
import * as utils from "../utils/common.mjs";
import {NS_XMLNS, NS_HTML, NS_SVG, NS_XLINK} from "../utils/common.mjs";
import {Zip} from "../utils/zip.mjs";
import {Capturer} from "../capturer/capturer.mjs";
import {CaptureHelperHandler} from "../capturer/helper-handler.mjs";
import {server} from "../scrapbook/server.mjs";

const $describe = $(describe);

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MAF = "http://maf.mozdev.org/metadata/rdf#";

describe('capturer/capturer.mjs', function () {
  afterEach(function () {
    sinon.restore();

    for (const elem of document.querySelectorAll('iframe')) {
      elem.remove();
    }
  });

  $describe.skipIf($.noBrowser)('Capturer', function () {
    const docUrl = 'https://example.com/';

    let timeId;
    let stubBrowserSendMessage;
    let stubLinkStyleSheet;
    let stubImportStyleSheet;

    beforeEach(function () {
      // set up a unique timeId for the test
      timeId = utils.dateToId();

      // stub out messaging to prevent delay from `background.onCaptureEnd`
      stubBrowserSendMessage = sinon.stub(browser.runtime, 'sendMessage').value(() => {});

      // simulate inaccessible stylesheet (like cross-origin) since we have no real CSS
      stubLinkStyleSheet = sinon.stub(HTMLLinkElement.prototype, 'sheet').value(null);
      stubImportStyleSheet = sinon.stub(CSSImportRule.prototype, 'styleSheet').value(null);
    });

    describe('#captureGeneral', function () {
      context('basic call handling', function () {
        const options = {
          "capture.dummyOption1": "foo",
          "capture.dummyOption2": "bar",
        };

        for (const [desc, factory] of [
          ['if `doc` is provided', () => {
            sinon.stub(Document.prototype, 'URL').value(docUrl);

            const doc = createDocFixture();
            return {
              input: {
                doc,
                settings: {timeId},
                options,
              },
              expected: {
                doc,
                docUrl: undefined,
                refUrl: undefined,
                settings: sinon.match({timeId}),
                options,
              },
            };
          }],
          ['with optional arguments', () => {
            const doc = createDocFixture();
            const settings = {
              timeId: '20250102030405678',
              documentName: 'customDocName',
              indexFilename: 'customIndexFilename',
              fullPage: false,
              type: 'site',
              title: 'customTitle',
              favIconUrl: 'https://example.org/favicon.png',
            };
            return {
              input: {
                doc,
                docUrl,
                refUrl: `${docUrl}ref/`,
                settings,
                options,
              },
              expected: {
                doc,
                docUrl,
                refUrl: `${docUrl}ref/`,
                settings: sinon.match(settings),
                options,
              },
            };
          }],
          ['regardless of `tabId` and `url`', () => {
            const doc = createDocFixture();
            return {
              input: {
                doc,
                docUrl,
                tabId: 123,
                url: 'https://example.org/',
                settings: {timeId},
                options,
              },
              expected: {
                doc,
                docUrl,
                refUrl: undefined,
                settings: sinon.match({timeId}),
                options,
              },
            };
          }],
        ]) {
          it('should call `captureDocumentOrFile`' + (desc ? ` ${desc}` : ''), async function () {
            var {input, expected} = factory();

            var stubCapture = sinon.stub(Capturer.prototype, 'captureDocumentOrFile').callsFake(({doc, docUrl}) => ({
              url: 'index.html',
              sourceUrl: docUrl || doc.URL,
            }));

            var result = await new Capturer().captureGeneral(input);
            assert.deepEqual(result, {
              url: 'index.html',
              sourceUrl: docUrl,
            });

            sinon.assert.calledOnceWithExactly(stubCapture, expected);
          });
        }

        for (const [desc, factory] of [
          ['if `tabId` is an integer', () => {
            return {
              input: {
                tabId: 123,
                settings: {timeId},
                options,
              },
              expected: {
                tabId: 123,
                frameId: undefined,
                mode: undefined,
                settings: sinon.match({timeId}),
                options,
              },
            };
          }],
          ['with optional arguments', () => {
            const settings = {
              timeId: '20250102030405678',
              documentName: 'customDocName',
              indexFilename: 'customIndexFilename',
              fullPage: false,
              type: 'site',
              title: 'customTitle',
              favIconUrl: 'https://example.org/favicon.png',
            };
            return {
              input: {
                tabId: 123,
                frameId: 456,
                mode: 'tab',
                settings,
                options,
              },
              expected: {
                tabId: 123,
                frameId: 456,
                mode: 'tab',
                settings: sinon.match(settings),
                options,
              },
            };
          }],
          ['regardless of `url`', () => {
            return {
              input: {
                tabId: 123,
                url: 'https://example.org/',
                settings: {timeId},
                options,
              },
              expected: {
                tabId: 123,
                frameId: undefined,
                mode: undefined,
                settings: sinon.match({timeId}),
                options,
              },
            };
          }],
        ]) {
          it('should call `captureTab`' + (desc ? ` ${desc}` : ''), async function () {
            var {input, expected} = factory();

            var stubCapture = sinon.stub(Capturer.prototype, 'captureTab').callsFake(() => ({
              url: 'index.html',
              sourceUrl: docUrl,
            }));

            var result = await new Capturer().captureGeneral(input);
            assert.deepEqual(result, {
              url: 'index.html',
              sourceUrl: docUrl,
            });

            sinon.assert.calledOnceWithExactly(stubCapture, expected);
          });
        }

        for (const [desc, factory] of [
          ['if `url` is a string', () => {
            return {
              input: {
                url: docUrl,
                settings: {timeId},
                options,
              },
              expected: {
                url: docUrl,
                refUrl: undefined,
                mode: undefined,
                settings: sinon.match({timeId}),
                options,
              },
            };
          }],
          ['with optional arguments', () => {
            const settings = {
              timeId: '20250102030405678',
              documentName: 'customDocName',
              indexFilename: 'customIndexFilename',
              fullPage: false,
              type: 'site',
              title: 'customTitle',
              favIconUrl: 'https://example.org/favicon.png',
            };
            return {
              input: {
                url: docUrl,
                refUrl: 'https://example.org/ref/',
                mode: 'source',
                settings,
                options,
              },
              expected: {
                url: docUrl,
                refUrl: 'https://example.org/ref/',
                mode: 'source',
                settings: sinon.match(settings),
                options,
              },
            };
          }],
        ]) {
          it('should call `captureRemote`' + (desc ? ` ${desc}` : ''), async function () {
            var {input, expected} = factory();

            var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').callsFake(({url: sourceUrl}) => ({
              url: 'index.html',
              sourceUrl,
            }));

            var result = await new Capturer().captureGeneral(input);
            assert.deepEqual(result, {
              url: 'index.html',
              sourceUrl: docUrl,
            });

            sinon.assert.calledOnceWithExactly(stubCapture, expected);
          });
        }

        for (const [desc, factory] of [
          ['if `doc/`tabId`/`url` are not provided', () => {
            return {
              input: {
                settings: {timeId},
                options,
              },
            };
          }],
          ['regardless of invalid `doc/`tabId`/`url`', () => {
            return {
              input: {
                doc: null,
                tabId: null,
                url: null,
                settings: {timeId},
                options,
              },
            };
          }],
        ]) {
          it('should throw' + (desc ? ` ${desc}` : ''), async function () {
            var {input} = factory();

            let error;
            try {
              await new Capturer().captureGeneral(input);
            } catch (ex) {
              error = ex;
            }

            assert.instanceOf(error, Error);
            assert.strictEqual(error.message, 'Bad arguments.');
          });
        }
      });

      context('helpers handling', function () {
        it('should ignore helpers when options["capture.helpersEnabled"] is falsy', async function () {
          var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
          var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var options = {
            "capture.image": "save",
            "capture.helpersEnabled": false,
            "capture.helpers": JSON.stringify([
              {
                options: {
                  "capture.image": "link",
                },
              },
            ]),
          };

          await new Capturer().captureGeneral({url: docUrl, options});

          sinon.assert.notCalled(spyRewrite);
          sinon.assert.calledOnceWithMatch(stubCapture, {
            options,
          });
        });

        it('should clear helper-related options if options["capture.helpers"] is empty', async function () {
          var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
          var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var options = {
            "capture.image": "save",
            "capture.helpersEnabled": true,
            "capture.helpers": '',
          };

          await new Capturer().captureGeneral({url: docUrl, options});

          sinon.assert.notCalled(spyRewrite);
          sinon.assert.calledOnceWithMatch(stubCapture, {
            options: {
              "capture.helpersEnabled": false,
              "capture.helpers": '',
            },
          });
        });

        it('should clear helper-related options if options["capture.helpers"] is invalid', async function () {
          var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
          var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var options = {
            "capture.image": "save",
            "capture.helpersEnabled": true,
            "capture.helpers": '[bad syntax]',
          };

          await new Capturer().captureGeneral({url: docUrl, options});

          sinon.assert.notCalled(spyRewrite);
          sinon.assert.calledOnceWithMatch(stubCapture, {
            options: {
              "capture.helpersEnabled": false,
              "capture.helpers": '',
            },
          });
        });

        context('when capturing document', function () {
          it('should handle `options` command in helpers', async function () {
            var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
            var stubCapture = sinon.stub(Capturer.prototype, 'captureDocumentOrFile').returns({
              url: 'index.html',
              sourceUrl: docUrl,
            });

            var options = {
              "capture.image": "save",
              "capture.helpersEnabled": true,
              "capture.helpers": JSON.stringify([{
                pattern: "/^https?://example\\.com//i",
                options: {"capture.image": "link"},
              }]),
            };
            var doc = createDocFixture();

            await new Capturer().captureGeneral({doc, docUrl, options});

            sinon.assert.calledOnceWithExactly(spyRewrite, [{
              pattern: /^https?:\/\/example\.com\//i,
              options: {"capture.image": "link"},
            }], docUrl);
            assert.deepEqual(spyRewrite.lastCall.returnValue, {"capture.image": "link"});

            sinon.assert.calledOnceWithMatch(stubCapture, {
              options: {"capture.image": "link"},
            });
          });
        });

        context('when capturing tab', function () {
          it('should handle `options` command in helpers (`frameId` not set)', async function () {
            var stubGetFrame = sinon.stub().returns({url: docUrl});
            sinon.stub(browser.webNavigation, 'getFrame').value(stubGetFrame);
            var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
            var stubCapture = sinon.stub(Capturer.prototype, 'captureTab').returns({
              url: 'index.html',
              sourceUrl: docUrl,
            });

            var options = {
              "capture.image": "save",
              "capture.helpersEnabled": true,
              "capture.helpers": JSON.stringify([{
                pattern: "/^https?://example\\.com//i",
                options: {"capture.image": "link"},
              }]),
            };

            await new Capturer().captureGeneral({tabId: 123, options});

            sinon.assert.calledOnceWithExactly(stubGetFrame, {tabId: 123, frameId: 0});

            sinon.assert.calledOnceWithExactly(spyRewrite, [{
              pattern: /^https?:\/\/example\.com\//i,
              options: {"capture.image": "link"},
            }], docUrl);
            assert.deepEqual(spyRewrite.lastCall.returnValue, {"capture.image": "link"});

            sinon.assert.calledOnceWithMatch(stubCapture, {
              options: {"capture.image": "link"},
            });
          });

          it('should handle `options` command in helpers (`frameId` set)', async function () {
            var stubGetFrame = sinon.stub().returns({url: docUrl});
            sinon.stub(browser.webNavigation, 'getFrame').value(stubGetFrame);
            var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
            var stubCapture = sinon.stub(Capturer.prototype, 'captureTab').returns({
              url: 'index.html',
              sourceUrl: docUrl,
            });

            var options = {
              "capture.image": "save",
              "capture.helpersEnabled": true,
              "capture.helpers": JSON.stringify([{
                pattern: "/^https?://example\\.com//i",
                options: {"capture.image": "link"},
              }]),
            };

            await new Capturer().captureGeneral({tabId: 123, frameId: 456, options});

            sinon.assert.calledOnceWithExactly(stubGetFrame, {tabId: 123, frameId: 456});

            sinon.assert.calledOnceWithExactly(spyRewrite, [{
              pattern: /^https?:\/\/example\.com\//i,
              options: {"capture.image": "link"},
            }], docUrl);
            assert.deepEqual(spyRewrite.lastCall.returnValue, {"capture.image": "link"});

            sinon.assert.calledOnceWithMatch(stubCapture, {
              options: {"capture.image": "link"},
            });
          });
        });

        context('when capturing URL', function () {
          it('should handle `options` command in helpers', async function () {
            var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
            var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns(Promise.resolve({
              url: docUrl,
            }));
            var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').returns({
              url: 'index.html',
              sourceUrl: docUrl,
            });

            var options = {
              "capture.image": "save",
              "capture.helpersEnabled": true,
              "capture.helpers": JSON.stringify([{
                pattern: "/^https?://example\\.com//i",
                options: {"capture.image": "link"},
              }]),
            };

            await new Capturer().captureGeneral({url: docUrl, settings: {timeId}, options});

            var _helpers = [{
              pattern: /^https?:\/\/example\.com\//i,
              options: {"capture.image": "link"},
            }];
            sinon.assert.calledWithExactly(spyRewrite.getCall(0), _helpers, docUrl);
            assert.deepEqual(spyRewrite.getCall(0).returnValue, {"capture.image": "link"});
            sinon.assert.calledWithExactly(spyRewrite.getCall(1), _helpers, docUrl);
            assert.deepEqual(spyRewrite.getCall(1).returnValue, {"capture.image": "link"});
            assert.isNull(spyRewrite.getCall(2));

            sinon.assert.calledOnceWithMatch(stubResolve, {
              url: docUrl,
              refUrl: undefined,
              settings: {
                timeId,
                isMainPage: true,
                isMainFrame: true,
              },
              options,
            });

            sinon.assert.calledOnceWithMatch(stubCapture, {
              options: {"capture.image": "link"},
            });
          });

          it('should handle `options` command for redirected URL', async function () {
            var spyRewrite = sinon.spy(CaptureHelperHandler, 'getOverwritingOptions');
            var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns(Promise.resolve({
              url: docUrl,
            }));
            var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').returns({
              url: 'index.html',
              sourceUrl: docUrl,
            });

            var options = {
              "capture.image": "save",
              "capture.helpersEnabled": true,
              "capture.helpers": JSON.stringify([
                {
                  pattern: "/^https?://example\\.com/$/i",
                  options: {
                    "capture.image": "link",
                  },
                },
                {
                  pattern: "/^https?://example\\.com/redirect\\.html/i",
                  options: {
                    "capture.image": "blank",
                    "capture.style": "blank",
                  },
                },
              ]),
            };

            await new Capturer().captureGeneral({url: `${docUrl}redirect.html`, settings: {timeId}, options});

            var _helpers = [
              {
                pattern: /^https?:\/\/example\.com\/$/i,
                options: {
                  "capture.image": "link",
                },
              },
              {
                pattern: /^https?:\/\/example\.com\/redirect\.html/i,
                options: {
                  "capture.image": "blank",
                  "capture.style": "blank",
                },
              },
            ];

            // overriding options for the original URL: only for `resolveRedirects`
            sinon.assert.calledWithExactly(spyRewrite.getCall(0), _helpers, `${docUrl}redirect.html`);
            assert.deepEqual(spyRewrite.getCall(0).returnValue, {"capture.image": "blank", "capture.style": "blank"});

            // overriding options for the redirected URL: for `captureRemote`
            sinon.assert.calledWithExactly(spyRewrite.getCall(1), _helpers, docUrl);
            assert.deepEqual(spyRewrite.getCall(1).returnValue, {"capture.image": "link"});

            assert.isNull(spyRewrite.getCall(2));

            sinon.assert.calledOnceWithMatch(stubResolve, {
              url: `${docUrl}redirect.html`,
              refUrl: undefined,
              settings: {
                timeId,
                isMainPage: true,
                isMainFrame: true,
              },
              options: {
                "capture.image": "blank", "capture.style": "blank",
              },
            });

            sinon.assert.calledOnceWithMatch(stubCapture, {
              options: {"capture.image": "link"},
            });
          });
        });
      });
    });

    describe('#captureTab', function () {
      const options = {
        "capture.dummyOption1": "foo",
        "capture.dummyOption2": "bar",
      };

      for (const mode of ["tab", "source", "bookmark", "<other>"]) {
        context(`when \`mode\` = "${mode}"`, function () {
          switch (mode) {
            default: {
              for (const [desc, factory] of [
                ['', () => ({
                  input: {
                    tabId: 123,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: [
                    'captureDocumentOrFile',
                    [{
                      settings: sinon.match({
                        timeId,
                        title: undefined,
                        favIconUrl: undefined,
                      }),
                      options,
                    }],
                    {tabId: 123, frameId: undefined},
                  ],
                })],
                ['(with optional arguments)', () => ({
                  input: {
                    tabId: 123,
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: [
                    'captureDocumentOrFile',
                    [{
                      settings: sinon.match({
                        timeId,
                        title: 'customTitle',
                        favIconUrl: `${docUrl}favicon.png`,
                      }),
                      options,
                    }],
                    {tabId: 123, frameId: undefined},
                  ],
                })],
                ['with `frameId` if provided', () => ({
                  input: {
                    tabId: 123, frameId: 456,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: [
                    'captureDocumentOrFile',
                    [{
                      settings: sinon.match({
                        timeId,
                        title: undefined,
                        favIconUrl: undefined,
                      }),
                      options,
                    }],
                    {tabId: 123, frameId: 456},
                  ],
                })],
                ['with `frameId` if provided (with optional arguments)', () => ({
                  input: {
                    tabId: 123, frameId: 456,
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: [
                    'captureDocumentOrFile',
                    [{
                      settings: sinon.match({
                        timeId,
                        title: 'customTitle',
                        favIconUrl: `${docUrl}favicon.png`,
                      }),
                      options,
                    }],
                    {tabId: 123, frameId: 456},
                  ],
                })],
              ]) {
                it('should invoke `captureDocumentOrFile`' + (desc ? ` ${desc}` : ''), async function () {
                  var {input, expected} = factory();

                  var stubTabs = sinon.stub().returns({url: docUrl, title: 'My tab title', favIconUrl: `${docUrl}favicon.png`});
                  sinon.stub(browser.tabs, 'get').value(stubTabs);
                  var stubGetFrame = sinon.stub().returns({url: `${docUrl}frame.html`});
                  sinon.stub(browser.webNavigation, 'getFrame').value(stubGetFrame);
                  var stubInject = sinon.stub(Capturer.prototype, 'injectContentScripts');
                  var stubInvoke = sinon.stub(Capturer.prototype, 'invoke').callsFake((_method, _args, {frameId}) => ({
                    url: 'index.html',
                    sourceUrl: (Number.isInteger(frameId) && frameId !== 0) ? `${docUrl}frame.html` : docUrl,
                  }));

                  var result = await new Capturer().captureTab(input);
                  assert.deepEqual(result, {
                    url: 'index.html',
                    sourceUrl: (Number.isInteger(input.frameId) && input.frameId !== 0) ? `${docUrl}frame.html` : docUrl,
                  });

                  sinon.assert.calledOnceWithExactly(stubTabs, 123);
                  if (Number.isInteger(input.frameId) && input.frameId !== 0) {
                    sinon.assert.calledOnceWithExactly(stubGetFrame, {tabId: 123, frameId: input.frameId});
                  } else {
                    sinon.assert.notCalled(stubGetFrame);
                  }
                  sinon.assert.calledOnceWithExactly(stubInject, 123);
                  sinon.assert.calledOnceWithExactly(stubInvoke, ...expected);
                });
              }

              break;
            }
            case "source":
            case "bookmark": {
              for (const [desc, factory] of [
                ['with tab URL and title', () => ({
                  input: {
                    tabId: 123,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: {
                    url: docUrl,
                    mode,
                    settings: sinon.match({
                      timeId,
                      title: 'My tab title',
                      favIconUrl: undefined,
                    }),
                    options,
                  },
                })],
                ['with tab URL (with `title` and `favIconUrl`)', () => ({
                  input: {
                    tabId: 123,
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: {
                    url: docUrl,
                    mode,
                    settings: sinon.match({
                      timeId,
                      title: 'customTitle',
                      favIconUrl: `${docUrl}favicon.png`,
                    }),
                    options,
                  },
                })],
                ['with frame URL when `frameId` = 0', () => ({
                  input: {
                    tabId: 123, frameId: 0,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: {
                    url: docUrl,
                    mode,
                    settings: sinon.match({
                      timeId,
                      title: undefined,
                      favIconUrl: undefined,
                    }),
                    options,
                  },
                })],
                ['with frame URL when `frameId` is provided  (with `title` and `favIconUrl`)', () => ({
                  input: {
                    tabId: 123, frameId: 456,
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: {
                    url: `${docUrl}frame.html`,
                    mode,
                    settings: sinon.match({
                      timeId,
                      title: 'customTitle',
                      favIconUrl: `${docUrl}favicon.png`,
                    }),
                    options,
                  },
                })],
              ]) {
                it('should call `captureRemote`' + (desc ? ` ${desc}` : ''), async function () {
                  var {input, expected} = factory();

                  var stubTabs = sinon.stub().returns({url: docUrl, title: 'My tab title', favIconUrl: `${docUrl}favicon.png`});
                  sinon.stub(browser.tabs, 'get').value(stubTabs);
                  var stubGetFrame = sinon.stub().returns({url: `${docUrl}frame.html`});
                  sinon.stub(browser.webNavigation, 'getFrame').value(stubGetFrame);
                  var stubCapture = sinon.stub(Capturer.prototype, 'captureRemote').callsFake(({url: sourceUrl}) => ({
                    url: 'index.html',
                    sourceUrl,
                  }));

                  var result = await new Capturer().captureTab(input);
                  assert.deepEqual(result, {
                    url: 'index.html',
                    sourceUrl: (Number.isInteger(input.frameId) && input.frameId !== 0) ? `${docUrl}frame.html` : docUrl,
                  });

                  sinon.assert.calledOnceWithExactly(stubTabs, 123);
                  if (Number.isInteger(input.frameId) && input.frameId !== 0) {
                    sinon.assert.calledOnceWithExactly(stubGetFrame, {tabId: 123, frameId: input.frameId});
                  } else {
                    sinon.assert.notCalled(stubGetFrame);
                  }
                  sinon.assert.calledOnceWithExactly(stubCapture, expected);
                });
              }

              break;
            }
          }
        });
      }
    });

    describe('#captureRemote', function () {
      const options = {
        "capture.dummyOption1": "foo",
        "capture.dummyOption2": "bar",
      };

      for (const mode of ["tab", "source", "bookmark", "<other>"]) {
        context(`when \`mode\` = "${mode}"`, function () {
          switch (mode) {
            case "source":
            default: {
              for (const [desc, factory] of [
                ['', () => ({
                  input: {
                    url: docUrl,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: undefined, refPolicy: undefined,
                    settings: sinon.match({
                      timeId,
                      title: undefined,
                      favIconUrl: undefined,
                      fullPage: true,
                    }),
                    options,
                  },
                })],
                ['(with optional arguments)', () => ({
                  input: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    settings: sinon.match({
                      timeId,
                      title: 'customTitle',
                      favIconUrl: `${docUrl}favicon.png`,
                      fullPage: true,
                    }),
                    options,
                  },
                })],
              ]) {
                it('should call `captureUrl` with `{fullPage: true}`' + (desc ? ` ${desc}` : ''), async function () {
                  var {input, expected} = factory();

                  var stubCapture = sinon.stub(Capturer.prototype, 'captureUrl').callsFake(({url: sourceUrl}) => ({
                    url: 'index.html',
                    sourceUrl,
                  }));

                  var result = await new Capturer().captureRemote(input);
                  assert.deepEqual(result, {
                    url: 'index.html',
                    sourceUrl: docUrl,
                  });

                  sinon.assert.calledOnceWithExactly(stubCapture, expected);
                });
              }

              break;
            }
            case "bookmark": {
              for (const [desc, factory] of [
                ['', () => ({
                  input: {
                    url: docUrl,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: undefined, refPolicy: undefined,
                    settings: sinon.match({
                      timeId,
                      title: undefined,
                      favIconUrl: undefined,
                    }),
                    options,
                  },
                })],
                ['(with optional arguments)', () => ({
                  input: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    settings: sinon.match({
                      timeId,
                      title: 'customTitle',
                      favIconUrl: `${docUrl}favicon.png`,
                    }),
                    options,
                  },
                })],
              ]) {
                it('should call `captureBookmark`' + (desc ? ` ${desc}` : ''), async function () {
                  var {input, expected} = factory();

                  var stubCapture = sinon.stub(Capturer.prototype, 'captureBookmark').callsFake(({url: sourceUrl}) => ({
                    url: 'index.html',
                    sourceUrl,
                  }));

                  var result = await new Capturer().captureRemote(input);
                  assert.deepEqual(result, {
                    url: 'index.html',
                    sourceUrl: docUrl,
                  });

                  sinon.assert.calledOnceWithExactly(stubCapture, expected);
                });
              }

              break;
            }
            case "tab": {
              for (const [desc, factory] of [
                ['', () => ({
                  input: {
                    url: docUrl,
                    mode,
                    settings: {timeId},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: undefined, refPolicy: undefined,
                    settings: sinon.match({
                      timeId,
                      title: undefined,
                      favIconUrl: undefined,
                      fullPage: true,
                    }),
                    options,
                  },
                })],
                ['(with optional arguments)', () => ({
                  input: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    mode,
                    settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}favicon.png`},
                    options,
                  },
                  expected: {
                    url: docUrl, refUrl: `${docUrl}ref.html`, refPolicy: 'unsafe-url',
                    settings: sinon.match({
                      timeId,
                      title: 'customTitle',
                      favIconUrl: `${docUrl}favicon.png`,
                      fullPage: true,
                    }),
                    options,
                  },
                })],
              ]) {
                it('should call `captureRemoteTab` with `{fullPage: true}`' + (desc ? ` ${desc}` : ''), async function () {
                  var {input, expected} = factory();

                  var stubCapture = sinon.stub(Capturer.prototype, 'captureRemoteTab').callsFake(({url: sourceUrl}) => ({
                    url: 'index.html',
                    sourceUrl,
                  }));

                  var result = await new Capturer().captureRemote(input);
                  assert.deepEqual(result, {
                    url: 'index.html',
                    sourceUrl: docUrl,
                  });

                  sinon.assert.calledOnceWithExactly(stubCapture, expected);
                });
              }

              break;
            }
          }
        });
      }
    });

    describe('#captureUrl', function () {
      const options = {
        "capture.saveAs": "folder",
        "capture.downLink.file.mode": "none",
        "capture.downLink.doc.depth": null,
      };

      context('basic call handling', function () {
        it('should call `captureDocumentOrFile` if `resolveRedirects` result is a document', async function () {
          var doc = createDocFixture();
          var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns({
            url: docUrl,
            fetchResponse: {
              url: docUrl,
              status: 200,
              headers: {},
            },
            doc,
          });
          var stubCapture = sinon.stub(Capturer.prototype, 'captureDocumentOrFile').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var result = await new Capturer().captureUrl({
            url: docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubResolve, {
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            overrideBlob: undefined,
            isAttachment: undefined,
            checkMetaRefresh: true,
            settings: {timeId},
            options,
          });
          sinon.assert.calledOnceWithExactly(stubCapture, {
            doc,
            docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            settings: {timeId},
            options,
          });
        });

        it('should call `captureDocumentOrFile` with optional arguments', async function () {
          var doc = createDocFixture();
          var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns({
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            fetchResponse: {
              url: docUrl,
              status: 200,
              headers: {},
            },
            doc,
          });
          var stubCapture = sinon.stub(Capturer.prototype, 'captureDocumentOrFile').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var result = await new Capturer().captureUrl({
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubResolve, {
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            overrideBlob: undefined,
            isAttachment: undefined,
            checkMetaRefresh: true,
            settings: {timeId},
            options,
          });
          sinon.assert.calledOnceWithExactly(stubCapture, {
            doc,
            docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            settings: {timeId},
            options,
          });
        });

        it('should call `captureFile` if `resolveRedirects` result is not a document', async function () {
          var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns({
            url: docUrl,
            fetchResponse: {
              url: docUrl,
              status: 200,
              headers: {},
            },
            doc: null,
          });
          var stubCapture = sinon.stub(Capturer.prototype, 'captureFile').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var result = await new Capturer().captureUrl({
            url: docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubResolve, {
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            overrideBlob: undefined,
            isAttachment: undefined,
            checkMetaRefresh: true,
            settings: {timeId},
            options,
          });
          sinon.assert.calledOnceWithExactly(stubCapture, {
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            charset: undefined,
            settings: {timeId},
            options,
          });
        });

        it('should call `captureFile` with header charset and optional arguments', async function () {
          var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns({
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            fetchResponse: {
              url: docUrl,
              status: 200,
              headers: {charset: 'UTF-8'},
            },
            doc: null,
          });
          var stubCapture = sinon.stub(Capturer.prototype, 'captureFile').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var result = await new Capturer().captureUrl({
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubResolve, {
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            overrideBlob: undefined,
            isAttachment: undefined,
            checkMetaRefresh: true,
            settings: {timeId},
            options,
          });
          sinon.assert.calledOnceWithExactly(stubCapture, {
            url: docUrl,
            refUrl: `${docUrl}referrer/`,
            refPolicy: 'unsafe-url',
            charset: 'UTF-8',
            settings: {timeId},
            options,
          });
        });

        it('should throw if `resolveRedirects` result has error', async function () {
          var stubResolve = sinon.stub(Capturer.prototype, 'resolveRedirects').returns({
            url: docUrl,
            fetchResponse: {
              url: docUrl,
              status: 404,
              headers: {},
              blob: new Blob(['foo'], {type: 'text/html'}),
              error: {name: 'HttpError', message: '404 Not Found'},
            },
            doc: null,
            error: new Error('404 Not Found'),
          });

          var error;
          try {
            await new Capturer().captureUrl({
              url: docUrl,
              settings: {timeId},
              options,
            });
          } catch (ex) {
            error = ex;
          }
          assert.instanceOf(error, Error);
          assert.strictEqual(error.message, '404 Not Found');

          sinon.assert.calledOnceWithExactly(stubResolve, {
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            overrideBlob: undefined,
            isAttachment: undefined,
            checkMetaRefresh: true,
            settings: {timeId},
            options,
          });
        });
      });
    });

    describe('#captureBookmark', function () {
      const resMap = {
        [docUrl]: {
          blob: new Blob([`\
<!DOCTYPE html>
<meta charset="utf-8">
<title>ABC 中文 𠀀 にほんご</title>
<link rel="shortcut icon" href="./green.bmp">
`], {type: 'text/html'}),
        },
        [`${docUrl}green.bmp`]: {
          blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
        },
        [`${docUrl}red.bmp`]: {
          blob: new Blob([utils.byteStringToArrayBuffer(RED_BMP_BYTES)], {type: 'image/bmp'}),
        },
      };

      const options = {
        "capture.saveTo": "folder",
        "capture.saveAs": "folder",
        "capture.recordDocumentMeta": true,
      };

      for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
        it(`should save as single \`.htm\` file when options["capture.saveAs"] = "${saveAs}"`, async function () {
          sinon.stub(options, "capture.saveAs").value(saveAs);

          var result = await new TestCapturer(resMap).captureGeneral({
            url: docUrl,
            mode: 'bookmark',
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            timeId,
            title: 'ABC 中文 𠀀 にほんご',
            type: "bookmark",
            sourceUrl: docUrl,
            targetDir: undefined,
            filename: `${timeId}.htm`,
            url: "index.html",
            favIconUrl: `data:image/bmp;base64,${GREEN_BMP_B64}`,
          });
        });
      }

      it('should take title and favicon from the document', async function () {
        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${GREEN_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should include no title if not exist in the document', async function () {
        sinon.stub(resMap, docUrl).value({
          blob: new Blob([`\
<!DOCTYPE html>
<meta charset="utf-8">
<link rel="shortcut icon" href="./green.bmp">
`], {type: 'text/html'}),
        });

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.notExists(doc.querySelector('title'));
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${GREEN_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should take site favicon if no favicon in the document', async function () {
        const resMap = {
          [docUrl]: {
            blob: new Blob([`\
<!DOCTYPE html>
<meta charset="utf-8">
<title>ABC 中文 𠀀 にほんご</title>
`], {type: 'text/html'}),
          },
          [`${docUrl}favicon.ico`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(BLUE_BMP_BYTES)], {type: 'image/x-icon'}),
          },
        };

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/x-icon;base64,${BLUE_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should include no favicon if neither favicon nor site favicon exists', async function () {
        const resMap = {
          [docUrl]: {
            blob: new Blob([`\
<!DOCTYPE html>
<meta charset="utf-8">
<title>ABC 中文 𠀀 にほんご</title>
`], {type: 'text/html'}),
          },
        };

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.notExists(doc.querySelector('link[rel="shortcut icon"]'));
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should ignore title and favicon if the source is an attachment', async function () {
        sinon.stub(resMap, docUrl).value({
          blob: resMap[docUrl].blob,
          headers: {isAttachment: true},
        });

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.notExists(doc.querySelector('title'));
        assert.notExists(doc.querySelector('link[rel="shortcut icon"]'));
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should take title and favicon from `settings` if provided', async function () {
        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}red.bmp`},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'customTitle');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${RED_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should take title and favicon from `settings` if provided even if the source is an attachment', async function () {
        sinon.stub(resMap, docUrl).value({
          blob: resMap[docUrl].blob,
          headers: {isAttachment: true},
        });

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId, title: 'customTitle', favIconUrl: `${docUrl}red.bmp`},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'customTitle');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${RED_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should not record document metadata if options["capture.recordDocumentMeta"] is falsy', async function () {
        var options = {
          "capture.recordDocumentMeta": false,
        };
        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {});
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${GREEN_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');
      });

      it('should call `addItemToServer` without saving when options["capture.saveTo"] = "server"', async function () {
        stubServer(sinon);
        var spySaveDocument = sinon.spy(Capturer.prototype, 'saveDocument');
        var stubAddItem = sinon.stub(Capturer.prototype, 'addItemToServer');

        var options = {
          "capture.saveTo": "server",
          "capture.recordDocumentMeta": true,
        };
        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        assert.notExists(data);

        sinon.assert.notCalled(spySaveDocument);
        sinon.assert.calledOnceWithExactly(stubAddItem, {
          item: {
            id: timeId,
            index: '',
            title: 'ABC 中文 𠀀 にほんご',
            type: 'bookmark',
            create: timeId,
            source: docUrl,
            icon: `data:image/bmp;base64,${GREEN_BMP_B64}`,
            comment: undefined,
            charset: undefined,
          },
          parentId: undefined,
          index: undefined,
        });
      });

      it('should call `addItemToServer` with saving when options["capture.saveTo"] = "server" and the current book is `no_tree`', async function () {
        stubServer(sinon, {books: {'': {config: {no_tree: true}}}});
        var stubAddItem = sinon.stub(Capturer.prototype, 'addItemToServer');

        var options = {
          "capture.saveTo": "server",
          "capture.recordDocumentMeta": true,
        };

        var {data} = await new TestCapturer(resMap).captureGeneral({
          url: docUrl,
          mode: 'bookmark',
          settings: {timeId},
          options,
        });
        var doc = await utils.readFileAsDocument(data);

        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'bookmark',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=https://example.com/');
        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), `data:image/bmp;base64,${GREEN_BMP_B64}`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'https://example.com/');

        sinon.assert.calledOnceWithExactly(stubAddItem, {
          item: {
            id: timeId,
            index: `${timeId}.htm`,
            title: 'ABC 中文 𠀀 にほんご',
            type: 'bookmark',
            create: timeId,
            source: docUrl,
            icon: `data:image/bmp;base64,${GREEN_BMP_B64}`,
            comment: undefined,
            charset: undefined,
          },
          parentId: undefined,
          index: undefined,
        });
      });
    });

    describe('#captureFile', function () {
      const resMap = {};

      const options = {
        "capture.saveTo": "folder",
        "capture.saveAs": "maff",
        "capture.recordDocumentMeta": true,
      };

      before(async function () {
        Object.assign(resMap, {
          [`${docUrl}green.bmp`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
          },
          [`${docUrl}file.txt`]: {
            blob: new Blob(['ABC 中文 𠀀 にほんご'], {type: 'text/plain'}),
          },
          [`${docUrl}big5.txt`]: {
            blob: new Blob([await encodeText('Big5 中文內容', 'big5')], {type: 'text/plain'}),
            headers: {charset: 'big5'},
          },
        });
      });

      for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
        switch (saveAs) {
          case "folder":
          default: {
            it(`should save the file and generate \`index.html\` when options["capture.saveAs"] = "${saveAs}"`, async function () {
              sinon.stub(options, "capture.saveAs").value(saveAs);
              var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

              var result = await new TestCapturer(resMap).captureGeneral({
                url: `${docUrl}green.bmp`,
                settings: {timeId},
                options,
              });
              sinon.assert.calledOnceWithMatch(spyCapture, {
                url: 'https://example.com/green.bmp',
                refUrl: undefined,
                refPolicy: undefined,
                charset: undefined,
                settings: {timeId},
                options,
              });
              sinon.assert.match(result, {
                timeId,
                title: 'green.bmp',
                type: "file",
                sourceUrl: 'https://example.com/green.bmp',
                targetDir: undefined,
                filename: 'index.html',
                url: "index.html",
                favIconUrl: undefined,
                charset: undefined,
              });
              assert.hasAllKeys(result.data, ['index.html', 'green.bmp']);

              var doc = await utils.readFileAsDocument(result.data.get('index.html'));
              assert.deepEqual(getAttributes(doc.documentElement), {
                'data-scrapbook-source': 'https://example.com/green.bmp',
                'data-scrapbook-create': timeId,
                'data-scrapbook-type': 'file',
              });
              assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
              assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=green.bmp');
              assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'green.bmp');

              assert.strictEqual(
                await utils.readFileAsText(result.data.get('green.bmp'), false),
                GREEN_BMP_BYTES,
              );
            });

            break;
          }
          case "zip": {
            it(`should save the file and generate \`index.html\` when options["capture.saveAs"] = "${saveAs}"`, async function () {
              sinon.stub(options, "capture.saveAs").value(saveAs);
              var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

              var result = await new TestCapturer(resMap).captureGeneral({
                url: `${docUrl}green.bmp`,
                settings: {timeId},
                options,
              });
              sinon.assert.calledOnceWithMatch(spyCapture, {
                url: 'https://example.com/green.bmp',
                refUrl: undefined,
                refPolicy: undefined,
                charset: undefined,
                settings: {timeId},
                options,
              });
              sinon.assert.match(result, {
                timeId,
                title: 'green.bmp',
                type: "file",
                sourceUrl: 'https://example.com/green.bmp',
                targetDir: undefined,
                filename: `${timeId}.htz`,
                url: "index.html",
                favIconUrl: undefined,
                charset: undefined,
              });
              var zip = await Zip.loadAsync(result.data);
              assert.hasAllKeys(zip.files, ['index.html', 'green.bmp']);

              var blob = new Blob([await zip.file('index.html').async('blob')], {type: "text/html"});
              var doc = await utils.readFileAsDocument(blob);
              assert.deepEqual(getAttributes(doc.documentElement), {
                'data-scrapbook-source': 'https://example.com/green.bmp',
                'data-scrapbook-create': timeId,
                'data-scrapbook-type': 'file',
              });
              assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
              assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=green.bmp');
              assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'green.bmp');

              assert.strictEqual(
                await utils.readFileAsText(await zip.file('green.bmp').async('blob'), false),
                GREEN_BMP_BYTES,
              );
            });

            break;
          }
          case "maff": {
            it(`should save the file and generate \`index.html\` when options["capture.saveAs"] = "${saveAs}"`, async function () {
              sinon.stub(options, "capture.saveAs").value(saveAs);
              var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

              var result = await new TestCapturer(resMap).captureGeneral({
                url: `${docUrl}green.bmp`,
                settings: {timeId},
                options,
              });
              sinon.assert.calledOnceWithMatch(spyCapture, {
                url: 'https://example.com/green.bmp',
                refUrl: undefined,
                refPolicy: undefined,
                charset: undefined,
                settings: {timeId},
                options,
              });
              sinon.assert.match(result, {
                timeId,
                title: 'green.bmp',
                type: "file",
                sourceUrl: 'https://example.com/green.bmp',
                targetDir: undefined,
                filename: `${timeId}.maff`,
                url: "index.html",
                favIconUrl: undefined,
                charset: undefined,
              });
              var zip = await Zip.loadAsync(result.data);
              assert.hasAllKeys(zip.files, [
                `${timeId}/`,
                `${timeId}/index.rdf`,
                `${timeId}/index.html`,
                `${timeId}/green.bmp`,
              ]);

              var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
              var doc = await utils.readFileAsDocument(blob);
              assert.deepEqual(getAttributes(doc.documentElement), {
                'data-scrapbook-source': 'https://example.com/green.bmp',
                'data-scrapbook-create': timeId,
                'data-scrapbook-type': 'file',
              });
              assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
              assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=green.bmp');
              assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'green.bmp');

              assert.strictEqual(
                await utils.readFileAsText(await zip.file(`${timeId}/green.bmp`).async('blob'), false),
                GREEN_BMP_BYTES,
              );

              var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
              var doc = await utils.readFileAsDocument(blob);
              var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
              assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
              var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
              assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
            });

            break;
          }
          case "singleHtml": {
            it(`should save the file as data URL when options["capture.saveAs"] = "${saveAs}"`, async function () {
              sinon.stub(options, "capture.saveAs").value(saveAs);
              var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

              var result = await new TestCapturer(resMap).captureGeneral({
                url: `${docUrl}green.bmp`,
                settings: {timeId},
                options,
              });
              sinon.assert.calledOnceWithMatch(spyCapture, {
                url: 'https://example.com/green.bmp',
                refUrl: undefined,
                refPolicy: undefined,
                charset: undefined,
                settings: {timeId},
                options,
              });
              sinon.assert.match(result, {
                timeId,
                title: 'green.bmp',
                type: "file",
                sourceUrl: 'https://example.com/green.bmp',
                targetDir: undefined,
                filename: `${timeId}.html`,
                url: "index.html",
                favIconUrl: undefined,
                charset: undefined,
              });

              var doc = await utils.readFileAsDocument(result.data);
              assert.deepEqual(getAttributes(doc.documentElement), {
                'data-scrapbook-source': 'https://example.com/green.bmp',
                'data-scrapbook-create': timeId,
                'data-scrapbook-type': 'file',
              });
              assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
              assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), `0; url=data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}`);
              assert.strictEqual(doc.querySelector('a').getAttribute('href'), `data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}`);
            });

            break;
          }
        }
      }

      it('should save the charset of a text file (from header)', async function () {
        var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

        var result = await new TestCapturer(resMap).captureGeneral({
          url: `${docUrl}big5.txt`,
          settings: {timeId},
          options,
        });
        sinon.assert.calledOnceWithExactly(spyCapture, {
          url: 'https://example.com/big5.txt',
          refUrl: undefined,
          refPolicy: undefined,
          charset: 'big5',
          settings: sinon.match({timeId}),
          options: sinon.match(options),
        });
        sinon.assert.match(result, {
          timeId,
          title: 'big5.txt',
          type: "file",
          sourceUrl: 'https://example.com/big5.txt',
          targetDir: undefined,
          filename: `${timeId}.maff`,
          url: "index.html",
          favIconUrl: undefined,
          charset: 'big5',
        });
        var zip = await Zip.loadAsync(result.data);
        assert.hasAllKeys(zip.files, [
          `${timeId}/`,
          `${timeId}/index.rdf`,
          `${timeId}/index.html`,
          `${timeId}/big5.txt`,
        ]);

        var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
        var doc = await utils.readFileAsDocument(blob);
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/big5.txt',
          'data-scrapbook-create': timeId,
          'data-scrapbook-type': 'file',
          'data-scrapbook-charset': 'big5',
        });
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=big5.txt');
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'big5.txt');

        var text = await utils.readFileAsText(await zip.file(`${timeId}/big5.txt`).async('blob'), 'big5');
        assert.strictEqual(text, 'Big5 中文內容');

        var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
        var doc = await utils.readFileAsDocument(blob);
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
      });

      it('should not record document metadata if options["capture.recordDocumentMeta"] is falsy', async function () {
        sinon.stub(options, "capture.recordDocumentMeta").value(false);
        var spyCapture = sinon.spy(Capturer.prototype, 'captureFile');

        var result = await new TestCapturer(resMap).captureGeneral({
          url: `${docUrl}file.txt`,
          settings: {timeId},
          options,
        });
        sinon.assert.calledOnceWithMatch(spyCapture, {
          url: 'https://example.com/file.txt',
          refUrl: undefined,
          refPolicy: undefined,
          charset: undefined,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          timeId,
          title: 'file.txt',
          type: "file",
          sourceUrl: 'https://example.com/file.txt',
          targetDir: undefined,
          filename: `${timeId}.maff`,
          url: "index.html",
          favIconUrl: undefined,
          charset: undefined,
        });
        var zip = await Zip.loadAsync(result.data);
        assert.hasAllKeys(zip.files, [
          `${timeId}/`,
          `${timeId}/index.rdf`,
          `${timeId}/index.html`,
          `${timeId}/file.txt`,
        ]);

        var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
        var doc = await utils.readFileAsDocument(blob);
        assert.deepEqual(getAttributes(doc.documentElement), {});
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=file.txt');
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'file.txt');

        var text = await utils.readFileAsText(await zip.file(`${timeId}/file.txt`).async('blob'));
        assert.strictEqual(text, 'ABC 中文 𠀀 にほんご');

        var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
        var doc = await utils.readFileAsDocument(blob);
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
      });
    });

    describe('#captureDocumentOrFile', function () {
      const options = {
        "capture.saveFileAsHtml": false,
      };

      for (const type of ["html", "xhtml", "svg", "xml"]) {
        context(`when contentType is ${type}`, function () {
          switch (type) {
            case "html":
            case "xhtml":
            case "svg": {
              it('should call `captureDocument`', async function () {
                var stubCapture = sinon.stub(Capturer.prototype, 'captureDocument').returns({
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                var doc = createDocFixture({type});
                var result = await new Capturer().captureDocumentOrFile({
                  doc,
                  docUrl,
                  settings: {timeId},
                  options,
                });
                sinon.assert.match(result, {
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                sinon.assert.calledOnceWithExactly(stubCapture, {
                  doc,
                  docUrl,
                  envDocUrl: undefined,
                  baseUrl: undefined,
                  refPolicy: undefined,
                  settings: {timeId},
                  options,
                });
              });

              break;
            }
            case "xml": {
              it('should invoke `captureFile`', async function () {
                var stubInvoke = sinon.stub(Capturer.prototype, 'invoke').returns({
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                var doc = createDocFixture({type});
                var result = await new Capturer().captureDocumentOrFile({
                  doc,
                  docUrl,
                  settings: {timeId},
                  options,
                });
                sinon.assert.match(result, {
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                sinon.assert.calledOnceWithExactly(stubInvoke, 'captureFile', [{
                  url: docUrl,
                  refUrl: undefined,
                  refPolicy: undefined,
                  charset: 'UTF-8',
                  settings: {timeId, title: ''},
                  options,
                }]);
              });

              it('should invoke `captureFile` when options["capture.saveFileAsHtml"] is truthy ', async function () {
                var stubInvoke = sinon.stub(Capturer.prototype, 'invoke').returns({
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                var options = {
                  "capture.saveFileAsHtml": true,
                };

                var doc = createDocFixture({type});
                var result = await new Capturer().captureDocumentOrFile({
                  doc,
                  docUrl,
                  settings: {timeId},
                  options,
                });
                sinon.assert.match(result, {
                  url: 'index.html',
                  sourceUrl: docUrl,
                });

                sinon.assert.calledOnceWithExactly(stubInvoke, 'captureFile', [{
                  url: docUrl,
                  refUrl: undefined,
                  refPolicy: undefined,
                  charset: 'UTF-8',
                  settings: {timeId, title: ''},
                  options,
                }]);
              });

              break;
            }
          }
        });
      }

      context('when contentType is "text/plain"', function () {
        it('should invoke `captureFile` with document charset', async function () {
          var stubInvoke = sinon.stub(Capturer.prototype, 'invoke').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var u8ar = await encodeText('\uFEFF' + '中文內容', 'utf-16le');
          var src = URL.createObjectURL(new Blob([u8ar], {type: 'text/plain'}));
          var {contentDocument: doc} = await createIframeFixture({src});
          var result = await new Capturer().captureDocumentOrFile({
            doc,
            docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubInvoke, 'captureFile', [{
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            charset: 'UTF-16LE',
            settings: {timeId, title: ''},
            options,
          }]);
        });

        it('should call `captureDocument` when options["capture.saveFileAsHtml"] is truthy', async function () {
          var stubCapture = sinon.stub(Capturer.prototype, 'captureDocument').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var options = {
            "capture.saveFileAsHtml": true,
          };

          var u8ar = await encodeText('\uFEFF' + '中文內容', 'utf-16le');
          var src = URL.createObjectURL(new Blob([u8ar], {type: 'text/plain'}));
          var {contentDocument: doc} = await createIframeFixture({src});
          var result = await new Capturer().captureDocumentOrFile({
            doc,
            docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubCapture, {
            doc,
            docUrl,
            envDocUrl: undefined,
            baseUrl: undefined,
            refPolicy: undefined,
            mime: 'text/html',
            settings: {timeId},
            options,
          });
        });
      });

      context('when contentType is "image/bmp"', function () {
        it('should invoke `captureFile`', async function () {
          var stubInvoke = sinon.stub(Capturer.prototype, 'invoke').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var src = URL.createObjectURL(new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}));
          var {contentDocument: doc} = await createIframeFixture({src});
          var result = await new Capturer().captureDocumentOrFile({
            doc,
            docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubInvoke, 'captureFile', [{
            url: docUrl,
            refUrl: undefined,
            refPolicy: undefined,
            charset: sinon.match.typeOf('string'),
            settings: {timeId, title: sinon.match.typeOf('string')},
            options,
          }]);
        });

        it('should call `captureDocument` when options["capture.saveFileAsHtml"] is truthy', async function () {
          var stubCapture = sinon.stub(Capturer.prototype, 'captureDocument').returns({
            url: 'index.html',
            sourceUrl: docUrl,
          });

          var options = {
            "capture.saveFileAsHtml": true,
          };

          var src = URL.createObjectURL(new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}));
          var {contentDocument: doc} = await createIframeFixture({src});
          var result = await new Capturer().captureDocumentOrFile({
            doc,
            docUrl,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url: 'index.html',
            sourceUrl: docUrl,
          });

          sinon.assert.calledOnceWithExactly(stubCapture, {
            doc,
            docUrl,
            envDocUrl: undefined,
            baseUrl: undefined,
            refPolicy: undefined,
            mime: 'text/html',
            settings: {timeId},
            options,
          });
        });
      });
    });

    describe('#captureDocument', function () {
      context('basic capture handling', function () {
        function factoryHtml() {
          return createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ABC 中文 𠀀 にほんご</title>
</head>
<body>
<p>ABC 中文 𠀀 にほんご</p>
<img src="./green.bmp">
</body>
</html>
`});
        }

        function factoryXhtml() {
          return createDocFixture({type: 'xhtml', code: `\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<title>ABC 中文 𠀀 にほんご</title>
</head>
<body>
<p>ABC 中文 𠀀 にほんご</p>
<img src="./green.bmp" />
</body>
</html>
`});
        }

        function factorySvg() {
          return createDocFixture({type: 'svg', code: `\
<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<image href="./green.bmp" x="15" y="5" width="10" height="10" />
</svg>
`});
        }

        const resMap = {
          [`${docUrl}green.bmp`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
          },
        };

        const baseOptions = {
          "capture.saveTo": "folder",
          "capture.saveAs": "folder",
          "capture.recordDocumentMeta": true,
          "capture.image": "save",
        };

        context('for HTML document', function () {
          for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
            context(`when options["capture.saveAs"] = "${saveAs}"`, function () {
              const options = {
                ...baseOptions,
                "capture.saveAs": saveAs,
              };

              switch (saveAs) {
                case "folder":
                default: {
                  it('should save to `index.html` with resources', async function () {
                    var doc = factoryHtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.html`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.html',
                      targetDir: undefined,
                      filename: 'index.html',
                      url: 'index.html',
                      favIconUrl: undefined,
                    });
                    assert.hasAllKeys(result.data, ['index.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(result.data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.html',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(result.data.get('green.bmp'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "zip": {
                  it('should save to `index.html` with resources', async function () {
                    var doc = factoryHtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.html`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.html',
                      targetDir: undefined,
                      filename: `${timeId}.htz`,
                      url: 'index.html',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, ['index.html', 'green.bmp']);

                    var blob = new Blob([await zip.file('index.html').async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.html',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file('green.bmp').async('blob'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "maff": {
                  it('should save to `*/index.html` with resources', async function () {
                    var doc = factoryHtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.html`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.html',
                      targetDir: undefined,
                      filename: `${timeId}.maff`,
                      url: 'index.html',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, [
                      `${timeId}/`,
                      `${timeId}/index.rdf`,
                      `${timeId}/index.html`,
                      `${timeId}/green.bmp`,
                    ]);

                    var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.html',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file(`${timeId}/green.bmp`).async('blob'), false),
                      GREEN_BMP_BYTES,
                    );

                    var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
                    var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
                  });

                  break;
                }
                case "singleHtml": {
                  it('should save to `*.html` with embedded resources', async function () {
                    var doc = factoryHtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.html`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.html',
                      targetDir: undefined,
                      filename: `${timeId}.html`,
                      url: 'index.html',
                      favIconUrl: undefined,
                    });

                    var doc = await utils.readFileAsDocument(result.data);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.html',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), `data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}`);
                  });

                  break;
                }
              }
            });
          }
        });

        context('for XHTML document', function () {
          for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
            context(`when options["capture.saveAs"] = "${saveAs}"`, function () {
              const options = {
                ...baseOptions,
                "capture.saveAs": saveAs,
              };

              switch (saveAs) {
                case "folder":
                default: {
                  it('should save to `index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factoryXhtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.xhtml`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.xhtml',
                      targetDir: undefined,
                      filename: 'index.html',
                      url: 'index.xhtml',
                      favIconUrl: undefined,
                    });
                    assert.hasAllKeys(result.data, ['index.html', 'index.xhtml', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(result.data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]'));

                    var doc = await utils.readFileAsDocument(result.data.get('index.xhtml'));
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      [`{${NS_XMLNS}}xmlns`]: NS_HTML,
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                    });
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(result.data.get('green.bmp'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "zip": {
                  it('should save to `index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factoryXhtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.xhtml`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.xhtml',
                      targetDir: undefined,
                      filename: `${timeId}.htz`,
                      url: 'index.xhtml',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, ['index.html', 'index.xhtml', 'green.bmp']);

                    var blob = new Blob([await zip.file('index.html').async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]'));

                    var blob = new Blob([await zip.file('index.xhtml').async('blob')], {type: "application/xhtml+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      [`{${NS_XMLNS}}xmlns`]: NS_HTML,
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                    });
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file('green.bmp').async('blob'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "maff": {
                  it('should save to `*/index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factoryXhtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.xhtml`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.xhtml',
                      targetDir: undefined,
                      filename: `${timeId}.maff`,
                      url: 'index.xhtml',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, [
                      `${timeId}/`,
                      `${timeId}/index.rdf`,
                      `${timeId}/index.html`,
                      `${timeId}/index.xhtml`,
                      `${timeId}/green.bmp`,
                    ]);

                    var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]'));

                    var blob = new Blob([await zip.file(`${timeId}/index.xhtml`).async('blob')], {type: "application/xhtml+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      [`{${NS_XMLNS}}xmlns`]: NS_HTML,
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                    });
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file(`${timeId}/green.bmp`).async('blob'), false),
                      GREEN_BMP_BYTES,
                    );

                    var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.xhtml');
                    var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
                  });

                  break;
                }
                case "singleHtml": {
                  it('should save to `*.xhtml` with embedded resources', async function () {
                    var doc = factoryXhtml();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}page.xhtml`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'ABC 中文 𠀀 にほんご',
                      type: '',
                      sourceUrl: 'https://example.com/page.xhtml',
                      targetDir: undefined,
                      filename: `${timeId}.xhtml`,
                      url: 'index.xhtml',
                      favIconUrl: undefined,
                    });

                    var doc = await utils.readFileAsDocument(result.data);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      [`{${NS_XMLNS}}xmlns`]: NS_HTML,
                      'data-scrapbook-source': 'https://example.com/page.xhtml',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');
                    assert.strictEqual(doc.querySelector('img').getAttribute('src'), `data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}`);
                  });

                  break;
                }
              }
            });
          }
        });

        context('for SVG document', function () {
          for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
            context(`when options["capture.saveAs"] = "${saveAs}"`, function () {
              const options = {
                ...baseOptions,
                "capture.saveAs": saveAs,
              };

              switch (saveAs) {
                case "folder":
                default: {
                  it('should save to `index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factorySvg();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}image.svg`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'image.svg',
                      type: '',
                      sourceUrl: 'https://example.com/image.svg',
                      targetDir: undefined,
                      filename: 'index.html',
                      url: 'index.svg',
                      favIconUrl: undefined,
                    });
                    assert.hasAllKeys(result.data, ['index.html', 'index.svg', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(result.data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/image.svg',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.svg"]'));

                    var doc = await utils.readFileAsDocument(result.data.get('index.svg'));
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'viewBox': '0 0 100 100',
                      [`{${NS_XMLNS}}xmlns`]: NS_SVG,
                      [`{${NS_XMLNS}}xmlns:xlink`]: NS_XLINK,
                      'data-scrapbook-source': 'https://example.com/image.svg',
                    });
                    assert.strictEqual(doc.querySelector('image').getAttribute('href'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(result.data.get('green.bmp'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "zip": {
                  it('should save to `index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factorySvg();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}image.svg`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'image.svg',
                      type: '',
                      sourceUrl: 'https://example.com/image.svg',
                      targetDir: undefined,
                      filename: `${timeId}.htz`,
                      url: 'index.svg',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, ['index.html', 'index.svg', 'green.bmp']);

                    var blob = new Blob([await zip.file('index.html').async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/image.svg',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.svg"]'));

                    var blob = new Blob([await zip.file('index.svg').async('blob')], {type: "image/svg+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'viewBox': '0 0 100 100',
                      [`{${NS_XMLNS}}xmlns`]: NS_SVG,
                      [`{${NS_XMLNS}}xmlns:xlink`]: NS_XLINK,
                      'data-scrapbook-source': 'https://example.com/image.svg',
                    });
                    assert.strictEqual(doc.querySelector('image').getAttribute('href'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file('green.bmp').async('blob'), false),
                      GREEN_BMP_BYTES,
                    );
                  });

                  break;
                }
                case "maff": {
                  it('should save to `*/index.xhtml` with generated `index.html` and resources', async function () {
                    var doc = factorySvg();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}image.svg`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'image.svg',
                      type: '',
                      sourceUrl: 'https://example.com/image.svg',
                      targetDir: undefined,
                      filename: `${timeId}.maff`,
                      url: 'index.svg',
                      favIconUrl: undefined,
                    });
                    var zip = await Zip.loadAsync(result.data);
                    assert.hasAllKeys(zip.files, [
                      `${timeId}/`,
                      `${timeId}/index.rdf`,
                      `${timeId}/index.html`,
                      `${timeId}/index.svg`,
                      `${timeId}/green.bmp`,
                    ]);

                    var blob = new Blob([await zip.file(`${timeId}/index.html`).async('blob')], {type: "text/html"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'data-scrapbook-source': 'https://example.com/image.svg',
                      'data-scrapbook-create': timeId,
                    });
                    assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
                    assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.svg"]'));

                    var blob = new Blob([await zip.file(`${timeId}/index.svg`).async('blob')], {type: "image/svg+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'viewBox': '0 0 100 100',
                      [`{${NS_XMLNS}}xmlns`]: NS_SVG,
                      [`{${NS_XMLNS}}xmlns:xlink`]: NS_XLINK,
                      'data-scrapbook-source': 'https://example.com/image.svg',
                    });
                    assert.strictEqual(doc.querySelector('image').getAttribute('href'), 'green.bmp');

                    assert.strictEqual(
                      await utils.readFileAsText(await zip.file(`${timeId}/green.bmp`).async('blob'), false),
                      GREEN_BMP_BYTES,
                    );

                    var blob = new Blob([await zip.file(`${timeId}/index.rdf`).async('blob')], {type: "application/rdf+xml"});
                    var doc = await utils.readFileAsDocument(blob);
                    var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.svg');
                    var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
                    assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html
                  });

                  break;
                }
                case "singleHtml": {
                  it('should save to `*.xhtml` with embedded resources', async function () {
                    var doc = factorySvg();
                    var result = await new TestCapturer(resMap).captureGeneral({
                      doc,
                      docUrl: `${docUrl}image.svg`,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.match(result, {
                      timeId,
                      title: 'image.svg',
                      type: '',
                      sourceUrl: 'https://example.com/image.svg',
                      targetDir: undefined,
                      filename: `${timeId}.svg`,
                      url: 'index.svg',
                      favIconUrl: undefined,
                    });

                    var doc = await utils.readFileAsDocument(result.data);
                    assert.deepEqual(getAttributes(doc.documentElement), {
                      'viewBox': '0 0 100 100',
                      [`{${NS_XMLNS}}xmlns`]: NS_SVG,
                      [`{${NS_XMLNS}}xmlns:xlink`]: NS_XLINK,
                      'data-scrapbook-source': 'https://example.com/image.svg',
                      'data-scrapbook-create': timeId,
                    });
                    assert.strictEqual(doc.querySelector('image').getAttribute('href'), `data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}`);
                  });

                  break;
                }
              }
            });
          }
        });
      });

      context('single HTML handling', function () {
        const options = {
          "capture.saveAs": "singleHtml",
          "capture.style": "save",
          "capture.rewriteCss": "url",
          "capture.imageBackground": "save",
          "capture.mergeCssResources": false,
        };

        it('should use UTF-8 encoding for CSS and base64 for binary files', async function () {
          // style
          var doc = createDocFixture({
            name: 'style', value: '#internal { background: url("./green.bmp"); }',
          });
          var resMap = {
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
          var doc = await utils.readFileAsDocument(data);
          assert.strictEqual(doc.querySelector('style').textContent, `#internal { background: url("data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}"); }`);

          // style import
          var doc = createDocFixture({
            name: 'style', value: '@import "./imported.css";',
          });
          var resMap = {
            [`${docUrl}imported.css`]: {
              blob: new Blob(['#imported { background: url("./green.bmp"); }'], {type: 'text/css'}),
            },
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
          var doc = await utils.readFileAsDocument(data);
          assert.strictEqual(doc.querySelector('style').textContent, `@import "data:text/css;charset=UTF-8;filename=imported.css,\
%23imported%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}%22);%20%7D";`);

          // external
          var doc = createDocFixture({
            name: 'link', attrs: {rel: 'stylesheet', href: 'link.css'},
          });
          var resMap = {
            [`${docUrl}link.css`]: {
              blob: new Blob(['#external { background: url("./green.bmp"); }'], {type: 'text/css'}),
            },
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
          var doc = await utils.readFileAsDocument(data);
          assert.strictEqual(doc.querySelector('link').getAttribute('href'), `data:text/css;charset=UTF-8;filename=link.css,\
%23external%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}%22);%20%7D`);

          // external import
          var doc = createDocFixture({
            name: 'link', attrs: {rel: 'stylesheet', href: 'link.css'},
          });
          var resMap = {
            [`${docUrl}link.css`]: {
              blob: new Blob(['@import "./imported.css";'], {type: 'text/css'}),
            },
            [`${docUrl}imported.css`]: {
              blob: new Blob(['#imported { background: url("./green.bmp"); }'], {type: 'text/css'}),
            },
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
          var doc = await utils.readFileAsDocument(data);
          assert.strictEqual(doc.querySelector('link').getAttribute('href'), `data:text/css;charset=UTF-8;filename=link.css,\
@import%20%22data:text/css;charset=UTF-8;filename=imported.css,\
%2523imported%2520%257B%2520background:%2520url(%2522data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}%2522);%2520%257D%22;`);
        });

        it('should use non-uniquified filename for generated data URLs', async function () {
          var doc = createDocFixture({name: 'html', children: [
            {name: 'head', children: [
              {name: 'link', attrs: {rel: 'stylesheet', href: './dir1/style.css'}},
              {name: 'link', attrs: {rel: 'stylesheet', href: './dir2/style.css'}},
              {name: 'link', attrs: {rel: 'stylesheet', href: './dir3/style.css'}},
            ]},
            {name: 'body', children: [
              {name: 'img', attrs: {src: './dir1/green.bmp'}},
              {name: 'img', attrs: {src: './dir2/green.bmp'}},
              {name: 'img', attrs: {src: './dir3/green.bmp'}},
            ]},
          ]});
          var {data} = await new TestCapturer().captureGeneral({doc, docUrl, options});
          var doc = await utils.readFileAsDocument(data);

          var elems = doc.querySelectorAll('link');
          assert.strictEqual(elems[0].getAttribute('href'), `data:text/css;charset=UTF-8;filename=style.css,`);
          assert.strictEqual(elems[1].getAttribute('href'), `data:text/css;charset=UTF-8;filename=style.css,`);
          assert.strictEqual(elems[2].getAttribute('href'), `data:text/css;charset=UTF-8;filename=style.css,`);

          var elems = doc.querySelectorAll('img');
          assert.strictEqual(elems[0].getAttribute('src'), `data:application/octet-stream;filename=green.bmp;base64,`);
          assert.strictEqual(elems[1].getAttribute('src'), `data:application/octet-stream;filename=green.bmp;base64,`);
          assert.strictEqual(elems[2].getAttribute('src'), `data:application/octet-stream;filename=green.bmp;base64,`);
        });

        context('merge CSS resouruces handling', function () {
          function factory() {
            return createDocFixture({name: 'head', children: [
              {name: 'style', value: '@import "./import.css";'},
              {name: 'style', value: '@font-face { font-family: myFont1; src: url("./internal-font.woff"); }'},
              {name: 'style', value: '@keyframes spin { from { background-image: url("./internal-keyframe.bmp"); } to { transform: rotate(1turn); } }'},
              {name: 'style', value: '#internal { background: url("./internal.bmp"); }'},
              {name: 'link', attrs: {rel: 'stylesheet', href: './link.css'}},
            ]});
          }

          const resMap = {
            [`${docUrl}internal-font.woff`]: {
              blob: new Blob([], {type: 'font/woff'}),
            },
            [`${docUrl}internal-keyframe.bmp`]: {
              blob: new Blob([], {type: 'image/bmp'}),
            },
            [`${docUrl}internal.bmp`]: {
              blob: new Blob([], {type: 'image/bmp'}),
            },
            [`${docUrl}link.css`]: {
              blob: new Blob(['#link { background: url("./link.bmp"); }'], {type: 'text/css'}),
            },
            [`${docUrl}link.bmp`]: {
              blob: new Blob([], {type: 'image/bmp'}),
            },
            [`${docUrl}import.css`]: {
              blob: new Blob(['#import { background: url("./import.bmp"); }'], {type: 'text/css'}),
            },
            [`${docUrl}import.bmp`]: {
              blob: new Blob([], {type: 'image/bmp'}),
            },
          };

          it('should generate a resource map when options["capture.mergeCssResources"] is truthy', async function () {
            sinon.stub(options, "capture.mergeCssResources").value(true);

            var doc = factory();
            var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
            var doc = await utils.readFileAsDocument(data);

            var map = Array.prototype.reduce.call(
              getRulesFromCssText(doc.querySelector('style[data-scrapbook-elem="css-resource-map"]').textContent)[0].style,
              (a, c, i, o) => {
                a[`var(${c})`] = o.getPropertyValue(c);
                return a;
              },
              {},
            );

            var styles = doc.querySelectorAll('style');

            // @import cannot use CSS variable
            var cssText = styles[0].textContent;
            assert.match(cssText, rawRegex`${'^'}@import "data:${'[^"]+'}";${'$'}`);

            // @font-face src cannot use CSS variable
            var cssText = styles[1].textContent;
            assert.match(cssText, rawRegex`src: url("data:${'[^")]+'}");`);

            // @keyframes
            var cssText = styles[2].textContent;
            var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
            assert.notStrictEqual(cssText, cssText2);
            assert.strictEqual(cssText2, `@keyframes spin { from { background-image: url("data:image/bmp;filename=internal-keyframe.bmp;base64,"); } to { transform: rotate(1turn); } }`);

            // internal
            var cssText = styles[3].textContent;
            var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
            assert.notStrictEqual(cssText, cssText2);
            assert.strictEqual(cssText2, `#internal { background: url("data:image/bmp;filename=internal.bmp;base64,"); }`);

            // link
            var cssText = (await utils.xhr({
              url: doc.querySelector('link').getAttribute('href'),
              responseType: 'text',
            })).response.trim();
            var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
            assert.notStrictEqual(cssText, cssText2);
            assert.strictEqual(cssText2, `#link { background: url("data:image/bmp;filename=link.bmp;base64,"); }`);
          });

          it('should not generate a resource map when options["capture.mergeCssResources"] is falsy', async function () {
            var doc = factory();
            var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
            var doc = await utils.readFileAsDocument(data);

            assert.notExists(doc.querySelector('style[data-scrapbook-elem="css-resource-map"]'));

            var styles = doc.querySelectorAll('style');

            // @import cannot use CSS variable
            var cssText = styles[0].textContent;
            assert.match(cssText, rawRegex`${'^'}@import "data:${'[^"]+'}";${'$'}`);

            // @font-face src cannot use CSS variable
            var cssText = styles[1].textContent;
            assert.match(cssText, rawRegex`src: url("data:${'[^")]+'}");`);

            // @keyframes
            var cssText = styles[2].textContent;
            assert.strictEqual(cssText, `@keyframes spin { from { background-image: url("data:image/bmp;filename=internal-keyframe.bmp;base64,"); } to { transform: rotate(1turn); } }`);

            // internal
            var cssText = styles[3].textContent;
            assert.strictEqual(cssText, `#internal { background: url("data:image/bmp;filename=internal.bmp;base64,"); }`);

            // link
            var cssText = (await utils.xhr({
              url: doc.querySelector('link').getAttribute('href'),
              responseType: 'text',
            })).response.trim();
            assert.strictEqual(cssText, `#link { background: url("data:image/bmp;filename=link.bmp;base64,"); }`);
          });
        });
      });

      context('capture selection handling', function () {
        async function docFactory(collapsed) {
          const {contentDocument: doc} = await createIframeFixture({
            hidden: false,
            docData: {
              name: 'body',
              children: [
                {name: 'p', id: 'previous', value: 'previous content'},
                {name: 'img', attrs: {src: './red.bmp'}},
                {name: 'div', id: 'selection', children: [
                  {name: 'p', id: 'selected', value: 'selected content'},
                  {name: 'img', attrs: {src: './green.bmp'}},
                ]},
                {name: 'p', id: 'next', value: 'next content'},
                {name: 'img', attrs: {src: './blue.bmp'}},
              ],
            },
            onload: async ({target: {contentDocument: doc}}) => {
              const sel = doc.getSelection();
              const range = doc.createRange();
              if (collapsed) {
                range.setStartBefore(doc.querySelector('#selection'));
                range.setEndBefore(doc.querySelector('#selection'));
              } else {
                range.selectNode(doc.querySelector('#selection'));
              }
              sel.addRange(range);
            },
          });
          return doc;
        }

        const resMap = {
          [`${docUrl}red.bmp`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(RED_BMP_BYTES)], {type: 'image/bmp'}),
          },
          [`${docUrl}green.bmp`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
          },
          [`${docUrl}blue.bmp`]: {
            blob: new Blob([utils.byteStringToArrayBuffer(BLUE_BMP_BYTES)], {type: 'image/bmp'}),
          },
        };

        const options = {
          "capture.image": "save",
        };

        context('when `fullPage` is falsy', function () {
          it('should capture only the selected range(s)', async function () {
            var doc = await docFactory();

            var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {fullPage: false}, options});
            assert.hasAllKeys(data, ['index.html', 'green.bmp']);

            var doc = await utils.readFileAsDocument(data.get('index.html'));
            assert.notExists(doc.querySelector('html > body > #previous'));
            assert.notExists(doc.querySelector('html > body > #previous + img[src="red.bmp"]'));
            assert.exists(doc.querySelector('html > body > #selection'));
            assert.exists(doc.querySelector('html > body > #selection > img[src="green.bmp"]'));
            assert.notExists(doc.querySelector('html > body > #next'));
            assert.notExists(doc.querySelector('html > body > #next + img[src="blue.bmp"]'));
          });

          it('should capture the whole page if selection is collapsed', async function () {
            var doc = await docFactory(true);

            var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {fullPage: true}, options});
            assert.hasAllKeys(data, ['index.html', 'red.bmp', 'green.bmp', 'blue.bmp']);

            var doc = await utils.readFileAsDocument(data.get('index.html'));
            assert.exists(doc.querySelector('html > body > #previous'));
            assert.exists(doc.querySelector('html > body > #previous + img[src="red.bmp"]'));
            assert.exists(doc.querySelector('html > body > #selection'));
            assert.exists(doc.querySelector('html > body > #selection > img[src="green.bmp"]'));
            assert.exists(doc.querySelector('html > body > #next'));
            assert.exists(doc.querySelector('html > body > #next + img[src="blue.bmp"]'));
          });
        });

        context('when `fullPage` is truthy', function () {
          it('should capture the whole page', async function () {
            var doc = await docFactory();

            var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {fullPage: true}, options});
            assert.hasAllKeys(data, ['index.html', 'red.bmp', 'green.bmp', 'blue.bmp']);

            var doc = await utils.readFileAsDocument(data.get('index.html'));
            assert.exists(doc.querySelector('html > body > #previous'));
            assert.exists(doc.querySelector('html > body > #previous + img[src="red.bmp"]'));
            assert.exists(doc.querySelector('html > body > #selection'));
            assert.exists(doc.querySelector('html > body > #selection > img[src="green.bmp"]'));
            assert.exists(doc.querySelector('html > body > #next'));
            assert.exists(doc.querySelector('html > body > #next + img[src="blue.bmp"]'));
          });
        });
      });

      context('downLink handling', function () {
        context('for files', function () {
          function docFactory() {
            return createDocFixture({name: 'a', attrs: {href: './green.bmp#foo'}});
          }

          const resMap = {
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          const options = {
            "capture.downLink.file.mode": "none",
            "capture.downLink.file.extFilter": "bmp",
            "capture.downLink.doc.depth": null,
            "capture.downLink.urlFilter": "",
            "capture.downLink.urlExtra": "",
            "capture.linkUnsavedUri": false,
          };

          let spyUrlFilter;
          let spyFileExtFilter;
          let spyFileMimeFilter;
          let spyDownload;

          beforeEach(function () {
            spyUrlFilter = sinon.spy(Capturer.prototype, 'downLinkUrlFilter');
            spyFileExtFilter = sinon.spy(Capturer.prototype, 'downLinkFileExtFilter');
            spyFileMimeFilter = sinon.spy(Capturer.prototype, 'downLinkFileMimeFilter');
            spyDownload = sinon.spy(Capturer.prototype, 'downloadFile');
          });

          for (const mode of ["none", "url", "header"]) {
            context(`when options["capture.downLink.file.mode"] = ${JSON.stringify(mode)}`, function () {
              switch (mode) {
                case "none":
                default: {
                  it('should never capture linked file', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var doc = docFactory();
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
                    assert.hasAllKeys(data, ['index.html']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/green.bmp#foo',
                    });

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyFileMimeFilter);
                    sinon.assert.notCalled(spyFileExtFilter);
                    sinon.assert.notCalled(spyDownload);
                  });

                  break;
                }
                case "url": {
                  it('should capture linked file if URL extension matches', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var doc = docFactory();
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'green.bmp#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/green.bmp#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.notCalled(spyFileMimeFilter);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'bmp', sinon.match(options));
                    assert.isTrue(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/green.bmp',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should ignore HTTP headers', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var resMap = {
                      [`${docUrl}dynamic.py`]: {
                        blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
                        headers: {contentType: 'image/bmp', filename: 'green.bmp'},
                      },
                    };
                    var doc = createDocFixture({name: 'a', attrs: {href: './dynamic.py#foo'}});
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
                    assert.hasAllKeys(data, ['index.html']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/dynamic.py#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/dynamic.py#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.notCalled(spyFileMimeFilter);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'py', sinon.match(options));
                    assert.isFalse(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.notCalled(spyDownload);
                  });

                  it('should rewrite unfetchable URLs', async function () {
                    sinon.stub(console, "error");
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);
                    sinon.stub(resMap, `${docUrl}green.bmp`).value(undefined);

                    var doc = docFactory();
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'urn:scrapbook:download:error:https://example.com/green.bmp#foo',
                    });

                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/green.bmp',
                      settings: {timeId},
                      options,
                    });
                  });

                  break;
                }
                case "header": {
                  it('should capture linked file if extension from URL matches', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var doc = docFactory();
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'green.bmp#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/green.bmp#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyFileMimeFilter, undefined, sinon.match(options));
                    assert.isFalse(spyFileMimeFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'bmp', sinon.match(options));
                    assert.isTrue(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/green.bmp',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should capture linked file if extension from header filename matches', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var resMap = {
                      [`${docUrl}dynamic.py`]: {
                        blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
                        headers: {filename: 'green.bmp'},
                      },
                    };
                    var doc = createDocFixture({name: 'a', attrs: {href: './dynamic.py#foo'}});
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'green.bmp#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/dynamic.py#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyFileMimeFilter, undefined, sinon.match(options));
                    assert.isFalse(spyFileMimeFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'bmp', sinon.match(options));
                    assert.isTrue(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/dynamic.py',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should capture linked file if extension from header content type matches', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);

                    var resMap = {
                      [`${docUrl}dynamic.py`]: {
                        blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
                        headers: {contentType: 'image/bmp'},
                      },
                    };
                    var doc = createDocFixture({name: 'a', attrs: {href: './dynamic.py#foo'}});
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'dynamic.py.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'dynamic.py.bmp#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/dynamic.py#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyFileMimeFilter, 'image/bmp', sinon.match(options));
                    assert.isFalse(spyFileMimeFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'bmp', sinon.match(options));
                    assert.isTrue(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/dynamic.py',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should prefer extension from header content type to header filename', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);
                    sinon.stub(options, "capture.downLink.file.extFilter").value("jpg");

                    var resMap = {
                      [`${docUrl}dynamic.py`]: {
                        blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/jpeg'}),
                        headers: {contentType: 'image/jpeg', filename: 'file.bin'},
                      },
                    };
                    var doc = createDocFixture({name: 'a', attrs: {href: './dynamic.py#foo'}});
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'file.bin.jpg']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'file.bin.jpg#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/dynamic.py#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyFileMimeFilter, 'image/jpeg', sinon.match(options));
                    assert.isFalse(spyFileMimeFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyFileExtFilter, 'jpg', sinon.match(options));
                    assert.isTrue(spyFileExtFilter.lastCall.returnValue);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/dynamic.py',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should capture linked file if header content type matches', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);
                    sinon.stub(options, "capture.downLink.file.extFilter").value('mime:image/bmp');

                    var resMap = {
                      [`${docUrl}dynamic.py`]: {
                        blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
                        headers: {contentType: 'image/bmp'},
                      },
                    };
                    var doc = createDocFixture({name: 'a', attrs: {href: './dynamic.py#foo'}});
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'dynamic.py.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'dynamic.py.bmp#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/dynamic.py#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyFileMimeFilter, 'image/bmp', sinon.match(options));
                    assert.isTrue(spyFileMimeFilter.lastCall.returnValue);
                    sinon.assert.notCalled(spyFileExtFilter);
                    sinon.assert.calledOnceWithMatch(spyDownload, {
                      url: 'https://example.com/dynamic.py',
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should ignore unfetchable URLs without rewriting', async function () {
                    sinon.stub(options, "capture.downLink.file.mode").value(mode);
                    sinon.stub(resMap, `${docUrl}green.bmp`).value(undefined);

                    var doc = docFactory();
                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/green.bmp#foo',
                    });

                    sinon.assert.notCalled(spyDownload);
                  });

                  break;
                }
              }

              if (["url", "header"].includes(mode)) {
                it('should not capture linked file if URL filter matches', async function () {
                  sinon.stub(options, "capture.downLink.file.mode").value(mode);
                  sinon.stub(options, "capture.downLink.urlFilter").value('/https://example/');

                  var doc = docFactory();
                  var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
                  assert.hasAllKeys(data, ['index.html']);

                  var doc = await utils.readFileAsDocument(data.get('index.html'));
                  assert.deepEqual(getAttributes(doc.querySelector('a')), {
                    href: 'https://example.com/green.bmp#foo',
                  });

                  sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/green.bmp#foo', sinon.match(options));
                  assert.isTrue(spyUrlFilter.lastCall.returnValue);
                  sinon.assert.notCalled(spyFileMimeFilter);
                  sinon.assert.notCalled(spyFileExtFilter);
                  sinon.assert.notCalled(spyDownload);
                });

                it('should include URLs provided by options["capture.downLink.urlExtra"] regardless of filters', async function () {
                  sinon.stub(options, "capture.downLink.file.mode").value(mode);
                  sinon.stub(options, "capture.downLink.urlExtra").value(`${docUrl}green.bmp`);
                  sinon.stub(options, "capture.downLink.file.extFilter").value('');
                  sinon.stub(options, "capture.downLink.urlFilter").value('/https://example/');

                  var doc = createDocFixture();
                  var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, settings: {timeId}, options});
                  assert.hasAllKeys(data, ['index.html', 'green.bmp']);

                  sinon.assert.notCalled(spyUrlFilter);
                  sinon.assert.notCalled(spyFileMimeFilter);
                  sinon.assert.notCalled(spyFileExtFilter);
                  sinon.assert.calledOnceWithMatch(spyDownload, {
                    url: 'https://example.com/green.bmp',
                    settings: {timeId},
                    options,
                  });
                });
              }
            });
          }
        });

        context('for documents', function () {
          const resMap = {
            [docUrl]: {
              blob: new Blob(['<a href="./page.html#foo"></a>'], {type: 'text/html'}),
            },
            [`${docUrl}page.html`]: {
              blob: new Blob(['<a href="./page2.html#bar"></a><img src="./green.bmp">'], {type: 'text/html'}),
            },
            [`${docUrl}page2.html`]: {
              blob: new Blob(['<img src="./yellow.bmp">'], {type: 'text/html'}),
            },
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
            [`${docUrl}yellow.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(YELLOW_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };
          const options = {
            "capture.downLink.doc.depth": 1,
            "capture.downLink.doc.urlFilter": "",
            "capture.downLink.file.mode": "none",
            "capture.downLink.file.extFilter": "",
            "capture.downLink.urlFilter": "",
            "capture.downLink.urlExtra": "",
            "capture.saveAs": "folder",
            "capture.frameRename": true,
            "capture.linkUnsavedUri": false,
          };

          let spyUrlFilter;
          let spyDocUrlFilter;
          let spyCapture;

          beforeEach(function () {
            spyUrlFilter = sinon.spy(Capturer.prototype, 'downLinkUrlFilter');
            spyDocUrlFilter = sinon.spy(Capturer.prototype, 'downLinkDocUrlFilter');
            spyCapture = sinon.spy(Capturer.prototype, 'captureDocumentOrFile');
          });

          for (const depth of [null, 0, 1, 2]) {
            context(`when options["capture.downLink.doc.depth"] = ${depth}`, function () {
              switch (depth) {
                case null: {
                  it('should never capture linked document', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
                    assert.hasAllKeys(data, ['index.html']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyDocUrlFilter);
                  });

                  break;
                }
                case 0: {
                  it('should generate site map', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });

                    assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                      "version": 3,
                      "indexPages": [
                        "index.html",
                      ],
                      "redirects": [],
                      "files": [
                        {
                          "path": "index.json",
                        },
                        {
                          "path": "index.dat",
                        },
                        {
                          "path": "index.rdf",
                        },
                        {
                          "path": "history.rdf",
                        },
                        {
                          "path": "^metadata^",
                        },
                        {
                          "path": "index.html",
                          "url": "https://example.com/",
                          "role": "document",
                          "token": getToken(docUrl, "document"),
                        },
                        {
                          "path": "index.xhtml",
                          "role": "document",
                        },
                        {
                          "path": "index.svg",
                          "role": "document",
                        },
                      ],
                    });

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyDocUrlFilter);
                  });

                  it('should capture documents provided by options["capture.downLink.urlExtra"] as depth 0 regardless of filters', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.downLink.urlExtra").value(`${docUrl}page.html`);
                    sinon.stub(options, "capture.downLink.urlFilter").value('https://example.com/page.html');

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json', 'page.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'page.html#foo',
                    });

                    var doc = await utils.readFileAsDocument(data.get('page.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'green.bmp',
                    });
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page2.html#bar',
                    });

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyDocUrlFilter);
                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                  });

                  break;
                }
                case 1: {
                  it('should capture linked document witdh depth <= 1 and rewrite links', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json', 'page.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'page.html#foo',
                    });

                    var doc = await utils.readFileAsDocument(data.get('page.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'green.bmp',
                    });
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page2.html#bar',
                    });

                    assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                      "version": 3,
                      "indexPages": [
                        "index.html",
                      ],
                      "redirects": [],
                      "files": [
                        {
                          "path": "index.json",
                        },
                        {
                          "path": "index.dat",
                        },
                        {
                          "path": "index.rdf",
                        },
                        {
                          "path": "history.rdf",
                        },
                        {
                          "path": "^metadata^",
                        },
                        {
                          "path": "index.html",
                          "url": "https://example.com/",
                          "role": "document",
                          "token": getToken(docUrl, "document"),
                        },
                        {
                          "path": "index.xhtml",
                          "role": "document",
                        },
                        {
                          "path": "index.svg",
                          "role": "document",
                        },
                        {
                          "path": "page.html",
                          "url": "https://example.com/page.html",
                          "role": "document",
                          "token": getToken("https://example.com/page.html", "document"),
                        },
                        {
                          "path": "green.bmp",
                          "url": "https://example.com/green.bmp",
                          "role": "resource",
                          "token": getToken("https://example.com/green.bmp", "resource"),
                        },
                      ],
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/page.html#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyDocUrlFilter, 'https://example.com/page.html#foo', sinon.match(options));
                    assert.isTrue(spyDocUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should ignore `downLink.file.*` for linked document', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.downLink.file.mode").value("url");
                    sinon.stub(options, "capture.downLink.file.extFilter").value('html');

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json', 'page.html', 'green.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'page.html#foo');
                  });

                  it('should not capture linked document if doc URL filter not match', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.downLink.doc.urlFilter").value('/^https://example\\.org/');

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/page.html#foo', sinon.match(options));
                    assert.isFalse(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.calledWithExactly(spyDocUrlFilter, 'https://example.com/page.html#foo', sinon.match(options));
                    assert.isFalse(spyDocUrlFilter.lastCall.returnValue);
                  });

                  it('should not capture linked document if URL filter matches', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.downLink.urlFilter").value('https://example.com/page.html');

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });

                    sinon.assert.calledWithExactly(spyUrlFilter, 'https://example.com/page.html#foo', sinon.match(options));
                    assert.isTrue(spyUrlFilter.lastCall.returnValue);
                    sinon.assert.notCalled(spyDocUrlFilter);
                  });

                  it('should not capture linked document if `download` is set', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(resMap, docUrl).value({
                      blob: new Blob(['<a href="./page.html#foo" download="mypage.html"></a>'], {type: 'text/html'}),
                    });

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                      download: 'mypage.html',
                    });
                  });

                  it('should not capture linked document if header is attachment', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(resMap, `${docUrl}page.html`).value({
                      blob: resMap[`${docUrl}page.html`].blob,
                      headers: {isAttachment: true},
                    });

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });
                  });

                  it('should ignore unfetchable links without rewriting', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(resMap, `${docUrl}page.html`).value(undefined);

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });
                  });

                  it('should capture documents provided by options["capture.downLink.urlExtra"] as depth 0 regardless of filters', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.downLink.urlExtra").value(`${docUrl}page.html`);
                    sinon.stub(options, "capture.downLink.urlFilter").value('https://example.com/page.html');

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json', 'page.html', 'page2.html', 'green.bmp', 'yellow.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'page.html#foo',
                    });

                    var doc = await utils.readFileAsDocument(data.get('page.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'green.bmp',
                    });
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'page2.html#bar',
                    });

                    var doc = await utils.readFileAsDocument(data.get('page2.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'yellow.bmp',
                    });

                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page2.html',
                      refUrl: 'https://example.com/page.html',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                  });

                  it('should ignore in-depth capture when options["capture.saveAs"] = "singleHtml"', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);
                    sinon.stub(options, "capture.saveAs").value("singleHtml");

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});

                    var doc = await utils.readFileAsDocument(data);
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'https://example.com/page.html#foo',
                    });

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyDocUrlFilter);
                  });

                  it('should ignore in-depth capture when capturing a file', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);

                    var resMap = {
                      [docUrl]: {
                        blob: new Blob(['foo'], {type: 'text/plain'}),
                        headers: {filename: 'file.txt'},
                      },
                    };
                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
                    assert.hasAllKeys(data, ['index.html', 'file.txt']);

                    assert.deepEqual(await utils.readFileAsText(data.get('file.txt')), 'foo');

                    sinon.assert.notCalled(spyUrlFilter);
                    sinon.assert.notCalled(spyDocUrlFilter);
                  });

                  break;
                }
                case 2: {
                  it('should capture linked document witdh depth <= 2 and rewrite links', async function () {
                    sinon.stub(options, "capture.downLink.doc.depth").value(depth);

                    var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, settings: {timeId}, options});
                    assert.hasAllKeys(data, ['index.html', 'index.json', 'page.html', 'page2.html', 'green.bmp', 'yellow.bmp']);

                    var doc = await utils.readFileAsDocument(data.get('index.html'));
                    assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'page.html#foo');

                    var doc = await utils.readFileAsDocument(data.get('page.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'green.bmp',
                    });
                    assert.deepEqual(getAttributes(doc.querySelector('a')), {
                      href: 'page2.html#bar',
                    });

                    var doc = await utils.readFileAsDocument(data.get('page2.html'));
                    assert.deepEqual(getAttributes(doc.querySelector('img')), {
                      src: 'yellow.bmp',
                    });

                    assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                      "version": 3,
                      "indexPages": [
                        "index.html",
                      ],
                      "redirects": [],
                      "files": [
                        {
                          "path": "index.json",
                        },
                        {
                          "path": "index.dat",
                        },
                        {
                          "path": "index.rdf",
                        },
                        {
                          "path": "history.rdf",
                        },
                        {
                          "path": "^metadata^",
                        },
                        {
                          "path": "index.html",
                          "url": "https://example.com/",
                          "role": "document",
                          "token": getToken(docUrl, "document"),
                        },
                        {
                          "path": "index.xhtml",
                          "role": "document",
                        },
                        {
                          "path": "index.svg",
                          "role": "document",
                        },
                        {
                          "path": "page.html",
                          "url": "https://example.com/page.html",
                          "role": "document",
                          "token": getToken("https://example.com/page.html", "document"),
                        },
                        {
                          "path": "green.bmp",
                          "url": "https://example.com/green.bmp",
                          "role": "resource",
                          "token": getToken("https://example.com/green.bmp", "resource"),
                        },
                        {
                          "path": "page2.html",
                          "url": "https://example.com/page2.html",
                          "role": "document",
                          "token": getToken("https://example.com/page2.html", "document"),
                        },
                        {
                          "path": "yellow.bmp",
                          "url": "https://example.com/yellow.bmp",
                          "role": "resource",
                          "token": getToken("https://example.com/yellow.bmp", "resource"),
                        },
                      ],
                    });

                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                    sinon.assert.calledWithMatch(spyCapture, {
                      docUrl: 'https://example.com/page2.html',
                      refUrl: 'https://example.com/page.html',
                      refPolicy: undefined,
                      charset: undefined,
                      settings: {timeId},
                      options,
                    });
                  });

                  break;
                }
              }
            });
          }

          context('frame depth handling', function () {
            it('should capture links in frames with the same depth as parent', async function () {
              var resMap = {
                [docUrl]: {
                  blob: new Blob(['<iframe src="./frame.html"></iframe>'], {type: 'text/html'}),
                },
                [`${docUrl}frame.html`]: {
                  blob: new Blob(['<a href="./linked.html">'], {type: 'text/html'}),
                },
                [`${docUrl}linked.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
              };

              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'index_1.html', 'linked.html']);

              var doc = await utils.readFileAsDocument(data.get('index.html'));
              assert.deepEqual(getAttributes(doc.querySelector('iframe')), {
                src: 'index_1.html',
              });

              var doc = await utils.readFileAsDocument(data.get('index_1.html'));
              assert.deepEqual(getAttributes(doc.querySelector('a')), {
                href: 'linked.html',
              });
            });
          });

          context('frame renaming handling', function () {
            it('should group frames in linked documents with same name when options["capture.frameRename"] is truthy', async function () {
              var resMap = {
                [docUrl]: {
                  blob: new Blob(['<a href="./page1.html"></a><a href="./page2.html"></a>'], {type: 'text/html'}),
                },
                [`${docUrl}page1.html`]: {
                  blob: new Blob(['<iframe src="./frame1.html"></iframe>'], {type: 'text/html'}),
                },
                [`${docUrl}page2.html`]: {
                  blob: new Blob(['<iframe src="./frame2.xhtml"></iframe>'], {type: 'text/html'}),
                },
                [`${docUrl}frame1.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
                [`${docUrl}frame2.xhtml`]: {
                  blob: new Blob(['<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><body>foo</body></html>'], {type: 'application/xhtml+xml'}),
                },
              };

              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'page1.html', 'page1_1.html', 'page2.html', 'page2_1.xhtml']);

              assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "indexPages": [
                  "index.html",
                ],
                "redirects": [],
                "files": [
                  {
                    "path": "index.json",
                  },
                  {
                    "path": "index.dat",
                  },
                  {
                    "path": "index.rdf",
                  },
                  {
                    "path": "history.rdf",
                  },
                  {
                    "path": "^metadata^",
                  },
                  {
                    "path": "index.html",
                    "url": "https://example.com/",
                    "role": "document",
                    "token": getToken("https://example.com/", "document"),
                  },
                  {
                    "path": "index.xhtml",
                    "role": "document",
                  },
                  {
                    "path": "index.svg",
                    "role": "document",
                  },
                  {
                    "path": "page1.html",
                    "url": "https://example.com/page1.html",
                    "role": "document",
                    "token": getToken("https://example.com/page1.html", "document"),
                  },
                  {
                    "path": "page1_1.html",
                    "url": "https://example.com/frame1.html",
                    "role": "document",
                    "token": getToken("https://example.com/frame1.html", "document"),
                  },
                  {
                    "path": "page1_1.xhtml",
                    "role": "document",
                  },
                  {
                    "path": "page1_1.svg",
                    "role": "document",
                  },
                  {
                    "path": "page2.html",
                    "url": "https://example.com/page2.html",
                    "role": "document",
                    "token": getToken("https://example.com/page2.html", "document"),
                  },
                  {
                    "path": "page2_1.html",
                    "role": "document",
                  },
                  {
                    "path": "page2_1.xhtml",
                    "url": "https://example.com/frame2.xhtml",
                    "role": "document",
                    "token": getToken("https://example.com/frame2.xhtml", "document"),
                  },
                  {
                    "path": "page2_1.svg",
                    "role": "document",
                  },
                ],
              });
            });

            it('should not group frames in linked documents when options["capture.frameRename"] is falsy', async function () {
              sinon.stub(options, "capture.frameRename").value(false);
              var resMap = {
                [docUrl]: {
                  blob: new Blob(['<a href="./page1.html"></a><a href="./page2.html"></a>'], {type: 'text/html'}),
                },
                [`${docUrl}page1.html`]: {
                  blob: new Blob(['<iframe src="./frame1.html"></iframe>'], {type: 'text/html'}),
                },
                [`${docUrl}page2.html`]: {
                  blob: new Blob(['<iframe src="./frame2.xhtml"></iframe>'], {type: 'text/html'}),
                },
                [`${docUrl}frame1.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
                [`${docUrl}frame2.xhtml`]: {
                  blob: new Blob(['<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><body>foo</body></html>'], {type: 'application/xhtml+xml'}),
                },
              };

              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'page1.html', 'frame1.html', 'page2.html', 'frame2.xhtml']);

              assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "indexPages": [
                  "index.html",
                ],
                "redirects": [],
                "files": [
                  {
                    "path": "index.json",
                  },
                  {
                    "path": "index.dat",
                  },
                  {
                    "path": "index.rdf",
                  },
                  {
                    "path": "history.rdf",
                  },
                  {
                    "path": "^metadata^",
                  },
                  {
                    "path": "index.html",
                    "url": "https://example.com/",
                    "role": "document",
                    "token": getToken("https://example.com/", "document"),
                  },
                  {
                    "path": "index.xhtml",
                    "role": "document",
                  },
                  {
                    "path": "index.svg",
                    "role": "document",
                  },
                  {
                    "path": "page1.html",
                    "url": "https://example.com/page1.html",
                    "role": "document",
                    "token": getToken("https://example.com/page1.html", "document"),
                  },
                  {
                    "path": "frame1.html",
                    "url": "https://example.com/frame1.html",
                    "role": "document",
                    "token": getToken("https://example.com/frame1.html", "document"),
                  },
                  {
                    "path": "page2.html",
                    "url": "https://example.com/page2.html",
                    "role": "document",
                    "token": getToken("https://example.com/page2.html", "document"),
                  },
                  {
                    "path": "frame2.xhtml",
                    "url": "https://example.com/frame2.xhtml",
                    "role": "document",
                    "token": getToken("https://example.com/frame2.xhtml", "document"),
                  },
                ],
              });
            });
          });

          context('meta refresh handling', function () {
            it('should treat meta refresh as having extra depth', async function () {
              var resMap = {
                [docUrl]: {
                  blob: new Blob(['<a href="./linked.html"></a>'], {type: 'text/html'}),
                },
                [`${docUrl}linked.html`]: {
                  blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
                },
                [`${docUrl}refreshed.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
              };

              // depth = 1
              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'linked.html']);

              var doc = await utils.readFileAsDocument(data.get('linked.html'));
              assert.deepEqual(getAttributes(doc.querySelector('meta[http-equiv="refresh"]')), {
                'http-equiv': 'refresh',
                'content': '0; url=https://example.com/refreshed.html#newfrag',
              });

              // depth = 2
              sinon.stub(options, "capture.downLink.doc.depth").value(2);
              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'linked.html', 'refreshed.html']);

              var doc = await utils.readFileAsDocument(data.get('linked.html'));
              assert.deepEqual(getAttributes(doc.querySelector('meta[http-equiv="refresh"]')), {
                'http-equiv': 'refresh',
                'content': '0; url=refreshed.html#newfrag',
              });
            });
          });

          context('site map handling', function () {
            it('should preserve case for `path`s', async function () {
              var resMap = {
                [`${docUrl}Green.bmp`]: {
                  blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
                },
                [`${docUrl}Linked.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
              };
              var doc = createDocFixture({name: 'body', children: [
                {name: 'a', attrs: {href: './Linked.html'}},
                {name: 'img', attrs: {src: './Green.bmp'}},
              ]});

              var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'Green.bmp', 'Linked.html']);

              assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "indexPages": [
                  "index.html",
                ],
                "redirects": [],
                "files": [
                  {
                    "path": "index.json",
                  },
                  {
                    "path": "index.dat",
                  },
                  {
                    "path": "index.rdf",
                  },
                  {
                    "path": "history.rdf",
                  },
                  {
                    "path": "^metadata^",
                  },
                  {
                    "path": "index.html",
                    "url": "https://example.com/",
                    "role": "document",
                    "token": getToken("https://example.com/", "document"),
                  },
                  {
                    "path": "index.xhtml",
                    "role": "document",
                  },
                  {
                    "path": "index.svg",
                    "role": "document",
                  },
                  {
                    "path": "Green.bmp",
                    "url": "https://example.com/Green.bmp",
                    "role": "resource",
                    "token": getToken("https://example.com/Green.bmp", "resource"),
                  },
                  {
                    "path": "Linked.html",
                    "url": "https://example.com/Linked.html",
                    "role": "document",
                    "token": getToken("https://example.com/Linked.html", "document"),
                  },
                ],
              });
            });

            it('should trace redirects and record in `redirects`', async function () {
              var resMap = {
                [docUrl]: {
                  blob: new Blob(['<a href="./page.py"></a>'], {type: 'text/html'}),
                },
                [`${docUrl}page.py`]: {
                  url: `${docUrl}redirected.html`,
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
                [`${docUrl}redirected.html`]: {
                  blob: new Blob(['foo'], {type: 'text/html'}),
                },
              };

              var {data} = await new TestCapturer(resMap).captureGeneral({url: docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'redirected.html']);

              var doc = await utils.readFileAsDocument(data.get('index.html'));
              assert.deepEqual(getAttributes(doc.querySelector('a')), {
                href: 'redirected.html',
              });

              assert.deepEqual(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "indexPages": [
                  "index.html",
                ],
                "redirects": [
                  [
                    "https://example.com/page.py",
                    "https://example.com/redirected.html",
                  ],
                ],
                "files": [
                  {
                    "path": "index.json",
                  },
                  {
                    "path": "index.dat",
                  },
                  {
                    "path": "index.rdf",
                  },
                  {
                    "path": "history.rdf",
                  },
                  {
                    "path": "^metadata^",
                  },
                  {
                    "path": "index.html",
                    "url": "https://example.com/",
                    "role": "document",
                    "token": getToken("https://example.com/", "document"),
                  },
                  {
                    "path": "index.xhtml",
                    "role": "document",
                  },
                  {
                    "path": "index.svg",
                    "role": "document",
                  },
                  {
                    "path": "redirected.html",
                    "url": "https://example.com/redirected.html",
                    "role": "document",
                    "token": getToken("https://example.com/redirected.html", "document"),
                  },
                ],
              });
            });
          });

          context('URL handling', function () {
            it('should not record URL for data URLs', async function () {
              var options = {
                "capture.downLink.doc.depth": 0,
                "capture.saveDataUriAsFile": true,
              };
              var resMap = () => true;
              var src = `data:image/bmp;filename=test.bmp;base64,${GREEN_BMP_B64}`;
              var doc = createDocFixture({name: 'img', attrs: {src}});

              var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json', 'test.bmp']);

              var doc = await utils.readFileAsDocument(data.get('index.html'));
              assert.deepEqual(getAttributes(doc.querySelector('img')), {
                src: 'test.bmp',
              });

              sinon.assert.match(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "files": sinon.match.some(
                  sinon.match({
                    "path": "test.bmp",
                    "url": undefined,
                    "role": "resource",
                    "token": getToken(src, "resource"),
                  }),
                ),
              });
            });

            it('should not record URL for blob: URLs', async function () {
              var options = {
                "capture.downLink.doc.depth": 0,
                "capture.saveDataUriAsFile": true,
              };
              var resMap = () => true;
              var src = URL.createObjectURL(new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}));
              var doc = createDocFixture({name: 'img', attrs: {src}});

              var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
              assert.lengthOf(data, 3);

              var doc = await utils.readFileAsDocument(data.get('index.html'));
              var imageFile = doc.querySelector('img').getAttribute('src');

              sinon.assert.match(JSON.parse(await utils.readFileAsText(data.get('index.json'))), {
                "version": 3,
                "files": sinon.match.some(
                  sinon.match({
                    "path": imageFile,
                    "url": undefined,
                    "role": "resource",
                    "token": getToken(src, "resource"),
                  }),
                ),
              });
            });

            it('should safely ignore invalid URLs when rebuilding links', async function () {
              var resMap = () => true;
              var doc = createDocFixture({name: 'body', children: [
                {name: 'a', attrs: {href: 'https://exa%23mple.org/'}},
                {name: 'a', attrs: {href: 'https://#fragment'}},
                {name: 'a', attrs: {href: 'https://:443'}},
                {name: 'a', attrs: {href: 'https://example.org:70000'}},
                {name: 'a', attrs: {href: 'https://example.org:7z'}},
              ]});

              var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
              assert.hasAllKeys(data, ['index.html', 'index.json']);

              var doc = await utils.readFileAsDocument(data.get('index.html'));
              var elems = doc.querySelectorAll('a');
              assert.deepEqual(getAttributes(elems[0]), {href: 'https://exa%23mple.org/'});
              assert.deepEqual(getAttributes(elems[1]), {href: 'https://#fragment'});
              assert.deepEqual(getAttributes(elems[2]), {href: 'https://:443'});
              assert.deepEqual(getAttributes(elems[3]), {href: 'https://example.org:70000'});
              assert.deepEqual(getAttributes(elems[4]), {href: 'https://example.org:7z'});
            });
          });
        });
      });
    });

    describe('#fetch', function () {
      const options = {
        "capture.resourceSizeLimit": null,
        "capture.referrerPolicy": "strict-origin",
        "capture.referrerSpoofSource": false,
      };

      it('should return with response if the request succeeds', async function () {
        var blob = new Blob(['foo'], {type: 'text/html'});
        stubXhr(sinon, {
          status: 200,
          statusText: 'OK',
          response: blob,
        });

        var result = await new Capturer().fetch({
          url: `${docUrl}page.html`,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page.html',
          status: 200,
          headers: {},
          blob,
          error: undefined,
        });
      });

      it('should return with response header information', async function () {
        var blob = new Blob(['foo'], {type: 'text/html'});
        stubXhr(sinon, {
          status: 200,
          statusText: 'OK',
          response: blob,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Content-Disposition': "inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.html; filename=_.html",
            'Content-Length': blob.size,
          },
        });

        var result = await new Capturer().fetch({
          url: `${docUrl}page.html`,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page.html',
          status: 200,
          headers: {
            contentType: 'text/html',
            charset: 'UTF-8',
            isAttachment: false,
            filename: '中文𠀀.html',
            contentLength: 3,
          },
          blob,
          error: undefined,
        });
      });

      it('should return with `{error}` if response not OK', async function () {
        var blob = new Blob(['foo'], {type: 'text/html'});
        stubXhr(sinon, {
          status: 404,
          statusText: 'Not Found',
          response: blob,
        });

        var result = await new Capturer().fetch({
          url: `${docUrl}page.html`,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page.html',
          status: 404,
          headers: {},
          blob,
          error: {name: 'HttpError', message: '404 Not Found'},
        });
      });

      it('should return with corresponding Blob for a data URL', async function () {
        var url = 'data:text/plain,foo';
        var result = await new Capturer().fetch({
          url,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url,
          status: 200,
          headers: {
            contentType: 'text/plain',
            filename: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33.txt',
            charset: undefined,
            contentLength: 3,
          },
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(result.blob.type, 'text/plain');
        assert.strictEqual(await utils.readFileAsText(result.blob), 'foo');
      });

      it('should return with further header information if exists for a data URL', async function () {
        var url = 'data:text/plain;charset=utf-8;filename=myfile.txt,foo';
        var result = await new Capturer().fetch({
          url,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url,
          status: 200,
          headers: {
            contentType: 'text/plain',
            filename: 'myfile.txt',
            charset: 'utf-8',
            contentLength: 3,
          },
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(result.blob.type, 'text/plain;charset=utf-8;filename=myfile.txt');
        assert.strictEqual(await utils.readFileAsText(result.blob), 'foo');
      });

      it('should return a dummy response for `about:blank`', async function () {
        var result = await new Capturer().fetch({
          url: 'about:blank',
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'about:blank',
          status: 200,
          headers: {},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(result.blob.size, 0);
      });

      it('should return a dummy response for `about:srcdoc`', async function () {
        var result = await new Capturer().fetch({
          url: 'about:srcdoc',
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'about:srcdoc',
          status: 200,
          headers: {},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(result.blob.size, 0);
      });

      it('should return with the data from `overrideBlob` if provided', async function () {
        var blob = new Blob(['foo'], {type: 'text/html'});
        var result = await new Capturer().fetch({
          url: `${docUrl}page.html`,
          overrideBlob: blob,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page.html',
          status: 200,
          headers: {},
          blob,
          error: undefined,
        });
      });

      it('should return with `{error}` if the URL is empty', async function () {
        var url = '';
        var result = await new Capturer().fetch({
          url,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url,
          status: 0,
          headers: {},
          error: {name: 'URIError', message: 'URL is empty.'},
        });
      });

      for (const url of ['//example.com/', '/example.com/', './myfile.txt', '?id=123']) {
        it('should return with `{error}` if the URL is not absolute' + ` ["${url}"]`, async function () {
          var result = await new Capturer().fetch({
            url,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url,
            status: 0,
            headers: {},
            error: {name: 'URIError', message: 'URL is not absolute.'},
          });
        });
      }

      for (const url of ['ws://example.com/', 'wss://example.com/', 'ftp://example.com/', 'mailto:someone@example.com']) {
        it('should return with `{error}` if the URL has an unsupported scheme' + ` ["${url}"]`, async function () {
          var result = await new Capturer().fetch({
            url,
            settings: {timeId},
            options,
          });
          sinon.assert.match(result, {
            url,
            status: 0,
            headers: {},
            error: {name: 'URIError', message: 'URL scheme not supported.'},
          });
        });
      }

      it('should return with `{error}` if the URL is invalid', async function () {
        var url = 'https://exa[mple.org/';
        var result = await new Capturer().fetch({
          url,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url,
          status: 0,
          headers: {},
          error: {name: 'URIError', message: sinon.match.typeOf('string')},
        });
      });

      it('should return same result for inputs with same URL after a fetch with falsy `headerOnly`', async function () {
        var counter = 0;
        stubXhr(sinon, ({url}) => {
          counter++;
          return {
            url,
            headers: {'Content-Disposition': `inline; filename=page-${counter}.html`},
            response: new Blob([`visit ${counter}`], {type: 'text/html'}),
          };
        });

        var capturer = new Capturer();

        var result = await capturer.fetch({
          url: docUrl,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');

        var result = await capturer.fetch({
          url: docUrl,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');

        var result = await capturer.fetch({
          url: docUrl,
          headerOnly: true,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');
      });

      it('should return same result for inputs with same URL and truthy `headerOnly` after a fetch with truthy `headerOnly`', async function () {
        var counter = 0;
        stubXhr(sinon, ({url}) => {
          counter++;
          return {
            url,
            headers: {'Content-Disposition': `inline; filename=page-${counter}.html`},
            response: new Blob([`visit ${counter}`], {type: 'text/html'}),
          };
        });

        var capturer = new Capturer();

        var result = await capturer.fetch({
          url: docUrl,
          headerOnly: true,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: null,
          error: undefined,
        });

        var result = await capturer.fetch({
          url: docUrl,
          headerOnly: true,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: null,
          error: undefined,
        });

        var result = await capturer.fetch({
          url: docUrl,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: docUrl,
          status: 200,
          headers: {isAttachment: false, filename: 'page-2.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 2');
      });

      it('should return same result for URLs with same normalized value', async function () {
        var counter = 0;
        stubXhr(sinon, ({url}) => {
          counter++;
          return {
            url,
            headers: {'Content-Disposition': `inline; filename=page-${counter}.html`},
            response: new Blob([`visit ${counter}`], {type: 'text/html'}),
          };
        });

        var capturer = new Capturer();

        var result = await capturer.fetch({
          url: 'https://example.com/page!123.html',
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page!123.html',
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');

        var result = await capturer.fetch({
          url: 'https://example.com/p%61ge%21123.html',
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: 'https://example.com/page!123.html',
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');
      });

      it('should return same result for inputs with either the original or the redirected URL', async function () {
        var counter = 0;
        stubXhr(sinon, ({url}) => {
          counter++;
          return {
            url: url === docUrl ? `${url}?q=1` : url,
            headers: {'Content-Disposition': `inline; filename=page-${counter}.html`},
            response: new Blob([`visit ${counter}`], {type: 'text/html'}),
          };
        });

        var capturer = new Capturer();

        var result = await capturer.fetch({
          url: docUrl,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: `${docUrl}?q=1`,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');

        var result = await capturer.fetch({
          url: docUrl,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: `${docUrl}?q=1`,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');

        var result = await capturer.fetch({
          url: `${docUrl}?q=1`,
          headerOnly: true,
          settings: {timeId},
          options,
        });
        sinon.assert.match(result, {
          url: `${docUrl}?q=1`,
          status: 200,
          headers: {isAttachment: false, filename: 'page-1.html'},
          blob: sinon.match.instanceOf(Blob),
          error: undefined,
        });
        assert.strictEqual(await utils.readFileAsText(result.blob), 'visit 1');
      });

      context('referrer handling', function () {
        context('when options["capture.referrerPolicy"] is not prefixed with "+"', function () {
          it('should send referrer using options["capture.referrerPolicy"] if `refPolicy` not provided', async function () {
            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'http://example.org/']]));
          });

          it('should prefer `refPolicy` over options["capture.referrerPolicy"]', async function () {
            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              refPolicy: 'unsafe-url',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'http://example.org/index.html']]));
          });

          it('should send `url` as referrer when options["capture.referrerSpoofSource"] is truthy', async function () {
            sinon.stub(options, "capture.referrerSpoofSource").value(true);

            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              refPolicy: 'unsafe-url',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'https://example.com/page.html']]));
          });
        });

        context('when options["capture.referrerPolicy"] is prefixed with "+"', function () {
          it('should send referrer using options["capture.referrerPolicy"] if `refPolicy` not provided', async function () {
            sinon.stub(options, "capture.referrerPolicy").value("+unsafe-url");

            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'http://example.org/index.html']]));
          });

          it('should prefer options["capture.referrerPolicy"] over `refPolicy`', async function () {
            sinon.stub(options, "capture.referrerPolicy").value("+unsafe-url");

            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              refPolicy: 'strict-origin',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'http://example.org/index.html']]));
          });

          it('should send `url` as referrer when options["capture.referrerSpoofSource"] is truthy', async function () {
            sinon.stub(options, "capture.referrerPolicy").value("+strict-origin");
            sinon.stub(options, "capture.referrerSpoofSource").value(true);

            let headers;
            stubXhr(sinon, function (requestData) {
              headers = requestData.headers;
              return {
                status: 200,
                statusText: 'OK',
                response: new Blob(['foo'], {type: 'text/html'}),
              };
            });

            await new Capturer().fetch({
              url: `${docUrl}page.html`,
              refUrl: 'http://example.org/index.html',
              refPolicy: 'unsafe-url',
              settings: {timeId},
              options,
            });
            assert.deepEqual(headers, new Map([['x-webscrapbook-referer', 'https://example.com/']]));
          });
        });
      });
    });

    describe('#getUniqueFilename', function () {
      const options = {
        "capture.saveFilenameMaxLenUtf16": 120,
        "capture.saveFilenameMaxLenUtf8": 240,
      };

      it('should uniquify by appending "-<num>" for identical inputs', async function () {
        var capturer = new Capturer();
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.txt', options), 'file.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.txt', options), 'file-1.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.txt', options), 'file-2.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.txt', options), 'file-3.txt');
      });

      it('should uniquify case insensitively but output using the original case', async function () {
        var capturer = new Capturer();
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.txt', options), 'file.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'File.txt', options), 'File-1.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'FILE.txt', options), 'FILE-2.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'file.TXT', options), 'file-3.TXT');
      });

      it('should crop the base filename on demend', async function () {
        var options = {
          "capture.saveFilenameMaxLenUtf16": 4,
        };
        var capturer = new Capturer();
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'longfilename.txt', options), 'long.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'longfile.txt', options), 'long-1.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'longf.txt', options), 'long-2.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'long.txt', options), 'long-3.txt');

        var options = {
          "capture.saveFilenameMaxLenUtf8": 8,
        };
        var capturer = new Capturer();
        assert.strictEqual(capturer.getUniqueFilename(timeId, '中文檔名.txt', options), '中文.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, '中文檔.txt', options), '中文-1.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, '中文.txt', options), '中文-2.txt');
        assert.strictEqual(capturer.getUniqueFilename(timeId, '中文.txt', options), '中文-3.txt');
      });

      it('should rename special filenames', async function () {
        var capturer = new Capturer();
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.json', options), 'index-1.json');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.rdf', options), 'index-1.rdf');
        assert.strictEqual(capturer.getUniqueFilename(timeId, 'history.rdf', options), 'history-1.rdf');
        assert.strictEqual(capturer.getUniqueFilename(timeId, '^metadata^', options), '^metadata^-1');
      });
    });

    describe('#registerDocument', function () {
      const options = {
        "capture.frameRename": true,
        "capture.saveAsciiFilename": false,
        "capture.saveFilenameMaxLenUtf16": 120,
        "capture.saveFilenameMaxLenUtf8": 240,
      };

      context('when `role` is provided or is main document', function () {
        it('should return with `{isDuplicate: true}` for documents with identical `docUrl` and `role`', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: false, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result2 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: false, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result3 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html#foo`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: false, isMainFrame: false, documentName: 'index'},
            options,
          });
          assert.deepEqual(result, {
            filename: 'index.html',
            url: 'index.html',
          });
          assert.deepEqual(result2, {
            filename: 'index.html',
            url: 'index.html',
            isDuplicate: true,
          });
          assert.deepEqual(result3, {
            filename: 'index.html',
            url: 'index.html',
            isDuplicate: true,
          });

          sinon.assert.notCalled(spyUniquify);
        });

        it('should uniquify by appending `_<num>` for documents with identical `documentName`', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: true, isMainFrame: true, documentName: 'index'},
            options,
          });
          var result2 = await capturer.registerDocument({
            docUrl: `${docUrl}page2.html`,
            mime: 'text/html',
            role: 'document-uuid111',  // iframe in a headed document
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result3 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid222',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result4 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid333',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result5 = await capturer.registerDocument({
            docUrl: `${docUrl}page3.xhtml`,
            mime: 'application/xhtml+xml',
            role: 'document-uuid444',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result6 = await capturer.registerDocument({
            docUrl: `${docUrl}page4.svg`,
            mime: 'image/svg+xml',
            role: 'document-uuid555',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          assert.deepEqual(result, {
            filename: 'index.html',
            url: 'index.html',
          });
          assert.deepEqual(result2, {
            filename: 'index_1.html',
            url: 'index_1.html',
          });
          assert.deepEqual(result3, {
            filename: 'index_2.html',
            url: 'index_2.html',
          });
          assert.deepEqual(result4, {
            filename: 'index_3.html',
            url: 'index_3.html',
          });
          assert.deepEqual(result5, {
            filename: 'index_4.xhtml',
            url: 'index_4.xhtml',
          });
          assert.deepEqual(result6, {
            filename: 'index_5.svg',
            url: 'index_5.svg',
          });

          sinon.assert.notCalled(spyUniquify);

          // verify that related filenames won't be used
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.html', options), 'index-1.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.html', options), 'index-2.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.xhtml', options), 'index-1.xhtml');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.svg', options), 'index-1.svg');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_1.html', options), 'index_1-1.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_1.html', options), 'index_1-2.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_1.xhtml', options), 'index_1-1.xhtml');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_1.svg', options), 'index_1-1.svg');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_4.html', options), 'index_4-1.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index_5.html', options), 'index_5-1.html');
        });

        it('should uniquify using the deducted filenames when options["capture.frameRename"] is falsy (except for the main document)', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url,
            status: 200,
            headers: {},
            blob: null,
          }));

          var options = {
            "capture.frameRename": false,
            "capture.saveAsciiFilename": false,
            "capture.saveFilenameMaxLenUtf16": 120,
            "capture.saveFilenameMaxLenUtf8": 240,
          };

          var capturer = new Capturer();
          var result = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: true, isMainFrame: true, documentName: 'index'},
            options,
          });
          var result2 = await capturer.registerDocument({
            docUrl: `${docUrl}page2.html`,
            mime: 'text/html',
            role: 'document-uuid111',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result3 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid222',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result4 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid333',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result5 = await capturer.registerDocument({
            docUrl: `${docUrl}page3.xhtml`,
            mime: 'application/xhtml+xml',
            role: 'document-uuid444',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          var result6 = await capturer.registerDocument({
            docUrl: `${docUrl}page4.svg`,
            mime: 'image/svg+xml',
            role: 'document-uuid555',
            settings: {timeId, isMainPage: true, isMainFrame: false, documentName: 'index'},
            options,
          });
          assert.deepEqual(result, {
            filename: 'index.html',
            url: 'index.html',
          });
          assert.deepEqual(result2, {
            filename: 'page2.html',
            url: 'page2.html',
          });
          assert.deepEqual(result3, {
            filename: 'page.html',
            url: 'page.html',
          });
          assert.deepEqual(result4, {
            filename: 'page-1.html',
            url: 'page-1.html',
          });
          assert.deepEqual(result5, {
            filename: 'page3.xhtml',
            url: 'page3.xhtml',
          });
          assert.deepEqual(result6, {
            filename: 'page4.svg',
            url: 'page4.svg',
          });

          sinon.assert.calledWithExactly(spyUniquify.getCall(0), timeId, 'page2.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(1), timeId, 'page.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(2), timeId, 'page.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(3), timeId, 'page3.xhtml', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(4), timeId, 'page4.svg', options);

          // verify that related filenames won't be used
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.html', options), 'index-1.html');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.xhtml', options), 'index-1.xhtml');
          assert.strictEqual(capturer.getUniqueFilename(timeId, 'index.svg', options), 'index-1.svg');
        });

        it('should uniquify using the deducted filenames when `documentName` is falsy', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            role: 'document',
            settings: {timeId, isMainPage: true, isMainFrame: true},
            options,
          });
          var result2 = await capturer.registerDocument({
            docUrl: `${docUrl}page2.html`,
            mime: 'text/html',
            role: 'document-uuid111',
            settings: {timeId, isMainPage: true, isMainFrame: false},
            options,
          });
          var result3 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid222',
            settings: {timeId, isMainPage: true, isMainFrame: false},
            options,
          });
          var result4 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,  // iframe[srcdoc] has envDocUrl same as the parent frame
            mime: 'text/html',
            role: 'document-uuid333',
            settings: {timeId, isMainPage: true, isMainFrame: false},
            options,
          });
          assert.deepEqual(result, {
            filename: 'page.html',
            url: 'page.html',
          });
          assert.deepEqual(result2, {
            filename: 'page2.html',
            url: 'page2.html',
          });
          assert.deepEqual(result3, {
            filename: 'page-1.html',
            url: 'page-1.html',
          });
          assert.deepEqual(result4, {
            filename: 'page-2.html',
            url: 'page-2.html',
          });

          sinon.assert.calledWithExactly(spyUniquify.getCall(0), timeId, 'page.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(1), timeId, 'page2.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(2), timeId, 'page.html', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(3), timeId, 'page.html', options);
        });

        context('document name handling', function () {
          it('should take the filename from URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}subdir/${encodeURIComponent('中文#123.html')}`,
              mime: 'text/html',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '中文#123.html',
              url: '中文%23123.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '中文#123.html', options);
          });

          it('should take the filename from header if exists', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {filename: '中文#123.html'},
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}file.html`,
              mime: 'text/html',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '中文#123.html',
              url: '中文%23123.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '中文#123.html', options);
          });

          it('should append the canonical extension if not matching `mime`', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {contentType: 'text/html'},  // should ignore header content type
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}file.htm`,
              mime: 'application/xhtml+xml',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'file.htm.xhtml',
              url: 'file.htm.xhtml',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'file.htm.xhtml', options);
          });

          it('should use `.html` as extension when `mime` is other than HTML/XHTML/SVG', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {contentType: 'text/html'},  // should ignore header content type
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}file.txt`,
              mime: 'application/octet-stream',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'file.txt.html',
              url: 'file.txt.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'file.txt.html', options);
          });

          it('should remove original extension if matching `mime` when `mime` is other than HTML/XHTML/SVG', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {contentType: 'text/html'},  // should ignore header content type
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}file.txt`,
              mime: 'text/plain',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'file.html',
              url: 'file.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'file.html', options);
          });

          it('should validate the filename and remove bad chars', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}1:2.html`,
              mime: 'text/html',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '1_2.html',
              url: '1_2.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '1_2.html', options);
          });

          it('should return pure ASCII filename when options["capture.saveAsciiFilename"] is truthy', async function () {
            sinon.stub(options, "capture.saveAsciiFilename").value(true);
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}${encodeURIComponent('中文.html')}`,
              mime: 'text/html',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '%E4%B8%AD%E6%96%87.html',
              url: '%25E4%25B8%25AD%25E6%2596%2587.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '%E4%B8%AD%E6%96%87.html', options);
          });

          it('should work for an unfetchable URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerDocument({
              docUrl: `${docUrl}page.html`,
              mime: 'text/html',
              role: 'document',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'page.html',
              url: 'page.html',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'page.html', options);
          });

          it('should throw for an invalid URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');

            var error;
            try {
              await new Capturer().registerDocument({
                docUrl: "https://exa[mple.org/",
                mime: 'text/html',
                role: 'document',
                settings: {timeId},
                options,
              });
            } catch (ex) {
              error = ex;
            }
            assert.instanceOf(error, Error);

            sinon.assert.notCalled(spyUniquify);
          });
        });
      });

      context('when `role` is not provided', function () {
        it('should return the deducted document name without registration and uniquification', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {contentType: 'text/html', filename: '頁面:page#123.html'},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            settings: {timeId},
            options,
          });
          var result2 = await capturer.registerDocument({
            docUrl: `${docUrl}page.html`,
            mime: 'text/html',
            settings: {timeId},
            options,
          });
          assert.deepEqual(result, {
            filename: '頁面_page#123.html',
            url: '頁面_page%23123.html',
          });
          assert.deepEqual(result2, {
            filename: '頁面_page#123.html',
            url: '頁面_page%23123.html',
          });

          sinon.assert.notCalled(spyUniquify);
        });
      });
    });

    describe('#registerFile', function () {
      const options = {
        "capture.saveAsciiFilename": false,
        "capture.saveFilenameMaxLenUtf16": 120,
        "capture.saveFilenameMaxLenUtf8": 240,
      };

      context('when `role` is provided', function () {
        it('should return with `{isDuplicate: true}` for inputs with identical `url` and `role`', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerFile({
            url: `${docUrl}subdir/file.txt`,
            role: 'resource',
            settings: {timeId},
            options,
          });
          var result2 = await capturer.registerFile({
            url: `${docUrl}subdir/file.txt`,
            role: 'resource',
            settings: {timeId},
            options,
          });
          var result3 = await capturer.registerFile({
            url: `${docUrl}subdir/file.txt#123`,
            role: 'resource',
            settings: {timeId},
            options,
          });
          assert.deepEqual(result2, {
            filename: 'file.txt',
            url: 'file.txt',
            isDuplicate: true,
          });
          assert.deepEqual(result3, {
            filename: 'file.txt',
            url: 'file.txt',
            isDuplicate: true,
          });

          // do not call uniquify for the duplicated resource
          sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'file.txt', options);
        });

        it('should uniquify inputs with identical deducted filename', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerFile({
            url: `${docUrl}/file.css`,
            role: 'css',
            settings: {timeId},
            options,
          });
          var result2 = await capturer.registerFile({
            url: `${docUrl}subdir/file.css`,
            role: 'css',
            settings: {timeId},
            options,
          });
          var result3 = await capturer.registerFile({
            url: `${docUrl}/file.css`,
            role: 'css-big5',  // link[charset]
            settings: {timeId},
            options,
          });
          var result4 = await capturer.registerFile({
            url: `${docUrl}/file.css`,
            role: 'css-uuid111',  // dynamic CSS
            settings: {timeId},
            options,
          });
          assert.deepEqual(result, {
            filename: 'file.css',
            url: 'file.css',
          });
          assert.deepEqual(result2, {
            filename: 'file-1.css',
            url: 'file-1.css',
          });
          assert.deepEqual(result3, {
            filename: 'file-2.css',
            url: 'file-2.css',
          });
          assert.deepEqual(result4, {
            filename: 'file-3.css',
            url: 'file-3.css',
          });

          sinon.assert.calledWithExactly(spyUniquify.getCall(0), timeId, 'file.css', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(1), timeId, 'file.css', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(2), timeId, 'file.css', options);
          sinon.assert.calledWithExactly(spyUniquify.getCall(3), timeId, 'file.css', options);
        });

        context('filename handling', function () {
          it('should take the filename from URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}subdir/${encodeURIComponent('中文#123.txt')}`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '中文#123.txt',
              url: '中文%23123.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '中文#123.txt', options);
          });

          it('should take the filename from header filename if exists', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {filename: '中文#123.txt'},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}file.txt`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '中文#123.txt',
              url: '中文%23123.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '中文#123.txt', options);
          });

          it('should fix the filename to match header content type if exists (from URL)', async function () {
            var url = `${docUrl}subdir/image.bmp`;

            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {contentType: 'image/png'},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}image.bmp`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'image.bmp.png',
              url: 'image.bmp.png',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'image.bmp.png', options);
          });

          it('should fix the filename to match header content type if exists (from header)', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {contentType: 'image/png', filename: '圖片.bmp'},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}image.bmp`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '圖片.bmp.png',
              url: '圖片.bmp.png',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '圖片.bmp.png', options);
          });

          it('should validate the filename and remove bad chars', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}subdir/${encodeURIComponent('1:2.txt')}`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '1_2.txt',
              url: '1_2.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '1_2.txt', options);
          });

          it('should return pure ASCII filename if options["capture.saveAsciiFilename"] is truthy', async function () {
            sinon.stub(options, "capture.saveAsciiFilename").value(true);
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}${encodeURIComponent('中文.txt')}`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '%E4%B8%AD%E6%96%87.txt',
              url: '%25E4%25B8%25AD%25E6%2596%2587.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, '%E4%B8%AD%E6%96%87.txt', options);
          });

          it('should escape special chars in the returned `url` property', async function () {
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}subdir/${encodeURIComponent('中文 foo%bar#baz.txt')}`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: '中文 foo%bar#baz.txt',
              url: '中文%20foo%25bar%23baz.txt',
            });
          });

          it('should take filename from the redirected URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: `${docUrl}redirected.txt`,
              status: 200,
              headers: {},
              blob: null,
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}file.txt`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'redirected.txt',
              url: 'redirected.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'redirected.txt', options);
          });

          it('should work for an unfetchable URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
            var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
              url: utils.splitUrlByAnchor(url)[0],
              status: 404,
              headers: {},
              blob: null,
              error: {
                name: 'HttpError',
                message: '404 Not Found',
              },
            }));

            var result = await new Capturer().registerFile({
              url: `${docUrl}file.txt`,
              role: 'resource',
              settings: {timeId},
              options,
            });
            assert.deepEqual(result, {
              filename: 'file.txt',
              url: 'file.txt',
            });

            sinon.assert.calledOnceWithExactly(spyUniquify, timeId, 'file.txt', options);
          });

          it('should throw for an invalid URL', async function () {
            var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');

            var error;
            try {
              await new Capturer().registerFile({
                url: "https://exa[mple.org/",
                role: 'resource',
                settings: {timeId},
                options,
              });
            } catch (ex) {
              error = ex;
            }
            assert.instanceOf(error, Error);

            // do not call uniquify for an invalid URL
            sinon.assert.notCalled(spyUniquify);
          });
        });

        context('header content type matching handling', function () {
          for (const [ext, contentType] of [
            ['.jpg', 'image/jpeg'],
            ['.jpeg', 'image/jpeg'],
            ['.jpe', 'image/jpeg'],
            ['.JPG', 'image/jpeg'],
          ]) {
            it(`should keep current extension if it belongs to the matched ones (case insensitively) ["${ext}" for ${contentType}]`, async function () {
              var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
                url: utils.splitUrlByAnchor(url)[0],
                status: 200,
                headers: {contentType, filename: `file${ext}`},
                blob: null,
              }));
              var result = await new Capturer().registerFile({
                url: docUrl,
                role: 'resource',
                settings: {timeId},
                options,
              });
              assert.strictEqual(result.filename, `file${ext}`);
            });
          }

          for (const [ext, contentType, expected] of [
            ['.bin', 'image/jpeg', '.jpg'],
            ['.bin', 'text/html', '.html'],
            ['.bin', 'text/xml', '.xml'],
            ['.bin', 'text/css', '.css'],
            ['.bin', 'text/javascript', '.js'],
            ['.bin', 'image/bmp', '.bmp'],
            ['.bin', 'image/jpeg', '.jpg'],
            ['.bin', 'image/gif', '.gif'],
            ['.bin', 'image/png', '.png'],
            ['.bin', 'image/svg+xml', '.svg'],
            ['.bin', 'audio/wav', '.wav'],
            ['.bin', 'audio/mp3', '.mp3'],
            ['.bin', 'audio/ogg', '.oga'],
            ['.bin', 'application/ogg', '.ogx'],
            ['.bin', 'audio/mpeg', '.mpga'],
            ['.bin', 'video/mp4', '.mp4'],
            ['.bin', 'video/webm', '.webm'],
            ['.bin', 'video/ogg', '.ogv'],
          ]) {
            it(`should append canonical extension if the extension does not belong to the matched ones ["${ext}" for ${contentType} => "${expected}"]`, async function () {
              var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
                url: utils.splitUrlByAnchor(url)[0],
                status: 200,
                headers: {contentType, filename: `file${ext}`},
                blob: null,
              }));
              var result = await new Capturer().registerFile({
                url: docUrl,
                role: 'resource',
                settings: {timeId},
                options,
              });
              assert.strictEqual(result.filename, `file${ext}${expected}`);
            });
          }

          for (const [ext, contentType, expected] of [
            ['', 'text/html', '.html'],
            ['', 'text/xml', '.xml'],
            ['', 'text/css', '.css'],
            ['', 'text/javascript', '.js'],
          ]) {
            it(`should treat no extension as not match ["${ext}" for ${contentType} => "${expected}"]`, async function () {
              var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
                url: utils.splitUrlByAnchor(url)[0],
                status: 200,
                headers: {contentType, filename: `file${ext}`},
                blob: null,
              }));
              var result = await new Capturer().registerFile({
                url: docUrl,
                role: 'resource',
                settings: {timeId},
                options,
              });
              assert.strictEqual(result.filename, `file${ext}${expected}`);
            });
          }

          for (const [ext, contentType] of [
            ['', 'application/octet-stream'],
            ['.jpg', 'application/octet-stream'],
            ['.gif', 'application/octet-stream'],
            ['.png', 'application/octet-stream'],
          ]) {
            it(`should keep current extension if the content type is not required to match ["${ext}" for ${contentType}]`, async function () {
              var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
                url: utils.splitUrlByAnchor(url)[0],
                status: 200,
                headers: {contentType, filename: `file${ext}`},
                blob: null,
              }));
              var result = await new Capturer().registerFile({
                url: docUrl,
                role: 'resource',
                settings: {timeId},
                options,
              });
              assert.strictEqual(result.filename, `file${ext}`);
            });
          }
        });
      });

      context('when `role` is not provided', function () {
        it('should return the deducted filename without registration and uniquification', async function () {
          var spyUniquify = sinon.spy(Capturer.prototype, 'getUniqueFilename');
          var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
            url: utils.splitUrlByAnchor(url)[0],
            status: 200,
            headers: {contentType: 'image/png', filename: '圖片:file#123.bmp'},
            blob: null,
          }));

          var capturer = new Capturer();
          var result = await capturer.registerFile({
            url: `${docUrl}subdir/file.txt`,
            settings: {timeId},
            options,
          });
          var result2 = await capturer.registerFile({
            url: `${docUrl}subdir/file.txt`,
            settings: {timeId},
            options,
          });
          assert.deepEqual(result, {
            filename: '圖片_file#123.bmp.png',
            url: '圖片_file%23123.bmp.png',
          });
          assert.deepEqual(result2, {
            filename: '圖片_file#123.bmp.png',
            url: '圖片_file%23123.bmp.png',
          });

          sinon.assert.notCalled(spyUniquify);
        });
      });
    });

    describe('#resolveRedirects', function () {
      const options = {
        "capture.referrerPolicy": "",
        "capture.referrerSpoofSource": false,
      };

      for (const [desc, factory] of [
        ['should call `fetch` and return the result', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: docUrl,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: undefined,
              refPolicy: undefined,
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: undefined,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should call `fetch` and return the response with optional arguments', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const overrideBlob = new Blob(['foo'], {type: 'text/html'});
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: overrideBlob,
          };
          return {
            input: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should call `fetch` with `{ignoreSizeLimit: false}` when `settings` has `{isMainPage: false}`', () => {
          const settings = {
            timeId,
            isMainPage: false,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: docUrl,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: undefined,
              refPolicy: undefined,
              overrideBlob: undefined,
              ignoreSizeLimit: false,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: undefined,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should call `fetch` with `{ignoreSizeLimit: false}` when `settings` has `{isMainFrame: false}`', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: false,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: docUrl,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: undefined,
              refPolicy: undefined,
              overrideBlob: undefined,
              ignoreSizeLimit: false,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: undefined,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should return with `{error}` if fetch fails', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 404,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
            error: {name: 'HttpError', message: '404 Not Found'},
          };
          return {
            input: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              error: {name: 'Error', message: '404 Not Found'},
            },
          };
        }],
        ['should return with `{doc: null}` if the fetch response is an attachment', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {isAttachment: true},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: docUrl,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: undefined,
              refPolicy: undefined,
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: undefined,
              fetchResponse,
              isAttachment: true,
              doc: null,
              error: undefined,
            },
          };
        }],
        ['should return with `{doc: null}` if `isAttachment` is truthy', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: docUrl,
              isAttachment: true,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: undefined,
              refPolicy: undefined,
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: docUrl,
              refUrl: undefined,
              fetchResponse,
              isAttachment: true,
              doc: null,
              error: undefined,
            },
          };
        }],
        ['should return the redirected URL with original hash if redirect(s) are present', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}/redirected.html`,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}/redirected.html#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should return the refreshed URL with updated hash and refUrl if a meta refresh is present', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}refreshed.html`,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: docUrl,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchFunc,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}refreshed.html#newfrag`,
              refUrl: docUrl,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should work for multiple meta refresh', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}refreshed2.html`,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: docUrl,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed1.html#frag1">'], {type: 'text/html'}),
              };
            }
            if (url === `${docUrl}refreshed1.html`) {
              return {
                url: `${docUrl}refreshed1.html`,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed2.html#frag2">'], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchFunc,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}refreshed2.html#frag2`,
              refUrl: `${docUrl}refreshed1.html`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should return with `{error}` for circular meta refresh', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}refreshed1.html`,
            status: 200,
            headers: {},
            blob: new Blob([`<meta http-equiv="refresh" content="0; url=${docUrl}#frag2">`], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: docUrl,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed1.html#frag1">'], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchFunc,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: {name: 'Error', message: 'Circular meta refresh.'},
            },
          };
        }],
        ['should ignore meta refresh if time > 0', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['<meta http-equiv="refresh" content="1; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
            },
          };
        }],
        ['should ignore meta refresh in <noscript>', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['<noscript><meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag"></noscript>'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should ignore meta refresh if fetch response is non-document', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/plain'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              checkMetaRefresh: false,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: null,
              error: undefined,
            },
          };
        }],
        ['should ignore meta refresh if `checkMetaRefresh` is falsy', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              checkMetaRefresh: false,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should ignore meta refresh if the fetch response is an attachment', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {isAttachment: true},
            blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: true,
              doc: null,
              error: undefined,
            },
          };
        }],
        ['should ignore meta refresh if `isAttachment` is truthy', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: docUrl,
            status: 200,
            headers: {},
            blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              isAttachment: true,
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: true,
              doc: null,
              error: undefined,
            },
          };
        }],
        ['should work for a redirect and then meta refresh', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}refreshed.html`,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: `${docUrl}redirected.html`,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchFunc,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}refreshed.html#newfrag`,
              refUrl: `${docUrl}redirected.html`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should work for a meta refresh and then redirect', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}redirected.html`,
            status: 200,
            headers: {},
            blob: new Blob(['foo'], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: docUrl,
                status: 200,
                headers: {},
                blob: new Blob(['<meta http-equiv="refresh" content="0; url=./refreshed.html#newfrag">'], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchFunc,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}redirected.html#newfrag`,
              refUrl: docUrl,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: undefined,
            },
          };
        }],
        ['should return with `{error}` for circular meta refresh with redirect', () => {
          const settings = {
            timeId,
            isMainPage: true,
            isMainFrame: true,
          };
          const fetchResponse = {
            url: `${docUrl}redir2.html`,
            status: 200,
            headers: {},
            blob: new Blob([`<meta http-equiv="refresh" content="0; url=${docUrl}redir1.html">`], {type: 'text/html'}),
          };
          const fetchFunc = ({url}) => {
            if (url === docUrl) {
              return {
                url: docUrl,
                status: 200,
                headers: {},
                blob: new Blob([`<meta http-equiv="refresh" content="0; url=${docUrl}redir1.html">`], {type: 'text/html'}),
              };
            }
            return fetchResponse;
          };
          return {
            input: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              settings,
              options,
            },
            fetchResponse,
            expectedFetchArgs: {
              url: docUrl,
              refUrl: `${docUrl}referrer/`,
              refPolicy: 'unsafe-url',
              overrideBlob: undefined,
              ignoreSizeLimit: true,
              settings,
              options,
            },
            expectedResult: {
              url: `${docUrl}#frag`,
              refUrl: `${docUrl}referrer/`,
              fetchResponse,
              isAttachment: undefined,
              doc: sinon.match.instanceOf(HTMLDocument),
              error: {name: 'Error', message: 'Circular meta refresh.'},
            },
          };
        }],
      ]) {
        it(desc, async function () {
          var {input, fetchResponse, fetchFunc, expectedFetchArgs, expectedResult} = factory();

          var stubFetch = sinon.stub(Capturer.prototype, 'fetch');
          if (fetchResponse) {
            stubFetch.returns(fetchResponse);
          } else if (fetchFunc) {
            stubFetch.callsFake(fetchFunc);
          }

          var result = await new Capturer().resolveRedirects(input);
          sinon.assert.match(result, expectedResult);

          sinon.assert.calledWithExactly(stubFetch.firstCall, expectedFetchArgs);
        });
      }
    });

    describe('#downloadFile', function () {
      const options = {
        "capture.saveAs": "folder",
        "capture.saveDataUriAsFile": false,
      };

      it('should call `fetch`, `registerFile`, and then `downloadBlob`', async function () {
        var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
          url,
          status: 200,
          headers: {},
          blob: new Blob(['foo'], {type: 'text/plain'}),
        }));
        var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
        var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

        var settings = {timeId};
        var result = await new Capturer().downloadFile({
          url: `${docUrl}file.txt#foo`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          filename: 'file.txt',
          url: 'file.txt',
        });

        sinon.assert.calledWithExactly(stubFetch, {
          url: 'https://example.com/file.txt',
          refUrl: undefined,
          refPolicy: undefined,
          overrideBlob: undefined,
          settings,
          options,
        });
        sinon.assert.calledOnceWithExactly(spyRegister, {
          url: 'https://example.com/file.txt',
          role: 'resource',
          settings,
          options,
        });
        sinon.assert.calledOnceWithExactly(spyDownloadBlob, {
          blob: sinon.match.instanceOf(Blob),
          filename: 'file.txt',
          sourceUrl: 'https://example.com/file.txt',
          settings,
          options,
        });
        assert.strictEqual(spyDownloadBlob.lastCall.args[0].blob.type, 'text/plain');
        assert.strictEqual(await utils.readFileAsText(spyDownloadBlob.lastCall.args[0].blob), 'foo');
      });

      it('should take header filename and charset from fetch response if exists', async function () {
        var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
          url,
          status: 200,
          headers: {
            contentType: 'text/plain',
            charset: 'UTF-8',
            isAttachment: false,
            filename: '中文.txt',
            contentLength: 4,
          },
          blob: new Blob(['中文'], {type: 'text/plain'}),
        }));
        var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

        var settings = {timeId};
        var result = await new Capturer().downloadFile({
          url: `${docUrl}file.txt`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          filename: '中文.txt',
          url: '中文.txt',
        });

        sinon.assert.calledOnceWithExactly(spyDownloadBlob, {
          blob: sinon.match.instanceOf(Blob),
          filename: '中文.txt',
          sourceUrl: `${docUrl}file.txt`,
          settings,
          options,
        });
        assert.strictEqual(spyDownloadBlob.lastCall.args[0].blob.type, 'text/plain;charset=utf-8');
        assert.strictEqual(await utils.readFileAsText(spyDownloadBlob.lastCall.args[0].blob), '中文');
      });

      it('should return as data URL when options["capture.saveAs"] = "singleHtml"', async function () {
        var stubFetch = sinon.stub(Capturer.prototype, 'fetch').callsFake(({url}) => ({
          url,
          status: 200,
          headers: {},
          blob: new Blob(['foo'], {type: 'text/plain'}),
        }));
        var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
        var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

        var settings = {timeId};
        var options = {
          "capture.saveAs": "singleHtml",
        };
        var result = await new Capturer().downloadFile({
          url: `${docUrl}file.txt#foo`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          filename: 'file.txt',
          url: 'data:text/plain;filename=file.txt,foo',
        });

        sinon.assert.calledWithExactly(stubFetch, {
          url: 'https://example.com/file.txt',
          refUrl: undefined,
          refPolicy: undefined,
          overrideBlob: undefined,
          settings,
          options,
        });
        sinon.assert.calledOnceWithExactly(spyRegister, {
          url: 'https://example.com/file.txt',
          role: undefined,
          settings,
          options,
        });
        sinon.assert.calledOnceWithExactly(spyDownloadBlob, {
          blob: sinon.match.instanceOf(Blob),
          filename: 'file.txt',
          sourceUrl: 'https://example.com/file.txt',
          settings,
          options,
        });
        assert.strictEqual(spyDownloadBlob.lastCall.args[0].blob.type, 'text/plain');
        assert.strictEqual(await utils.readFileAsText(spyDownloadBlob.lastCall.args[0].blob), 'foo');
      });

      context('data URL handling', function () {
        it('should return the original data URL when options["capture.saveDataUriAsFile"] is falsy', async function () {
          var spyFetch = sinon.spy(Capturer.prototype, 'fetch');
          var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
          var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

          var settings = {timeId};
          var result = await new Capturer().downloadFile({
            url: `data:text/plain;filename=file.txt;field=value,foo`,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: 'data:text/plain;filename=file.txt;field=value,foo',
          });

          sinon.assert.notCalled(spyFetch);
          sinon.assert.notCalled(spyRegister);
          sinon.assert.notCalled(spyDownloadBlob);
        });

        it('should download data URL as file when options["capture.saveDataUriAsFile"] is truthy', async function () {
          var spyFetch = sinon.spy(Capturer.prototype, 'fetch');
          var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
          var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

          var settings = {timeId};
          var options = {
            "capture.saveAs": "folder",
            "capture.saveDataUriAsFile": true,
          };
          var result = await new Capturer().downloadFile({
            url: 'data:text/plain,foo',
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33.txt',
            url: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33.txt',
          });

          sinon.assert.calledWithExactly(spyFetch, {
            url: 'data:text/plain,foo',
            refUrl: undefined,
            refPolicy: undefined,
            overrideBlob: undefined,
            settings,
            options,
          });
          sinon.assert.calledOnceWithExactly(spyRegister, {
            url: 'data:text/plain,foo',
            role: 'resource',
            settings,
            options,
          });
          sinon.assert.calledOnceWithExactly(spyDownloadBlob, {
            blob: sinon.match.instanceOf(Blob),
            filename: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33.txt',
            sourceUrl: 'data:text/plain,foo',
            settings,
            options,
          });
          assert.strictEqual(spyDownloadBlob.lastCall.args[0].blob.type, 'text/plain');
          assert.strictEqual(await utils.readFileAsText(spyDownloadBlob.lastCall.args[0].blob), 'foo');
        });

        it('should take filename and other parameters from data URL', async function () {
          var spyFetch = sinon.spy(Capturer.prototype, 'fetch');
          var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
          var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

          var settings = {timeId};
          var options = {
            "capture.saveAs": "folder",
            "capture.saveDataUriAsFile": true,
          };
          var result = await new Capturer().downloadFile({
            url: 'data:text/plain;filename=file.txt;field=value,foo',
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: 'file.txt',
            url: 'file.txt',
          });

          sinon.assert.calledWithExactly(spyFetch, {
            url: 'data:text/plain;filename=file.txt;field=value,foo',
            refUrl: undefined,
            refPolicy: undefined,
            overrideBlob: undefined,
            settings,
            options,
          });
          sinon.assert.calledOnceWithExactly(spyRegister, {
            url: 'data:text/plain;filename=file.txt;field=value,foo',
            role: 'resource',
            settings,
            options,
          });
          sinon.assert.calledOnceWithExactly(spyDownloadBlob, {
            blob: sinon.match.instanceOf(Blob),
            filename: 'file.txt',
            sourceUrl: 'data:text/plain;filename=file.txt;field=value,foo',
            settings,
            options,
          });
          assert.strictEqual(spyDownloadBlob.lastCall.args[0].blob.type, 'text/plain;filename=file.txt;field=value');
          assert.strictEqual(await utils.readFileAsText(spyDownloadBlob.lastCall.args[0].blob), 'foo');
        });

        it('should return the original data URL when options["capture.saveAs"] = "singleHtml" (regardless of options["capture.saveDataUriAsFile"])', async function () {
          var spyFetch = sinon.spy(Capturer.prototype, 'fetch');
          var spyRegister = sinon.spy(Capturer.prototype, 'registerFile');
          var spyDownloadBlob = sinon.spy(Capturer.prototype, 'downloadBlob');

          var settings = {timeId};
          var options = {
            "capture.saveAs": "singleHtml",
            "capture.saveDataUriAsFile": true,
          };
          var result = await new Capturer().downloadFile({
            url: `data:text/plain;filename=file.txt;field=value,foo`,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: 'data:text/plain;filename=file.txt;field=value,foo',
          });

          sinon.assert.notCalled(spyFetch);
          sinon.assert.notCalled(spyRegister);
          sinon.assert.notCalled(spyDownloadBlob);
        });
      });
    });

    describe('#downloadBlob', function () {
      for (const saveAs of ["folder", "zip", "maff", "singleHtml", "<other>"]) {
        context(`when options["capture.saveAs"] = "${saveAs}"`, function () {
          const options = {
            "capture.saveAs": saveAs,
            "capture.saveDataUriAsFile": false,
          };

          switch (saveAs) {
            case "folder":
            case "zip":
            case "maff":
            default: {
              it('should call `saveFileCache`', async function () {
                var stubSave = sinon.stub(Capturer.prototype, 'saveFileCache');

                var settings = {timeId};
                var blob = new Blob(['foo'], {type: 'text/plain'});
                var result = await new Capturer().downloadBlob({
                  blob,
                  filename: 'file.txt',
                  sourceUrl: `${docUrl}file.txt`,
                  settings,
                  options,
                });
                sinon.assert.match(result, {
                  filename: 'file.txt',
                  url: 'file.txt',
                });

                sinon.assert.calledOnceWithExactly(stubSave, {
                  timeId,
                  path: (saveAs === "maff") ? `${timeId}/file.txt` : 'file.txt',
                  url: 'https://example.com/file.txt',
                  blob,
                });
              });

              it('should call `saveFileCache` if `sourceUrl` is data URL when options["capture.saveDataUriAsFile"] is truthy', async function () {
                var stubSave = sinon.stub(Capturer.prototype, 'saveFileCache');

                var settings = {timeId};
                var options = {
                  "capture.saveAs": saveAs,
                  "capture.saveDataUriAsFile": true,
                };
                var blob = new Blob(['foo'], {type: 'text/plain'});
                var result = await new Capturer().downloadBlob({
                  blob,
                  filename: 'file.txt',
                  sourceUrl: 'data:text/plain;key=value,foo',
                  settings,
                  options,
                });
                sinon.assert.match(result, {
                  filename: 'file.txt',
                  url: 'file.txt',
                });

                sinon.assert.calledOnceWithExactly(stubSave, {
                  timeId,
                  path: (saveAs === "maff") ? `${timeId}/file.txt` : 'file.txt',
                  url: 'data:text/plain;key=value,foo',
                  blob,
                });
              });

              it('should return the Blob as data URL if `sourceUrl` is data URL when options["capture.saveDataUriAsFile"] is falsy', async function () {
                var stubSave = sinon.stub(Capturer.prototype, 'saveFileCache');

                var settings = {timeId};
                var blob = new Blob(['foo'], {type: 'text/plain'});
                var result = await new Capturer().downloadBlob({
                  blob,
                  filename: 'file.txt',
                  sourceUrl: 'data:text/plain;key=value,foo',
                  settings,
                  options,
                });
                sinon.assert.match(result, {
                  filename: 'file.txt',
                  url: 'data:text/plain;filename=file.txt,foo',
                });

                sinon.assert.notCalled(stubSave);
              });

              break;
            }
            case "singleHtml": {
              it('should return the Blob as data URL', async function () {
                var stubSave = sinon.stub(Capturer.prototype, 'saveFileCache');

                var settings = {timeId};
                var blob = new Blob(['foo'], {type: 'text/plain'});
                var result = await new Capturer().downloadBlob({
                  blob,
                  filename: 'file.txt',
                  sourceUrl: `${docUrl}file.txt`,
                  settings,
                  options,
                });
                sinon.assert.match(result, {
                  filename: 'file.txt',
                  url: 'data:text/plain;filename=file.txt,foo',
                });

                sinon.assert.notCalled(stubSave);
              });

              it('should return the Blob as data URL when `sourceUrl` is data URL', async function () {
                var stubSave = sinon.stub(Capturer.prototype, 'saveFileCache');

                var settings = {timeId};
                var blob = new Blob(['foo'], {type: 'text/plain'});
                var result = await new Capturer().downloadBlob({
                  blob,
                  filename: 'file.txt',
                  sourceUrl: 'data:text/plain,foo',
                  settings,
                  options,
                });
                sinon.assert.match(result, {
                  filename: 'file.txt',
                  url: 'data:text/plain;filename=file.txt,foo',
                });

                sinon.assert.notCalled(stubSave);
              });

              break;
            }
          }
        });
      }

      context('data URL handling', function () {
        const options = {
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsFile": false,
        };
        const settings = {timeId};

        it('should encode URL content as UTF-8 if `blob` has UTF-8 charset', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob(['ABC 中文 𠀀#にほんご'], {type: 'application/octet-stream;charset=utf-8'}),
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: 'data:application/octet-stream;charset=UTF-8,ABC%20中文%20𠀀%23にほんご',
          });
        });

        it('should include UTF-8 percent-encoded filename if exists', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob(['ABC 中文 𠀀#にほんご'], {type: 'application/octet-stream;charset=utf-8'}),
            filename: '中文file.txt',
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: '中文file.txt',
            url: 'data:application/octet-stream;charset=UTF-8;filename=%E4%B8%AD%E6%96%87file.txt,ABC%20中文%20𠀀%23にほんご',
          });
        });

        it('should encode URL content as percent-encoded byte string if `blob` has non-UTF-8 charset', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob([await encodeText('Big5 中文內容', 'big5')], {type: 'application/octet-stream;charset=big5'}),
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: 'data:application/octet-stream;charset=big5,Big5%20%A4%A4%A4%E5%A4%BA%AEe',
          });
        });

        it('should include UTF-8 percent-encoded filename if exists', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob([await encodeText('Big5 中文內容', 'big5')], {type: 'application/octet-stream;charset=big5'}),
            filename: '中文file.txt',
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: '中文file.txt',
            url: 'data:application/octet-stream;charset=big5;filename=%E4%B8%AD%E6%96%87file.txt,Big5%20%A4%A4%A4%E5%A4%BA%AEe',
          });
        });

        it('should encode URL content as percent-encoded byte string if `blob` is text type', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob(['ABC 中文 𠀀 にほんご'], {type: 'text/plain'}),
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: 'data:text/plain,ABC%20%E4%B8%AD%E6%96%87%20%F0%A0%80%80%20%E3%81%AB%E3%81%BB%E3%82%93%E3%81%94',
          });
        });

        it('should include UTF-8 percent-encoded filename if exists', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob(['ABC 中文 𠀀 にほんご'], {type: 'text/plain'}),
            filename: '中文file.txt',
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: '中文file.txt',
            url: 'data:text/plain;filename=%E4%B8%AD%E6%96%87file.txt,ABC%20%E4%B8%AD%E6%96%87%20%F0%A0%80%80%20%E3%81%AB%E3%81%BB%E3%82%93%E3%81%94',
          });
        });

        it('should encode URL content as base64 if `blob` is not text type', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: undefined,
            url: `data:image/bmp;base64,${GREEN_BMP_B64}`,
          });
        });

        it('should include UTF-8 percent-encoded filename if exists', async function () {
          var result = await new Capturer().downloadBlob({
            blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            filename: '中文=foo;bar,file.bmp',
            sourceUrl: docUrl,
            settings,
            options,
          });
          sinon.assert.match(result, {
            filename: '中文=foo;bar,file.bmp',
            url: `data:image/bmp;filename=%E4%B8%AD%E6%96%87%3Dfoo%3Bbar%2Cfile.bmp;base64,${GREEN_BMP_B64}`,
          });
        });
      });
    });

    describe('#downLinkFileExtFilter', function () {
      const capturer = new Capturer();

      it('should parse one rule per line', function () {
        var options = {
          "capture.downLink.file.extFilter": ['txt', 'css', '/jpe?g/'].join('\n'),
        };
        assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
        assert.isTrue(capturer.downLinkFileExtFilter('css', options));
        assert.isTrue(capturer.downLinkFileExtFilter('jpg', options));
        assert.isTrue(capturer.downLinkFileExtFilter('jpeg', options));
        assert.isFalse(capturer.downLinkFileExtFilter('html', options));
      });

      it('should skip lines starting with `#`', function () {
        var options = {
          "capture.downLink.file.extFilter": '#txt',
        };
        assert.isFalse(capturer.downLinkFileExtFilter('txt', options));
        assert.isFalse(capturer.downLinkFileExtFilter('#txt', options));
      });

      it('should return false when rules are empty', function () {
        var options = {
          "capture.downLink.file.extFilter": '',
        };
        assert.isFalse(capturer.downLinkFileExtFilter('txt', options));
        assert.isFalse(capturer.downLinkFileExtFilter('', options));
      });

      it('should return false when extension is falsy', function () {
        var options = {
          "capture.downLink.file.extFilter": '//',
        };
        assert.isFalse(capturer.downLinkFileExtFilter(null, options));
        assert.isFalse(capturer.downLinkFileExtFilter(undefined, options));
      });

      context('plain rules handling', function () {
        it('should match full extension', function () {
          var options = {
            "capture.downLink.file.extFilter": 'txt',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
          assert.isFalse(capturer.downLinkFileExtFilter('txt1', options));
          assert.isFalse(capturer.downLinkFileExtFilter('itxt', options));
          assert.isFalse(capturer.downLinkFileExtFilter('x', options));
          assert.isFalse(capturer.downLinkFileExtFilter('', options));
        });

        it('should match case insensitively', function () {
          var options = {
            "capture.downLink.file.extFilter": 'txt',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('TXT', options));
          assert.isTrue(capturer.downLinkFileExtFilter('Txt', options));
        });

        for (const [desc, sep] of [
          ['should separate extensions at space', ' '],
          ['should separate extensions at tab', '\t'],
          ['should separate extensions at comma', ','],
          ['should separate extensions at semicolon', ';'],
          ['should separate extensions with mixed separators', ' ,; '],
        ]) {
          it(desc, function () {
            var options = {
              "capture.downLink.file.extFilter": ['txt', 'bmp', 'css'].join(sep),
            };
            assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
            assert.isTrue(capturer.downLinkFileExtFilter('bmp', options));
            assert.isTrue(capturer.downLinkFileExtFilter('css', options));
            assert.isFalse(capturer.downLinkFileExtFilter('html', options));
          });
        }
      });

      context('regex rules handling', function () {
        it('should match full extension', function () {
          var options = {
            "capture.downLink.file.extFilter": '/txt/',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
          assert.isFalse(capturer.downLinkFileExtFilter('txt1', options));
          assert.isFalse(capturer.downLinkFileExtFilter('itxt', options));
          assert.isFalse(capturer.downLinkFileExtFilter('x', options));
          assert.isFalse(capturer.downLinkFileExtFilter('', options));
        });

        it('should assume no flag for a regex without flag', function () {
          var options = {
            "capture.downLink.file.extFilter": '/txt/',
          };
          assert.isFalse(capturer.downLinkFileExtFilter('TXT', options));
          assert.isFalse(capturer.downLinkFileExtFilter('Txt', options));
        });

        it('should work for regex with flag', function () {
          var options = {
            "capture.downLink.file.extFilter": '/txt/i',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('TXT', options));
          assert.isTrue(capturer.downLinkFileExtFilter('Txt', options));
        });

        it('should work for regex with wildcards', function () {
          var options = {
            "capture.downLink.file.extFilter": '/(txt|bmp|css)/i',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
          assert.isTrue(capturer.downLinkFileExtFilter('bmp', options));
          assert.isTrue(capturer.downLinkFileExtFilter('css', options));
          assert.isFalse(capturer.downLinkFileExtFilter('html', options));

          var options = {
            "capture.downLink.file.extFilter": '/(?!py).+/',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('txt', options));
          assert.isTrue(capturer.downLinkFileExtFilter('bmp', options));
          assert.isTrue(capturer.downLinkFileExtFilter('css', options));
          assert.isTrue(capturer.downLinkFileExtFilter('html', options));
          assert.isTrue(capturer.downLinkFileExtFilter('svg', options));
          assert.isFalse(capturer.downLinkFileExtFilter('py', options));
          assert.isFalse(capturer.downLinkFileExtFilter('pyc', options));

          var options = {
            "capture.downLink.file.extFilter": '//',
          };
          assert.isTrue(capturer.downLinkFileExtFilter('', options));
          assert.isFalse(capturer.downLinkFileExtFilter('x', options));
        });
      });

      context('MIME rules handling', function () {
        it('should skip rules starting with `mime:`', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:text/plain',
          };
          assert.isFalse(capturer.downLinkFileExtFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileExtFilter('mime:text/plain', options));
          assert.isFalse(capturer.downLinkFileExtFilter('', options));

          var options = {
            "capture.downLink.file.extFilter": 'mime:/.*?/i',
          };
          assert.isFalse(capturer.downLinkFileExtFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileExtFilter('mime:text/plain', options));
          assert.isFalse(capturer.downLinkFileExtFilter('', options));
        });
      });
    });

    describe('#downLinkFileMimeFilter', function () {
      const capturer = new Capturer();

      it('should parse one rule per line', function () {
        var options = {
          "capture.downLink.file.extFilter": ['mime:/text/.+/', 'mime:/application/.+/'].join('\n'),
        };
        assert.isTrue(capturer.downLinkFileMimeFilter('text/javascript', options));
        assert.isTrue(capturer.downLinkFileMimeFilter('application/javascript', options));
        assert.isFalse(capturer.downLinkFileMimeFilter('image/jpeg', options));
      });

      it('should skip lines starting with `#`', function () {
        var options = {
          "capture.downLink.file.extFilter": '#mime:text/javascript',
        };
        assert.isFalse(capturer.downLinkFileMimeFilter('#text/javascript', options));
        assert.isFalse(capturer.downLinkFileMimeFilter('text/javascript', options));
        assert.isFalse(capturer.downLinkFileMimeFilter('#mime:text/javascript', options));
      });

      it('should return false when rules are empty', function () {
        var options = {
          "capture.downLink.file.extFilter": '',
        };
        assert.isFalse(capturer.downLinkFileMimeFilter('text/plain', options));
        assert.isFalse(capturer.downLinkFileMimeFilter('', options));
      });

      it('should return false when extension is falsy', function () {
        var options = {
          "capture.downLink.file.extFilter": 'mime:/.*?/',
        };
        assert.isFalse(capturer.downLinkFileMimeFilter(null, options));
        assert.isFalse(capturer.downLinkFileMimeFilter(undefined, options));
      });

      context('plain rules handling', function () {
        it('should match full MIME', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:text/plain',
          };
          assert.isTrue(capturer.downLinkFileMimeFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('1text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('text/plain1', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('ext/pl', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('text/', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('plain', options));
        });

        it('should match case insensitively', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:text/plain',
          };
          assert.isTrue(capturer.downLinkFileMimeFilter('TEXT/PLAIN', options));
          assert.isTrue(capturer.downLinkFileMimeFilter('Text/Plain', options));
        });
      });

      context('regex rules handling', function () {
        it('should match full MIME', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:/text/plain/',
          };
          assert.isTrue(capturer.downLinkFileMimeFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('1text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('text/plain1', options));
        });

        it('should assume no flag for a regex without flag', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:/text/plain/',
          };
          assert.isFalse(capturer.downLinkFileMimeFilter('TEXT/PLAIN', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('Text/Plain', options));
        });

        it('should work for regex with flag', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:/text/plain/i',
          };
          assert.isTrue(capturer.downLinkFileMimeFilter('TEXT/PLAIN', options));
          assert.isTrue(capturer.downLinkFileMimeFilter('Text/Plain', options));
        });

        it('should work for regex with wildcards', function () {
          var options = {
            "capture.downLink.file.extFilter": 'mime:/text/.+/',
          };
          assert.isTrue(capturer.downLinkFileMimeFilter('text/plain', options));
          assert.isTrue(capturer.downLinkFileMimeFilter('text/css', options));
        });
      });

      context('non-MIME rules handling', function () {
        it('should skip rules not starting with `mime:`', function () {
          var options = {
            "capture.downLink.file.extFilter": 'text/plain',
          };
          assert.isFalse(capturer.downLinkFileMimeFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('', options));

          var options = {
            "capture.downLink.file.extFilter": '/.*?/i',
          };
          assert.isFalse(capturer.downLinkFileMimeFilter('text/plain', options));
          assert.isFalse(capturer.downLinkFileMimeFilter('', options));
        });
      });
    });

    describe('#downLinkDocUrlFilter', function () {
      const capturer = new Capturer();

      it('should parse one rule per line', function () {
        var options = {
          "capture.downLink.doc.urlFilter": ['https://example.com/', 'https://example.org/'].join('\n'),
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/', options));
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.org/', options));
        assert.isFalse(capturer.downLinkDocUrlFilter('https://example.gov/', options));
      });

      it('should skip lines starting with `#`', function () {
        var options = {
          "capture.downLink.doc.urlFilter": ['#https://example.com/', 'http://example.org/'].join('\n'),
        };
        assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/', options));
        assert.isFalse(capturer.downLinkDocUrlFilter('#https://example.com/', options));
      });

      it('should ignore chars starting from a space', function () {
        var options = {
          "capture.downLink.doc.urlFilter": 'https://example.com/foo bar',  // treat as https://example.com/foo
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/foo', options));
        assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/foo bar', options));

        var options = {
          "capture.downLink.doc.urlFilter": '/https://example.com/foo bar/',  // treat as /https://example.com/foo (invalid)
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://anyurl.com/', options));
      });

      it('should ignore hash in the input URL', function () {
        var options = {
          "capture.downLink.doc.urlFilter": 'https://example.com/',
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/#foo', options));

        var options = {
          "capture.downLink.doc.urlFilter": '/https://example.com/foo/$/',
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/foo/#foo', options));
      });

      it('should return true when rules are empty', function () {
        var options = {
          "capture.downLink.doc.urlFilter": '',
        };
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/', options));
        assert.isTrue(capturer.downLinkDocUrlFilter('https://example.org/', options));
        assert.isTrue(capturer.downLinkDocUrlFilter('https://anyurl.com/', options));
        assert.isTrue(capturer.downLinkDocUrlFilter('', options));
      });

      context('plain rules handling', function () {
        it('should match full URL', function () {
          var options = {
            "capture.downLink.doc.urlFilter": 'https://example.com/',
          };
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/?foo=bar', options));
        });

        it('should match case sensitively', function () {
          var options = {
            "capture.downLink.doc.urlFilter": 'https://example.com/foo',
          };
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/FOO', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/Foo', options));
        });
      });

      context('regex rules handling', function () {
        it('should match partial URL', function () {
          var options = {
            "capture.downLink.doc.urlFilter": '/https://example\\.com//',
          };
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/', options));
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/subpath', options));
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/?foo=bar', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.org/', options));
        });

        it('should assume no flag for a regex without flag', function () {
          var options = {
            "capture.downLink.doc.urlFilter": '/https://example\\.com/foo/',
          };
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/FOO', options));
          assert.isFalse(capturer.downLinkDocUrlFilter('https://example.com/Foo', options));
        });

        it('should work for regex with wildcards', function () {
          var options = {
            "capture.downLink.doc.urlFilter": '/https?://example\\.(com|org)//',
          };
          assert.isTrue(capturer.downLinkDocUrlFilter('http://example.com/foo', options));
          assert.isTrue(capturer.downLinkDocUrlFilter('https://example.org/foo', options));
        });
      });
    });

    describe('#downLinkUrlFilter', function () {
      const capturer = new Capturer();

      it('should parse one rule per line', function () {
        var options = {
          "capture.downLink.urlFilter": ['https://example.com/', 'https://example.org/'].join('\n'),
        };
        assert.isTrue(capturer.downLinkUrlFilter('https://example.com/', options));
        assert.isTrue(capturer.downLinkUrlFilter('https://example.org/', options));
        assert.isFalse(capturer.downLinkUrlFilter('https://example.gov/', options));
      });

      it('should skip lines starting with `#`', function () {
        var options = {
          "capture.downLink.urlFilter": '#https://example.com/',
        };
        assert.isFalse(capturer.downLinkUrlFilter('https://example.com/', options));
        assert.isFalse(capturer.downLinkUrlFilter('#https://example.com/', options));
      });

      it('should ignore chars starting from a space', function () {
        var options = {
          "capture.downLink.urlFilter": 'https://example.com/foo bar',  // treat as https://example.com/foo
        };
        assert.isTrue(capturer.downLinkUrlFilter('https://example.com/foo', options));
        assert.isFalse(capturer.downLinkUrlFilter('https://example.com/foo bar', options));

        var options = {
          "capture.downLink.urlFilter": '/https://example.com/foo bar/',  // treat as /https://example.com/foo (invalid)
        };
        assert.isFalse(capturer.downLinkUrlFilter('https://example.com/foo bar', options));
        assert.isFalse(capturer.downLinkUrlFilter('https://example.com', options));
      });

      it('should ignore hash in the input URL', function () {
        var options = {
          "capture.downLink.urlFilter": 'https://example.com/',
        };
        assert.isTrue(capturer.downLinkUrlFilter('https://example.com/#foo', options));

        var options = {
          "capture.downLink.urlFilter": '/https://example.com/foo/$/',
        };
        assert.isTrue(capturer.downLinkUrlFilter('https://example.com/foo/#foo', options));
      });

      it('should return false when rules are empty', function () {
        var options = {
          "capture.downLink.urlFilter": '',
        };
        assert.isFalse(capturer.downLinkUrlFilter('https://example.com/', options));
        assert.isFalse(capturer.downLinkUrlFilter('https://example.org/', options));
        assert.isFalse(capturer.downLinkUrlFilter('', options));
      });

      context('plain rules handling', function () {
        it('should match full URL', function () {
          var options = {
            "capture.downLink.urlFilter": 'https://example.com/',
          };
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/?foo=bar', options));
        });

        it('should match case sensitively', function () {
          var options = {
            "capture.downLink.urlFilter": 'https://example.com/foo',
          };
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/FOO', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/Foo', options));
        });
      });

      context('regex rules handling', function () {
        it('should match partial URL', function () {
          var options = {
            "capture.downLink.urlFilter": '/https://example\\.com//',
          };
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/', options));
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/subpath', options));
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/?foo=bar', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.org/', options));
        });

        it('should assume no flag for a regex without flag', function () {
          var options = {
            "capture.downLink.urlFilter": '/https://example\\.com/foo/',
          };
          assert.isTrue(capturer.downLinkUrlFilter('https://example.com/foo', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/FOO', options));
          assert.isFalse(capturer.downLinkUrlFilter('https://example.com/Foo', options));
        });

        it('should work for regex with wildcards', function () {
          var options = {
            "capture.downLink.urlFilter": '/https?://example\\.(com|org)//',
          };
          assert.isTrue(capturer.downLinkUrlFilter('http://example.com/foo', options));
          assert.isTrue(capturer.downLinkUrlFilter('https://example.org/foo', options));
        });
      });
    });
  });
});
