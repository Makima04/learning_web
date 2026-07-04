#!/usr/bin/env python3
# clean_sentences.py — 一次性迁移：清洗 sentences 表里的格式噪声
#
# 噪声类型见 match_vocab.clean_sentence_text 的注释（句首题号 / 中文括注 /
# 页眉 / 分值碎片 / 句中 (NN)）。papers.js 已重生成干净，DB 里仍是旧脏文本。
# 若不清洗 DB，前端发干净文本 → 后端 sentences.text 精确匹配不到 → 新建行 +
# 重翻译 → 3302 条缓存译文全废 + 重复计费。
#
# 策略：就地 UPDATE + 去重，保留 translations 里的缓存译文。
#   - 空桶（清洗后变空，如 "(20 points)"）：连 translations 一起删。
#   - 唯一桶（1 条原 text → 1 条 clean）：UPDATE text，译文不动。
#   - 碰撞桶（多条原 text → 同一 clean）：保留「有译文」者（或 id 最小者）
#     UPDATE 为 clean；其余连 translations 删除（被删者文本与保留者一致，无损）。
# 幂等：重跑 0 行变更。
#
# 用法：
#   .venv/bin/python3 scripts/clean_sentences.py             # dry-run，打印 diff
#   .venv/bin/python3 scripts/clean_sentences.py --apply     # 执行迁移

import argparse
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# 复用 match_vocab 的清洗逻辑（CLAUDE.md 约定：逻辑两处保持一致，不要复制粘贴）
sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_vocab import clean_sentence_text  # noqa: E402

DB_PATH = Path(__file__).resolve().parent.parent / "english_web.db"


def fetch_rows(conn):
    """返回 [(id, text, has_translation: bool)]。"""
    rows = conn.execute(
        "SELECT s.id, s.text, "
        "EXISTS(SELECT 1 FROM translations t WHERE t.sentence_id = s.id) AS has_t "
        "FROM sentences s"
    ).fetchall()
    return [(r[0], r[1] or "", bool(r[2])) for r in rows]


def plan(rows):
    """把 (id, text, has_t) 按 clean text 分桶，返回 (uniques, collisions, empties)。
    uniques: [(id, old, new)] — UPDATE
    collisions: {clean: [(id, old, has_t), ...]} — 保留 keeper，删其余
    empties: [(id, old)] — 删
    """
    buckets = defaultdict(list)
    for id, text, has_t in rows:
        buckets[clean_sentence_text(text)].append((id, text, has_t))

    uniques = []
    collisions = {}
    empties = []
    for clean, items in buckets.items():
        if not clean:
            empties.extend([(id, old) for id, old, _ in items])
        elif len(items) == 1:
            id, old, _ = items[0]
            if old != clean:
                uniques.append((id, old, clean))
        else:
            collisions[clean] = items
    return uniques, collisions, empties


def pick_keeper(items):
    """碰撞桶里选保留者：优先有译文的；其次 id 最小。"""
    with_t = [it for it in items if it[2]]
    if with_t:
        return min(with_t, key=lambda x: x[0])
    return min(items, key=lambda x: x[0])


def show_diff(rows, limit=30):
    uniques, collisions, empties = plan(rows)
    print(f"== sentences 总数: {len(rows)} ==")
    print(f"  唯一桶（UPDATE）: {len(uniques)} 行")
    print(f"  碰撞桶（合并去重）: {len(collisions)} 组，涉及 {sum(len(v) for v in collisions.values())} 行")
    print(f"  空桶（删除）: {len(empties)} 行")
    print()

    print(f"== UPDATE diff（前 {min(limit, len(uniques))} 条）==")
    for id, old, new in uniques[:limit]:
        print(f"  [{id}]")
        print(f"    OLD: {old[:100]!r}")
        print(f"    NEW: {new[:100]!r}")
    print()

    print(f"== 删除（空桶，全部 {len(empties)} 条）==")
    for id, old in empties:
        print(f"  [{id}] {old[:80]!r}")
    print()

    print(f"== 碰撞桶样例（前 5 组）==")
    for clean, items in list(collisions.items())[:5]:
        keeper = pick_keeper(items)
        print(f"  KEEP [{keeper[0]}] -> {clean[:80]!r}")
        for id, old, _ in items:
            mark = " (keeper)" if id == keeper[0] else " (DELETE)"
            print(f"    [{id}]{mark} {old[:80]!r}")
    print()

    # 汇总：将要删多少行、update 多少行
    delete_count = len(empties) + sum(
        len(items) - 1 for items in collisions.values()
    )
    print(f"== 汇总 ==")
    print(f"  UPDATE: {len(uniques)} 行")
    print(f"  DELETE sentences: {delete_count} 行（空桶 {len(empties)} + 碰撞 {delete_count - len(empties)}）")
    print(f"  DELETE translations: 同上数量（每条 sentences 删前先删 translations）")
    print(f"  保留 sentences: {len(rows) - delete_count} 行")


def apply(rows):
    uniques, collisions, empties = plan(rows)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    tx = conn
    deleted_sent = 0
    deleted_trans = 0
    updated = 0
    try:
        # 空桶：删 sentences + translations
        empty_ids = [id for id, _ in empties]
        if empty_ids:
            cur = tx.execute(
                "DELETE FROM translations WHERE sentence_id IN (%s)"
                % ",".join("?" * len(empty_ids)),
                empty_ids,
            )
            deleted_trans += cur.rowcount
            cur = tx.execute(
                "DELETE FROM sentences WHERE id IN (%s)"
                % ",".join("?" * len(empty_ids)),
                empty_ids,
            )
            deleted_sent += cur.rowcount

        # 碰撞桶：先删 losers（避免 keeper UPDATE 到 clean 时与已存在的 clean 文本撞 UNIQUE），
        # 再 UPDATE keeper。同桶 losers 的 clean 与 keeper 相同，删掉后才安全。
        for clean, items in collisions.items():
            keeper = pick_keeper(items)
            losers = [id for id, _, _ in items if id != keeper[0]]
            if losers:
                cur = tx.execute(
                    "DELETE FROM translations WHERE sentence_id IN (%s)"
                    % ",".join("?" * len(losers)),
                    losers,
                )
                deleted_trans += cur.rowcount
                cur = tx.execute(
                    "DELETE FROM sentences WHERE id IN (%s)"
                    % ",".join("?" * len(losers)),
                    losers,
                )
                deleted_sent += cur.rowcount
            # keeper UPDATE（若已是 clean 则 no-op）
            cur = tx.execute(
                "UPDATE sentences SET text=? WHERE id=? AND text<>?",
                (clean, keeper[0], clean),
            )
            if cur.rowcount > 0:
                updated += 1

        # 唯一桶：UPDATE
        for id, old, new in uniques:
            tx.execute("UPDATE sentences SET text=? WHERE id=?", (new, id))
            updated += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print(f"== apply 完成 ==")
    print(f"  UPDATE sentences: {updated} 行")
    print(f"  DELETE sentences: {deleted_sent} 行")
    print(f"  DELETE translations: {deleted_trans} 行")


def main():
    ap = argparse.ArgumentParser(description="清洗 sentences 表格式噪声")
    ap.add_argument("--apply", action="store_true", help="执行迁移（默认 dry-run）")
    args = ap.parse_args()

    if not DB_PATH.exists():
        sys.exit(f"DB 不存在: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = fetch_rows(conn)
    conn.close()

    if args.apply:
        apply(rows)
        # 重跑一次确认幂等
        conn = sqlite3.connect(DB_PATH)
        rows2 = fetch_rows(conn)
        conn.close()
        u, c, e = plan(rows2)
        print(f"\n== 重跑校验（应全 0）==")
        print(f"  UPDATE: {len(u)}, 碰撞: {len(c)}, 空桶: {len(e)}")
    else:
        show_diff(rows)
        print("\n(dry-run，加 --apply 执行)")


if __name__ == "__main__":
    main()
