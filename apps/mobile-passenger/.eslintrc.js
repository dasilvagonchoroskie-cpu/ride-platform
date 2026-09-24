module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['android/', 'ios/', 'node_modules/', '.expo/', 'dist/'],
  env: {
    es2022: true,
    node: true,
  },
  globals: {
    __DEV__: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    setImmediate: 'readonly',
    console: 'readonly',
    fetch: 'readonly',
    process: 'readonly',
    Buffer: 'readonly',
  },
  rules: {
    'no-undef': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
  },
};
