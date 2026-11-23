'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const build=read('.github/workflows/android-web-apk.yml');
const real=read('.github/workflows/android-web-physical-device.yml');
const play=read('.github/workflows/android-web-play-internal.yml');
const identity=read('android-web/tools/verify_app_identity.py');
const signer=read('android-web/tools/verify_release_artifact.py');
const device=read('android-web/tools/device_upgrade_smoke.py');
const gradle=read('android-web/app/build.gradle');
const manifest=read('android-web/app/src/main/AndroidManifest.xml');
const signing=JSON.parse(read('android-web/release-signing.json'));
const assetlinks=JSON.parse(read('static/android-assetlinks.json'));

const newCert='80:6A:14:7A:41:42:20:3F:05:EA:D8:C5:76:3D:4C:D5:59:C4:D6:CC:B9:EC:FF:02:BA:72:8D:59:AA:1A:8F:7B';
const originalCert='5D:DF:61:E2:71:82:93:40:CF:B4:17:85:D5:20:E9:C5:5A:18:51:E7:F3:7C:CC:F5:CB:1B:D2:64:48:D6:A4:5C';
assert(gradle.includes("applicationId 'com.mtunz.web'"));
assert(gradle.includes('versionCode 2'));
assert(gradle.includes("versionName '1.0.1'"));
assert(manifest.includes('android:icon="@drawable/mtunz_icon"'));
assert(identity.includes('LOCKED_ICON_GIT_SHA'),'Original icon must remain byte-for-byte unchanged');
assert(identity.includes('ORIGINAL_SIGNER_SHA256'),'Old Digital Asset Links must remain valid');
assert(signing.release_cert_sha256===newCert);
assert(signing.legacy_1_0_0_cert_sha256===originalCert);
const target=assetlinks.find(x=>x.target?.package_name==='com.mtunz.web');
assert(target);
assert(target.target.sha256_cert_fingerprints.includes(newCert));
assert(target.target.sha256_cert_fingerprints.includes(originalCert));
assert(signer.includes('RELEASE_CERT'));
assert(signer.includes('ABORT: APK certificate is not the NEW pinned mtunz signing key'));
assert(signer.includes('LEGACY_CERT'));
assert(device.includes('"install", "-r"') && !device.includes('"uninstall"'));
assert(device.includes('original mtunz 1.0.0 is installed'),'Must not automatically remove the old app');
assert(device.includes('check_apk(args.apk)'));

assert(build.includes("if: github.event_name == 'workflow_dispatch' && inputs.sign_release"),
 'Signing must be opt-in, not automatic on PR or push.');
assert(build.includes('python android-web/tools/verify_app_identity.py'));
assert(build.includes('python android-web/tools/verify_release_artifact.py'));
assert(build.includes('MTUNZ_ANDROID_WEB_KEYSTORE_BASE64'));
assert(build.includes('new_fingerprint'));
assert(build.includes('mtunz-web-android-RELEASE-new-fixed-key'));
assert(!build.includes('mtunz-web-android-PLAY-RELEASE-aab'),'Only build APK at this stage');
assert(!build.includes(':app:bundleRelease'),'Do not build unused AAB');
assert(build.includes('Smoke-test installation and launch on Android emulator'));

assert(real.includes('$'+'{{ github.token }}'),'Device test workflow inputs must expand.');
assert(real.includes('gcloud firebase test android run'));
assert(real.includes('--type robo'));
assert(real.includes("model.get('formFactor','').upper()!='PHYSICAL'"),'Never describe an emulator as a physical phone');
assert(real.includes('mtunz-web-android-RELEASE-new-fixed-key'));
assert(real.includes('mtunz-physical-device-qa'));
assert(real.includes('apk_sha256'));
// Old Google Play workflow intentionally disabled: user requested APK ONLY.
assert(play.includes('if: $'+'{{ false }}'),'Do not upload APK or AAB to Play automatically.');
assert(!/track:\s*production/i.test(play),'Never publish to Play production');
console.log('mtunz APK-only release: original logo, new stable key, safe install and CI safeguards verified.');
