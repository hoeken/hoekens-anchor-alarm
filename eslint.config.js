const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["node_modules/**", "public/**", "ui/public/**"],
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
    files: ["ui/js/**/*.js"],
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
