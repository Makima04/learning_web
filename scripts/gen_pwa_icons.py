#!/usr/bin/env python3
"""从 512×512 的祥子原图生成浏览器和主屏幕图标。

依赖 .venv 中的 Pillow：.venv/bin/python3 scripts/gen_pwa_icons.py
"""
from pathlib import Path

from PIL import Image

ICONS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
SOURCE = ICONS_DIR / "sakiko-512.png"
BACKGROUND = (251, 238, 216)  # 与客服小祥原图的奶油色边缘匹配


def main() -> None:
    with Image.open(SOURCE) as source:
        artwork = source.convert("RGB")

    for size in (32, 180, 192):
        image = artwork.resize((size, size), Image.Resampling.LANCZOS)
        image.save(ICONS_DIR / f"sakiko-{size}.png", optimize=True)

    for size in (192, 512):
        # 满铺底色，缩小头像以给 Android 的圆形裁切留出空间。
        inset_size = round(size * 0.69)
        portrait = artwork.resize((inset_size, inset_size), Image.Resampling.LANCZOS)
        icon = Image.new("RGB", (size, size), BACKGROUND)
        margin = (size - inset_size) // 2
        icon.paste(portrait, (margin, margin))
        icon.save(ICONS_DIR / f"sakiko-{size}-maskable.png", optimize=True)


if __name__ == "__main__":
    main()
