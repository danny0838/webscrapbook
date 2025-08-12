import js from "@eslint/js";
import {includeIgnoreFile} from "@eslint/compat";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import stylistic from "@stylistic/eslint-plugin";

import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");

// ref: https://github.com/eslint-stylistic/eslint-stylistic/blob/main/packages/eslint-plugin/configs/customize.ts
const stylisticCustomized = stylistic.configs.customize({
  semi: true,
  jsx: false,
});

export default [
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      "src/lib/browser-polyfill.js",
      "src/lib/jszip.js",
      "src/lib/mime.js",
      "src/lib/sha.js",
      "src/core/content.js",
      "test/lib/**/*.js",
      "test/lib/**/*.mjs",
    ],
  },
  {
    plugins: {
      ...stylisticCustomized.plugins,
      ...importPlugin.flatConfigs.recommended.plugins,
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
      "@stylistic/no-extra-semi": "error",
      "@stylistic/no-mixed-operators": "off",
      "@stylistic/no-multi-spaces": ["error", {ignoreEOLComments: true}],
      "@stylistic/no-multiple-empty-lines": ["error", {max: 2, maxBOF: 0, maxEOF: 0}],
      "@stylistic/object-curly-spacing": ["error", "never"],
      "@stylistic/operator-linebreak": "off",
      "@stylistic/padded-blocks": "off",
      "@stylistic/quote-props": ["error", "consistent"],
      "@stylistic/quotes": "off",

      // ref: https://github.com/import-js/eslint-plugin-import
      ...importPlugin.flatConfigs.recommended.rules,
      "import/no-named-as-default-member": "off",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        browser: false,
        chrome: false,
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
      "src/**/*.mjs",
    ],
  },
  {
    files: [
      "src/lib/polyfill.js",
      "src/lib/webext-polyfill.js",
    ],
    languageOptions: {
      sourceType: "script",
    },
  },
  {
    files: [
      "test/**/*.js",
      "test/**/*.mjs",
    ],
    rules: {
      "import/no-unresolved": "warn", // prevent workflow failure when test/shared/* not generated
    },
  },
  {
    files: [
      "test/test.js",
      "test/test_*.mjs",
    ],
    languageOptions: {
      globals: globals.mocha,
    },
  },
  {
    files: [
      "test/unittest-encoding.js",
      "test/t/**/*.js",
    ],
    languageOptions: {
      sourceType: "script",
      globals: globals.browser,
    },
    rules: {
      "@stylistic/eol-last": "off", // for some one-liner test files
    },
  },
];
