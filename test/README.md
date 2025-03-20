Unit tests
----------

### System requirements

* Firefox ≥ 68, Chromium ≥ 73
* Python ≥ 3.7
* PyWebScrapBook (compatible version)

### Usage

1. Copy `config.json` to `config.local.json` and edit it:
   * Make sure `wsb_extension_id` matches the extension ID of WebScrapBook.
   * Make sure `server_port`, `server_port2`, and `backend_port` are available (not used by other applications).

2. Run `server.py` to start the local hosting server and do some initialization.

3. Install WebScrapBook extension (standard install or as a temporary extension).

4. Install `WebScrapBook Test Suite` extension in this directory (as a temporary extension).

5. Configure WebScrapBook options:
   * Make sure backend server URL matches the configured `backend_port`.

6. Click on the browser action of the test suite extension. A tab will be opened and the test will start automatically. Alternatively, right-click on the browser action for subgroup tests.

7. Do the same tests in a private window for Firefox (which may behave differently from in a normal window).

### Notes

* It's recommended to use a different user account or profile of the browser, or use another build of browser (such as Development Edition of Firefox) for tests.

* Tests may fail due to several unclear issues of the browser. Here are some hints for further investigation:
  * **Run tests repeatedly**: varying fails/errors suggest there's an issue of the browser or somewhere rather than the extension itself.
  * **Clear browser cache**: to avoid fails due to retrieving outdated testing page content.
  * **Use clean profile**: in Chromium, tests could get repeatedly fail for a long living user account, and shifting to another user resolves it. In Firefox, this can resolve a profile issue after version change.
