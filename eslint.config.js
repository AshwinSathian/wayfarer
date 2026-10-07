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
          // "ui": the app's own widgets in src/app/ui.
          prefix: ["app", "ui"],
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: ["app", "ui"],
          style: "kebab-case",
        },
      ],
      // Underscore-prefixed params are this codebase's convention for
      // intentionally-unused arguments required by a callback/interface shape.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // P1.11 (F36, F40): no silently swallowed errors, no explicit any.
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CatchClause[param=null]",
          message: "Bind the error, then handle it explicitly: rethrow, or record it with DiagnosticsService.record / recordDiagnostic.",
        },
        {
          selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='Identifier'][body.name='undefined']",
          message: ".catch(() => undefined) hides failures. Handle or record the error.",
        },
        {
          selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message: ".catch(() => {}) hides failures. Handle or record the error.",
        },
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
    // that's the point of a stub, not a code smell.
    files: ["src/testing/**/*.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
