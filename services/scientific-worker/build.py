"""Reproducible, dependency-free worker archive; Python runtime is separately pinned."""
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent
expected = (root / ".python-version").read_text().strip()
if ".".join(map(str, sys.version_info[:3])) != expected:
    raise SystemExit(f"Scientific worker requires Python {expected}")
target = root / "dist" / "economyos-science.pyz"
target.parent.mkdir(exist_ok=True)
files = {str(path.relative_to(root)): path.read_bytes()
         for path in sorted((root / "economyos_science").glob("*.py"))}
files["__main__.py"] = b"from economyos_science.__main__ import main\nmain()\n"
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
    for name, content in sorted(files.items()):
        entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, content)
print(f"Built {target.name} with Python {expected}; no third-party dependencies")
