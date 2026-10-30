module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    { files: ['jest.setup.js'], env: { jest: true } },
    {
      files: ['scripts/*.cjs', 'backend/*.cjs'],
      env: { node: true },
      parser: 'espree',
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
    },
  ],
};
