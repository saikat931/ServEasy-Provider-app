const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidAppDir = path.join(projectRoot, 'android', 'app');
const buildGradlePath = path.join(androidAppDir, 'build.gradle');
const mainAppPath = path.join(androidAppDir, 'src', 'main', 'java', 'com', 'serveasy', 'provider', 'MainApplication.kt');
const manifestPath = path.join(androidAppDir, 'src', 'main', 'AndroidManifest.xml');
const assetsDir = path.join(androidAppDir, 'src', 'main', 'assets');
const sourceKeystore = path.join(projectRoot, 'credentials', 'release.keystore');
const targetKeystore = path.join(androidAppDir, 'release.keystore');

console.log('[configure-release-build] Setting up release keystore and gradle configuration...');

// 1. Copy keystore to android/app/
if (fs.existsSync(sourceKeystore)) {
  fs.copyFileSync(sourceKeystore, targetKeystore);
  console.log('[configure-release-build] Copied release.keystore to android/app/');
} else {
  console.warn('[configure-release-build] Warning: credentials/release.keystore not found.');
}

// 2. Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log('[configure-release-build] Created android/app/src/main/assets directory.');
}

// 3. Patch android/app/build.gradle
if (fs.existsSync(buildGradlePath)) {
  let content = fs.readFileSync(buildGradlePath, 'utf8');

  // Exact target block in signingConfigs:
  const debugSigningConfig = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

  const updatedSigningConfigs = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file('release.keystore')
            storePassword 'serveasy123'
            keyAlias 'serveasy'
            keyPassword 'serveasy123'
        }
    }`;

  if (content.includes(debugSigningConfig)) {
    content = content.replace(debugSigningConfig, updatedSigningConfigs);
  }

  // Exact target block in buildTypes:
  content = content.replace(
    /signingConfig signingConfigs\.debug\s+def enableShrinkResources = findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\) \?: 'false'\s+shrinkResources enableShrinkResources\.toBoolean\(\)\s+minifyEnabled enableMinifyInReleaseBuilds/,
    `signingConfig signingConfigs.release
            shrinkResources false
            minifyEnabled false`
  );

  fs.writeFileSync(buildGradlePath, content, 'utf8');
  console.log('[configure-release-build] Successfully configured android/app/build.gradle for Standalone Release Build.');
} else {
  console.error('[configure-release-build] Error: android/app/build.gradle not found.');
  process.exit(1);
}

// 4. Patch MainApplication.kt to disable developer support in release mode
if (fs.existsSync(mainAppPath)) {
  let mainAppContent = fs.readFileSync(mainAppPath, 'utf8');
  
  const targetHostCall = `    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )`;

  const patchedHostCall = `    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
      useDevSupport = BuildConfig.DEBUG
    )`;

  if (mainAppContent.includes(targetHostCall)) {
    mainAppContent = mainAppContent.replace(targetHostCall, patchedHostCall);
    fs.writeFileSync(mainAppPath, mainAppContent, 'utf8');
    console.log('[configure-release-build] Successfully patched MainApplication.kt: useDevSupport = BuildConfig.DEBUG');
  } else {
    console.log('[configure-release-build] Target block in MainApplication.kt already patched or modified.');
  }
}

// 5. Ensure UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY is in AndroidManifest.xml
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY')) {
    manifest = manifest.replace(
      '</application>',
      '    <meta-data android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" android:value="{&quot;expo-channel-name&quot;:&quot;preview&quot;}"/>\n  </application>'
    );
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('[configure-release-build] Injected UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY into AndroidManifest.xml');
  } else {
    console.log('[configure-release-build] UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY already present in AndroidManifest.xml');
  }
}
