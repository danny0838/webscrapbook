# Tests

## System requirements

* [Node.js](https://nodejs.org)
* [Python](https://www.python.org) ≥ 3.7 (Optional)
* [PyWebScrapBook](https://github.com/danny0838/PyWebScrapBook) (Optional)

## Running tests

1. Run `npm run dev:<browser>` to prepare development for specific browser.

2. Install WebScrapBook extension (standard install or as a temporary extension).

3. Install `WebScrapBook Test Suite` extension from this directory (as a temporary extension).

4. Copy `config.json` to `config.local.json` and configure:
   * `wsb_extension_id`: should match the extension ID of the installed WebScrapBook extension
   * `server_port`, `server_port2`, and `backend_port`: should be available (not used by other applications)

5. Install PyWebScrapBook and configure related extension options: (Optional, for backend server related end-to-end tests)
   * `Backend server > Address`: should match `http://localhost:<backend_port>/`

6. Run `server.py` to start the local hosting server. (Optional, for end-to-end capture tests)

7. Click on the browser action of the test suite extension. A tab will be opened and the test will start automatically.
   > Alternatively, right-click on the browser action for subgroup tests.

7. Do the same tests in a private window for Firefox (which may behave differently from in a normal window).

## Notes

* It's recommended to use a different user account or profile of the browser, or use another build of browser (such as Firefox Developer Edition) for tests.

* Tests may fail due to several unclear issues of the browser. Here are some hints for further investigation:
  * **Run tests repeatedly**: varying fails/errors suggest there's an issue of the browser or somewhere rather than the extension itself.
  * **Clear browser cache**: to avoid fails due to retrieving outdated testing page content.
  * **Use clean profile**: in Chromium, tests could get repeatedly fail for a long living user account, and shifting to another user resolves it. In Firefox, this can resolve a profile issue after version change.
