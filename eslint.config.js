// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      // Underscore-prefixed params are this codebase's convention for
      // intentionally-unused arguments required by a callback/interface shape.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  },
  {
    // Test doubles legitimately implement interfaces with no-op methods and
    // intentionally-unused parameters (e.g. a stub Worker's postMessage()) —
    // that's the point of a stub, not a code smell. Test fixtures also
    // routinely need `as any` to build deliberately-partial mock data.
    files: ["src/testing/**/*.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // idb's generic type parameters (IDBPObjectStore<DB, TxStores, Store, Mode>)
    // can't be expressed generically across the version-to-version migration
    // helpers in this file, which by design operate on stores whose exact
    // schema varies by the DB version being migrated from.
    files: ["src/app/data/idb.service.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
