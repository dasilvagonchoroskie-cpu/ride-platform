const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: o Metro precisa enxergar a raiz do workspace e o pacote @ride/shared
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  '@ride/shared': path.resolve(workspaceRoot, 'packages/shared'),
};
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
