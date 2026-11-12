"""王道原题图映射；重建目录或重新抽题时仍保留完整题面。"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE_MANIFEST = ROOT / "scripts/wangdao_question_images.json"


@lru_cache(maxsize=1)
def question_images() -> dict[str, dict]:
    return json.loads(IMAGE_MANIFEST.read_text(encoding="utf-8"))["items"]


def apply_question_image(question: dict) -> dict:
    qid = question.get("id") or f"{question['book']}-{question['kind']}-{question['section']}-{question['qno']}"
    image = question_images().get(qid)
    if image is not None:
        if question.get("book_ans_page") not in (image["book_ans_page"], image.get("previous_book_ans_page", image["book_ans_page"])):
            raise ValueError(f"{qid}: 原书答案页与原题图不一致，请重新核对")
        question.update(img=image["img"], pdf_page=image["pdf_page"], book_ans_page=image["book_ans_page"])
        if "pdf_edition" in question:
            question["pdf_edition"] = image.get("pdf_edition", "单题")
    return question
