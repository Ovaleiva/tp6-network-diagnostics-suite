const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { FileStore } = require('metro-cache');
const path = require('node:path');

// Las cachés y el bundle generado no forman parte del código de la aplicación.
const config = {
  // Evita saturar la memoria al usar Metro junto con el emulador.
  maxWorkers: 2,
  resolver: {
    blockList: [/[/\\](?:\.pnpm-store|\.pnpm-cache|artifacts|tmp)[/\\]/],
  },
  cacheStores: [
    new FileStore({ root: path.join(__dirname, 'tmp', 'metro-cache') }),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
