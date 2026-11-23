"""Validate signed APK and AAB identity before distribution.

These checks enforce the owner's NEW fixed release signing key. It is
NOT compatible with the original 1.0.0 signature. No private key is stored in this repo.
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

PACKAGE = "com.mtunz.web"
ROOT = Path(__file__).resolve().parents[2]
RELEASE_CERT = "806A147A4142203F05EAD8C5763D4CD559C4D6CCB9ECFF02BA728D59AA1A8F7B"
LEGACY_CERT = "5DDF61E271829340CFB41785D520E9C55A1851E7F37CCCF5CB1BD26448D6A45C"


def run(*args):
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode:
        raise SystemExit(f"{args[0]} failed: {proc.stderr[-1200:]}")
    return proc.stdout + "\n" + proc.stderr


def find_tool(name):
    path = shutil.which(name)
    if path:
        return path
    import os
    home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if home:
        candidates = sorted((Path(home) / "build-tools").glob(f"*/{name}"))
        if candidates:
            return str(candidates[-1])
    raise SystemExit(f"Required tool missing: {name}. Install Android SDK build-tools.")


def normalize(value):
    return re.sub(r"[^0-9A-F]", "", value.upper())


def check_apk(path):
    apksigner, aapt = find_tool("apksigner"), find_tool("aapt")
    result = run(apksigner, "verify", "--verbose", "--print-certs", str(path))
    matches = re.findall(r"Signer #\d+ certificate SHA-256 digest:\s*([A-Fa-f0-9:]+)", result)
    if len(matches) != 1 or normalize(matches[0]) != RELEASE_CERT:
        raise SystemExit("ABORT: APK certificate is not the NEW pinned mtunz signing key.")
    badging = run(aapt, "dump", "badging", str(path))
    m = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not m or m.group(1) != PACKAGE or int(m.group(2)) <= 1:
        raise SystemExit("ABORT: package must be com.mtunz.web, versionCode > 1.")
    print(f"PASS: installable APK {PACKAGE}, v{m.group(3)} ({m.group(2)}), new fixed signing key.")


def check_bundle(path):
    keytool = find_tool("keytool")
    result = run(keytool, "-printcert", "-jarfile", str(path))
    m = re.search(r"SHA256:\s*([A-Fa-f0-9:]+)", result)
    if not m or normalize(m.group(1)) != RELEASE_CERT:
        raise SystemExit("ABORT: signed AAB certificate is not the NEW pinned mtunz signing key.")
    print("PASS: Play AAB is signed with the new fixed mtunz signing key (upload key).")
    print("WARNING: New-key releases are not installable over the original 1.0.0 APK. If using Play later, configure the Play app signing certificate deliberately.")


def main():
    import json
    signing = json.loads((ROOT / "android-web/release-signing.json").read_text(encoding="utf-8"))
    if (normalize(signing.get("release_cert_sha256", "")) != RELEASE_CERT
            or normalize(signing.get("legacy_1_0_0_cert_sha256", "")) != LEGACY_CERT
            or signing.get("package_name") != PACKAGE):
        raise SystemExit("Pinned new/legacy Android certificate configuration does not match the verifier.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path)
    parser.add_argument("--aab", type=Path)
    opts = parser.parse_args()
    if not opts.apk and not opts.aab:
        parser.error("At least one of --apk or --aab is required")
    for file in (opts.apk, opts.aab):
        if file and not file.is_file():
            parser.error(f"Missing artifact {file}")
    if opts.apk:
        check_apk(opts.apk)
    if opts.aab:
        check_bundle(opts.aab)


if __name__ == "__main__":
    main()
