#!/usr/bin/env python3
"""一次性批处理脚本：把所有未解析的句子灌过 LLM。

in-process 调用 server.llm 的同名函数（与 /api/parse/batch 端点走同一套逻辑），
但不走 HTTP（无需 token）。fail-fast：任意一个任务出错即 abort 整批，
取消未启动的 future，让在飞的跑完（不杀线程，它们持有 socket），然后停。

用法：
    .venv/bin/python3 scripts/_batch_parse_all.py
"""
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

# 确保能 import 项目根的 server 包
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# 重要：硬编码并发 8，不读 active_concurrency() —— 用户在 UI 设了 30，
# 但 30 在本网关已经触发超时；8 是实测安全上限。
CONCURRENCY = 8

# 只解析「长难句」：词数 ≥ MIN_WORDS 才算。短句（如 "But some observers are skeptical."）
# 不需要 10 层结构拆解，解析它们浪费 LLM 配额也浪费用户注意力。
# 15 词是考研长难句经验门槛：低于此基本一句到底、无结构可言。
MIN_WORDS = 15

# fail-fast 阈值改为「连续 N 条 empty/error 才判定网关故障」——
# 单条 empty 可能只是模型对某句话确实没输出（如引文/生僻内容），不该据此 abort 整批。
# 连续 CONSECUTIVE_FAIL_THRESHOLD 条全失败才说明网关挂了。
CONSECUTIVE_FAIL_THRESHOLD = 5

# 进度打印步长
PROGRESS_EVERY = 25


def _word_count(text):
    """粗略词数：按空白切，去掉纯标点 token。"""
    return len([w for w in (text or "").split() if any(ch.isalpha() for ch in w)])


def collect_pending(conn):
    """返回 [(id, text), ...] 所有未解析或解析失败且词数 ≥ MIN_WORDS 的句子。"""
    rows = conn.execute(
        "SELECT s.id, s.text FROM sentences s "
        "LEFT JOIN parses p ON p.sentence_id = s.id "
        "WHERE p.status IS NULL OR p.status != 'ok' "
        "ORDER BY s.id"
    ).fetchall()
    return [(r["id"], r["text"]) for r in rows if _word_count(r["text"]) >= MIN_WORDS]


def parse_one(item):
    """单条解析任务。返回 (id, status, error_or_none)。

    status: 'ok' / 'fail'
    出任何异常都返回 'fail' + error 文本（不 raise），由主循环判定是否 abort。
    """
    from server import llm  # 在工作线程里 import，确保用对 cwd
    sid, text = item
    try:
        content_parts = []
        final_content = None
        for chunk in llm.parse_sentence_stream(text):
            if isinstance(chunk, dict) and chunk.get("_done"):
                final_content = chunk.get("content") or ""
            elif isinstance(chunk, str):
                content_parts.append(chunk)
        content = final_content if final_content is not None else "".join(content_parts)
        if not content.strip():
            return (sid, "fail", "empty content from model")
        # 落库：每线程一个连接
        from server.db import get_db
        conn = get_db()
        try:
            llm.save_parse(conn, sid, content, llm.active_model())
        finally:
            conn.close()
        return (sid, "ok", None)
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        return (sid, "fail", msg)


def main():
    t_start = time.time()
    # 必须在主线程里 init_db，避免 races
    from server.db import init_db, get_db
    init_db()
    conn = get_db()
    try:
        pending = collect_pending(conn)
    finally:
        conn.close()

    total = len(pending)
    print(f"pending sentences: {total}")
    if total == 0:
        print("BATCH DONE: parsed=0 failed=0 skipped=0 aborted=False first_error=")
        return 0

    ok = 0
    fail = 0
    skipped = 0
    aborted = False
    first_error = None
    consecutive_fail = 0  # 连续失败计数：达到 CONSECUTIVE_FAIL_THRESHOLD 才 abort

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        # 先全部 submit（最多 ~1600 个，futures 占用很小）
        future_map = {ex.submit(parse_one, item): item[0] for item in pending}
        done_ids = set()
        for fut in as_completed(future_map):
            sid = future_map[fut]
            try:
                rid, status, err = fut.result()
            except Exception as e:
                # future 自身崩了（不应发生，parse_one 已 try/except，但保险）
                rid = sid
                status = "fail"
                err = f"future-crash: {type(e).__name__}: {e}"
            done_ids.add(rid)
            if status == "ok":
                ok += 1
                consecutive_fail = 0  # 成功即重置连续失败计数
            else:
                fail += 1
                consecutive_fail += 1
                if first_error is None:
                    first_error = f"id={rid}: {err}"
                    print(f"FIRST ERROR id={rid}: {err[:500]}")
                # 连续 N 条失败 → 判定网关故障，abort
                if consecutive_fail >= CONSECUTIVE_FAIL_THRESHOLD and not aborted:
                    aborted = True
                    print(
                        f"ABORT: {consecutive_fail} consecutive failures, "
                        f"treating as gateway outage. Cancelling un-started tasks."
                    )
                    for f in future_map:
                        if f not in done_ids and not f.running() and not f.done():
                            f.cancel()
                            skipped += 1

            # 进度
            done_total = ok + fail
            if done_total % PROGRESS_EVERY == 0 or done_total == total:
                print(
                    f"done {done_total}/{total} (ok={ok}, fail={fail}, "
                    f"skipped={skipped}, consec_fail={consecutive_fail}) [last_id={rid}]"
                )

            # 如果已 abort 且所有在飞都结束，提前退出
            if aborted:
                # 检查是否还有未完成且未取消（即 running）的
                still_running = [
                    f for f in future_map
                    if f not in done_ids and f.running()
                ]
                if not still_running:
                    break

    # 统计被 cancel 但其实没跑的：skipped 已在上面累加
    # 注意：cancel() 返回 False 的（已经在跑）会自然完成，已计入 ok/fail
    elapsed = time.time() - t_start
    print("-" * 60)
    print(
        f"BATCH DONE: parsed={ok} failed={fail} skipped={skipped} "
        f"aborted={aborted} first_error={first_error}"
    )
    print(f"elapsed: {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # 脚本本身崩了（如 import 失败、DB 连不上）
        traceback.print_exc()
        sys.exit(1)
