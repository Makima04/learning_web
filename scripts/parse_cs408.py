#!/usr/bin/env python3
"""解析 408 真题 PDF → 结构化 JSON + 考点标注 + 考频分析。

用法:
  .venv/bin/python3 scripts/parse_cs408.py              # 解析 papers/cs408/*.pdf
  .venv/bin/python3 scripts/parse_cs408.py --year 2023
  .venv/bin/python3 scripts/parse_cs408.py --analyze-only

输出:
  papers/cs408/<year>.json     单年卷
  papers/cs408/index.json      索引
  papers/cs408/exam_stats.json 考点考频/分科分布分析
  papers/cs408/2026.json       若可从网页抓取回忆版

来源说明:
  PDF 来自公开学习仓库 neville-studio/408-exam-paper（重构版，仅供个人学习）
  2026 优先尝试 csgraduates.com 回忆整理版
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

try:
    import fitz  # pymupdf
except ImportError:
    print("need pymupdf: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
CS408_DIR = ROOT / "papers" / "cs408"
OUT_DIR = CS408_DIR

# 408 卷面分科题号（近十余年稳定布局；个别年份若调整可在 YEAR_BOOK_OVERRIDES 覆盖）
DEFAULT_BOOK_RANGES = [
    ("ds", range(1, 12), range(41, 43)),   # 选择 1-11, 大题 41-42
    ("co", range(12, 23), range(43, 45)),  # 12-22, 43-44
    ("os", range(23, 33), range(45, 47)),  # 23-32, 45-46
    ("cn", range(33, 41), range(47, 48)),  # 33-40, 47
]

BOOK_NAME = {
    "ds": "数据结构",
    "co": "计算机组成原理",
    "os": "操作系统",
    "cn": "计算机网络",
}

# 题号 → 书（由 DEFAULT_BOOK_RANGES 生成）
def build_q_book_map(
    ranges: list[tuple[str, range, range]] | None = None,
) -> dict[int, str]:
    ranges = ranges or DEFAULT_BOOK_RANGES
    m: dict[int, str] = {}
    for book, mcq, big in ranges:
        for n in mcq:
            m[n] = book
        for n in big:
            m[n] = book
    return m


Q_BOOK = build_q_book_map()

# 考点关键词 → kp_id（按匹配长度优先，可多标）
# 与 frontend/src/data/kg/cs408.ts 对齐
KP_RULES: list[tuple[str, list[str]]] = [
    # —— 数据结构 ——
    ("ds.algo.design", [r"设计算法", r"算法设计", r"基本设计思想", r"C\s*或\s*C\+\+", r"时间复杂度"]),
    ("ds.algo.dp", [r"动态规划", r"最优子结构"]),
    ("ds.algo.greedy", [r"贪心"]),
    ("ds.algo.recur", [r"递归", r"分治", r"阶乘"]),
    ("ds.sort.external", [r"外部排序", r"置换.?选择", r"初始归并段", r"败者树", r"多路归并"]),
    ("ds.sort.compare", [r"排序稳定性", r"排序.*复杂度", r"各种排序"]),
    ("ds.sort.merge", [r"归并排序"]),
    ("ds.sort.swap", [r"快速排序", r"快排", r"冒泡排序"]),
    ("ds.sort.select", [r"堆排序", r"简单选择排序", r"选择排序"]),
    ("ds.sort.insert", [r"直接插入排序", r"折半插入", r"希尔排序", r"插入排序"]),
    ("ds.sort.radix", [r"基数排序"]),
    ("ds.search.hash", [r"散列", r"哈希", r"冲突处理", r"拉链法", r"开放定址", r"装填因子"]),
    ("ds.search.b", [r"\bB\+?\s*树", r"B\+树", r"B树"]),
    ("ds.search.avl", [r"平衡二叉", r"AVL", r"平衡因子"]),
    ("ds.search.rbt", [r"红黑树"]),
    ("ds.search.bst", [r"二叉排序树", r"二叉搜索树", r"BST"]),
    ("ds.search.seq-bin", [r"折半查找", r"二分查找", r"顺序查找", r"分块查找"]),
    ("ds.graph.topo", [r"拓扑", r"关键路径", r"AOV", r"AOE"]),
    ("ds.graph.sp", [r"最短路径", r"Dijkstra", r"迪杰斯特拉", r"Floyd", r"弗洛伊德"]),
    ("ds.graph.mst", [r"最小生成树", r"Prim", r"Kruskal", r"普里姆", r"克鲁斯卡尔"]),
    ("ds.graph.dfs-bfs", [r"深度优先", r"广度优先", r"\bDFS\b", r"\bBFS\b"]),
    ("ds.graph.store", [r"邻接矩阵", r"邻接表", r"邻接多重表", r"十字链表", r"有向图", r"无向图"]),
    ("ds.tree.huffman", [r"哈夫曼", r"Huffman"]),
    ("ds.tree.uf", [r"并查集", r"等价类"]),
    ("ds.tree.forest", [r"森林", r"树转换为二叉树", r"孩子兄弟"]),
    ("ds.tree.thread", [r"线索二叉"]),
    ("ds.tree.trav", [r"前序遍历", r"中序遍历", r"后序遍历", r"层次遍历", r"先序", r"非递归遍历"]),
    ("ds.tree.bt", [r"二叉树", r"完全二叉树", r"满二叉树", r"树的高度", r"双亲", r"孩子结点"]),
    ("ds.str.kmp", [r"\bKMP\b", r"next\s*数组", r"模式匹配"]),
    ("ds.str.match", [r"串匹配", r"字符串匹配"]),
    ("ds.sq.apply", [r"中缀", r"后缀表达式", r"前缀表达式", r"表达式求值"]),
    ("ds.sq.stack", [r"栈", r"出栈", r"入栈", r"括号匹配"]),
    ("ds.sq.queue", [r"队列", r"循环队列", r"队头", r"队尾", r"出队", r"入队"]),
    ("ds.linear.poly", [r"逆置", r"合并.*链表", r"多项式"]),
    ("ds.linear.linked", [r"单链表", r"双链表", r"循环链表", r"链表", r"指针p", r"next"]),
    ("ds.linear.seq", [r"顺序表", r"一维数组", r"顺序存储", r"下标"]),
    # —— 组成 ——
    ("co.cpu.pipeline", [r"流水线", r"流水冒险", r"数据冒险", r"控制冒险", r"结构冒险", r"转发", r"停顿"]),
    ("co.cpu.datapath", [r"数据通路", r"控制器", r"指令周期", r"微操作"]),
    ("co.cpu.hardsoft", [r"微程序", r"硬布线", r"微指令", r"微地址"]),
    ("co.mem.virt", [r"虚拟存储", r"页表", r"TLB", r"快表", r"缺页", r"虚地址", r"物理地址.*变换"]),
    ("co.mem.cache", [r"Cache", r"cache", r"高速缓存", r"映射", r"直接映射", r"组相联", r"全相联", r"写回", r"写直达", r"替换算法"]),
    ("co.mem.sram-dram", [r"SRAM", r"DRAM", r"芯片扩展", r"存储器扩展", r"位扩展", r"字扩展"]),
    ("co.mem.hier", [r"存储层次", r"局部性"]),
    ("co.data.float", [r"浮点", r"IEEE\s*754", r"阶码", r"尾数", r"规格化"]),
    ("co.data.int", [r"补码", r"原码", r"反码", r"移码", r"定点数", r"机器数"]),
    ("co.data.alu", [r"ALU", r"乘法器", r"除法", r"加减乘除", r"Booth"]),
    ("co.data.check", [r"海明", r"CRC", r"奇偶校验", r"校验码"]),
    ("co.isa.format", [r"寻址方式", r"指令格式", r"操作码", r"指令字", r"相对寻址", r"间接寻址", r"立即寻址"]),
    ("co.isa.ciscrisc", [r"CISC", r"RISC"]),
    ("co.io.dma", [r"\bDMA\b", r"直接存储器访问"]),
    ("co.io.query", [r"中断", r"程序查询", r"中断响应", r"中断隐指令"]),
    ("co.io.channel", [r"通道方式", r"I/O\s*通道"]),
    ("co.bus.arb", [r"总线仲裁", r"总线定时", r"异步通信", r"同步总线"]),
    ("co.bus.perf", [r"总线带宽", r"总线宽度", r"总线频率"]),
    ("co.intro.perf", [r"CPI", r"MIPS", r"主频", r"吞吐率", r"执行时间"]),
    ("co.intro.hier", [r"冯.?诺依曼", r"层次结构", r"存储程序"]),
    # —— 操作系统 ——
    ("os.proc.deadlock", [r"死锁", r"银行家", r"安全序列", r"资源分配图"]),
    ("os.proc.classic", [r"生产者.?消费者", r"读者.?写者", r"哲学家", r"P\s*操作", r"V\s*操作"]),
    ("os.proc.sync", [r"信号量", r"管程", r"互斥", r"同步", r"临界区", r"wait\s*\(", r"signal\s*\("]),
    ("os.proc.sched", [r"调度", r"时间片", r"FCFS", r"SJF", r"优先级调度", r"多级反馈", r"响应比", r"周转时间"]),
    ("os.proc.pcb", [r"\bPCB\b", r"进程控制块", r"线程", r"进程状态", r"进程创建"]),
    ("os.mem.virt", [r"页面置换", r"LRU", r"FIFO.*页面", r"时钟置换", r"工作集", r"请求分页", r"虚拟内存"]),
    ("os.mem.thrash", [r"抖动", r"颠簸"]),
    ("os.mem.page", [r"分页", r"分段", r"段页", r"页框", r"页号", r"逻辑地址", r"物理地址"]),
    ("os.mem.alloc", [r"动态分区", r"首次适应", r"最佳适应", r"最坏适应", r"紧凑", r"连续分配"]),
    ("os.file.alloc", [r"磁盘分配", r"索引分配", r"隐式链接", r"显式链接", r"FAT", r"inode", r"FCB"]),
    ("os.file.fs", [r"空闲.*管理", r"成组链接", r"位示图", r"文件系统"]),
    ("os.file.dir", [r"目录", r"文件共享", r"硬链接", r"符号链接"]),
    ("os.file.struct", [r"文件.*结构", r"逻辑结构", r"物理结构", r"记录式文件"]),
    ("os.io.disk", [r"磁盘调度", r"电梯算法", r"SCAN", r"CSCAN", r"SSTF", r"磁臂"]),
    ("os.io.spool", [r"SPOOLing", r"假脱机", r"缓冲"]),
    ("os.io.hw", [r"I/O\s*控制", r"设备独立性"]),
    ("os.intro.int", [r"系统调用", r"用户态", r"核心态", r"陷入", r"trap"]),
    ("os.intro.feat", [r"操作系统.*特征", r"分时", r"实时系统"]),
    # —— 计网 ——
    ("cn.trans.cong", [r"拥塞控制", r"慢开始", r"拥塞避免", r"快重传", r"快恢复", r"cwnd", r"ssthresh"]),
    ("cn.trans.tcp", [r"\bTCP\b", r"三次握手", r"四次挥手", r"可靠传输", r"流量控制", r"滑动窗口", r"累计确认", r"序号"]),
    ("cn.trans.udp", [r"\bUDP\b"]),
    ("cn.net.route", [r"路由", r"\bRIP\b", r"\bOSPF\b", r"\bBGP\b", r"距离向量", r"链路状态"]),
    ("cn.net.ip", [r"\bIP\b地址", r"子网", r"CIDR", r"网络号", r"主机号", r"默认网关", r"分组转发"]),
    ("cn.net.icmp", [r"\bICMP\b", r"\bARP\b"]),
    ("cn.net.ipv6", [r"IPv6"]),
    ("cn.dll.mac", [r"CSMA", r"\bMAC\b", r"冲突检测", r"退避"]),
    ("cn.dll.eth", [r"以太网", r"交换机", r"网桥", r"VLAN", r"MAC地址"]),
    ("cn.dll.framing", [r"成帧", r"滑动窗口.*链路", r"停等协议", r"GBN", r"SR协议", r"PPP", r"比特填充"]),
    ("cn.dll.ppp", [r"\bPPP\b"]),
    ("cn.app.dns", [r"\bDNS\b", r"域名"]),
    ("cn.app.http", [r"\bHTTP\b", r"\bHTTPS\b", r"SMTP", r"邮件"]),
    ("cn.app.other", [r"\bFTP\b", r"\bDHCP\b"]),
    ("cn.intro.layer", [r"OSI", r"TCP/IP.*层", r"协议栈", r"封装", r"PDU"]),
    ("cn.intro.perf", [r"时延", r"带宽", r"吞吐量", r"往返时间", r"RTT"]),
    ("cn.phy.coding", [r"编码", r"调制", r"曼彻斯特"]),
    ("cn.phy.media", [r"传输介质", r"电路交换", r"分组交换"]),
]

# 预编译
_COMPILED_RULES: list[tuple[str, list[re.Pattern[str]]]] = [
    (kp, [re.compile(p, re.I) for p in pats]) for kp, pats in KP_RULES
]


NOISE_LINE = re.compile(
    r"(第\s*\d+\s*页|共\s*\d+\s*页|全国硕士研究生|计算机学科专业基础|绝密|启用前|"
    r"答题卡|注意事项|考生须知)"
)


def extract_pdf_text(path: Path) -> str:
    doc = fitz.open(path)
    parts: list[str] = []
    for page in doc:
        parts.append(page.get_text("text"))
    text = "\n".join(parts)
    # 规范化空白
    text = text.replace("\u3000", " ").replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def strip_headers(text: str) -> str:
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            lines.append("")
            continue
        if NOISE_LINE.search(s) and len(s) < 80:
            continue
        # 页眉粘连整行标题
        if re.match(r"^\d{4}\s*年.*试题", s) and "第" in s and "页" in s:
            continue
        lines.append(line)
    return "\n".join(lines)


def split_questions(text: str) -> dict[int, str]:
    """按题号 1..47 切分。"""
    text = strip_headers(text)
    # 统一题号形式：1.  1． 1、 41.（13 分）
    # 在题号前插入分隔标记
    pattern = re.compile(
        r"(?:(?<=\n)|(?<=^))"
        r"(?P<n>[1-9]\d?)\s*[.．、]"
        r"(?:\s*[（(]\s*\d+\s*分\s*[）)])?"
        r"\s*"
    )
    matches = list(pattern.finditer(text))
    # 过滤：题号应大致递增且在 1-47
    picked: list[re.Match[str]] = []
    expect = 1
    for m in matches:
        n = int(m.group("n"))
        if n > 47:
            continue
        # 允许从 expect 或 expect 附近恢复（OCR 漏题）
        if n == expect or (expect <= n <= expect + 2) or (not picked and n == 1):
            picked.append(m)
            expect = n + 1
        elif picked and n == int(picked[-1].group("n")):
            continue
        elif n == expect - 1:
            continue
        elif n >= expect and n <= 47 and (n - expect) <= 3:
            # 跳号容忍
            picked.append(m)
            expect = n + 1

    result: dict[int, str] = {}
    for i, m in enumerate(picked):
        n = int(m.group("n"))
        start = m.start()
        end = picked[i + 1].start() if i + 1 < len(picked) else len(text)
        body = text[start:end].strip()
        # 去掉开头题号
        body = re.sub(
            r"^" + re.escape(m.group(0).strip()) + r"\s*",
            "",
            body,
            count=1,
        ).strip()
        # 截断「二、综合」说明混入
        body = re.sub(r"^综合应用题[^\n]*\n?", "", body)
        result[n] = body
    return result


def parse_mcq(body: str) -> dict[str, Any]:
    """拆 stem + options A-D。"""
    # 选项可能跨行：A. xxx \n B. ...
    opt_re = re.compile(
        r"(?:(?<=\n)|(?<=\s)|^)"
        r"([A-D])\s*[.．、]\s*"
    )
    matches = list(opt_re.finditer(body))
    # 取最后一组连续 A-D
    if len(matches) >= 4:
        # 找以 A 开头且后续有 B C D 的一段
        start_idx = None
        for i, m in enumerate(matches):
            if m.group(1) == "A":
                labels = [matches[j].group(1) for j in range(i, min(i + 4, len(matches)))]
                if labels == ["A", "B", "C", "D"]:
                    start_idx = i
                    break
        if start_idx is None:
            # 退而求其次：任意 A 后的选项
            for i, m in enumerate(matches):
                if m.group(1) == "A":
                    start_idx = i
                    break
        if start_idx is not None:
            a = matches[start_idx]
            stem = body[: a.start()].strip()
            options: dict[str, str] = {}
            for j in range(start_idx, min(start_idx + 4, len(matches))):
                m = matches[j]
                lab = m.group(1)
                end = matches[j + 1].start() if j + 1 < len(matches) else len(body)
                # 若下一项不是按序，限制 end
                if j + 1 < len(matches):
                    next_lab = matches[j + 1].group(1)
                    order = "ABCD"
                    if lab in order and next_lab in order:
                        if order.index(next_lab) <= order.index(lab):
                            # 可能已到下一题残留
                            pass
                val = body[m.end() : end].strip()
                val = re.sub(r"\s+", " ", val)
                options[lab] = val
            return {"stem": re.sub(r"\s+", " ", stem).strip(), "options": options}

    return {"stem": re.sub(r"\s+", " ", body).strip(), "options": {}}


def annotate_kps(text: str, book: str, n: int) -> list[dict[str, str]]:
    """规则兜底标注（关键词）。正式考点请用 scripts/annotate_cs408_llm.py 多标签分类。

    返回 [{id, role}]，至少尽量标到书级兜底。
    """
    hits: list[tuple[int, str]] = []  # (score, kp_id)
    for kp_id, regs in _COMPILED_RULES:
        # 限定同分科前缀
        prefix = {"ds": "ds.", "co": "co.", "os": "os.", "cn": "cn."}[book]
        if not kp_id.startswith(prefix):
            continue
        score = 0
        for r in regs:
            if r.search(text):
                score += 2 + min(len(r.pattern), 12) // 4
        if score:
            hits.append((score, kp_id))
    hits.sort(key=lambda x: -x[0])
    # 去重保序
    seen: set[str] = set()
    ordered: list[str] = []
    for _, kid in hits:
        if kid not in seen:
            seen.add(kid)
            ordered.append(kid)
    if not ordered:
        # 书级兜底：用该科最高频大类
        fallback = {
            "ds": "ds.algo.design" if n >= 41 else "ds.tree.bt",
            "co": "co.cpu.pipeline" if n >= 41 else "co.mem.cache",
            "os": "os.proc.sync" if n >= 41 else "os.proc.sched",
            "cn": "cn.trans.tcp" if n >= 41 else "cn.net.ip",
        }[book]
        ordered = [fallback]

    primary = ordered[0]
    secondary = ordered[1:3]
    out = [{"id": primary, "role": "primary"}]
    for s in secondary:
        out.append({"id": s, "role": "secondary"})
    return out


def parse_year_pdf(year: int, pdf: Path) -> dict[str, Any]:
    raw = extract_pdf_text(pdf)
    qmap = split_questions(raw)
    items: list[dict[str, Any]] = []
    for n in range(1, 48):
        body = qmap.get(n, "")
        book = Q_BOOK.get(n, "ds")
        kind = "big" if n >= 41 else "mcq"
        points = 2 if n <= 40 else None
        # 尝试从题干前缀读分值 41.（13 分）
        if kind == "big":
            # 原匹配可能已剥掉分值，从 raw 再找
            m = re.search(
                rf"(?:(?<=\n)|(?<=^)){n}\s*[.．、]\s*[（(]\s*(\d+)\s*分\s*[）)]",
                raw,
            )
            if m:
                points = int(m.group(1))
            else:
                # 常见默认分值
                points = {41: 13, 42: 10, 43: 10, 44: 13, 45: 8, 46: 7, 47: 9}.get(n, 10)

        if kind == "mcq":
            parsed = parse_mcq(body)
            stem = parsed["stem"]
            options = parsed["options"]
        else:
            stem = body.strip()
            options = {}

        # 仅规则草稿；LLM 分类见 annotate_cs408_llm.py（会写 kps_meta.method=llm）
        kps = annotate_kps(stem + " " + " ".join(options.values()), book, n) if stem else []
        items.append(
            {
                "n": n,
                "kind": kind,
                "book": book,
                "book_name": BOOK_NAME[book],
                "points": points,
                "stem": stem,
                "options": options if options else None,
                "kps": kps,
                "kps_meta": {"method": "rules", "note": "draft; prefer LLM multilabel"},
                "answer": None,
                "source": "pdf_rebuild",
            }
        )

    return {
        "year": year,
        "subject": "cs408",
        "title": f"{year}年全国硕士研究生入学考试计算机学科专业基础综合",
        "source_pdf": pdf.name,
        "source_note": "neville-studio/408-exam-paper 重构版；考点为规则自动标注，供组卷/复习参考",
        "counts": {
            "total": len(items),
            "parsed_nonempty": sum(1 for it in items if it["stem"]),
            "mcq": sum(1 for it in items if it["kind"] == "mcq"),
            "big": sum(1 for it in items if it["kind"] == "big"),
        },
        "items": items,
    }


def _html_to_text(s: str) -> str:
    s = re.sub(r"(?is)<script.*?</script>", " ", s)
    s = re.sub(r"(?is)<style.*?</style>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p>", "\n", s)
    s = re.sub(r"(?i)</pre>", "\n", s)
    s = re.sub(r"(?i)</li>", "\n", s)
    s = re.sub(r"(?i)<li[^>]*>", "\n- ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
    )
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def try_fetch_2026() -> dict[str, Any] | None:
    """从 csgraduates 回忆页抽取（td-content + h5 题号结构）。"""
    try:
        import urllib.request
    except ImportError:
        return None

    url = "https://csgraduates.com/study_methods/408quiz/2026/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (study-tool)"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"2026 fetch failed: {e}", file=sys.stderr)
        return None

    m = re.search(
        r'(?is)<div class=td-content>(.*?)(?:<div class="td-page|</main>)',
        html,
    )
    if not m:
        m = re.search(r"(?is)<div class=td-content>(.*)", html)
    if not m:
        print("2026: td-content not found", file=sys.stderr)
        return None
    content = m.group(1)
    (OUT_DIR / "2026.raw.txt").write_text(content[:300000], encoding="utf-8")

    items: list[dict[str, Any]] = []
    for n in range(1, 41):
        hm = re.search(
            rf"(?is)<h5 id={n}>{n}</h5>(.*?)(?=<h5 id=|<h4 id=|<h3 id=|$)",
            content,
        )
        if not hm:
            continue
        block = hm.group(1)
        ans_m = re.search(r"data-answer=([A-D])", block)
        ans = ans_m.group(1) if ans_m else None
        stem_html = re.split(r'(?is)<div class="choice-container', block)[0]
        stem = _html_to_text(stem_html)
        options: dict[str, str] = {}
        for lab, txt in re.findall(
            r"(?is)<span class=choice-label>\s*([A-D])\.\s*</span>\s*"
            r"<span class=choice-text>(.*?)</span>",
            block,
        ):
            options[lab] = _html_to_text(txt)
        exp = re.search(r"(?is)<div class=explanation[^>]*>(.*?)</div>", block)
        explanation = _html_to_text(exp.group(1)) if exp else None
        book = Q_BOOK.get(n, "ds")
        kps = annotate_kps(stem + " " + " ".join(options.values()), book, n)
        items.append(
            {
                "n": n,
                "kind": "mcq",
                "book": book,
                "book_name": BOOK_NAME[book],
                "points": 2,
                "stem": stem,
                "options": options or None,
                "kps": kps,
                "answer": ans,
                "explanation": explanation,
                "source": "web_recall_csgraduates_2026",
            }
        )

    for n in range(41, 48):
        hm = re.search(
            rf"(?is)<h5 id={n}>{n}</h5>(.*?)(?=<h5 id=|<h4 id=|<h3 id=|$)",
            content,
        )
        if not hm:
            continue
        block = hm.group(1)
        stem_html = re.split(r'(?is)<div class="answer-container', block)[0]
        stem = _html_to_text(stem_html)
        pts_m = re.search(r"(?:本题满分|（)\s*(\d+)\s*分", stem)
        pts = (
            int(pts_m.group(1))
            if pts_m
            else {41: 13, 42: 10, 43: 10, 44: 13, 45: 8, 46: 7, 47: 9}.get(n, 10)
        )
        sol = re.search(r'(?is)<div class="solution-detail[^"]*"[^>]*>(.*)', block)
        solution = _html_to_text(sol.group(1))[:4000] if sol else None
        book = Q_BOOK.get(n, "ds")
        kps = annotate_kps(stem, book, n)
        items.append(
            {
                "n": n,
                "kind": "big",
                "book": book,
                "book_name": BOOK_NAME[book],
                "points": pts,
                "stem": stem[:8000],
                "options": None,
                "kps": kps,
                "answer": solution,
                "source": "web_recall_csgraduates_2026",
            }
        )

    items.sort(key=lambda x: x["n"])
    nonempty = sum(1 for it in items if len(it.get("stem") or "") > 5)
    if nonempty < 30:
        print(f"2026 parse too sparse ({nonempty})", file=sys.stderr)
        return None

    return {
        "year": 2026,
        "subject": "cs408",
        "title": "2026年全国硕士研究生入学考试计算机学科专业基础综合（回忆版）",
        "source_pdf": None,
        "source_url": url,
        "source_note": "网络回忆整理版，题干/选项可能与正式卷有出入；考点为自动标注",
        "counts": {
            "total": len(items),
            "parsed_nonempty": nonempty,
            "mcq": sum(1 for it in items if it["kind"] == "mcq"),
            "big": sum(1 for it in items if it["kind"] == "big"),
        },
        "items": items,
    }


def analyze(papers: list[dict[str, Any]]) -> dict[str, Any]:
    """跨年考点考频与大题分布分析。"""
    kp_year: dict[str, set[int]] = defaultdict(set)
    kp_count: Counter[str] = Counter()
    kp_points: Counter[str] = Counter()
    book_mcq: Counter[str] = Counter()
    book_big: Counter[str] = Counter()
    big_primary: Counter[str] = Counter()
    yearly_big: dict[int, list[dict[str, Any]]] = {}

    for paper in papers:
        year = paper["year"]
        yearly_big[year] = []
        for it in paper["items"]:
            if not it.get("stem"):
                continue
            book = it["book"]
            if it["kind"] == "mcq":
                book_mcq[book] += 1
            else:
                book_big[book] += 1
            pts = it.get("points") or (2 if it["kind"] == "mcq" else 10)
            kps = it.get("kps") or []
            for i, k in enumerate(kps):
                kid = k["id"] if isinstance(k, dict) else k
                kp_count[kid] += 1
                kp_year[kid].add(year)
                if i == 0:
                    kp_points[kid] += pts
                    if it["kind"] == "big":
                        big_primary[kid] += 1
                        yearly_big[year].append(
                            {
                                "n": it["n"],
                                "book": book,
                                "points": pts,
                                "primary_kp": kid,
                                "stem_preview": (it["stem"] or "")[:80],
                            }
                        )

    # 大题配额稳定性
    big_slot_books = []
    for year, slots in sorted(yearly_big.items()):
        books = [s["book"] for s in sorted(slots, key=lambda x: x["n"])]
        big_slot_books.append({"year": year, "books": books, "pattern": "-".join(books)})

    pattern_counter = Counter(x["pattern"] for x in big_slot_books)

    top_kp = [
        {
            "kp_id": kid,
            "count": kp_count[kid],
            "years": sorted(kp_year[kid]),
            "year_span": len(kp_year[kid]),
            "approx_points": kp_points[kid],
            "as_big_primary": big_primary.get(kid, 0),
        }
        for kid in kp_count
    ]
    top_kp.sort(key=lambda x: (-x["count"], -x["year_span"]))

    return {
        "years": sorted(p["year"] for p in papers),
        "paper_count": len(papers),
        "mcq_by_book_total": dict(book_mcq),
        "big_by_book_total": dict(book_big),
        "big_slot_patterns": [
            {"pattern": p, "count": c} for p, c in pattern_counter.most_common()
        ],
        "big_slots_by_year": big_slot_books,
        "top_knowledge_points": top_kp[:80],
        "recommended_big_blueprint": {
            "note": "与组卷算法 CS408_BIG_SLOTS 一致：DS2+CO2+OS2+CN1",
            "slots": [
                {"slot": "q41", "book": "ds"},
                {"slot": "q42", "book": "ds"},
                {"slot": "q43", "book": "co"},
                {"slot": "q44", "book": "co"},
                {"slot": "q45", "book": "os"},
                {"slot": "q46", "book": "os"},
                {"slot": "q47", "book": "cn"},
            ],
            "high_freq_big_kps": [
                x for x in top_kp if x["as_big_primary"] > 0
            ][:30],
        },
        "notes": [
            "考点标注为关键词规则自动结果，综合题可能多考点，primary 取最高分规则命中",
            "PDF 为社区重构版，非教育部原件；2026 若为回忆版需人工校对",
            "选择题分科题号按 1-11 DS / 12-22 CO / 23-32 OS / 33-40 CN 的常规布局",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, help="只解析某年")
    ap.add_argument("--analyze-only", action="store_true")
    ap.add_argument("--skip-2026", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    papers: list[dict[str, Any]] = []

    if not args.analyze_only:
        years = [args.year] if args.year else list(range(2012, 2026))
        for y in years:
            pdf = OUT_DIR / f"{y}.pdf"
            if not pdf.exists():
                print(f"skip missing {pdf}")
                continue
            print(f"parsing {y} ...")
            paper = parse_year_pdf(y, pdf)
            out = OUT_DIR / f"{y}.json"
            out.write_text(json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8")
            print(
                f"  -> {out.name}: nonempty={paper['counts']['parsed_nonempty']}/47"
            )
            papers.append(paper)

        if not args.skip_2026 and (args.year is None or args.year == 2026):
            print("fetching 2026 recall ...")
            p2026 = try_fetch_2026()
            if p2026:
                out = OUT_DIR / "2026.json"
                out.write_text(
                    json.dumps(p2026, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(f"  -> 2026.json nonempty={p2026['counts']['parsed_nonempty']}")
                papers.append(p2026)
    else:
        for path in sorted(OUT_DIR.glob("20*.json")):
            if path.name == "index.json":
                continue
            papers.append(json.loads(path.read_text(encoding="utf-8")))

    # 若只解析部分年，分析时加载全部已有 json
    if args.year or not papers:
        all_papers = []
        for path in sorted(OUT_DIR.glob("20*.json")):
            if path.name in ("index.json",):
                continue
            try:
                all_papers.append(json.loads(path.read_text(encoding="utf-8")))
            except Exception:
                pass
        if all_papers:
            papers = all_papers

    if papers:
        stats = analyze(papers)
        (OUT_DIR / "exam_stats.json").write_text(
            json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        index = {
            "subject": "cs408",
            "years": [p["year"] for p in sorted(papers, key=lambda x: x["year"])],
            "files": [f"{p['year']}.json" for p in sorted(papers, key=lambda x: x["year"])],
            "stats": "exam_stats.json",
        }
        (OUT_DIR / "index.json").write_text(
            json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print("wrote exam_stats.json + index.json")
        print("top 10 KPs:")
        for row in stats["top_knowledge_points"][:10]:
            print(
                f"  {row['kp_id']:28} count={row['count']:3} years={row['year_span']} big={row['as_big_primary']}"
            )
        print("big patterns:", stats["big_slot_patterns"][:3])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
