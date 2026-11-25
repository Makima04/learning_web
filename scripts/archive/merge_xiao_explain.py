#!/usr/bin/env python3
"""把各科 *.explain.json 合并进 {subject}.kp.json 和 frontend/public/politics/xiao1000.kp.json。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "papers" / "politics" / "xiao1000"
PUBLIC = ROOT / "frontend" / "public" / "politics" / "xiao1000.kp.json"
QUESTIONS_PUBLIC = ROOT / "frontend" / "public" / "politics" / "xiao1000.json"
CHUNK_DIR = ROOT / "frontend" / "public" / "politics" / "xiao1000"
CATALOG_PUBLIC = ROOT / "frontend" / "public" / "politics" / "xiao1000.index.json"

SUBJECTS = ["marx", "mao", "xi", "history", "moral"]
PATCH_FILES = {
    "marx": ["marx.explain.json"],
    "mao": ["mao.explain.json"],
    "xi": ["xi.explain.a.json", "xi.explain.b.json", "xi.explain.json"],
    "history": ["history.explain.json"],
    "moral": ["moral.explain.json"],
}
SUBJECT_META = {
    "marx": ("马原", "理解题，先把概念钉死再做多选"),
    "mao": ("毛中特", "革命道路、改造、探索，记忆+对比"),
    "xi": ("新思想", "中国式现代化、新质生产力、最新提法"),
    "history": ("史纲", "会议、文件、阶段意义，易混对比"),
    "moral": ("思法", "人生价值、道德、法治运行"),
}


def load_json(path: Path):
    return json.loads(path.read_text())


def dump_indent(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def dump_compact(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def chapter_key(item: dict) -> tuple[int | None, str]:
    return item.get("chapter_no"), item.get("chapter") or "未分章"


def build_chunks_and_catalog(questions: list[dict], kps: list[dict]) -> None:
    catalog = {"version": 1, "subjects": []}
    for subject in SUBJECTS:
        subject_questions = [q for q in questions if q.get("subject") == subject]
        subject_kps = [kp for kp in kps if kp.get("subject") == subject]
        dump_compact(CHUNK_DIR / f"{subject}.json", {"questions": subject_questions, "kps": subject_kps})

        chapters: dict[tuple[int | None, str], dict] = {}

        for item in subject_questions:
            key = chapter_key(item)
            chapter = chapters.setdefault(
                key,
                {
                    "chapter_no": key[0],
                    "chapter": key[1],
                    "questionCount": 0,
                    "kpCount": 0,
                },
            )
            chapter["questionCount"] += 1

        for item in subject_kps:
            key = chapter_key(item)
            chapter = chapters.setdefault(
                key,
                {
                    "chapter_no": key[0],
                    "chapter": key[1],
                    "questionCount": 0,
                    "kpCount": 0,
                },
            )
            chapter["kpCount"] += 1
        chapter_list = sorted(
            chapters.values(),
            key=lambda item: (
                item["chapter_no"] is None,
                item["chapter_no"] if item["chapter_no"] is not None else 99,
                item["chapter"],
            ),
        )
        label, hint = SUBJECT_META[subject]
        catalog["subjects"].append(
            {
                "id": subject,
                "label": label,
                "hint": hint,
                "questionCount": len(subject_questions),
                "kpCount": len(subject_kps),
                "chapters": chapter_list,
            }
        )
    dump_compact(CATALOG_PUBLIC, catalog)


def load_patches(subject: str) -> dict:
    merged: dict = {}
    for name in PATCH_FILES[subject]:
        path = SRC / name
        if not path.exists():
            continue
        data = load_json(path)
        if not isinstance(data, dict):
            raise SystemExit(f"{path} 必须是 {{id: payload}} 对象")
        merged.update(data)
    return merged


def validate_payload(kp_id: str, payload: dict) -> list[str]:
    errors = []
    explain = payload.get("explain")
    checks = payload.get("checks")
    if not isinstance(explain, list) or len(explain) < 3:
        errors.append(f"{kp_id}: explain 少于 3 段")
    else:
        for i, sec in enumerate(explain):
            if not isinstance(sec, dict) or not str(sec.get("title") or "").strip() or not str(sec.get("body") or "").strip():
                errors.append(f"{kp_id}: explain[{i}] 缺 title/body")
    if not isinstance(checks, list) or len(checks) < 3:
        errors.append(f"{kp_id}: checks 少于 3 题")
    else:
        answers = []
        for i, c in enumerate(checks):
            if not isinstance(c, dict) or not str(c.get("prompt") or "").strip() or not isinstance(c.get("answer"), bool):
                errors.append(f"{kp_id}: checks[{i}] 缺 prompt/boolean answer")
            else:
                answers.append(c["answer"])
        if answers and (all(answers) or not any(answers)):
            errors.append(f"{kp_id}: checks 不要全对或全错")
    return errors


def main() -> int:
    errors: list[str] = []
    missing: list[str] = []
    patched = 0
    public = load_json(PUBLIC)
    questions = load_json(QUESTIONS_PUBLIC)
    public_by_id = {k["id"]: i for i, k in enumerate(public)}

    for subject in SUBJECTS:
        kp_path = SRC / f"{subject}.kp.json"
        kps = load_json(kp_path)
        patches = load_patches(subject)
        for kp in kps:
            kid = kp["id"]
            payload = patches.get(kid)
            if payload is None:
                if kp.get("explain") and kp.get("checks"):
                    continue
                missing.append(kid)
                continue
            errors.extend(validate_payload(kid, payload))
            for field in ("explain", "checks", "summary", "bullets", "confusions"):
                if field in payload:
                    kp[field] = payload[field]
            patched += 1
            if kid in public_by_id:
                pub = public[public_by_id[kid]]
                for field in ("explain", "checks", "summary", "bullets", "confusions"):
                    if field in kp:
                        pub[field] = kp[field]
        dump_indent(kp_path, kps)

    dump_compact(PUBLIC, public)
    build_chunks_and_catalog(questions, public)

    print(f"merged patches into {patched} cards")
    print(f"public cards: {len(public)}")
    if missing:
        print(f"MISSING {len(missing)}")
        for kid in missing:
            print("  ", kid)
    if errors:
        print(f"WARN {len(errors)}")
        for e in errors[:40]:
            print("  ", e)
        if len(errors) > 40:
            print(f"  ... {len(errors) - 40} more")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
