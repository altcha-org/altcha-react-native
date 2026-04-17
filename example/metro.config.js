const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// Watch the parent package source
config.watchFolders = [root];

// Resolve react-native and react from the example's node_modules only
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(root, 'node_modules'),
];

// Block root's copies of singleton packages to prevent duplicate instances
const rootNodeModules = escapeRegex(path.resolve(root, 'node_modules'));
config.resolver.blockList = exclusionList([
  new RegExp(`^${rootNodeModules}\\/react\\/.*$`),
  new RegExp(`^${rootNodeModules}\\/react-native\\/.*$`),
  new RegExp(`^${rootNodeModules}\\/react-native-svg\\/.*$`),
]);

config.resolver.unstable_enablePackageExports = true;

// Chain to Expo's default resolver (handles react-native → react-native-web on web,
// and other platform-specific aliasing). Replacing it entirely breaks web builds.
const expoResolveRequest = config.resolver.resolveRequest;

const webMockEmpty = path.resolve(__dirname, 'web-mocks/empty.js');

// Native-only RN internal modules that have no react-native-web equivalent.
// Stub them out on web to prevent "unable to resolve" errors.
// Packages / modules with no web support — stubbed on web platform.
// These are all guarded by Platform.OS checks in app code, but Metro still
// bundles them; deep requires inside their compiled JS break the web build.
const WEB_STUBS = new Set([
  // @react-native-community/slider deep-requires react-native internals
  '@react-native-community/slider',
  // Native-only crypto — install() is guarded by Platform.OS !== 'web' in index.js
  'react-native-quick-crypto',
  'react-native-nitro-modules',
  'react-native-quick-base64',
  // react-native internal modules that have no web equivalent
  './BaseViewConfig',
  '../NativeComponent/PlatformBaseViewConfig',
  'react-native/Libraries/NativeComponent/PlatformBaseViewConfig',
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-altcha') {
    return {
      filePath: path.resolve(root, 'src/index.tsx'),
      type: 'sourceFile',
    };
  }

  if (platform === 'web') {
    // Alias react-native → react-native-web (Expo's config should do this but
    // our custom resolveRequest may have displaced it)
    if (moduleName === 'react-native') {
      return context.resolveRequest(context, 'react-native-web', platform);
    }

    // Stub native-only internals that have no web equivalent
    if (WEB_STUBS.has(moduleName)) {
      return { filePath: webMockEmpty, type: 'sourceFile' };
    }
  }

  // Delegate to Expo's resolver first, fall back to Metro's default
  if (expoResolveRequest) {
    return expoResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

function escapeRegex(str) {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
