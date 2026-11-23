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
    """Prefer the SAME pinned SDK tool used by the successful signing step.

    Ubuntu runners may also include distro apksigner on PATH; its output may
    differ from Android SDK 36. A release verifier must use the SDK 36 binary
    rather than silently selecting another tool version.
    """
    import os
    home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if home and name in ("apksigner", "aapt"):
        pinned = Path(home) / "build-tools" / "36.0.0" / name
        if pinned.is_file():
            return str(pinned)
    if home:
        candidates = sorted((Path(home) / "build-tools").glob(f"*/{name}"))
        if candidates:
            return str(candidates[-1])
    path = shutil.which(name)
    if path:
        return path
    raise SystemExit(f"Required tool missing: {name}. Install Android SDK build-tools.")


def normalize(value):
    return re.sub(r"[^0-9A-F]", "", value.upper())


def apk_certificate_digests(output):
    """Parse apksigner output without relaxing actual cryptographic validation.

    Some tool versions repeat signing-certificate diagnostics on stdout/stderr
    and/or show multiple signature schemes. Identical copies do not represent
    different signers. Every distinct digest must still match the pinned key.
    """
    digests = []
    for line in output.splitlines():
        match = re.search(
            r"Signer\s*#\s*\d+\s+certificate\s+SHA-256\s+digest\s*:\s*"
            r"([A-Fa-f0-9:]+)",
            line,
            flags=re.IGNORECASE,
        )
        if match:
            value = normalize(match.group(1))
            if len(value) == 64:
                digests.append(value)
    return sorted(set(digests))


def check_apk(path):
    apksigner, aapt = find_tool("apksigner"), find_tool("aapt")
    result = run(apksigner, "verify", "--verbose", "--print-certs", str(path))
    fingerprints = apk_certificate_digests(result)
    if fingerprints != [RELEASE_CERT]:
        found = ", ".join(fingerprints) if fingerprints else "(not reported by apksigner)"
        # Never print secrets. The signer digest lines and tool path are public
        # release metadata needed to debug differing SDK/distro tool output.
        lines = [line.strip() for line in result.splitlines()
                 if any(marker in line.lower() for marker in
                        ("sha-256", "signer", "certificate", "number of signers"))]
        raise SystemExit(
            "ABORT: APK certificate is not the NEW pinned mtunz signing key. "
            "Actual: " + found + "; Expected: " + RELEASE_CERT
            + "; verifier: " + str(apksigner)
            + "; apksigner output: " + " | ".join(lines[:20])
        )
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
