from pathlib import Path
import os
import time
import zipfile

root = Path(__file__).resolve().parent.parent
folder = root / "午睡小森林"
zip_path = root / "午睡小森林.zip"

if not folder.is_dir():
    raise SystemExit("未找到要打包的文件夹")

zip_path.unlink(missing_ok=True)

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(folder.rglob("*")):
        arcname = path.relative_to(root).as_posix()
        info = zipfile.ZipInfo(arcname + ("/" if path.is_dir() else ""))
        info.create_system = 3
        info.date_time = time.localtime(path.stat().st_mtime)[:6]
        if path.is_dir():
            info.external_attr = 0o40755 << 16
            zf.writestr(info, b"")
            continue
        executable = os.access(path, os.X_OK) or path.suffix == ".command"
        info.external_attr = (0o100755 if executable else 0o100644) << 16
        zf.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
