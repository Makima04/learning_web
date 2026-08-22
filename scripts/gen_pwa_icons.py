#!/usr/bin/env python3
"""生成 PWA 图标（frontend/public/icons/）。

主色与全站绿主色 HSL(152,48%,38%) ≈ #32a67a 对齐：圆角方块 + 白色「红」字。
依赖 .venv 中的 Pillow：.venv/bin/python3 scripts/gen_pwa_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 与 tailwind 主色 hsl(152 48% 38%) 换算一致
BG = (50, 166, 122)  # #32a67a
FG = (255, 255, 255)
SIZES = {180: "icon-180.png", 192: "icon-192.png", 512: "icon-512.png"}
# maskable 需满出血方形（无圆角无透明），字形收进 80% 安全区内
MASKABLE_SIZES = {192: "icon-192-maskable.png", 512: "icon-512-maskable.png"}

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"

# macOS 常见字体路径，取第一个存在的
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("未找到可用中文字体，请往 FONT_CANDIDATES 里加一条本机字体路径")


def make_icon(px: int, out: Path, glyph_ratio: float = 0.62, rounded: bool = True) -> None:
    scale = 4  # 超采样抗锯齿
    size = px * scale
    if rounded:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=BG + (255,))
    else:
        img = Image.new("RGBA", (size, size), BG + (255,))
        draw = ImageDraw.Draw(img)
    font = load_font(int(size * glyph_ratio))
    # 依据实际字形垂直居中
    bbox = draw.textbbox((0, 0), "红", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), "红", font=font, fill=FG + (255,))
    img = img.resize((px, px), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"{out} ({px}x{px})")


def main() -> None:
    for px, name in SIZES.items():
        make_icon(px, OUT_DIR / name)
    for px, name in MASKABLE_SIZES.items():
        make_icon(px, OUT_DIR / name, glyph_ratio=0.56, rounded=False)


if __name__ == "__main__":
    main()
