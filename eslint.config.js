import js from "@eslint/js";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";

// ref: https://github.com/eslint-stylistic/eslint-stylistic/blob/main/packages/eslint-plugin/configs/customize.ts
const stylisticCustomized = stylistic.configs.customize({
  semi: true,
  jsx: false,
});

export default [
  {
    ignores: [
      "dist",
      "src/lib/browser-polyfill.js",
      "src/lib/jszip.js",
      "src/lib/mime.js",
      "src/lib/sha.js",
      "test/lib/**/*.js",
      "test/shared/**/*.js",
    ],
  },
  {
    plugins: {
      ...stylisticCustomized.plugins,
    },
    rules: {
      // ref: https://eslint.org/docs/latest/rules/
      ...js.configs.recommended.rules,
      "no-cond-assign": "off",
      "no-control-regex": "off",
      "no-empty": "off",
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-unused-labels": "off",
      "no-unused-vars": "off",

      // ref: https://eslint.style/rules
      ...stylisticCustomized.rules,
      "@stylistic/arrow-parens": "off",
      "@stylistic/brace-style": "off",
      "@stylistic/indent": "off",
      "@stylistic/indent-binary-ops": "off",
      "@stylistic/max-statements-per-line": "off",
      "@stylistic/multiline-ternary": "off",
      "@stylistic/no-mixed-operators": "off",
      "@stylistic/no-multi-spaces": ["error", {ignoreEOLComments: true}],
      "@stylistic/no-multiple-empty-lines": ["error", {max: 2, maxBOF: 0, maxEOF: 0}],
      "@stylistic/object-curly-spacing": ["error", "never"],
      "@stylistic/operator-linebreak": "off",
      "@stylistic/padded-blocks": "off",
      "@stylistic/quote-props": ["error", "consistent"],
      "@stylistic/quotes": "off",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        browser: false,
        chrome: false,
        module: false,
        require: false,
        define: false,
      },
    },
  },
  {
    files: [
      "tools/**/*.js",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      "src/**/*.js",
    ],
  },
  {
    files: [
      "test/**/*.js",
    ],
    rules: {
      "@stylistic/eol-last": "off", // for some one-liner test files
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
        backend: false,
        localhost: false,
        localhost2: false,
        checkBackendServer: false,
        checkTestServer: false,
        checkExtension: false,
        capture: false,
        captureHeadless: false,
        openTestTab: false,
        backendRequest: false,
      },
    },
  },
];
