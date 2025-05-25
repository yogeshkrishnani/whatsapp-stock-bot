// eslint.config.js
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      // Allow console.log for server logging
      'no-console': 'off',

      // Standard rules
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      eqeqeq: 'warn',
      'no-trailing-spaces': 'error',

      // Consistent coding style
      'prefer-const': 'warn',
      'no-var': 'warn',

      // Formatting rules (2-space indentation)
      indent: ['error', 2],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
    },
  },
];
