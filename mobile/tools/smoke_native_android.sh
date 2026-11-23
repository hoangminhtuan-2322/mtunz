#!/usr/bin/env bash
set -euo pipefail
APK="android/app/build/outputs/apk/release/app-release.apk"
test -s "$APK"
AAPT="$ANDROID_HOME/build-tools/36.0.0/aapt"
test -x "$AAPT"
PACKAGE="$("$AAPT" dump badging "$APK" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")"
if [[ "$PACKAGE" != "com.mtunz.web" && "$PACKAGE" != "com.mtunz.web.preview" ]]; then
  echo "::error::Unexpected Android application package: $PACKAGE"
  exit 1
fi
adb install -r "$APK"
adb shell pm path "$PACKAGE" | grep -F 'package:'
adb logcat -c -b crash || true
adb shell am start -W -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER -p "$PACKAGE" | tee /tmp/mtunz-native-launch.txt
grep -Eq '^Status: ok$' /tmp/mtunz-native-launch.txt
sleep 12
pid="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
if [[ -z "$pid" ]]; then
  echo "::error::Native mtunz $PACKAGE process disappeared after launch."
  adb logcat -d -b crash || true
  exit 1
fi
echo "mtunz React Native process running with PID $pid"
adb logcat -d -b crash > /tmp/mtunz-native-crash.txt || true
if grep -Fq "Process: $PACKAGE," /tmp/mtunz-native-crash.txt ||
   grep -Fq "Unable to start activity ComponentInfo{$PACKAGE/" /tmp/mtunz-native-crash.txt; then
  echo "::error::Native mtunz crashed after launch."
  cat /tmp/mtunz-native-crash.txt
  exit 1
fi
echo "PASS: standalone native mtunz ($PACKAGE) launches without Chrome."
