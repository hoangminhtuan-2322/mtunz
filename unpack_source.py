#!/usr/bin/env python3
"""Safely unpack the verified MTUNZ source archive before Render's pip install."""
from pathlib import Path, PurePosixPath
import tarfile

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "mtunz-source.tar.xz"


def main() -> None:
    if not ARCHIVE.is_file():
        raise SystemExit(f"Missing source archive: {ARCHIVE.name}")

    with tarfile.open(ARCHIVE, mode="r:xz") as bundle:
        members = bundle.getmembers()

        # Reject traversal, links and special files. The uploaded archive contains
        # only ordinary files/directories, but validate every member before writing.
        checked = []
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts:
                raise SystemExit(f"Unsafe archive path: {member.name!r}")
            if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
                raise SystemExit(f"Unsupported archive entry: {member.name!r}")
            parts = tuple(part for part in name.parts if part not in ("", "."))
            target = ROOT.joinpath(*parts).resolve()
            if target != ROOT and ROOT not in target.parents:
                raise SystemExit(f"Archive path escapes project root: {member.name!r}")
            checked.append((member, target))

        for member, target in checked:
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = bundle.extractfile(member)
            if source is None:
                raise SystemExit(f"Cannot read archive member: {member.name!r}")
            with source, target.open("wb") as output:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
            target.chmod(member.mode & 0o755)

    required = [ROOT / "app.py", ROOT / "features.py", ROOT / "pg_storage.py",
                ROOT / "requirements.txt", ROOT / "static" / "index.html"]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Source archive is incomplete; missing: " + ", ".join(missing))
    print("MTUNZ source extracted and verified.")


if __name__ == "__main__":
    main()
