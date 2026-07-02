#!/usr/bin/env python3
"""translate_all.py — 批量翻译 sentences 表中所有未翻译/失败的句子。

直接调 server.llm.translate_text（不经 HTTP），ThreadPoolExecutor(max_workers=N)
并发，结果写回 translations 表。幂等：status='ok' 的跳过，可重跑只翻剩余的。

用法：
  .venv/bin/python3 scripts/translate_all.py                  # 默认 100 并发
  .venv/bin/python3 scripts/translate_all.py --workers 50
  .venv/bin/python3 scripts/translate_all.py --skip-errors    # 不重翻 status=error
  .venv/bin/python3 scripts/translate_all.py --limit 500      # 只翻 N 条（调试）
"""
import argparse
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# 让脚本能 import server.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.db import DB_PATH, now_iso  # noqa: E402
from server.llm import LlmNotConfigured, is_configured, translate_text  # noqa: E402


def get_todo(skip_errors: bool, limit) -> list[tuple[int, str]]:
    """返回 [(id, text)] 待翻译句子。默认纳入 status=error 的（重翻失败项）。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if skip_errors:
            sql = (
                "SELECT s.id, s.text FROM sentences s LEFT JOIN translations t "
                "ON t.sentence_id=s.id WHERE t.status IS NULL"
            )
        else:
            # 默认：翻所有非 ok 的（含 NULL 与 error），与「全部翻译」语义一致
            sql = (
                "SELECT s.id, s.text FROM sentences s LEFT JOIN translations t "
                "ON t.sentence_id=s.id WHERE t.status IS NULL OR t.status!='ok'"
            )
        params = []
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        return [(r["id"], r["text"]) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def write_result(conn, sid: int, zh: str, status: str):
    """upsert 一条 translations 记录。model 列不更新（保留历史值，与 _do_translate_sentence 一致）。"""
    now = now_iso()
    conn.execute(
        "INSERT INTO translations(sentence_id, zh, status, model, "
        "translated_by, translated_at, updated_at) VALUES(?,?,?,?,?,?,?) "
        "ON CONFLICT(sentence_id) DO UPDATE SET "
        "zh=excluded.zh, status=excluded.status, "
        "translated_at=excluded.translated_at, updated_at=excluded.updated_at",
        (sid, zh, status, None, None, now, now),
    )
    conn.commit()


def main():
    p = argparse.ArgumentParser(description="批量翻译未翻译的 sentences。")
    p.add_argument("--workers", type=int, default=100, help="并发数（默认 100）")
    p.add_argument("--skip-errors", action="store_true", help="不重翻 status=error 的")
    p.add_argument("--limit", type=int, default=None, help="只翻 N 条（调试）")
    args = p.parse_args()

    if not is_configured():
        sys.exit("error: ew_llm.json 未配置 url/key")

    todo = get_todo(args.skip_errors, args.limit)
    print(f"待翻译: {len(todo)} 条", flush=True)
    if not todo:
        print("无待翻译项，已全部完成。")
        return

    workers = max(1, min(args.workers, len(todo)))
    print(f"并发: {workers}", flush=True)

    # 写连接：主线程独占，串行写，避免 sqlite 并发写冲突；LLM 网络调用在 worker 线程
    wconn = sqlite3.connect(DB_PATH, timeout=30)
    wconn.row_factory = sqlite3.Row
    wconn.execute("PRAGMA busy_timeout=30000")
    try:
        # 预检：先翻一条确认 LLM 可用，避免批量写入一堆 unconfigured
        try:
            test_zh = translate_text(todo[0][1])
            write_result(wconn, todo[0][0], test_zh, "ok")
            todo = todo[1:]
            print("预检通过", flush=True)
        except LlmNotConfigured:
            sys.exit("error: LLM 未配置（缺 url/key/model），请先配好 ew_llm.json 与 config.active_llm_model")
        except Exception as e:
            print(f"warn: 预检失败，仍继续批量: {e}", file=sys.stderr, flush=True)

        done = ok = fail = 0
        t0 = time.time()
        total = len(todo)

        def one(item):
            sid, text = item
            try:
                return sid, translate_text(text), "ok", None
            except LlmNotConfigured:
                return sid, "", "unconfigured", "LLM 未配置"
            except Exception as e:
                return sid, str(e), "error", str(e)

        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(one, item) for item in todo]
            try:
                for fut in as_completed(futs):
                    sid, zh, status, err = fut.result()
                    write_result(wconn, sid, zh, status)
                    done += 1
                    if status == "ok":
                        ok += 1
                    else:
                        fail += 1
                    if done % 20 == 0 or done == total:
                        el = time.time() - t0
                        rate = done / el if el else 0
                        print(f"  进度 {done}/{total}  ok={ok} fail={fail}  "
                              f"{el:.1f}s  {rate:.1f}/s", flush=True)
                    if err and status != "ok":
                        print(f"    [fail] sid={sid}: {err[:120]}", flush=True)
            except KeyboardInterrupt:
                print(f"\n中断：已保存 {done} 条（ok={ok} fail={fail}），剩余未翻。可重跑续翻。", flush=True)
                # 取消未开始的，已 in-flight 的任其完成
                for f in futs:
                    f.cancel()
                return

        print(f"\n完成: {done} 条, ok={ok}, fail={fail}, 用时 {time.time()-t0:.1f}s", flush=True)
    finally:
        wconn.close()


if __name__ == "__main__":
    main()
