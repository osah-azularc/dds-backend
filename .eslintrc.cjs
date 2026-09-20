module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["import"],
  rules: {
    // Off by default: the codebase currently has a large backlog of unused
    // exports (see `npm run lint:dead-exports`), so enabling this here would
    // break `npm run lint`'s --max-warnings=0 gate on pre-existing debt.
    "import/no-unused-modules": "off",
  },
  ignorePatterns: ["api/views/"],
};
