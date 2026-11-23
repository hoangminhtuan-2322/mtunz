'use strict';

/**
 * Expo prebuild generates android/app/build.gradle. Set its RELEASE-only
 * signing config to the existing, permanently pinned mtunz web/APK key.
 * Never writes secrets to source or prints credentials.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const keys = [
  'MTUNZ_NATIVE_KEYSTORE_PATH',
  'MTUNZ_NATIVE_KEYSTORE_PASSWORD',
  'MTUNZ_NATIVE_KEY_ALIAS',
  'MTUNZ_NATIVE_KEY_PASSWORD',
];
if (process.argv.includes('--release')) {
  for (const key of keys) {
    if (!process.env[key]) throw new Error('Missing private signing setting: ' + key);
  }
  if (!fs.existsSync(process.env.MTUNZ_NATIVE_KEYSTORE_PATH))
    throw new Error('Private release keystore file is missing.');
}

let gradle = fs.readFileSync(file, 'utf8');
if (!gradle.includes('signingConfigs {') || !gradle.includes('buildTypes {'))
  throw new Error('Unexpected Expo Android Gradle template. Refusing to guess.');

if (!gradle.includes('mtunzFixedRelease {')) {
  const anchor = 'signingConfigs {';
  const pos = gradle.indexOf(anchor) + anchor.length;
  const releaseConfig = `
        // Fixed mtunz release key. Values come from GitHub Actions secrets.
        mtunzFixedRelease {
            storeFile file(System.getenv('MTUNZ_NATIVE_KEYSTORE_PATH'))
            storePassword System.getenv('MTUNZ_NATIVE_KEYSTORE_PASSWORD')
            keyAlias System.getenv('MTUNZ_NATIVE_KEY_ALIAS')
            keyPassword System.getenv('MTUNZ_NATIVE_KEY_PASSWORD')
        }`;
  gradle = gradle.slice(0, pos) + releaseConfig + gradle.slice(pos);
}
const buildTypes = gradle.indexOf('buildTypes {');
const releaseStart = gradle.indexOf('release {', buildTypes);
if (releaseStart === -1) throw new Error('Missing Android release buildType.');
const debugSigning = gradle.indexOf('signingConfig signingConfigs.debug', releaseStart);
const otherRelease = gradle.indexOf('signingConfig signingConfigs.mtunzFixedRelease', releaseStart);
if (debugSigning === -1 && otherRelease === -1)
  throw new Error('Cannot find release signingConfig; refusing an unsigned/mis-signed APK.');
if (debugSigning !== -1) {
  gradle = gradle.slice(0, debugSigning) +
    'signingConfig signingConfigs.mtunzFixedRelease' +
    gradle.slice(debugSigning + 'signingConfig signingConfigs.debug'.length);
}
fs.writeFileSync(file, gradle);
if (!gradle.includes('signingConfig signingConfigs.mtunzFixedRelease'))
  throw new Error('Failed to apply fixed mtunz signing config.');
console.log('Configured native Android release to use the pinned permanent mtunz signing key.');
