#!/usr/bin/env python3
"""从 2027 王道做题本 PDF 抽取题号/页码，并映射到图谱考点。

选择题用【无间隔】版；计组/计网大题用【单题】版。
PDF 为图片，走 macOS Vision OCR；结果缓存到 /tmp/wd408_ocr。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import fitz
from ocrmac import ocrmac

ROOT = Path("/Users/makima/program/web/english_web")
DOWNLOADS = Path("/Users/makima/Downloads")
OUT_DIR = ROOT / "papers" / "cs408" / "wangdao2027"
PUBLIC_CATALOG = ROOT / "frontend" / "public" / "cs408" / "wangdao2027.json"
CACHE = Path("/tmp/wd408_ocr")
DS_BIG_JSON = DOWNLOADS / "数据结构大题_按强化打卡表归类.json"

SOURCES = [
    {
        "book": "ds",
        "kind": "mcq",
        "label": "数据结构·选择题",
        "pdf": DOWNLOADS / "27王道【选择题】做题本" / "数据结构" / "【无间隔】.pdf",
        "edition": "无间隔",
    },
    {
        "book": "os",
        "kind": "mcq",
        "label": "操作系统·选择题",
        "pdf": DOWNLOADS / "27王道【选择题】做题本" / "操作系统" / "【无间隔】.pdf",
        "edition": "无间隔",
    },
    {
        "book": "co",
        "kind": "mcq",
        "label": "组成原理·选择题",
        "pdf": DOWNLOADS / "27王道【选择题】做题本" / "计组" / "【无间隔】.pdf",
        "edition": "无间隔",
    },
    {
        "book": "cn",
        "kind": "mcq",
        "label": "计算机网络·选择题",
        "pdf": DOWNLOADS / "27王道【选择题】做题本" / "计网" / "【无间隔】.pdf",
        "edition": "无间隔",
    },
    {
        "book": "ds",
        "kind": "big",
        "label": "数据结构·大题",
        "pdf": DOWNLOADS / "数据结构大题.pdf",
        "edition": "大题",
        "reuse_json": str(DS_BIG_JSON),
        "ocr_stems": True,  # 旧 JSON 题干被截断，改为 OCR 全文再与元数据合并
    },
    {
        "book": "os",
        "kind": "big",
        "label": "操作系统·大题",
        "pdf": DOWNLOADS / "操作系统大题.pdf",
        "edition": "大题",
    },
    {
        "book": "co",
        "kind": "big",
        "label": "组成原理·大题",
        "pdf": DOWNLOADS / "计组" / "【单题】.pdf",
        "edition": "单题",
    },
    {
        "book": "cn",
        "kind": "big",
        "label": "计算机网络·大题",
        "pdf": DOWNLOADS / "计网" / "【单题】.pdf",
        "edition": "单题",
    },
]

BOOK_NAME = {
    "ds": "数据结构",
    "os": "操作系统",
    "co": "计算机组成原理",
    "cn": "计算机网络",
}

# 王道小节 → 图谱考点（默认主考点）。多考点小节再用关键词拆。
SECTION_KP: dict[tuple[str, str], list[str]] = {}

def _fill(book: str, mapping: dict[str, list[str]]) -> None:
    for sec, kps in mapping.items():
        SECTION_KP[(book, sec)] = kps

_fill("ds", {
    "1.1": [],
    "1.2": ["ds.algo.design"],
    "2.1": ["ds.linear.seq"],
    "2.2": ["ds.linear.seq"],
    "2.3": ["ds.linear.linked"],
    "3.1": ["ds.sq.stack"],
    "3.2": ["ds.sq.queue"],
    "3.3": ["ds.sq.apply"],
    "3.4": ["ds.sq.apply"],
    "4.2": ["ds.str.kmp"],
    "5.1": ["ds.tree.bt"],
    "5.2": ["ds.tree.bt"],
    "5.3": ["ds.tree.trav"],
    "5.4": ["ds.tree.forest"],
    "5.5": ["ds.tree.huffman"],
    "6.1": ["ds.graph.store"],
    "6.2": ["ds.graph.store"],
    "6.3": ["ds.graph.dfs-bfs"],
    "6.4": ["ds.graph.sp"],
    "7.2": ["ds.search.seq-bin"],
    "7.3": ["ds.search.bst"],
    "7.4": ["ds.search.b"],
    "7.5": ["ds.search.hash"],
    "8.1": ["ds.sort.compare"],
    "8.2": ["ds.sort.insert"],
    "8.3": ["ds.sort.swap"],
    "8.4": ["ds.sort.select"],
    "8.5": ["ds.sort.merge"],
    "8.6": ["ds.sort.compare"],
    "8.7": ["ds.sort.external"],
})
_fill("co", {
    "1.1": ["co.intro.hier"],
    "1.2": ["co.intro.hier"],
    "1.3": ["co.intro.perf"],
    "2.1": ["co.data.int"],
    "2.2": ["co.data.alu"],
    "2.3": ["co.data.float"],
    "3.1": ["co.mem.hier"],
    "3.2": ["co.mem.sram-dram"],
    "3.3": ["co.mem.sram-dram"],
    "3.4": ["co.mem.hier"],
    "3.5": ["co.mem.cache"],
    "3.6": ["co.mem.virt"],
    "4.1": ["co.isa.format"],
    "4.2": ["co.isa.format"],
    "4.3": ["co.isa.format"],
    "4.4": ["co.isa.ciscrisc"],
    "5.1": ["co.cpu.datapath"],
    "5.2": ["co.cpu.datapath"],
    "5.3": ["co.cpu.datapath"],
    "5.4": ["co.cpu.hardsoft"],
    "5.5": ["co.io.query"],
    "5.6": ["co.cpu.pipeline"],
    "5.7": ["co.cpu.pipeline"],
    "6.1": ["co.bus.arb"],
    "6.2": ["co.bus.arb"],
    "7.1": ["co.io.query"],
    "7.2": ["co.io.query"],
    "7.3": ["co.io.query"],
})
_fill("os", {
    "1.1": ["os.intro.feat"],
    "1.2": ["os.intro.feat"],
    "1.3": ["os.intro.int"],
    "1.6": ["os.intro.feat"],
    "2.1": ["os.proc.pcb"],
    "2.2": ["os.proc.sched"],
    "2.3": ["os.proc.sync"],
    "2.4": ["os.proc.deadlock"],
    "3.1": ["os.mem.page"],
    "3.2": ["os.mem.virt"],
    "4.1": ["os.file.struct"],
    "4.2": ["os.file.dir"],
    "4.3": ["os.file.fs"],
    "5.1": ["os.io.hw"],
    "5.2": ["os.io.spool"],
    "5.3": ["os.io.disk"],
})
_fill("cn", {
    "1.1": ["cn.intro.perf"],
    "1.2": ["cn.intro.layer"],
    "2.1": ["cn.phy.coding"],
    "2.2": ["cn.phy.media"],
    "2.3": ["cn.phy.media"],
    "3.1": ["cn.dll.framing"],
    "3.2": ["cn.dll.framing"],
    "3.3": ["cn.dll.framing"],
    "3.4": ["cn.dll.framing"],
    "3.5": ["cn.dll.mac"],
    "3.6": ["cn.dll.eth"],
    "3.7": ["cn.dll.ppp"],
    "3.8": ["cn.dll.eth"],
    "4.1": ["cn.net.ip"],
    "4.2": ["cn.net.ip"],
    "4.3": ["cn.net.ipv6"],
    "4.4": ["cn.net.route"],
    "4.5": ["cn.net.ip"],
    "4.6": ["cn.net.ip"],
    "4.7": ["cn.net.route"],
    "5.1": ["cn.trans.tcp"],
    "5.2": ["cn.trans.udp"],
    "5.3": ["cn.trans.tcp"],
    "6.1": ["cn.app.other"],
    "6.2": ["cn.app.dns"],
    "6.3": ["cn.app.other"],
    "6.4": ["cn.app.http"],
    "6.5": ["cn.app.http"],
})

# 计网大题书签偶发把「介质访问控制」标成 3.6（选择题 3.6 是局域网），页内标题/关键词再拆。

KP_NAME = {
    "ds.linear.seq": "顺序表与操作复杂度",
    "ds.linear.linked": "单链表/双链表/循环链表",
    "ds.linear.poly": "链表应用（多项式/合并/逆置）",
    "ds.sq.stack": "栈与表达式求值/括号匹配",
    "ds.sq.queue": "循环队列与双端队列",
    "ds.sq.apply": "栈队列综合应用",
    "ds.str.kmp": "KMP 与 next 数组",
    "ds.str.match": "串匹配暴力与改进",
    "ds.tree.bt": "二叉树性质与存储",
    "ds.tree.trav": "遍历（递归/非递归/层次）",
    "ds.tree.thread": "线索二叉树",
    "ds.tree.forest": "树/森林与二叉树转换",
    "ds.tree.huffman": "哈夫曼树与编码",
    "ds.tree.uf": "并查集",
    "ds.graph.store": "邻接矩阵/邻接表",
    "ds.graph.dfs-bfs": "DFS/BFS 与应用",
    "ds.graph.mst": "最小生成树（Prim/Kruskal）",
    "ds.graph.sp": "最短路径（Dijkstra/Floyd）",
    "ds.graph.topo": "拓扑排序与关键路径",
    "ds.search.seq-bin": "顺序/折半查找",
    "ds.search.bst": "二叉排序树",
    "ds.search.avl": "平衡二叉树 AVL",
    "ds.search.rbt": "红黑树要点",
    "ds.search.b": "B 树 / B+ 树",
    "ds.search.hash": "散列查找与冲突处理",
    "ds.sort.insert": "插入类排序",
    "ds.sort.swap": "交换类（冒泡/快排）",
    "ds.sort.select": "选择类（简单选择/堆排）",
    "ds.sort.merge": "归并排序",
    "ds.sort.radix": "基数排序",
    "ds.sort.compare": "排序稳定性与复杂度对比",
    "ds.sort.external": "外部排序要点",
    "ds.algo.recur": "递归与分治",
    "ds.algo.greedy": "贪心",
    "ds.algo.dp": "动态规划（408 尺度）",
    "ds.algo.design": "综合题算法设计与复杂度",
    "co.intro.hier": "层次结构与冯·诺依曼",
    "co.intro.perf": "性能指标（CPI/MIPS/主频）",
    "co.data.int": "定点数原反补移码",
    "co.data.float": "IEEE754 浮点表示与运算",
    "co.data.alu": "ALU 与加减乘除实现",
    "co.data.check": "校验码（奇偶/CRC/海明）",
    "co.mem.hier": "存储层次与局部性",
    "co.mem.sram-dram": "SRAM/DRAM 与芯片扩展",
    "co.mem.cache": "Cache 映射/替换/写策略",
    "co.mem.virt": "虚拟存储器与 TLB",
    "co.isa.format": "指令格式与寻址方式",
    "co.isa.ciscrisc": "CISC/RISC",
    "co.cpu.datapath": "数据通路与控制器",
    "co.cpu.pipeline": "流水线原理与冒险",
    "co.cpu.hardsoft": "硬布线/微程序控制器",
    "co.bus.arb": "总线仲裁与定时",
    "co.bus.perf": "总线性能指标",
    "co.io.query": "程序查询与中断",
    "co.io.dma": "DMA",
    "co.io.channel": "通道方式要点",
    "os.intro.feat": "特征/功能/运行环境",
    "os.intro.int": "中断与系统调用",
    "os.proc.pcb": "进程与 PCB/线程",
    "os.proc.sched": "调度算法（FCFS/SJF/RR/多级反馈）",
    "os.proc.sync": "同步互斥与信号量/管程",
    "os.proc.classic": "经典同步问题",
    "os.proc.deadlock": "死锁（条件/避免/银行家/检测）",
    "os.mem.alloc": "连续分配与动态分区",
    "os.mem.page": "分页/分段/段页",
    "os.mem.virt": "虚拟内存与页面置换",
    "os.mem.thrash": "抖动与工作集",
    "os.file.struct": "文件逻辑/物理结构",
    "os.file.dir": "目录结构与文件共享",
    "os.file.alloc": "磁盘分配（连续/链接/索引）",
    "os.file.fs": "文件系统实现与空闲管理",
    "os.io.hw": "I/O 控制方式",
    "os.io.spool": "缓冲与 SPOOLing",
    "os.io.disk": "磁盘调度",
    "cn.intro.layer": "OSI/TCP-IP 分层与封装",
    "cn.intro.perf": "时延/带宽/吞吐量",
    "cn.phy.coding": "编码与调制",
    "cn.phy.media": "传输介质与交换",
    "cn.dll.framing": "成帧/差错/流量控制",
    "cn.dll.mac": "CSMA/CD/CA 与 MAC",
    "cn.dll.eth": "以太网与交换机",
    "cn.dll.ppp": "PPP",
    "cn.net.ip": "IP 地址/子网/CIDR",
    "cn.net.route": "路由算法与协议（RIP/OSPF/BGP）",
    "cn.net.icmp": "ICMP/ARP",
    "cn.net.ipv6": "IPv6 要点",
    "cn.app.dns": "DNS",
    "cn.app.http": "HTTP/HTTPS/邮件",
    "cn.app.other": "FTP/DHCP 等",
    "cn.trans.udp": "UDP",
    "cn.trans.tcp": "TCP 连接/可靠/流量控制",
    "cn.trans.cong": "TCP 拥塞控制",
}

# 小节内按题干关键词改挂考点
KEYWORD_RULES: dict[tuple[str, str], list[tuple[list[str], str]]] = {
    ("ds", "2.3"): [
        (["多项式", "逆置", "合并", "两个链表", "两条链"], "ds.linear.poly"),
    ],
    ("ds", "4.2"): [
        (["next", "KMP", "kmp"], "ds.str.kmp"),
        (["BF", "暴力", "简单匹配"], "ds.str.match"),
    ],
    ("ds", "5.3"): [
        (["线索"], "ds.tree.thread"),
    ],
    ("ds", "5.5"): [
        (["并查", "等价类", "Union", "Find"], "ds.tree.uf"),
        (["哈夫曼", "Huffman", "WPL", "前缀", "编码"], "ds.tree.huffman"),
    ],
    ("ds", "6.4"): [
        (["Prim", "Kruskal", "最小生成", "MST", "最经济"], "ds.graph.mst"),
        (["拓扑", "AOE", "关键路径", "关键活动", "AOV"], "ds.graph.topo"),
        (["Dijkstra", "Floyd", "最短"], "ds.graph.sp"),
    ],
    ("ds", "7.3"): [
        (["红黑"], "ds.search.rbt"),
        (["AVL", "平衡"], "ds.search.avl"),
    ],
    ("ds", "8.5"): [
        (["基数"], "ds.sort.radix"),
        (["归并"], "ds.sort.merge"),
    ],
    ("os", "2.3"): [
        (["哲学家", "读者", "写者", "生产者", "消费者"], "os.proc.classic"),
    ],
    ("os", "3.1"): [
        (["首次适应", "最佳适应", "最坏适应", "分区", "连续分配"], "os.mem.alloc"),
        (["分页", "分段", "页表", "段表", "段页"], "os.mem.page"),
    ],
    ("os", "3.2"): [
        (["抖动", "工作集"], "os.mem.thrash"),
    ],
    ("os", "4.3"): [
        (["FAT", "索引", "链接", "连续分配", "空闲", "成组"], "os.file.alloc"),
    ],
    ("co", "2.1"): [
        (["海明", "CRC", "奇偶", "校验"], "co.data.check"),
    ],
    ("co", "6.1"): [
        (["带宽", "吞吐", "总线周期"], "co.bus.perf"),
    ],
    ("co", "7.3"): [
        (["DMA", "dma"], "co.io.dma"),
        (["通道"], "co.io.channel"),
    ],
    ("cn", "3.5"): [(["CSMA", "冲突", "退避", "MAC"], "cn.dll.mac")],
    ("cn", "3.6"): [
        (["CSMA", "冲突", "退避"], "cn.dll.mac"),
        (["交换", "以太网", "VLAN", "网桥"], "cn.dll.eth"),
    ],
    ("cn", "4.2"): [
        (["ARP", "ICMP"], "cn.net.icmp"),
    ],
    ("cn", "5.3"): [
        (["拥塞", "慢开始", "慢启动", "快重传", "快恢复", "cwnd", "ssthresh"], "cn.trans.cong"),
    ],
}

# 允许 【P8S】/【P721 这类 OCR 脏尾巴，不强制右括号
Q_RE = re.compile(
    r"(?P<qno>\d{1,2})\s*[.．、]?\s*【\s*P\s*(?P<ans>\d{1,3})",
    re.I,
)
YEAR_RE = re.compile(r"【\s*(?P<year>20\d{2})\s*(?:统考)?真题】")
# title 可以是单字（「栈」）
SEC_RE = re.compile(r"^(?P<sec>\d{1,2}\.\d{1,2})\s+(?P<title>\S.*)$")
CH_RE = re.compile(r"^第\s*(?P<ch>\d{1,2})\s*章\s*(?P<title>\S.*)$")
SKIP_LINE = re.compile(
    r"^(微信|研七七|目录|说明|第0章|\d{1,3}/\d{1,3}|P\d+)$"
)
# 页内水印：【微信公众号：研七七】及 OCR 残缺形态
WATERMARK_RE = re.compile(
    r"【?\s*微信\s*公众号\s*[：:．.\s]*研[\s七]*\s*】?"
    r"|微信\s*公众号\s*[：:．.\s]*研[\s七]*"
    r"|【?\s*研[\s七]{2,}\s*】?"
    r"|微信搜一搜"
)


def clean_text(s: str, keep_newlines: bool = False) -> str:
    """去掉做题本水印，只留题干。"""
    if not s:
        return s
    s = WATERMARK_RE.sub("", s)
    if keep_newlines:
        s = re.sub(r"[^\S\n]+", " ", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
    else:
        s = re.sub(r"\s+", " ", s)
    s = s.strip(" ：:【】|")
    s = re.sub(r"（）\s*）+", "（）", s)
    s = re.sub(r"。\s*）+$", "。", s)
    return s.strip()


ABCD_SPLIT = re.compile(r"(?:(?<=^)|(?<=\s))([A-Da-d])\s*[.．、]\s*")
A_START = re.compile(r"(?:^|[\s。；;，,：:）)])A\s*[.．、]", re.I)
PAGE_NUM_RE = re.compile(r"^\d{1,3}\s*/\s*\d{1,3}$")


def split_abcd(block: str) -> dict[str, str]:
    parts = ABCD_SPLIT.split(block.strip())
    if len(parts) < 3 or parts[0].strip():
        return {}
    out: dict[str, str] = {}
    rest = parts[1:]
    for i in range(0, len(rest) - 1, 2):
        k, v = rest[i], rest[i + 1]
        k = k.upper()
        if k in "ABCD":
            val = clean_text(v)
            if val:
                out[k] = val
    return out


def split_mcq_options(text: str) -> tuple[str, dict[str, str]]:
    """从题干末尾切出 A/B/C/D。找不到则整段当题干。"""
    if not text:
        return "", {}
    found = list(A_START.finditer(text))
    for m in reversed(found):
        a_at = m.start() if text[m.start()] in "Aa" else m.start() + 1
        opts = split_abcd(text[a_at:])
        if len(opts.keys() & {"A", "B", "C", "D"}) >= 3:
            stem = text[:a_at].strip(" ；;，,")
            return stem, opts
    return text, {}


def join_ocr_lines(lines: list[str]) -> str:
    """中文行尾折行去掉空格，其余用空格拼接。"""
    acc = ""
    for ln in lines:
        if not acc:
            acc = ln
            continue
        if re.search(r"[\u4e00-\u9fffA-Za-z0-9]$", acc) and re.match(
            r"[\u4e00-\u9fff]", ln
        ):
            acc += ln
        else:
            acc += " " + ln
    return acc


def parse_question_body(kind: str, lines: list[str]) -> tuple[str, dict[str, str]]:
    cleaned: list[str] = []
    for ln in lines:
        ln = WATERMARK_RE.sub("", ln).strip()
        if not ln or PAGE_NUM_RE.match(ln) or SKIP_LINE.search(ln.replace(" ", "")):
            continue
        cleaned.append(ln)
    if kind == "big":
        return clean_text("\n".join(cleaned), keep_newlines=True), {}
    joined = clean_text(join_ocr_lines(cleaned))
    return split_mcq_options(joined)

# OCR 把 1 认成 I/l、$ 的补丁；图题漏检手工补
MANUAL_QUESTIONS = [
    {
        "book": "ds",
        "kind": "mcq",
        "section": "1.1",
        "section_name": "数据结构的基本概念",
        "qno": 2,
        "pdf_page": 4,
        "book_ans_page": 4,
        "year": None,
        "stem": "下列四种数据结构中，（ ）是非线性数据结构。",
        "pdf_edition": "无间隔",
        "pdf_name": "【无间隔】.pdf",
        "note": "页内四选项横排，OCR 未抽出题号，据原页补入",
    },
    {
        "book": "ds",
        "kind": "mcq",
        "section": "6.4",
        "section_name": "图的应用",
        "qno": 17,
        "pdf_page": 44,
        "book_ans_page": 248,
        "year": None,
        "stem": "（图题，OCR 未识别题干，见做题本 p.44 §6.4 #17）",
        "pdf_edition": "无间隔",
        "pdf_name": "【无间隔】.pdf",
        "note": "夹在配图选项中",
    },
    {
        "book": "ds",
        "kind": "mcq",
        "section": "6.4",
        "section_name": "图的应用",
        "qno": 23,
        "pdf_page": 45,
        "book_ans_page": 249,
        "year": None,
        "stem": "（图题，OCR 未识别题干，见做题本 p.45 §6.4 #23）",
        "pdf_edition": "无间隔",
        "pdf_name": "【无间隔】.pdf",
        "note": "夹在 AOE 网图中",
    },
]


def normalize_ocr_line(s: str) -> str:
    s = s.replace("【PI", "【P1").replace("【Pl", "【P1").replace("【PＩ", "【P1")
    s = s.replace("【P1$", "【P15").replace("【P1S", "【P15")
    s = re.sub(r"^I(?=\d)", "1", s)
    s = re.sub(r"^l(?=\d)", "1", s)
    return s


def toc_sections(doc: fitz.Document) -> list[dict]:
    out = []
    for level, title, page in doc.get_toc():
        title = re.sub(r"\s+", " ", title).strip()
        m = re.match(r"^(\d+\.\d+)\s+(.+)$", title)
        if m:
            out.append(
                {
                    "level": level,
                    "sec": m.group(1),
                    "title": m.group(2).strip(),
                    "page": page,
                }
            )
            continue
        m = re.match(r"^(\d+)\s+(.+)$", title)
        if m and level == 1 and m.group(1) != "0":
            out.append(
                {
                    "level": level,
                    "sec": m.group(1),
                    "title": m.group(2).strip(),
                    "page": page,
                    "chapter": True,
                }
            )
    return out


def section_on_page(toc: list[dict], page: int) -> tuple[str, str]:
    cur = ("", "")
    for item in toc:
        if item.get("chapter"):
            continue
        if item["page"] <= page:
            cur = (item["sec"], item["title"])
    return cur


def ocr_page_lines(png_path: Path) -> list[str]:
    anns = ocrmac.OCR(
        str(png_path), language_preference=["zh-Hans", "en-US"]
    ).recognize()
    # y 从下往上增大，按视觉从上到下、从左到右排
    items = []
    for text, _conf, box in anns:
        x, y, w, h = box
        items.append((-(y + h / 2), x, text.strip()))
    items.sort()
    lines: list[list[tuple[float, str]]] = []
    line_y: list[float] = []
    for cy_neg, x, text in items:
        cy = -cy_neg
        if not text:
            continue
        if lines and abs(line_y[-1] - cy) < 0.010:
            lines[-1].append((x, text))
        else:
            lines.append([(x, text)])
            line_y.append(cy)
    out = []
    for parts in lines:
        parts.sort()
        out.append(re.sub(r"\s+", " ", " ".join(p[1] for p in parts)).strip())
    return out


def render_page(page: fitz.Page, dest: Path, width: int = 1400) -> None:
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(str(dest))


def cache_key(book: str, kind: str, page: int) -> Path:
    return CACHE / f"{book}_{kind}_p{page:03d}.json"


def extract_pdf(src: dict, force: bool = False) -> list[dict]:
    pdf = src["pdf"]
    book, kind = src["book"], src["kind"]
    if src.get("reuse_json") and not src.get("ocr_stems"):
        return load_ds_big(src)

    doc = fitz.open(str(pdf))
    toc = toc_sections(doc)
    CACHE.mkdir(parents=True, exist_ok=True)
    questions: list[dict] = []
    pending: dict | None = None
    cur_sec, cur_title = "", ""
    t0 = time.time()

    def flush_pending() -> None:
        nonlocal pending
        if not pending:
            return
        stem, options = parse_question_body(pending["kind"], pending.pop("body_lines"))
        pending["stem"] = stem
        if options:
            pending["options"] = options
        questions.append(pending)
        pending = None

    def start_question(
        qm: re.Match,
        raw: str,
        compact: str,
        page_no: int,
        header_hint: str,
        toc_sec: str,
        toc_title: str,
    ) -> None:
        nonlocal pending, cur_sec, cur_title
        flush_pending()
        qno = int(qm.group("qno"))
        ans = int(qm.group("ans"))
        if ans > 500:  # 【P721 实为 P72
            ans = int(str(ans)[:2]) if ans >= 1000 else int(str(ans)[:2])
        # 题号回到 1 且本节已有 #1 → 漏检了新小节标题，改挂 TOC/页眉
        if qno == 1 and any(
            x["section"] == cur_sec and x["qno"] == 1 for x in questions
        ):
            nxt = header_hint or toc_sec
            if nxt and nxt != cur_sec:
                cur_sec, cur_title = nxt, toc_title if nxt == toc_sec else cur_title
        if not cur_sec and toc_sec:
            cur_sec, cur_title = toc_sec, toc_title
        remainder = Q_RE.sub("", raw, count=1).strip(" .。】")
        remainder = re.sub(r"^【\s*20\d{2}.*?】", "", remainder).strip()
        ym = YEAR_RE.search(raw) or YEAR_RE.search(compact)
        pending = {
            "book": book,
            "kind": kind,
            "section": cur_sec or toc_sec,
            "section_name": cur_title or toc_title,
            "qno": qno,
            "pdf_page": page_no,
            "book_ans_page": ans,
            "year": int(ym.group("year")) if ym else None,
            "pdf_edition": src["edition"],
            "pdf_name": str(pdf.name),
            "body_lines": [remainder] if remainder else [],
        }

    for i in range(doc.page_count):
        page_no = i + 1
        ck = cache_key(book, kind, page_no)
        if ck.exists() and not force:
            lines = json.loads(ck.read_text())["lines"]
        else:
            # 封面/说明多半无题
            png = CACHE / f"{book}_{kind}_p{page_no:03d}.png"
            try:
                render_page(doc[i], png)
                lines = ocr_page_lines(png)
            except Exception as e:
                print(f"  OCR fail {book}/{kind} p{page_no}: {e}", file=sys.stderr)
                lines = []
            finally:
                if png.exists():
                    png.unlink()
            ck.write_text(
                json.dumps({"page": page_no, "lines": lines}, ensure_ascii=False),
                encoding="utf-8",
            )
        toc_sec, toc_title = section_on_page(toc, page_no)
        if toc_sec and not cur_sec:
            cur_sec, cur_title = toc_sec, toc_title
        # 页眉「微信公众号 … 3.1」可作为即将换节的提示
        header_hint = ""
        if lines:
            hm = re.search(r"(\d{1,2}\.\d{1,2})\s*$", lines[0])
            if hm:
                header_hint = hm.group(1)

        for line in lines:
            raw = normalize_ocr_line(line.strip())
            compact = normalize_ocr_line(raw.replace(" ", ""))
            if compact.startswith("微信公众号") and "【P" not in compact:
                continue
            if SKIP_LINE.search(compact) or PAGE_NUM_RE.match(raw):
                continue
            ch = CH_RE.match(compact) or CH_RE.match(raw)
            if ch and "说明" not in ch.group("title"):
                continue
            sec_m = SEC_RE.match(raw) or SEC_RE.match(compact)
            if sec_m and "【P" not in compact and "【p" not in compact.lower():
                title = sec_m.group("title").strip()
                title = re.sub(r"【微信.*", "", title).strip()
                # 必须含汉字，避免把表格数字「5.5 4」当成小节
                if (
                    title
                    and re.search(r"[\u4e00-\u9fff]", title)
                    and not title.startswith("【")
                    and "章" not in title
                ):
                    new_sec = sec_m.group("sec")
                    # 页眉重复当前小节时不要冲掉跨页续题
                    if pending and new_sec == pending.get("section"):
                        cur_sec, cur_title = new_sec, title
                        continue
                    flush_pending()
                    cur_sec = new_sec
                    cur_title = title
                    continue
            qm = Q_RE.search(raw) or Q_RE.search(compact)
            if qm:
                start_question(qm, raw, compact, page_no, header_hint, toc_sec, toc_title)
                continue
            if pending:
                pending["body_lines"].append(raw)
        if page_no % 10 == 0 or page_no == doc.page_count:
            dt = time.time() - t0
            nq = len(questions) + (1 if pending else 0)
            print(
                f"  {src['label']} {page_no}/{doc.page_count} "
                f"q={nq} {dt:.0f}s",
                flush=True,
            )
    flush_pending()
    doc.close()
    questions = dedupe_questions(questions)
    if src.get("ocr_stems") and src.get("reuse_json"):
        questions = merge_reuse_meta(questions, src["reuse_json"], src)
        questions = dedupe_questions(questions)
    return questions


def merge_reuse_meta(qs: list[dict], reuse_path: str, src: dict) -> list[dict]:
    """OCR 题干为主；旧分类 JSON 补页码/答案页，并补 OCR 漏题。"""
    data = json.loads(Path(reuse_path).read_text())
    meta = {(str(d["short"]), int(d["no"])): d for d in data}
    have = {(q.get("section"), q.get("qno")) for q in qs}
    for q in qs:
        m = meta.get((str(q.get("section")), int(q.get("qno") or 0)))
        if not m:
            continue
        if m.get("ans") and not q.get("book_ans_page"):
            q["book_ans_page"] = m["ans"]
        if m.get("year") and not q.get("year"):
            q["year"] = m["year"]
        if m.get("title") and not q.get("section_name"):
            q["section_name"] = m["title"]
        reuse_stem = (m.get("stem") or "").strip()
        ocr_stem = (q.get("stem") or "").strip()
        # OCR 几乎没抽到时，才回退旧摘要
        if len(ocr_stem) < 8 and len(reuse_stem) > len(ocr_stem):
            q["stem"] = reuse_stem
    for d in data:
        key = (str(d["short"]), int(d["no"]))
        if key in have:
            continue
        qs.append(
            {
                "book": "ds",
                "kind": "big",
                "section": d["short"],
                "section_name": d["title"],
                "qno": d["no"],
                "pdf_page": d["page"],
                "book_ans_page": d.get("ans"),
                "year": d.get("year"),
                "stem": clean_text(d.get("stem") or ""),
                "pdf_edition": src.get("edition"),
                "pdf_name": Path(src["pdf"]).name,
                "ds_kind": d.get("kind"),
            }
        )
        have.add(key)
    return qs


def load_ds_big(src: dict) -> list[dict]:
    data = json.loads(Path(src["reuse_json"]).read_text())
    out = []
    for d in data:
        out.append(
            {
                "book": "ds",
                "kind": "big",
                "section": d["short"],
                "section_name": d["title"],
                "qno": d["no"],
                "pdf_page": d["page"],
                "book_ans_page": d.get("ans"),
                "year": d.get("year"),
                "stem": clean_text(d["stem"]),
                "pdf_edition": src["edition"],
                "pdf_name": src["pdf"].name,
                "ds_kind": d.get("kind"),
            }
        )
    return out


def dedupe_questions(qs: list[dict]) -> list[dict]:
    """同一小节同一题号保留首次出现（跨页续题会重复触发）。"""
    seen = set()
    out = []
    for q in qs:
        key = (q["book"], q["kind"], q["section"], q["qno"])
        if key in seen:
            continue
        # 过滤明显误识：题号 0 或超大
        if not (1 <= q["qno"] <= 80):
            continue
        seen.add(key)
        out.append(q)
    return out


def assign_kps(q: dict) -> list[str]:
    book, sec, stem = q["book"], q["section"], q.get("stem") or ""
    name = q.get("section_name") or ""
    hay = f"{name} {stem}"
    defaults = list(SECTION_KP.get((book, sec), []))
    if book == "cn" and sec == "3.6":
        if any(k in name for k in ("介质", "访问控制", "MAC")):
            defaults = ["cn.dll.mac"]
        elif any(k in name for k in ("局域", "以太", "交换机", "网桥")):
            defaults = ["cn.dll.eth"]
    rules = KEYWORD_RULES.get((book, sec), [])
    for kws, kp in rules:
        if any(k.lower() in hay.lower() for k in kws):
            return [kp]
    return defaults


def classify(questions: list[dict]) -> list[dict]:
    for q in questions:
        kps = assign_kps(q)
        q["kp_ids"] = kps
        q["kp_names"] = [KP_NAME.get(k, k) for k in kps]
        q["id"] = f"{q['book']}-{q['kind']}-{q['section']}-{q['qno']}"
    return questions


def write_markdown(questions: list[dict], path: Path) -> None:
    # 按书 → 考点组织
    by_book: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    intro: dict[str, list[dict]] = defaultdict(list)
    for q in questions:
        if q["kp_ids"]:
            by_book[q["book"]][q["kp_ids"][0]].append(q)
        else:
            intro[q["book"]].append(q)

    # 图谱模块顺序
    module_order = []
    seen_mod = set()
    for kp in KP_NAME:
        mod = ".".join(kp.split(".")[:2]) if kp.count(".") >= 2 else kp
        # 用前两段不够（ds.linear.seq → ds.linear）。按 KP_NAME 出现顺序即可。
        if kp not in seen_mod:
            module_order.append(kp)
            seen_mod.add(kp)

    lines = []
    lines.append("# 2027 王道 408 习题 · 按知识点分类")
    lines.append("")
    lines.append("来源：2027 王道考研复习指导做题本。")
    lines.append("")
    lines.append("- **选择题**：四科均用【无间隔】版（三种排版里最接近原书密度）。")
    lines.append("- **大题**：数据结构 / 操作系统用「大题」PDF；计组 / 计网用【单题】版。")
    lines.append("- **pdf_page**：做题本 PDF 页码（页脚 x/N）。")
    lines.append("- **§x.y #n**：王道书该节综合题/选择题题号（每节从 1 重编）。")
    lines.append("- **【Pxx】**：王道《复习指导》答案页，可回原书对答案。")
    lines.append("- 题干与选项来自做题本 OCR，可能有识别误差；图题仍以 PDF 为准。")
    lines.append("")

    # 统计表
    lines.append("## 规模")
    lines.append("")
    lines.append("| 科目 | 选择题 | 大题 | 合计 |")
    lines.append("|---|---:|---:|---:|")
    for book in ("ds", "co", "os", "cn"):
        mcq = sum(1 for q in questions if q["book"] == book and q["kind"] == "mcq")
        big = sum(1 for q in questions if q["book"] == book and q["kind"] == "big")
        lines.append(f"| {BOOK_NAME[book]} | {mcq} | {big} | {mcq+big} |")
    lines.append(
        f"| **合计** | {sum(1 for q in questions if q['kind']=='mcq')} | "
        f"{sum(1 for q in questions if q['kind']=='big')} | {len(questions)} |"
    )
    lines.append("")
    lines.append("OCR 漏检题号（做题本里有、表中无）："
                 "OS 选择 §1.3 #28；计组选择 §2.1 #13；计网选择 §6.2 #5；"
                 "计组大题 §4.3 #2（【单题】版该页多为上一题续页）。")
    lines.append("")

    def fmt(q: dict) -> str:
        kind = "选择" if q["kind"] == "mcq" else "大题"
        year = f" · {q['year']}真题" if q.get("year") else ""
        stem = (q.get("stem") or "").replace("|", "\\|")
        p = q.get("book_ans_page")
        ptag = f"【P{p}】" if p else ""
        return (
            f"| {kind} | §{q['section']} #{q['qno']} | p.{q['pdf_page']} | "
            f"{ptag}{year} | {stem} |"
        )

    header = "| 题型 | 节/题号 | 做题本页 | 原书答案页 | 摘要 |"
    sep = "|---|---|---:|---|---|"

    for book in ("ds", "co", "os", "cn"):
        lines.append(f"## {BOOK_NAME[book]}")
        lines.append("")
        if intro.get(book):
            lines.append("### 绪论 / 未入图谱")
            lines.append("")
            lines.append(header)
            lines.append(sep)
            for q in sorted(
                intro[book],
                key=lambda x: (x["kind"] != "mcq", x["section"], x["qno"]),
            ):
                lines.append(fmt(q))
            lines.append("")
        # 按 KP_NAME 顺序
        used = [kp for kp in KP_NAME if by_book[book].get(kp)]
        # 该科其他未知 kp
        extra = [kp for kp in by_book[book] if kp not in KP_NAME]
        for kp in used + extra:
            qs = by_book[book][kp]
            qs.sort(key=lambda x: (x["kind"] != "mcq", x["section"], x["qno"]))
            name = KP_NAME.get(kp, kp)
            n_mcq = sum(1 for q in qs if q["kind"] == "mcq")
            n_big = sum(1 for q in qs if q["kind"] == "big")
            lines.append(f"### {name} `{kp}`")
            lines.append("")
            lines.append(f"{n_mcq} 道选择 · {n_big} 道大题")
            lines.append("")
            lines.append(header)
            lines.append(sep)
            for q in qs:
                lines.append(fmt(q))
            lines.append("")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="如 ds-mcq,os-big")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    allow = {x.strip() for x in args.only.split(",") if x.strip()}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_q: list[dict] = []
    for src in SOURCES:
        key = f"{src['book']}-{src['kind']}"
        if allow and key not in allow:
            continue
        print(f"== {src['label']} {src['pdf']}", flush=True)
        qs = extract_pdf(src, force=args.force)
        print(f"   -> {len(qs)} 题", flush=True)
        all_q.extend(qs)

    # 手工补漏（去重键相同则跳过）
    have = {(q["book"], q["kind"], q["section"], q["qno"]) for q in all_q}
    for mq in MANUAL_QUESTIONS:
        key = (mq["book"], mq["kind"], mq["section"], mq["qno"])
        if key not in have:
            all_q.append(dict(mq))
            have.add(key)

    for q in all_q:
        q["stem"] = clean_text(q.get("stem") or "", keep_newlines=q.get("kind") == "big")
        if q.get("section_name"):
            q["section_name"] = clean_text(q["section_name"])
        if q.get("options"):
            q["options"] = {
                k: clean_text(v) for k, v in q["options"].items() if clean_text(v)
            }
            if not q["options"]:
                q.pop("options", None)
    all_q = classify(all_q)
    prev_path = OUT_DIR / "questions.json"
    if prev_path.exists():
        old = json.loads(prev_path.read_text(encoding="utf-8"))
        old_ans = {
            (q.get("book"), q.get("kind"), str(q.get("section")), q.get("qno")): q.get("answer")
            for q in old
            if q.get("answer")
        }
        for q in all_q:
            key = (q.get("book"), q.get("kind"), str(q.get("section")), q.get("qno"))
            if key in old_ans and not q.get("answer"):
                q["answer"] = old_ans[key]
    (OUT_DIR / "questions.json").write_text(
        json.dumps(all_q, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    slim = []
    for q in all_q:
        row = {
            "id": q["id"],
            "book": q["book"],
            "kind": q["kind"],
            "section": q["section"],
            "section_name": q.get("section_name") or "",
            "qno": q["qno"],
            "pdf_page": q.get("pdf_page"),
            "book_ans_page": q.get("book_ans_page"),
            "year": q.get("year"),
            "stem": q.get("stem") or "",
            "kp_ids": q.get("kp_ids") or [],
        }
        if q.get("options"):
            row["options"] = q["options"]
        if q.get("answer"):
            row["answer"] = q["answer"]
        slim.append(row)
    PUBLIC_CATALOG.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_CATALOG.write_text(
        json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    write_markdown(all_q, OUT_DIR / "by_kp.md")

    # 缺口报告：小节内题号不连续
    gaps = []
    grouped = defaultdict(list)
    for q in all_q:
        grouped[(q["book"], q["kind"], q["section"])].append(q["qno"])
    for key, nos in grouped.items():
        nos = sorted(set(nos))
        if not nos:
            continue
        expect = list(range(1, max(nos) + 1))
        missing = [n for n in expect if n not in nos]
        if missing:
            gaps.append({"key": f"{key[0]}-{key[1]}-{key[2]}", "missing": missing, "have": nos})
    (OUT_DIR / "gaps.json").write_text(
        json.dumps(gaps, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(all_q)} questions, {len(gaps)} sections with gaps -> {OUT_DIR}")
    print(f"frontend catalog -> {PUBLIC_CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
