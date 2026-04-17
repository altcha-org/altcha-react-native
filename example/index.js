import { Platform } from 'react-native';

// Install react-native-quick-crypto polyfill on native platforms.
// This sets global.crypto (incl. crypto.subtle) to a native C++ implementation
// via Nitro Modules, giving hardware-speed PBKDF2/SHA on iOS and Android.
// Web already has native crypto.subtle in the browser — skip it there.
if (Platform.OS !== 'web') {
  require('react-native-quick-crypto').install();
}

import { registerRootComponent } from 'expo';
import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
