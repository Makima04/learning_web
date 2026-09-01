"""数学做题本：按题裁原页 JPEG，刷题页直接显示，避免公式抽字/OCR 乱码。"""
from __future__ import annotations

from pathlib import Path

import fitz
from PIL import Image

SCALE = 1.55
JPEG_QUALITY = 54
PAD_PT = 3.0


def page_content_rect(page: fitz.Page, top: float, bottom: float) -> fitz.Rect:
    r = page.rect
    return fitz.Rect(r.x0 + 36, top, r.x1 - 36, bottom)


def render_clips(doc: fitz.Document, clips: list[tuple[int, float, float]], dest: Path) -> bool:
    """clips: [(pdf_page_1indexed, y0, y1), ...]，纵向拼成一张 JPEG。"""
    if not clips:
        return False
    images: list[Image.Image] = []
    for page_no, y0, y1 in clips:
        if page_no < 1 or page_no > doc.page_count:
            continue
        page = doc[page_no - 1]
        top = max(page.rect.y0 + 40, min(y0, y1) - PAD_PT)
        bot = min(page.rect.y1 - 28, max(y0, y1) + PAD_PT)
        if bot - top < 16:
            continue
        clip = page_content_rect(page, top, bot)
        pix = page.get_pixmap(
            matrix=fitz.Matrix(SCALE, SCALE),
            clip=clip,
            alpha=False,
            colorspace=fitz.csGRAY,
        )
        images.append(Image.frombytes("L", (pix.width, pix.height), pix.samples))
    if not images:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if len(images) == 1:
        images[0].save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return True
    width = max(im.width for im in images)
    height = sum(im.height for im in images)
    canvas = Image.new("L", (width, height), 255)
    y = 0
    for im in images:
        canvas.paste(im, (0, y))
        y += im.height
    canvas.save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return True


def pdf_y_from_norm_top(page: fitz.Page, top_frac: float) -> float:
    r = page.rect
    return r.y0 + top_frac * r.height
