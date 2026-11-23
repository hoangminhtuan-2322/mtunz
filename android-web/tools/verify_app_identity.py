"""Guardrails for updates to the original mtunz Android 1.0.0 APK.

Source of truth: the user-supplied mtunz-android-1.0.0(1).apk:
  applicationId: com.mtunz.web
  versionCode: 1
  versionName: 1.0.0
  signing cert SHA-256:
    5D:DF:61:E2:71:82:93:40:CF:B4:17:85:D5:20:E9:C5:
    5A:18:51:E7:F3:7C:CC:F5:CB:1B:D2:64:48:D6:A4:5C

Never change the app's logo or signing identity without explicit owner approval.
The PNG stored in the repository is the source image; Android resource packing
can produce different compressed bytes in an APK without changing the artwork.
"""

import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ICON = ROOT / "android-web/app/src/main/res/drawable-nodpi/mtunz_icon.png"
GRADLE = ROOT / "android-web/app/build.gradle"
MANIFEST = ROOT / "android-web/app/src/main/AndroidManifest.xml"
STRINGS = ROOT / "android-web/app/src/main/res/values/strings.xml"
ASSETLINKS = ROOT / "static/android-assetlinks.json"

# Git object SHA-1 of the original PNG committed to mtunz main.
# This intentionally locks the exact current source artwork and cannot
# be updated automatically by a PNG optimizer or image generator.
LOCKED_ICON_GIT_SHA = "282a6971e38d51ce570b094e07d5624663bbedbb"
ORIGINAL_PACKAGE = "com.mtunz.web"
ORIGINAL_SIGNER_SHA256 = (
    "5D:DF:61:E2:71:82:93:40:CF:B4:17:85:D5:20:E9:C5:"
    "5A:18:51:E7:F3:7C:CC:F5:CB:1B:D2:64:48:D6:A4:5C"
)


def require(ok, message):
    if not ok:
        raise SystemExit("Android base-APK compatibility check failed: " + message)


def main():
    icon = ICON.read_bytes()
    git_sha = hashlib.sha1(f"blob {len(icon)}\0".encode() + icon).hexdigest()
    require(git_sha == LOCKED_ICON_GIT_SHA,
            "App logo has changed. Restore android-web/ app icon from the "
            "locked original source; do not replace it without owner approval.")

    gradle = GRADLE.read_text(encoding="utf-8")
    require(bool(re.search(r"\bapplicationId\s+['\"]com\.mtunz\.web['\"]", gradle)),
            "Package ID is no longer com.mtunz.web.")
    version_code = re.search(r"\bversionCode\s+(\d+)", gradle)
    require(version_code is not None and int(version_code.group(1)) > 1,
            "An update to the supplied versionCode=1 APK must increment versionCode.")
    version_name = re.search(r"\bversionName\s+['\"](\d+)\.(\d+)\.(\d+)['\"]", gradle)
    require(
        version_name is not None
        and tuple(map(int, version_name.groups())) > (1, 0, 0),
        "The new versionName must be newer than original 1.0.0."
    )

    manifest = ET.parse(MANIFEST).getroot()
    android_attr = "{http://schemas.android.com/apk/res/android}"
    app = manifest.find("application")
    require(app is not None and app.get(android_attr + "icon") == "@drawable/mtunz_icon",
            "App launcher icon is no longer the original mtunz logo.")
    activity = app.find("activity")
    require(activity is not None
            and activity.get(android_attr + "name") == ".MainActivity",
            "Trusted Web Activity entry point changed.")
    urls = [
        el.get(android_attr + "value")
        for el in activity.findall("meta-data")
        if el.get(android_attr + "name") ==
        "android.support.customtabs.trusted.DEFAULT_URL"
    ]
    require("https://mtunz.onrender.com/" in urls,
            "App no longer opens the mtunz website.")

    strings = ET.parse(STRINGS).getroot()
    name = next((s.text for s in strings.findall("string")
                 if s.get("name") == "app_name"), None)
    require(name == "mtunz", "App name changed.")

    assetlinks = json.loads(ASSETLINKS.read_text(encoding="utf-8"))
    require(any(
        item.get("target", {}).get("namespace") == "android_app"
        and item["target"].get("package_name") == ORIGINAL_PACKAGE
        and ORIGINAL_SIGNER_SHA256 in
            item["target"].get("sha256_cert_fingerprints", [])
        for item in assetlinks
    ), "Original installed app signing fingerprint removed from assetlinks.")

    print("OK: original APK identity, app logo, website origin and upgrade version preserved.")
    print("The release must still be signed with the original private key.")


if __name__ == "__main__":
    main()
