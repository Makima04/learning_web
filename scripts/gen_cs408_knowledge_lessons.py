#!/usr/bin/env python3
"""将逐题教案源与原题合成为知识复习数据；--check 检查生成产物是否过期。"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from cs408_knowledge_cases import CASES, EXCERPTS, GAPS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/src/data/kg/cs408QuestionLessons.json"
BOOKS = {"ds": "数据结构", "co": "计算机组成原理", "os": "操作系统", "cn": "计算机网络"}

CODE = {
    "cs408-2023-q41": "int printVertices(MGraph G) {\n    int count = 0;\n    for (int i = 0; i < G.numVertices; ++i) {\n        int in = 0, out = 0;\n        for (int j = 0; j < G.numVertices; ++j) {\n            out += G.Edge[i][j];\n            in  += G.Edge[j][i];\n        }\n        if (out > in) {\n            printf(\"%c \", G.VerticesList[i]);\n            ++count;\n        }\n    }\n    return count;\n}",
    "cs408-2025-q41": "// 按原题假定乘积在 int 可表示范围内；结果数组不计额外空间。\nvoid calMulMax(int A[], int res[], int n) {\n    if (n <= 0) return;\n    int lo = A[n-1], hi = A[n-1];\n    for (int i = n-1; i >= 0; --i) {\n        if (A[i] < lo) lo = A[i];\n        if (A[i] > hi) hi = A[i];\n        int p = A[i] * lo, q = A[i] * hi;\n        res[i] = p > q ? p : q;\n    }\n}",
    "cs408-2015-q45": "semaphore fullA=x, emptyA=M-x;\nsemaphore fullB=y, emptyB=N-y;\n\nA: while (true) {\n    P(fullA); 从A信箱取邮件; V(emptyA);\n    回答并提出新问题;\n    P(emptyB); 向B信箱投邮件; V(fullB);\n}\nB: while (true) {\n    P(fullB); 从B信箱取邮件; V(emptyB);\n    回答并提出新问题;\n    P(emptyA); 向A信箱投邮件; V(fullA);\n}",
}

CHECKS = {
    "cs408-2023-q41": {"question": "在本题的邻接矩阵中，统计顶点 i 的出度应累计哪一项？",
                       "options": ["Edge[i][j]，固定行 i", "Edge[j][i]，固定列 i"],
                       "correctIndex": 0, "explanation": "有向边 i→j 存在时 Edge[i][j]=1，故行和为出度、列和为入度。"},
    "cs408-2012-q41": {"question": "为使本题最坏比较总次数最少，每轮应优先合并哪两个表？",
                       "options": ["当前最长的两个表", "当前最短的两个表"], "correctIndex": 1,
                       "explanation": "最优合并树采用哈夫曼式选择；每次合并当前最短两表，避免大表过早反复参与合并。"},
    "cs408-2025-q41": {"question": "本题允许 j=i，逆序扫描到 i 时如何使用后缀极值？",
                       "options": ["先把 A[i] 纳入极值，再计算 res[i]", "先算 res[i]，再把 A[i] 纳入极值"],
                       "correctIndex": 0, "explanation": "候选后缀是 A[i..n−1]，必须包含 A[i]；全负数或仅一个元素就能检验更新顺序。"},
    "cs408-2015-q45": {"question": "A 准备向 B 的信箱投递新邮件前，应先等待哪个计数信号量？",
                       "options": ["fullB，确保 B 已有邮件", "emptyB，确保 B 还有空位"], "correctIndex": 1,
                       "explanation": "投递是生产邮件，先消耗对方信箱空位；取信才消耗本方已有邮件数。"},
    "ds-mcq-4.2-3": {"question": "本题的两个空，按简单匹配、KMP 的顺序应如何填写？",
                      "options": ["O(nm)、O(n+m)", "O(n+m)、O(nm)"], "correctIndex": 0,
                      "explanation": "朴素匹配可能在每个起点重新比较整个模式；KMP 复用匹配状态并加上 O(m) 预处理。"},
}


def build() -> dict:
    catalog = dict(re.findall(r'\{ id: "([a-z][a-z0-9.\-]+)", name: "([^"]+)"',
                             (ROOT / "frontend/src/data/kg/cs408.ts").read_text()))
    assert set(CASES).isdisjoint(GAPS)
    assert set(CASES) | set(GAPS) == set(catalog), "每个知识点必须有逐题教案或明确的来源缺口"
    # 使用已入库的题库快照，干净检出即可重建，不依赖被 gitignore 排除的本地 PDF 管线中间文件。
    wd_path = ROOT / "frontend/public/cs408/wangdao2027.json"
    wd = {q["id"]: q for q in json.loads(wd_path.read_text())}
    papers: dict[int, dict] = {}
    sources: dict[str, str] = {}
    rows: dict[str, dict] = {}
    for kp, (qid, focus, steps, answer, transfer) in CASES.items():
        match = re.fullmatch(r"cs408-(\d{4})-q(\d+)", qid)
        if match:
            year, n = map(int, match.groups())
            path = ROOT / f"frontend/public/cs408/{year}.json"
            if year not in papers:
                papers[year] = json.loads(path.read_text())
            q = next(q for q in papers[year]["items"] if q["n"] == n)
            source = "exam"
            label = f"{year} 年 408 · {BOOKS[q['book']]} · 第 {n} 题"
        else:
            path = wd_path
            q = wd[qid]
            source = "wangdao"
            sec = str(q["section"])
            label = f"王道 · {BOOKS[q['book']]} · 第 {sec.split('.')[0]} 章 · 第 {sec} 节 · {q.get('section_name', '')} · {'大题' if q['kind'] == 'big' else '选择题'}第 {q['qno']} 题"
        assert q["book"] == kp.split(".")[0], (kp, qid, "跨学科错误")
        assert len(steps) >= 3 and all(s.strip() for s in steps)
        assert focus and transfer and answer
        if q.get("answer") and re.fullmatch(r"[A-D]+", str(q["answer"])):
            assert answer == q["answer"], (kp, qid, answer, q["answer"])
        options = {key: re.split(r"二[、.．]\s*综合应用题", value)[0].strip()
                   for key, value in (q.get("options") or {}).items()}
        stem = EXCERPTS.get(qid, q["stem"])
        assert stem.strip(), (kp, qid, "缺题干")
        sources[path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        rows[kp] = {
            "questionId": qid, "source": source, "kind": q["kind"], "label": label,
            "stem": stem, "options": options, "excerpt": qid in EXCERPTS,
            "focus": focus, "steps": list(steps), "answer": answer, "transfer": transfer,
            **({"code": CODE[qid]} if qid in CODE else {}),
            **({"selfCheck": CHECKS[qid]} if qid in CHECKS else {}),
        }
    return {"version": 1, "note": "由 scripts/gen_cs408_knowledge_lessons.py 生成；讲解为针对原题重新编写，非 OCR 解析复制。",
            "cases": rows, "gaps": GAPS, "sources": dict(sorted(sources.items()))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    output = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == output, "教案产物已过期，请重新运行生成脚本"
    else:
        OUT.write_text(output)
    print(f"408 知识复习：{len(CASES)} 份原题教案，{len(GAPS)} 个显式来源缺口。")


if __name__ == "__main__":
    main()
