const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Use node watcher (polling) to avoid EMFILE errors on macOS
// when Watchman is not installed and FSEvents hits file descriptor limits
config.watcher = {
  ...config.watcher,
  watchman: {
    deferStates: [],
  },
};

module.exports = config;
