## Dependencies

* `mocha.js`: built from [mocha](https://github.com/mochajs/mocha/tree/v11.7.2) with:
  ```
  npm run install
  npx rollup -c
  ```

* `chai.mjs`: built from [chai](https://github.com/chaijs/chai/tree/v6.0.1) with:
  ```
  npm run install
  npx esbuild --bundle --format=esm --keep-names --outfile=index.js lib/chai.js --target=chrome85,firefox79
  ```
