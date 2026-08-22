## Dependencies

* `mocha.js`: built from [mocha](https://github.com/mochajs/mocha/tree/v11.7.2) with:
  ```
  npm run install
  npx rollup -c
  ```

* `chai.mjs`: built from [chai](https://github.com/chaijs/chai/tree/v6.2.2) with:
  ```
  npm ci
  npx esbuild --bundle --format=esm --keep-names --outfile=index.js lib/chai.js --target=chrome85,firefox79
  ```

* `sinon-esm.js`: from [sinon](https://cdn.jsdelivr.net/npm/sinon@21.0.1/pkg/sinon-esm.js) (sinon >= 21.0.2 is extremely slow in older browsers, e.g., Firefox 79)
