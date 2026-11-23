"""Regression checks for release-APK certificate parsing from apksigner v36."""
import importlib.util
from pathlib import Path

import pytest


root = Path(__file__).resolve().parents[1]
path = root / "android-web/tools/verify_release_artifact.py"
spec = importlib.util.spec_from_file_location("mtunz_android_release_verifier", path)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

CERT = "806a147a4142203f05ead8c5763d4cd559c4d6ccb9ecff02ba728d59aa1a8f7b"
OTHER = "ff" * 32
SIGNED_OUTPUT = (
    "Verified using v2 scheme (APK Signature Scheme v2): true\n"
    "Verified using v3 scheme (APK Signature Scheme v3): true\n"
    "Number of signers: 1\n"
    f"Signer #1 certificate SHA-256 digest: {CERT}\n"
)
BADGING = "package: name='com.mtunz.web' versionCode='2' versionName='1.0.1'\n"


def test_parses_real_android_sdk_36_cert_output():
    assert verifier.apk_certificate_digests(SIGNED_OUTPUT) == [CERT.upper()]


def test_deduplicates_identical_v2_v3_cert_reports():
    assert verifier.apk_certificate_digests(SIGNED_OUTPUT * 2) == [CERT.upper()]


def test_refuses_unknown_or_multiple_distinct_signers(monkeypatch, tmp_path):
    apk = tmp_path / "test.apk"
    apk.write_bytes(b"not a real apk - mocked apksigner success in this test only")
    monkeypatch.setattr(verifier, "find_tool", lambda tool: tool)

    def mock_apksigner(*args):
        return SIGNED_OUTPUT.replace(CERT, OTHER) if args[0] == "apksigner" else BADGING

    monkeypatch.setattr(verifier, "run", mock_apksigner)
    with pytest.raises(SystemExit, match="Actual:"):
        verifier.check_apk(apk)

    def two_signers(*args):
        return SIGNED_OUTPUT + SIGNED_OUTPUT.replace(CERT, OTHER) if args[0] == "apksigner" else BADGING

    monkeypatch.setattr(verifier, "run", two_signers)
    with pytest.raises(SystemExit, match="Actual:"):
        verifier.check_apk(apk)


def test_accepts_pinned_signer_even_if_reported_twice(monkeypatch, tmp_path):
    apk = tmp_path / "test.apk"
    apk.write_bytes(b"not a real apk - mocked apksigner success in this test only")
    monkeypatch.setattr(verifier, "find_tool", lambda tool: tool)
    monkeypatch.setattr(
        verifier, "run",
        lambda *args: SIGNED_OUTPUT * 2 if args[0] == "apksigner" else BADGING,
    )
    verifier.check_apk(apk)


def test_prefers_android_sdk_36_tools_over_older_system_install(tmp_path, monkeypatch):
    sdk = tmp_path / "android-sdk"
    build = sdk / "build-tools" / "36.0.0"
    build.mkdir(parents=True)
    for tool in ("apksigner", "aapt"):
        (build / tool).write_bytes(b"dummy bin")
    monkeypatch.setenv("ANDROID_HOME", str(sdk))
    monkeypatch.setenv("PATH", "")
    assert verifier.find_tool("apksigner") == str(build / "apksigner")
    assert verifier.find_tool("aapt") == str(build / "aapt")
