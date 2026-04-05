const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Avoid spawning worker processes on locked-down Windows environments.
config.maxWorkers = 1;

module.exports = config;
