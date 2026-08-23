const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const fs = require('fs');
const path = require('node:path');

// ---- monorepo layout -------------------------------------------------------
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// ---- React Native for Windows additions ------------------------------------
const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * Monorepo (pnpm workspace) resolution + RNW blockList, merged.
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    blockList: [
      // Keeps run-windows from crashing a running Metro server.
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      // Avoid EBUSY on msbuild.ProjectImports.zip and RNW build artifacts.
      new RegExp(`${rnwPath}/build/.*`),
      new RegExp(`${rnwPath}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
