Unit tests
----------

### System requirements

* Firefox ≥ 63, Chromium ≥ 57
* Python 3.* (≥ 3.6 is better)

### Usage

1. Install WebScrapBook extension (standard install or as a temporary extension).

2. Copy `config.json` to `config.local.json` and edit it:
   * Make sure "wsb_extension_id" matches the extension ID of WebScrapBook.
   * Make sure "server_port" and "server_port2" are available (not used by other applications).

3. Run `server.py` to start the local hosting server.

4. Install `WebScrapBook Test Suite` extension in this directory (as a temporary extension).

5. Click on the browser action of the test suite extension. A tab will be opened and the test will start automatically. Alternatively, right-click on the browser action for subgroup tests.

### Notes

* It's recommended to use a different user account or profile of the browser, or use another build of browser (such as Development Edition of Firefox) for tests.

* Tests may fail due to several unclear issues of the browser. Here are some hints for further investigation:
  * **Run tests repeatedly**: varying fails/errors suggest there's an issue of the browser or somewhere rather than the extension itself.
  * **Clear browser cache**: to avoid fails due to retrieving outdated testing page content.
  * **Use clean profile**: in Chromium, tests could get repeatedly fail for a long living user account, and shifting to another user resolves it. In Firefox, this can resolve a profile issue after version change.
