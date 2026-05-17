const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "public/leaflet/**",
      "public/favicons/**",
      "public/icons/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["index.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, L: "readonly" },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["error", { vars: "local", args: "after-used" }],
    },
  },
  prettier,
];
