#!/usr/bin/env python3
"""把王道 / 李林880 / 张宇1000 整包目录拆成 index + 分片。

index：去掉 stem/options，供考点计数、排队（gzip 约 25KB）。
分片：王道按书（ds/os/cn/co），数学按 part-section 章节。
抽题脚本写完整包 JSON 后应再跑本脚本。

用法：
  python3 scripts/split_practice_catalogs.py
  python3 scripts/split_practice_catalogs.py frontend/public/math/lilin880.json
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"

CATALOGS = [
    PUBLIC / "cs408" / "wangdao2027.json",
    PUBLIC / "math" / "lilin880.json",
    PUBLIC / "math" / "zhangyu1000.json",
]

SLIM_DROP = frozenset({"stem", "options"})
SAFE_KEY = re.compile(r"^[A-Za-z0-9._-]+$")


def shard_key(item: dict) -> str:
    src = item.get("source")
    if src in ("lilin880", "zhangyu1000"):
        part = item.get("part") or "base"
        section = item.get("section")
        if section is None or section == "":
            return f"{part}-misc"
        return f"{part}-{section}"
    book = item.get("book") or "misc"
    return str(book)


def slim_item(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in SLIM_DROP}


def dump(path: Path, data) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def split_public_catalog(catalog_path: Path) -> Path:
    catalog_path = Path(catalog_path)
    if not catalog_path.is_file():
        raise FileNotFoundError(catalog_path)
    items = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError(f"{catalog_path} 不是题目数组")

    out_dir = catalog_path.with_suffix("")
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()

    groups: dict[str, list] = defaultdict(list)
    for q in items:
        key = shard_key(q)
        if not SAFE_KEY.match(key):
            raise ValueError(f"不安全的分片名 {key!r} ({q.get('id')})")
        groups[key].append(q)

    shards = []
    for key in sorted(groups):
        filename = f"{key}.json"
        dump(out_dir / filename, groups[key])
        shards.append({"key": key, "file": filename, "count": len(groups[key])})

    index = {
        "ver": "split-20260903a",
        "count": len(items),
        "shards": shards,
        "items": [slim_item(q) for q in items],
    }
    dump(out_dir / "index.json", index)
    print(
        f"split {catalog_path.name}: {len(items)} 题 -> {len(shards)} 分片 + index "
        f"({out_dir.relative_to(ROOT)})"
    )
    return out_dir


def split_all() -> None:
    for path in CATALOGS:
        if path.is_file():
            split_public_catalog(path)
        else:
            print(f"skip missing {path}")


def main(argv: list[str]) -> int:
    if argv:
        for raw in argv:
            split_public_catalog(Path(raw))
        return 0
    split_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
