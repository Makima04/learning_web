#!/usr/bin/env python3
"""修复张宇基础高数第18章15、16题的裁图边界。

第15题尾部混入第16题的条件，第16题顶部缺2像素。原PDF已不在本地，
用两图重叠的12行对齐并还原；题干和公式均取原扫描图，不重新识别。
源图哈希用于防止对新版扫描图误裁，修复后可重复执行。

用法：.venv/bin/python3 scripts/repair_zhangyu_surface_images.py
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "frontend" / "public" / "math" / "img" / "zy"
SOURCE_HASHES = (
    "ff2a2bc2793fe3e3cf38172ff400b917e4a8cf8b0124721b7f64c1a62d019b0d",
    "1d716eb997a566a9db51c2a3329cd9342cab1099f1323c596bdd7e329e02f3af",
)
REPAIRED_HASHES = (
    "c456108a2cddfc985f028d9268cac0a99c05d0cc6f3119ec3d6200cfbd29a5e5",
    "23a7c68b89a398cc6ee71b4d2b6f4872995f370b2926af5f5705a2c8fca3eab7",
)


def repair_images(img_dir: Path = IMG_DIR) -> None:
    paths = [img_dir / f"zy-base-hs-18-{qno}.jpg" for qno in (15, 16)]
    originals = [path.read_bytes() for path in paths]
    hashes = tuple(hashlib.sha256(data).hexdigest() for data in originals)
    if hashes == REPAIRED_HASHES:
        return
    if hashes != SOURCE_HASHES:
        raise ValueError("第18章15、16题的源图已变化，请先核对边界，未修改任何题图")

    a, b = [Image.open(io.BytesIO(data)).convert("L") for data in originals]
    # 第15题顶部0..3是上一题积分下标的重叠残留；14..105才是本题正文。
    q15 = Image.new("L", (812, 114), 255)
    q15.paste(a.crop((0, 4, 812, 106)), (0, 0))

    # a[122:134]与b[0:12]重叠；仅补回缺的a[120:122]，公式接缝不加间距。
    # 第16题正文到第113行结束，其后全是原页留白。
    q16 = Image.new("L", (812, 138), 255)
    q16.paste(a.crop((0, 120, 812, 122)), (0, 10))
    q16.paste(b.crop((0, 0, 812, 114)), (0, 12))

    repaired = []
    for im in (q15, q16):
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=95, optimize=True)
        repaired.append(buf.getvalue())

    backup = ROOT / "tmp" / "surface-image-originals"
    backup.mkdir(parents=True, exist_ok=True)
    for path, original, output in zip(paths, originals, repaired):
        saved = backup / path.name
        if not saved.exists():
            saved.write_bytes(original)
        path.write_bytes(output)
        print(f"已修复 {path.name}")


if __name__ == "__main__":
    repair_images()
