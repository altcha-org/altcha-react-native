/**
 * Adopts the UIKit scene-based life cycle, which apps built with the iOS 27 SDK
 * must use or they abort at launch.
 *
 * Expo SDK 57 ships the runtime pieces (`ExpoAppSceneDelegate`,
 * `ExpoReactNativeFactoryProvider`) but its prebuild template predates them.
 * This applies the same changes as the SDK 58 template; remove this plugin
 * once the example is on SDK 58.
 */
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift';

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const APP_DELEGATE_CLASS = 'class AppDelegate: ExpoAppDelegate {';
const APP_DELEGATE_PROVIDER_CLASS =
  'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';

// SceneDelegate creates the window and starts React Native, so the
// AppDelegate must not do it as well.
const APP_DELEGATE_START_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle only supports a Swift AppDelegate.');
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(APP_DELEGATE_PROVIDER_CLASS)) {
      return cfg;
    }
    if (
      !contents.includes(APP_DELEGATE_CLASS) ||
      !APP_DELEGATE_START_BLOCK.test(contents)
    ) {
      throw new Error(
        'withSceneLifecycle: AppDelegate.swift does not match the SDK 57 template; update the plugin.'
      );
    }
    contents = contents
      .replace(APP_DELEGATE_CLASS, APP_DELEGATE_PROVIDER_CLASS)
      .replace(
        APP_DELEGATE_START_BLOCK,
        '\n    // The window is created and React Native is started by `SceneDelegate`.\n'
      );
    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(
        cfg.modRequest.projectRoot
      );
      fs.writeFileSync(
        path.join(
          cfg.modRequest.platformProjectRoot,
          projectName,
          SCENE_DELEGATE_FILE
        ),
        SCENE_DELEGATE_SOURCE
      );
      return cfg;
    },
  ]);
}

function withSceneDelegateInProject(config) {
  return withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      cfg.modRequest.projectRoot
    );
    const filepath = path.join(projectName, SCENE_DELEGATE_FILE);
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: cfg.modResults,
      });
    }
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneAppDelegate(config);
  config = withSceneDelegateFile(config);
  return withSceneDelegateInProject(config);
};
