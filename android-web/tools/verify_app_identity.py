"""Guardrails for original mtunz logo/package and the new stable signing key.

Source of truth: the user-supplied mtunz-android-1.0.0(1).apk:
  applicationId: com.mtunz.web
  versionCode: 1
  versionName: 1.0.0
  signing cert SHA-256:
    5D:DF:61:E2:71:82:93:40:CF:B4:17:85:D5:20:E9:C5:
    5A:18:51:E7:F3:7C:CC:F5:CB:1B:D2:64:48:D6:A4:5C

The owner approved a new stable signing key because the legacy private key is unavailable.
Do not change the app logo, package ID or NEW signing identity after this release.
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
SIGNING = ROOT / "android-web/release-signing.json"

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

    signing = json.loads(SIGNING.read_text(encoding="utf-8"))
    new_cert = "80:6A:14:7A:41:42:20:3F:05:EA:D8:C5:76:3D:4C:D5:59:C4:D6:CC:B9:EC:FF:02:BA:72:8D:59:AA:1A:8F:7B"
    require(signing.get("package_name") == ORIGINAL_PACKAGE
            and signing.get("release_cert_sha256") == new_cert
            and signing.get("legacy_1_0_0_cert_sha256") == ORIGINAL_SIGNER_SHA256,
            "Pinned original or new signing certificate changed.")
    require(any(
        item.get("target", {}).get("namespace") == "android_app"
        and item["target"].get("package_name") == ORIGINAL_PACKAGE
        and new_cert in item["target"].get("sha256_cert_fingerprints", [])
        for item in assetlinks
    ), "New fixed release certificate missing from Digital Asset Links.")

    print("OK: original mtunz logo, package ID and website origin preserved.")
    print("OK: new fixed signing cert pinned; legacy certificate remains authorized.")
    print("NOTE: new-key releases cannot install over the original 1.0.0 APK.")


if __name__ == "__main__":
    main()
