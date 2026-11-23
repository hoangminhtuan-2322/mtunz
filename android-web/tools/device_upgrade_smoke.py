"""Opt-in upgrade smoke test for one USB-connected PHYSICAL Android phone.

This tool keeps app data: no uninstall, clear, downgrade, or debug signing.
Manual login/chat/file/push/Admin verification is still required afterwards.
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
    p.add_argument("--apk", type=Path, required=True, help="Signed mtunz 1.0.1 release APK")
    p.add_argument("--serial", help="Optional adb device serial if more than one phone")
    args = p.parse_args()
    if not args.apk.is_file():
        p.error("Signed release APK not found")
    check_apk(args.apk)
    adb = shutil.which("adb")
    if not adb:
        p.error("adb missing: install Android SDK Platform Tools")
    devices = [line.split()[0] for line in cmd(adb, "devices").splitlines()[1:]
               if line.strip() and line.endswith("\tdevice")]
    if args.serial:
        if args.serial not in devices:
            p.error("Selected phone is not authorized and connected through adb")
        serial = args.serial
    else:
        if len(devices) != 1:
            p.error("Connect exactly one unlocked USB Android phone with USB debugging enabled")
        serial = devices[0]
    def phone(*parts):
        return cmd(adb, "-s", serial, *parts)

    before = phone("shell", "dumpsys", "package", PACKAGE)
    match = re.search(r"\bversionCode=(\d+)\b", before)
    if not match or match.group(1) != "1":
        raise SystemExit("ABORT: installed package must be the original mtunz 1.0.0, versionCode=1."
                         " No changes were made to this phone.")
    print("Original mtunz 1.0.0 found. Installing signed update WITHOUT clearing app data...")
    print(phone("install", "-r", str(args.apk.resolve())))
    after = phone("shell", "dumpsys", "package", PACKAGE)
    updated = re.search(r"\bversionCode=(\d+)\b", after)
    if not updated or int(updated.group(1)) <= 1:
        raise SystemExit("Update did not install as a newer version.")
    launch = phone("shell", "am", "start", "-W", "-n", ACTIVITY)
    if "Status: ok" not in launch:
        raise SystemExit("APK updated but launcher did not open successfully: " + launch[-500:])
    print("PASS: original package updated in place and launched; user data was NOT cleared.")
    print("IMPORTANT: Manually verify Chrome TWA fullscreen, login, chat realtime, file attachments, "
          "background notifications and Admin on this phone. A launch test cannot prove those features.")


if __name__ == "__main__":
    main()
