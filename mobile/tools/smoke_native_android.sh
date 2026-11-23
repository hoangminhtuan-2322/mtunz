#!/usr/bin/env bash
# Validate a standalone React Native app, not an Android Browser Helper wrapper.
set -euo pipefail
APK="android/app/build/outputs/apk/release/app-release.apk"
test -s "$APK"
adb install -r "$APK"
adb shell pm path com.mtunz.web | grep -F 'package:'
adb logcat -c -b crash || true
adb shell am start -W -n com.mtunz.web/.MainActivity | tee /tmp/mtunz-native-launch.txt
grep -Eq '^Status: ok$' /tmp/mtunz-native-launch.txt
sleep 12
# In contrast to a TWA, the actual mtunz process must remain alive: the
# launcher must not immediately disappear into com.android.chrome.
pid="$(adb shell pidof com.mtunz.web | tr -d '\r')"
if [[ -z "$pid" ]]; then
  echo '::error::Native mtunz process is not running after launch.'
  adb logcat -d -b crash || true
  exit 1
fi
echo "mtunz React Native process is running with PID $pid"
adb shell dumpsys activity activities | grep -F 'com.mtunz.web' | head -12 || true
adb logcat -d -b crash > /tmp/mtunz-native-crash.txt || true
if grep -Eq 'Process: com[.]mtunz[.]web,|Unable to start activity ComponentInfo[{]com[.]mtunz[.]web/' /tmp/mtunz-native-crash.txt; then
  echo '::error::Native mtunz crashed after launch.'
  cat /tmp/mtunz-native-crash.txt
  exit 1
fi
echo 'PASS: standalone native mtunz Android launches without Chrome or crash.'
