"""CSS bundling must preserve the complete, ordered existing theme."""
from pathlib import Path
from importlib import util
import hashlib
import re

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = util.spec_from_file_location("mtunz_css_builder", ROOT / "scripts" / "build_css.py")
builder = util.module_from_spec(spec)
spec.loader.exec_module(builder)


def test_real_css_bundle_keeps_source_and_original_order(tmp_path):
    source_dir = ROOT / "static"
    original_index = (source_dir / "index.html").read_text(encoding="utf8")
    files = builder.SOURCE_LINK.findall(original_index)
    assert len(files) >= 35
    filename, n = builder.bundle_styles(source_dir, tmp_path)
    assert n == len(files)
    assert filename.startswith("mtunz-styles-")
    combined = (tmp_path / filename).read_text(encoding="utf8")
    assert combined.startswith("@import url("), "Google Fonts import must remain first"
    assert combined.count("/* ===== ") == n - 1
    assert combined.find("/* ===== world-moderation.css") < combined.find("/* ===== world-experience.css")
    for name in files:
        assert (source_dir / name).read_text(encoding="utf8").lstrip("\ufeff").strip() in combined
    transformed = (tmp_path / "index.html").read_text(encoding="utf8")
    assert transformed.count('<link rel="stylesheet"') == 1
    assert f'/static/{filename}' in transformed
    assert '/static/app.js?v=20.5' in transformed, "JavaScript loading order unchanged"
    assert (source_dir / "index.html").read_text(encoding="utf8") == original_index
    assert hashlib.sha256(combined.encode("utf8")).hexdigest()[:16] in filename


def test_bundle_is_content_addressed_and_refuses_incorrect_css(tmp_path):
    source = tmp_path / "input"
    output = tmp_path / "output"
    source.mkdir()
    (source / "index.html").write_text(
        '<link rel="stylesheet" href="/static/first.css">\n'
        '<link rel="stylesheet" href="/static/second.css">\n'
        '<script src="/static/app.js" defer></script>\n', encoding="utf8")
    (source / "first.css").write_text("@import url('https://fonts.example/a.css');\n.a{color:red}", encoding="utf8")
    (source / "second.css").write_text(".b{color:blue}", encoding="utf8")
    name, count = builder.bundle_styles(source, output)
    assert count == 2
    assert "first.css" not in (output / "index.html").read_text()
    (source / "second.css").write_text(".b{color:green}", encoding="utf8")
    changed, count = builder.bundle_styles(source, tmp_path / "output2")
    assert name != changed and count == 2
    (source / "second.css").write_text("@import url('/bad.css');", encoding="utf8")
    with pytest.raises(ValueError, match="@import"):
        builder.bundle_styles(source, tmp_path / "refuse")
