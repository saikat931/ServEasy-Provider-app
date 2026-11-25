const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidAppDir = path.join(projectRoot, 'android', 'app');
const buildGradlePath = path.join(androidAppDir, 'build.gradle');
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

// 2. Patch android/app/build.gradle
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
