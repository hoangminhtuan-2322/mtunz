"""Combine public CSS in its original cascade order at build time.

Source files are NOT deleted or rewritten. Render builds a fingerprinted CSS
bundle from all existing <link rel=stylesheet> tags, then replaces those tags
in the deployment copy of index.html. Git + Node unit tests still inspect the
unaltered source files. If a stylesheet cannot be safely bundled, fail build
rather than deploy an incomplete theme.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_LINK = re.compile(
    r'^[ \t]*<link rel="stylesheet" href="/static/([^"?]+\.css)(?:\?[^"]*)?">[ \t]*\n?',
    re.MULTILINE,
)
BUNDLED_LINK = re.compile(r'^\s*<link rel="stylesheet" href="/static/mtunz-styles-[a-f0-9]{16}\.css">\s*$', re.MULTILINE)


def bundle_styles(static_dir: Path, output_dir: Path | None = None) -> tuple[str, int]:
    static_dir = Path(static_dir)
    output_dir = Path(output_dir or static_dir)
    source = (static_dir / "index.html").read_text(encoding="utf8")
    links = list(SOURCE_LINK.finditer(source))
    if not links:
        if BUNDLED_LINK.search(source):
            return source, 0
        raise ValueError("No CSS links found; refusing to build an empty stylesheet")
    names = [m.group(1) for m in links]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate stylesheets: preserve order explicitly before bundling")
    contents = []
    for i, name in enumerate(names):
        # Reject paths outside static, URLs, absolute paths and symlinks.
        if "/" in name or "\\" in name or name.startswith("."):
            raise ValueError(f"Invalid CSS source name: {name!r}")
        f = static_dir / name
        if f.is_symlink() or not f.is_file():
            raise ValueError(f"CSS source missing or symlinked: {name}")
        text = f.read_text(encoding="utf8").lstrip("\ufeff")
        if re.search(r"@charset\b", text, re.I):
            raise ValueError(f"CSS @charset must be removed before concatenation: {name}")
        if i > 0 and re.search(r"@import\b", text, re.I):
            raise ValueError(f"CSS @import must come before other CSS rules: {name}")
        # Every sheet lives under /static/, so relative asset URLs keep their
        # original resolution. Preserve the first @import as the FIRST token.
        separator = "" if i == 0 else f"\n/* ===== {name} ===== */\n"
        contents.append(separator + text + "\n")
    combined = "".join(contents)
    digest = hashlib.sha256(combined.encode("utf8")).hexdigest()[:16]
    filename = f"mtunz-styles-{digest}.css"
    link = f'  <link rel="stylesheet" href="/static/{filename}">\n'
    # Replace only the first link with the bundle and remove other CSS links.
    start, end = links[0].span()
    new_source = source[:start] + link + source[end:]
    for old in links[1:]:
        # Recompute by exact matching string as indices changed above.
        new_source = new_source.replace(old.group(0), "", 1)
    if SOURCE_LINK.findall(new_source):
        raise RuntimeError("Unbundled CSS links remain")
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / filename).write_text(combined, encoding="utf8")
    (output_dir / "index.html").write_text(new_source, encoding="utf8")
    return filename, len(names)


if __name__ == "__main__":
    filename, count = bundle_styles(ROOT / "static")
    print(f"mtunz: {count} CSS files combined into /static/{filename}")
