"""王道逐题核对标注：覆盖小节/关键词粗分，题干变化时要求重新核对。"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from wangdao_images import apply_question_image

ROOT = Path(__file__).resolve().parent.parent
OVERLAY_PATH = ROOT / "scripts/wangdao_item_overlay.json"


@lru_cache(maxsize=1)
def reviewed_items() -> dict[str, dict]:
    return json.loads(OVERLAY_PATH.read_text(encoding="utf-8"))["items"]


def apply_reviewed_overlay(question: dict) -> dict:
    apply_question_image(question)
    qid = question.get("id") or f"{question['book']}-{question['kind']}-{question['section']}-{question['qno']}"
    review = reviewed_items().get(qid)
    if review is None:
        return question
    digest = hashlib.sha256((question.get("stem") or "").encode()).hexdigest()
    if digest != review["stem_sha256"]:
        raise ValueError(f"{qid}: 题干已变化，请重新核对 wangdao_item_overlay.json")
    question.update(kp_ids=list(review["kp_ids"]), facets=list(review["facets"]),
                    classificationNote=review["review_note"], diagnostic_eligible=review.get("diagnostic_eligible", True))
    if review.get("primaryFacet"):
        question["primaryFacet"] = review["primaryFacet"]
    else:
        question.pop("primaryFacet", None)
    return question
