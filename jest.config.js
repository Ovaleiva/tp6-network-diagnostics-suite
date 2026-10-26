module.exports = {
  preset: '@react-native/jest-preset',
  cacheDirectory: '<rootDir>/tmp/jest-cache',
  modulePathIgnorePatterns: [
    '<rootDir>/.pnpm-store/',
    '<rootDir>/.pnpm-cache/',
    '<rootDir>/artifacts/',
    '<rootDir>/tmp/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|nanoid|\\.pnpm))',
  ],
};
