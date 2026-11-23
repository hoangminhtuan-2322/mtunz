"""Safe USB install check for the NEW stable-key mtunz Android APK.

NEVER uninstall, wipe data or attempt to update the original 1.0.0 signed by
a different key. The user can first backup/verify synced server data and only
then explicitly remove 1.0.0 using Android Settings.
"""
import argparse
import re
import shutil
import subprocess
from pathlib import Path
from verify_release_artifact import check_apk

PACKAGE = "com.mtunz.web"
ACTIVITY = f"{PACKAGE}/.MainActivity"


def cmd(*args):
    proc = subprocess.run(args, text=True, capture_output=True)
    if proc.returncode:
        raise SystemExit(f"Command failed {args[0]}: {proc.stderr[-1000:]}")
    return proc.stdout.strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apk", type=Path, required=True, help="NEW stable-key mtunz 1.0.1 APK")
    p.add_argument("--serial", help="ADB device serial if multiple Android devices")
    args = p.parse_args()
    if not args.apk.is_file():
        p.error("Signed APK not found")
    check_apk(args.apk)
    adb = shutil.which("adb")
    if not adb:
        p.error("ADB missing: install Android SDK Platform Tools")
    devices = [line.split()[0] for line in cmd(adb, "devices").splitlines()[1:]
               if line.strip() and line.endswith("\tdevice")]
    if args.serial:
        if args.serial not in devices:
            p.error("Phone is not authorized/connected in ADB")
        serial = args.serial
    else:
        if len(devices) != 1:
            p.error("Connect exactly one unlocked Android phone with USB debugging")
        serial = devices[0]

    def phone(*parts):
        return cmd(adb, "-s", serial, *parts)

    before = phone("shell", "dumpsys", "package", PACKAGE)
    match = re.search(r"\bversionCode=(\d+)\b", before)
    if match and int(match.group(1)) == 1:
        raise SystemExit(
            "ABORT: original mtunz 1.0.0 is installed. Its signature is DIFFERENT "
            "from the owner-approved new key. Do NOT attempt an in-place upgrade. "
            "First confirm server-side chat/data is synced and arrange a backup. "
            "Only the device owner may explicitly uninstall the old app, later."
        )
    if match:
        print("Existing mtunz with versionCode", match.group(1),
              "— Android will refuse an update if its signing key differs.")
    else:
        print("No installed mtunz package. Installing NEW key APK...")
    # Android's built-in signature verification will reject incompatible updates.
    print(phone("install", "-r", str(args.apk.resolve())))
    launched = phone("shell", "am", "start", "-W", "-n", ACTIVITY)
    if "Status: ok" not in launched:
        raise SystemExit("Install completed but app launcher did not start: " + launched[-500:])
    print("PASS: new fixed-key mtunz APK installed and launcher opened.")
    print("Still manually verify login, realtime chat, files and background push.")


if __name__ == "__main__":
    main()
