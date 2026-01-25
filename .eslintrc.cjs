/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    'server/uploads/**',
    'client/dist/**',
  ],
  reportUnusedDisableDirectives: true,
  overrides: [
    {
      files: ['server/**/*.js'],
      env: { node: true, es2022: true },
      extends: ['eslint:recommended'],
      parserOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      },
    },
    {
      files: ['client/src/**/*.{js,jsx}'],
      env: { browser: true, es2022: true },
      extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        // Avoid forcing large refactors; still surfaces as warnings via ESLint output.
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
  ],
};
