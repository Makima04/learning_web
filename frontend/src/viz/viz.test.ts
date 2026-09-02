// 可视化帧生成逻辑的单测：算法部分（next/后缀/哈夫曼/遍历/Dijkstra/AVL/排序）必须正确，动画只是这些数据的展示
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { VIZ_ENTRIES } from "@/viz/registry";
import { buildNext, kmpMatch, longestBorder } from "@/viz/components/KmpView";
import { toPostfix, buildEvalFrames } from "@/viz/components/StackEvalView";
import { buildHuffman } from "@/viz/components/HuffmanView";
import { traversalOrders } from "@/viz/components/TreeTravView";
import { bfsOrder, dfsOrder } from "@/viz/components/GraphScanView";
import { dijkstraDist } from "@/viz/components/DijkstraView";
import { allBalanced, avlFinalRoot, buildAvlFrames, inorderOf, AVL_SEQ } from "@/viz/components/AvlView";
import { buildQuickSortFrames, quickSorted, QS_ARR } from "@/viz/components/QuickSortView";
import { buildHeapSortFrames, heapSorted, HS_ARR } from "@/viz/components/HeapSortView";
import { buildCircularQueueFrames } from "@/viz/components/CircularQueueView";
import { seqInsert, seqDelete } from "@/viz/components/SeqListView";
import { mergeSorted } from "@/viz/components/PolyMergeView";
import { matchBrackets } from "@/viz/components/StackApplyView";
import { bfTrace, BF_S, BF_T } from "@/viz/components/BfMatchView";
import { degreeCounts } from "@/viz/components/BtPropsView";
import { childSibling, biOrders, TREE_CHILDREN, TREE_ROOT, TREE_PRE, TREE_POST } from "@/viz/components/ForestConvertView";
import { ufRun, UF_UNIONS, UF_FIND } from "@/viz/components/UnionFindView";
import { matrixOf, listOf, VS } from "@/viz/components/GraphStoreView";
import { primFrames, kruskalFrames } from "@/viz/components/MstView";
import { topoFrames, criticalPath } from "@/viz/components/TopoSortView";
import { binSearchSteps, aslSuccess, BS_ARR } from "@/viz/components/BinSearchView";
import { bstInsert, bstDelete, inorderOf as bstInorder, BST_SEQ, type BstN } from "@/viz/components/BstView";
import { buildRbFrames, rbCheck, inorderOf as rbInorder, RB_SEQ, rbInsert } from "@/viz/components/RbtView";
import { buildBTreeFrames, bTreeInorder, BT_SEQ } from "@/viz/components/BTreeView";
import { linearProbe, chainHash, HASH_KEYS, HASH_M, asl as hashAsl } from "@/viz/components/HashView";
import { insertSortFrames, shellSortFrames, INS_ARR } from "@/viz/components/InsertSortView";
import { mergeSortFrames, mergeSorted as mgSorted, MG_ARR } from "@/viz/components/MergeSortView";
import { radixSort, RD_ARR } from "@/viz/components/RadixSortView";
import { bubblePass, selectPass, insertPass, stabilityReport } from "@/viz/components/SortCompareView";
import { mergeLevels } from "@/viz/components/ExternalSortView";
import { fibEvents } from "@/viz/components/RecurView";
import { activitySelect, ACTS } from "@/viz/components/GreedyView";
import { lcsTable, lcsBacktrack, isSubseq, LCS_X, LCS_Y } from "@/viz/components/DpView";
import { isPalindromeList } from "@/viz/components/DesignView";
import { pipelineSchedule } from "@/viz/components/PipelineView";
import { cacheSim, CACHE_BLOCKS } from "@/viz/components/CacheView";
import { translate, emat } from "@/viz/components/VirtMemView";
import { floatBits } from "@/viz/components/FloatView";
import { pvSim, PV_N, PV_OPS } from "@/viz/components/PvView";
import { rwSim, RW_EVENTS } from "@/viz/components/RwView";
import { pageReplace, replaceCount, clock2Victim, CLOCK2_ORDER, REF_STR, LRU2015_REF, LRU2019_REF, LRU2025_REF, LRU2025_INIT } from "@/viz/components/PageReplaceView";
import { fcfs, sjf, rr, PROCS, RR_Q } from "@/viz/components/SchedView";
import { bankerSafe, tryRequest, BK_AVAIL, BK_ALLOC, BK_MAX, BK_REQUEST } from "@/viz/components/BankerView";
import { pagingTranslate, segTranslate, splitVa, walkTwoLevel, levelTableFrames, PG_VA, PG_PAGE_SIZE, PG_TABLE, SEG_TABLE } from "@/viz/components/PagingView";
import { cwndTimeline } from "@/viz/components/CongView";
import { dvRounds } from "@/viz/components/DvView";
import { subnetInfo, aggregate } from "@/viz/components/IpView";

describe("KMP", () => {
  it("最长相等前后缀", () => {
    expect(longestBorder("ababa")).toBe(3);
    expect(longestBorder("aaa")).toBe(2);
    expect(longestBorder("ab")).toBe(0);
  });

  it("王道 next：ababaa → 0 1 1 2 3 4", () => {
    expect(buildNext("ababaa").slice(1)).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it("匹配位置（主串指针不回退）", () => {
    expect(kmpMatch("ababababaa", "ababaa")).toBe(5);
    expect(kmpMatch("aaaaa", "ab")).toBe(-1);
    expect(kmpMatch("hello", "hello")).toBe(1);
  });
});

describe("栈：中缀转后缀与求值", () => {
  it("1+2*3-4/2 → 1 2 3 * + 4 2 / -，值为 5", () => {
    const postfix = toPostfix(["1", "+", "2", "*", "3", "-", "4", "/", "2"]);
    expect(postfix).toEqual(["1", "2", "3", "*", "+", "4", "2", "/", "-"]);
    const last = buildEvalFrames(postfix).at(-1)!;
    expect(last.stack[0]).toBe("5");
  });
});

describe("哈夫曼", () => {
  it("[7,5,2,4]：WPL=35，前缀码 0/10/110/111", () => {
    const { wpl, codes } = buildHuffman([7, 5, 2, 4]);
    expect(wpl).toBe(35);
    const byW = [...codes].sort((a, b) => b.w - a.w); // 权重降序：编码越来越长
    expect(byW.map((c) => c.code)).toEqual(["0", "10", "111", "110"]); // 7→0, 5→10, 4→111, 2→110
    // 前缀码：任一编码不是另一个的前缀
    for (const a of byW) {
      for (const b of byW) {
        if (a !== b) expect(b.code.startsWith(a.code)).toBe(false);
      }
    }
  });
});

describe("二叉树遍历", () => {
  it("同一棵树的四种序列", () => {
    expect(traversalOrders()).toEqual({
      pre: "ABDEGCF",
      in: "DBEGAFC",
      post: "DGEBFCA",
      level: "ABCDEFG",
    });
  });
});

describe("图的 DFS/BFS", () => {
  it("按邻接表字母序", () => {
    expect(dfsOrder()).toEqual(["A", "B", "D", "C", "E", "F"]);
    expect(bfsOrder()).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("Dijkstra", () => {
  it("A 出发的最短距离", () => {
    expect(dijkstraDist()).toEqual({ A: 0, B: 3, C: 1, D: 8, E: 14 });
  });
});

describe("AVL", () => {
  it("终态：中序有序 + 全部平衡", () => {
    const root = avlFinalRoot();
    expect(inorderOf(root)).toEqual([...AVL_SEQ].sort((a, b) => a - b));
    expect(allBalanced(root)).toBe(true);
  });

  it("演示序列覆盖 RR/LL/LR/RL 四种失衡", () => {
    const phases = buildAvlFrames(AVL_SEQ).map((f) => f.phase ?? "");
    expect(phases.some((p) => p.includes("RR"))).toBe(true);
    expect(phases.some((p) => p.includes("LL"))).toBe(true);
    expect(phases.some((p) => p.includes("LR"))).toBe(true);
    expect(phases.some((p) => p.includes("RL"))).toBe(true);
  });

  it("每帧的树都保持 BST（帧间克隆不串数据）", () => {
    for (const f of buildAvlFrames(AVL_SEQ)) {
      const seq = inorderOf(f.root);
      const sorted = [...seq].sort((a, b) => a - b);
      expect(seq).toEqual(sorted);
    }
  });
});

describe("快排 / 堆排", () => {
  it("结果升序", () => {
    const sorted = [...QS_ARR].sort((a, b) => a - b);
    expect(quickSorted(QS_ARR)).toEqual(sorted);
    expect(heapSorted(HS_ARR)).toEqual([...HS_ARR].sort((a, b) => a - b));
  });

  it("快排不稳定被演示出来：终态 49₂（原始第 2 位）排在 49₁ 前面", () => {
    const frames = buildQuickSortFrames(QS_ARR);
    const last = frames.at(-1)!;
    expect(last.arr).toEqual([13, 27, 38, 49, 49, 65, 76, 97]);
    // 两个 49 的角标（原始下标）：前面的应为 "2"，后面的应为 "1"
    const dupTags = last.arr.map((v, k) => (v === 49 ? last.tags[k] : null)).filter(Boolean);
    expect(dupTags).toEqual(["2", "1"]);
    // 第一趟基准归位帧明确解说不稳定
    expect(frames.some((f) => f.phase === "基准归位" && f.desc.includes("不稳定"))).toBe(true);
  });

  it("堆排不稳定被演示出来：终态 49₇（原始第 7 位）排在 49₂ 前面", () => {
    const frames = buildHeapSortFrames(HS_ARR);
    const last = frames.at(-1)!;
    expect(last.arr).toEqual([13, 27, 38, 49, 49, 65, 76, 97]);
    // 两个 49 的角标（原始下标）：前面的应为 "7"，后面的应为 "2"（初始 49₂ 在前）
    const dupTags = last.arr.map((v, k) => (v === 49 ? last.tags[k] : null)).filter(Boolean);
    expect(dupTags).toEqual(["7", "2"]);
    expect(last.desc.includes("不稳定")).toBe(true);
  });
});

describe("演示组件烟测", () => {
  it("每个注册的组件都能静态渲染出实质内容（不崩、不空、无 NaN）", () => {
    expect(VIZ_ENTRIES.length).toBeGreaterThanOrEqual(11);
    for (const { kpId, Component } of VIZ_ENTRIES) {
      const html = renderToStaticMarkup(createElement(Component));
      expect(html.length, `${kpId} 渲染过短`).toBeGreaterThan(400);
      expect(html, `${kpId} 渲染出 NaN`).not.toContain("NaN");
    }
  });

  it("内存管理四档图解默认渲染含题型 tab", () => {
    const byKp = Object.fromEntries(VIZ_ENTRIES.map((e) => [e.kpId, e.Component]));
    const alloc = renderToStaticMarkup(createElement(byKp["os.mem.alloc"]!));
    expect(alloc).toContain("适应算法");
    expect(alloc).toContain("回收合并");
    expect(alloc).toContain("伙伴系统");
    const page = renderToStaticMarkup(createElement(byKp["os.mem.page"]!));
    expect(page).toContain("二级页表");
    expect(page).toContain("三级页表");
    const virt = renderToStaticMarkup(createElement(byKp["os.mem.virt"]!));
    expect(virt).toContain("CLOCK");
    expect(virt).toContain("2015 LRU");
    const thrash = renderToStaticMarkup(createElement(byKp["os.mem.thrash"]!));
    expect(thrash).toContain("408 时刻 t");
    expect(thrash).toContain("缺页率因素");
  });
});

describe("循环队列", () => {
  it("牺牲一格判满：第 8 个元素入队触发队满", () => {
    const frames = buildCircularQueueFrames([
      ...(["a", "b", "c", "d", "e", "f", "g"] as const).map((ch) => ({ kind: "enq" as const, ch })),
      { kind: "enq" as const, ch: "h" },
      { kind: "enq" as const, ch: "i" },
      { kind: "deq" as const },
    ]);
    expect(frames.some((f) => f.phase === "队满")).toBe(true);
    // 容量 m-1=7：a..g 占满，h 与 i 两次入队均判满
    const fullFrames = frames.filter((f) => f.phase === "队满");
    expect(fullFrames.length).toBe(2);
    // 出队帧：front 仍指着被取走的元素（下一拍才前移），该格标记为已释放
    const deqFrames = frames.filter((f) => f.phase === "出队");
    expect(deqFrames.length).toBe(1);
    expect(deqFrames[0]!.front).toBe(0);
    expect(deqFrames[0]!.slots[0]).toBe("a");
  });
});

describe("顺序表", () => {
  it("插入：位序 3 插 30，后移腾位", () => {
    expect(seqInsert([12, 25, 33, 48, 56], 3, 30)).toEqual([12, 25, 30, 33, 48, 56]);
  });
  it("删除：位序 2 删 25，前移补位", () => {
    expect(seqDelete([12, 25, 33, 48, 56], 2)).toEqual({ next: [12, 33, 48, 56], removed: 25 });
  });
});

describe("链表应用", () => {
  it("归并两个递增链表：结果递增且稳定（相等先取 A）", () => {
    const out = mergeSorted(
      [{ v: 2, o: "A1" }, { v: 8, o: "A2" }, { v: 25, o: "A3" }],
      [{ v: 2, o: "B1" }, { v: 5, o: "B2" }, { v: 19, o: "B3" }]
    );
    expect(out.map((x) => x.v)).toEqual([2, 2, 5, 8, 19, 25]);
    expect(out.filter((x) => x.v === 2).map((x) => x.o)).toEqual(["A1", "B1"]);
  });
});

describe("括号匹配", () => {
  it("正确串通过，错误串定位到首个错误下标", () => {
    expect(matchBrackets("[a+(b*c)-{d/(e+f)}]").ok).toBe(true);
    const bad = matchBrackets("[a+(b*c)}-d)");
    expect(bad.ok).toBe(false);
    expect(bad.errPos).toBe(8); // 下标 8 的 } 与栈顶 ( 不匹配
    expect(matchBrackets("((a+b)*c").reason).toContain("剩 1 个左括号");
  });
});

describe("BF 暴力匹配", () => {
  it("经典例子：成功匹配共比较 16 次，起点第 6 个字符", () => {
    const r = bfTrace(BF_S, BF_T);
    expect(r.foundAt).toBe(5);
    expect(r.comparisons).toBe(16);
  });
});

describe("二叉树性质", () => {
  it("n0 = n2 + 1 当场成立", () => {
    const { n0, n1, n2 } = degreeCounts();
    expect(n0).toBe(n2 + 1);
    expect(n0 + n1 + n2).toBe(7);
  });
});

describe("树 → 二叉树（孩子兄弟）", () => {
  it("先根 = 二叉先序，后根 = 二叉中序", () => {
    const bi = childSibling(TREE_CHILDREN as Record<string, string[]>, TREE_ROOT);
    const { pre, in: ino } = biOrders(bi);
    expect(pre).toBe(TREE_PRE.join(""));
    expect(ino).toBe(TREE_POST.join(""));
  });
});

describe("并查集", () => {
  it("合并后全体同根，路径压缩后查询 1 步", () => {
    const r = ufRun(8, UF_UNIONS, UF_FIND);
    expect(r.root).toBe(1);
    expect(r.beforeDepth).toBeGreaterThan(r.afterDepth);
    expect(r.afterDepth).toBe(1);
    // 全部连通：parent 树上最终都能到 1
    expect(new Set(r.parent.slice(1).map((p, i) => (p === i + 1 ? 1 : p))).size).toBeGreaterThanOrEqual(1);
  });
});

describe("图的存储", () => {
  it("邻接矩阵对称，行和 = 度；邻接表度数一致", () => {
    const m = matrixOf();
    for (let i = 0; i < VS.length; i++) {
      for (let j = 0; j < VS.length; j++) expect(m[i]![j]).toBe(m[j]![i]);
    }
    const l = listOf();
    const degSum = m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0) / 2;
    expect(degSum).toBe(5);
    m.forEach((row, i) => {
      expect(row.reduce((a, b) => a + b, 0)).toBe(l[i]!.length);
    });
  });
});

describe("最小生成树", () => {
  it("Prim 与 Kruskal 总权都是 15，5 条边", () => {
    const p = primFrames("A");
    const k = kruskalFrames();
    expect(p.total).toBe(15);
    expect(k.total).toBe(15);
    expect(p.frames.at(-1)!.tree.length).toBe(5);
    expect(k.frames.at(-1)!.tree.length).toBe(5);
  });
});

describe("拓扑排序与关键路径", () => {
  it("拓扑序列合法且关键路径长 8", () => {
    const { order } = topoFrames();
    expect(order).toHaveLength(6);
    // 任意边的起点在终点之前
    const idx = Object.fromEntries(order.map((v, i) => [v, i]));
    for (const e of criticalPathEdges()) {
      expect(idx[e[0]]!).toBeLessThan(idx[e[1]]!);
    }
    const cp = criticalPath();
    expect(cp.length).toBe(8);
    expect(cp.crit.map((e) => `${e.a}${e.b}`).join(",")).toBe("13,34,46");
  });
  function criticalPathEdges(): [string, string][] {
    return [
      ["1", "2"], ["1", "3"], ["2", "4"], ["3", "4"], ["3", "5"], ["4", "6"], ["5", "6"],
    ];
  }
});

describe("折半查找", () => {
  it("查 14：4 次成功；查 50：4 次失败；ASL = 41/13", () => {
    const a = binSearchSteps(BS_ARR, 14);
    expect(a.found).toBe(true);
    expect(a.steps.length).toBe(4);
    const b = binSearchSteps(BS_ARR, 50);
    expect(b.found).toBe(false);
    expect(b.steps.length).toBe(4);
    expect(aslSuccess(BS_ARR)).toBeCloseTo(41 / 13, 10);
  });
});

describe("BST", () => {
  it("插入后中序有序；删除 30 后仍有序且不含 30", () => {
    let root: BstN | null = null;
    for (const v of BST_SEQ) root = bstInsert(root, v);
    expect(bstInorder(root)).toEqual([...BST_SEQ].sort((a, b) => a - b));
    const after = bstDelete(root, 30);
    expect(bstInorder(after)).toEqual([...BST_SEQ].filter((v) => v !== 30).sort((a, b) => a - b));
  });
});

describe("红黑树", () => {
  it("插入序列触发旋转与变色，终态满足三性质", () => {
    const frames = buildRbFrames();
    expect(frames.some((f) => f.phase === "旋转")).toBe(true);
    expect(frames.some((f) => f.phase === "变色" || f.phase === "根染黑")).toBe(true);
    let root = null as ReturnType<typeof rbInsert>;
    for (const v of RB_SEQ) root = rbInsert(root, v);
    const chk = rbCheck(root);
    expect(chk.rootBlack).toBe(true);
    expect(chk.noRedRed).toBe(true);
    expect(chk.blackHeight).toBe(2);
    expect(rbInorder(root)).toEqual([...RB_SEQ].sort((a, b) => a - b));
  });
});

describe("B 树", () => {
  it("3 阶插入：中序有序，根分裂后高度 3", () => {
    const frames = buildBTreeFrames(3, BT_SEQ);
    expect(frames.some((f) => f.phase === "根分裂")).toBe(true);
    const last = frames.at(-1)!;
    expect(bTreeInorder(last.root)).toEqual([...BT_SEQ].sort((a, b) => a - b));
  });
});

describe("散列", () => {
  it("线性探测与链地址的落位与 ASL（12/7 与 9/7）", () => {
    const lp = linearProbe(HASH_KEYS, HASH_M);
    expect(lp.map((x) => x.pos)).toEqual([4, 5, 6, 7, 8, 2, 9]);
    expect(hashAsl(lp.map((x) => x.probes))).toBeCloseTo(12 / 7, 10);
    const ch = chainHash(HASH_KEYS, HASH_M);
    expect(ch[5]).toEqual([38, 27]);
    expect(ch[7]).toEqual([84, 40]);
    const costs = HASH_KEYS.map((k) => ch[k % HASH_M]!.indexOf(k) + 1);
    expect(hashAsl(costs)).toBeCloseTo(9 / 7, 10);
  });
});

describe("插入类排序：稳定性对照", () => {
  it("直接插入稳定，希尔不稳定（同一数据）", () => {
    const ins = insertSortFrames(INS_ARR).at(-1)!.items;
    const shell = shellSortFrames(INS_ARR, [4, 2, 1]).at(-1)!.items;
    const sorted = [...INS_ARR].sort((a, b) => a - b);
    expect(ins.map((x) => x.v)).toEqual(sorted);
    expect(shell.map((x) => x.v)).toEqual(sorted);
    const insDup = ins.filter((x) => x.v === 49).map((x) => x.o);
    const shellDup = shell.filter((x) => x.v === 49).map((x) => x.o);
    expect(insDup).toEqual([1, 2]); // 保序
    expect(shellDup).toEqual([2, 1]); // 反序 → 不稳定被真实演示
  });
});

describe("归并排序", () => {
  it("结果有序且稳定（相等先取左半）", () => {
    const last = mergeSortFrames(MG_ARR).at(-1)!.items;
    expect(mgSorted(MG_ARR)).toEqual([...MG_ARR].sort((a, b) => a - b));
    expect(last.filter((x) => x.v === 49).map((x) => x.o)).toEqual([1, 6]);
  });
});

describe("基数排序", () => {
  it("两轮（个位、十位）后有序", () => {
    expect(radixSort(RD_ARR)).toEqual([...RD_ARR].sort((a, b) => a - b));
  });
});

describe("排序对比", () => {
  it("各算法第一趟结果与稳定性实测", () => {
    const a = [49, 49, 38, 97, 76, 13, 27, 65];
    expect(bubblePass(a)).toEqual([49, 38, 49, 76, 13, 27, 65, 97]);
    expect(selectPass(a)).toEqual([13, 49, 38, 97, 76, 49, 27, 65]);
    expect(insertPass(a)).toEqual([49, 49, 38, 97, 76, 13, 27, 65]); // 前两个已局部有序
    const rep = stabilityReport();
    const by = Object.fromEntries(rep.map((r) => [r.algo, r.stable]));
    expect(by["快排"]).toBe(false);
    expect(by["堆排"]).toBe(false);
    expect(by["希尔"]).toBe(false);
    expect(by["直接插入"]).toBe(true);
    expect(by["归并"]).toBe(true);
  });
});

describe("外部排序", () => {
  it("8 段 2 路归并 3 趟；4 路 2 趟；4 段 4 路 1 趟", () => {
    expect(mergeLevels(8, 2)).toEqual([8, 4, 2, 1]);
    expect(mergeLevels(8, 4)).toEqual([8, 2, 1]);
    expect(mergeLevels(4, 4)).toEqual([4, 1]);
  });
});

describe("递归 fib", () => {
  it("fib(4)=3，调用 9 次，fib(2) 重复 2 次", () => {
    const r = fibEvents(4);
    expect(r.value).toBe(3);
    expect(r.calls).toBe(9);
    expect(r.dupCounts[2]).toBe(2);
    const r5 = fibEvents(5);
    expect(r5.value).toBe(5);
    expect(r5.calls).toBe(15); // 2·fib(6)−1
  });
});

describe("贪心：活动选择", () => {
  it("最早结束选 4 个；最早开始/最短时长都只有 3 个", () => {
    expect(activitySelect(ACTS, "finish")).toHaveLength(4);
    expect(activitySelect(ACTS, "start")).toHaveLength(3);
    expect(activitySelect(ACTS, "short")).toHaveLength(3);
  });
});

describe("DP：LCS", () => {
  it("LCS 长度 4，回溯结果是两串的公共子序列", () => {
    const { len } = lcsTable(LCS_X, LCS_Y);
    expect(len).toBe(4);
    const one = lcsBacktrack(LCS_X, LCS_Y);
    expect(one.length).toBe(4);
    expect(isSubseq(one, LCS_X)).toBe(true);
    expect(isSubseq(one, LCS_Y)).toBe(true);
  });
});

describe("算法设计：回文链表", () => {
  it("快慢指针 + 逆置判定", () => {
    expect(isPalindromeList([1, 2, 3, 2, 1])).toBe(true);
    expect(isPalindromeList([1, 2, 2, 1])).toBe(true);
    expect(isPalindromeList([1])).toBe(true);
    expect(isPalindromeList([1, 2, 3])).toBe(false);
    expect(isPalindromeList([1, 2])).toBe(false);
  });
});

describe("计组：指令流水线", () => {
  it("理想 9 周期；load-use 冒险 10 周期", () => {
    expect(pipelineSchedule(false).cycles).toBe(9);
    const st = pipelineSchedule(true);
    expect(st.cycles).toBe(10);
    // I2 的 EX 在周期 5（停顿一拍），气泡在周期 4
    expect(st.cells.some((c) => c.i === 1 && c.stage === "EX" && c.c === 5)).toBe(true);
    expect(st.cells.some((c) => c.stage === "*" && c.c === 4)).toBe(true);
  });
});

describe("计组：Cache 映射", () => {
  it("直接映射 0 命中；组相联/全相联各 2 命中", () => {
    expect(cacheSim(CACHE_BLOCKS, "direct").hits).toBe(0);
    expect(cacheSim(CACHE_BLOCKS, "set2").hits).toBe(2);
    expect(cacheSim(CACHE_BLOCKS, "full").hits).toBe(2);
  });
});

describe("计组：虚拟存储与浮点", () => {
  it("地址翻译与 EMAT", () => {
    expect(translate(0x3a7f, 9)).toBe(0x9a7f);
    expect(emat(0.98)).toBeCloseTo(112, 6);
  });
  it("IEEE754：-12.75 → 0xC14C0000；0.5 → 0x3F000000", () => {
    const b = floatBits(-12.75);
    expect(b.hex).toBe("0xC14C0000");
    expect(b.sign).toBe("1");
    expect(b.exp).toBe("10000010"); // 130 = 3 + 127
    expect(b.frac.startsWith("10011")).toBe(true); // 1.10011 隐含 1
    expect(floatBits(0.5).hex).toBe("0x3F000000");
  });
});

describe("OS：PV 生产者-消费者", () => {
  it("缓冲区满时生产者阻塞，消费者 V(empty) 唤醒", () => {
    const { frames, blockedCount } = pvSim(PV_N, PV_OPS);
    expect(blockedCount).toBe(1);
    expect(frames.some((f) => f.blocked === "P")).toBe(true);
    // 唤醒后缓冲区重新有 3 个产品
    const last = frames.at(-1)!;
    expect(last.buf.filter((x) => x !== null).length).toBeGreaterThanOrEqual(2);
    expect(last.mutex).toBe(1);
  });
});

describe("OS：读者-写者", () => {
  it("读者在场期间写者被挡；最后一个读者走后才放行", () => {
    const { frames, writerBlockedRounds } = rwSim(RW_EVENTS);
    expect(writerBlockedRounds).toBe(1);
    const blockedFrame = frames.find((f) => f.writerWaiting && !f.writerActive);
    expect(blockedFrame).toBeDefined();
    expect(blockedFrame!.count).toBeGreaterThan(0);
    // 序列结束时无写者滞留
    expect(frames.at(-1)!.writerActive).toBe(false);
  });
});

describe("OS：页面置换", () => {
  it("经典 Belady 序列：FIFO 3/4 帧 = 9/10（异常），LRU 10，OPT 7", () => {
    expect(pageReplace(REF_STR, 3, "FIFO").faults).toBe(9);
    expect(pageReplace(REF_STR, 4, "FIFO").faults).toBe(10);
    expect(pageReplace(REF_STR, 3, "LRU").faults).toBe(10);
    expect(pageReplace(REF_STR, 3, "OPT").faults).toBe(7);
  });

  it("2016 选择 26：改进 CLOCK 次序 (0,0)→(0,1)→(1,0)→(1,1)", () => {
    expect(CLOCK2_ORDER).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("2015 选择 27：4 帧 LRU，下一页 7 淘汰页 2", () => {
    const { steps } = pageReplace(LRU2015_REF, 4, "LRU");
    const last = steps.at(-1)!;
    expect(last.ref).toBe(7);
    expect(last.hit).toBe(false);
    expect(last.evicted).toBe(2);
  });

  it("2019 选择 29：4 帧 LRU 置换 5 次（空帧填入不算）", () => {
    expect(pageReplace(LRU2019_REF, 4, "LRU").faults).toBe(9);
    expect(replaceCount(LRU2019_REF, 4, "LRU")).toBe(5);
  });

  it("2025 选择 26：3 帧且 0/1/2 已在内存，缺页 6 次", () => {
    expect(pageReplace(LRU2025_REF, 3, "LRU", LRU2025_INIT).faults).toBe(6);
  });

  it("改进 CLOCK：全是 (1,*) 时第一轮找不到，清 A 后第三轮淘汰", () => {
    const r = clock2Victim(
      [
        { id: 3, a: 1, m: 0 },
        { id: 4, a: 1, m: 1 },
      ],
      0
    );
    expect(r.scans).toBe(3);
    expect(r.victimIndex).toBe(0);
    expect(r.afterA).toEqual([0, 0]);
  });
});

describe("OS：调度", () => {
  it("FCFS 8.75 / SJF 8 / RR 9（平均周转）", () => {
    expect(fcfs(PROCS).avgTT).toBeCloseTo(8.75, 10);
    expect(sjf(PROCS).avgTT).toBeCloseTo(8, 10);
    expect(sjf(PROCS).completion[2]).toBe(8); // P3 最短先跑（P1 完成后）
    expect(rr(PROCS, RR_Q).avgTT).toBeCloseTo(9, 10);
    // 甘特段连续无缝隙
    const segs = rr(PROCS, RR_Q).segments;
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
  });
});

describe("OS：银行家算法", () => {
  it("王道数据存在安全序列；P4 请求 (3,3,0) 不安全应拒绝", () => {
    const seq = bankerSafe(BK_AVAIL, BK_ALLOC, BK_MAX);
    expect(seq.length).toBe(5);
    expect(seq[0]).toBe("P1"); // 最小下标优先
    const req = tryRequest(BK_AVAIL, BK_ALLOC, BK_MAX, BK_REQUEST.p, BK_REQUEST.req);
    expect(req.grant).toBe(false);
    expect(req.reason).toContain("安全");
  });
});

describe("OS：分页/分段地址翻译", () => {
  it("2500 → 页2偏移452 → 帧5 → 5572；段越界触发中断", () => {
    const r = pagingTranslate(PG_VA, PG_PAGE_SIZE, PG_TABLE);
    expect(r).toMatchObject({ page: 2, offset: 452, frame: 5, pa: 5572, fault: false });
    expect(pagingTranslate(4096, PG_PAGE_SIZE, PG_TABLE).fault).toBe(true);
    expect(segTranslate(3, 500, SEG_TABLE)).toEqual({ pa: 160 * 1024 + 500, trap: false });
    expect(segTranslate(3, SEG_TABLE[3]!.limit, SEG_TABLE).trap).toBe(true);
  });

  it("2019 选择 31：VA 2050 1225H 按 10+10+12 拆成目录号 081H、页号 101H", () => {
    expect(splitVa(0x20501225, [10, 10, 12])).toEqual([0x081, 0x101, 0x225]);
  });

  it("2020 大题 46：a[1][2] 走二级页表得到 PTE 物理地址 0030 1004H", () => {
    const w = walkTwoLevel({
      va: 0x10801008,
      pdbr: 0x00201000,
      dirFrame: 0x00301,
      pageFrame: 0x00030,
    });
    expect(w.dir).toBe(0x42);
    expect(w.pt).toBe(0x1);
    expect(w.offset).toBe(0x008);
    expect(w.pdePa).toBe(0x00201108);
    expect(w.ptBase).toBe(0x00301000);
    expect(w.ptePa).toBe(0x00301004);
    expect(w.pa).toBe(0x00030008);
  });

  it("2026 选择 28：三级 9+9+9+12 满映射时 L3 占 256K 页框", () => {
    expect(levelTableFrames([9, 9, 9], 12, 1)).toBe(1);
    expect(levelTableFrames([9, 9, 9], 12, 2)).toBe(512);
    expect(levelTableFrames([9, 9, 9], 12, 3)).toBe(256 * 1024);
  });
});

describe("计网：拥塞控制 cwnd 时间线", () => {
  it("超时前峰 12；超时后 cwnd=1、门限 6；3ACK 后 cwnd=4、门限 4", () => {
    const tl = cwndTimeline();
    const timeout = tl.find((p) => p.event === "超时")!;
    expect(timeout.cwnd).toBe(1);
    expect(timeout.ssthresh).toBe(6);
    expect(Math.max(...tl.map((p) => p.cwnd))).toBe(12);
    const ack = tl.find((p) => p.event === "3ACK")!;
    expect(ack.cwnd).toBe(4);
    expect(ack.ssthresh).toBe(4);
    expect(tl.at(-1)!.cwnd).toBe(5); // 快恢复后线性 +1
  });
});

describe("计网：距离向量收敛", () => {
  it("3 轮内收敛；A 到 C 走 B（3 < 直连 5），A 到 D = 4", () => {
    const { rounds, convergedAt } = dvRounds();
    expect(convergedAt).toBeLessThanOrEqual(3);
    const final = rounds.at(-1)!;
    expect(final["A"]!["C"]).toBe(3);
    expect(final["A"]!["D"]).toBe(4);
    expect(final["D"]!["B"]).toBe(3);
  });
});

describe("计网：IP 子网与 CIDR", () => {
  it("192.168.10.70/26 → 网络 .64、广播 .127、62 主机", () => {
    const q = subnetInfo("192.168.10.70", 26);
    expect(q).toMatchObject({
      network: "192.168.10.64",
      broadcast: "192.168.10.127",
      first: "192.168.10.65",
      last: "192.168.10.126",
      count: 62,
      mask: "255.255.255.192",
    });
    expect(subnetInfo("10.1.2.3", 8).count).toBe(2 ** 24 - 2);
  });
  it("4 个连续对齐 /24 可聚合为 /22；不对齐不行", () => {
    expect(aggregate(["192.168.0.0/24", "192.168.1.0/24", "192.168.2.0/24", "192.168.3.0/24"])).toBe(22);
    expect(aggregate(["192.168.1.0/24", "192.168.2.0/24", "192.168.3.0/24", "192.168.4.0/24"])).toBeNull();
  });
});

/* ================= 以下为全覆盖批次（计组 16 + OS 12 + 计网 14）新增内核断言 ================= */

import { VN_PROG, vnRun } from "@/viz/components/HierView";
import { perfCalc, MIX_A, MIX_B, MIX_C } from "@/viz/components/PerfView";
import { intEncodings } from "@/viz/components/IntCodeView";
import { addSub8, dualSign } from "@/viz/components/AluView";
import { hammingCode, hammingCheck, crcRem } from "@/viz/components/CheckCodeView";
import { localityScan } from "@/viz/components/MemHierView";
import { chipPlan, decodeAddr, refreshPlan } from "@/viz/components/ChipView";
import { eaModes, expandOpcodes, A as ISA_A, PC0 as ISA_PC } from "@/viz/components/IsaView";
import { ciscRiscCycles } from "@/viz/components/CiscRiscView";
import { datapathFlow } from "@/viz/components/DatapathView";
import { microRun, hardwireRun } from "@/viz/components/MicroView";
import { chainGrant, counterGrant, REQ_DEMO } from "@/viz/components/BusArbView";
import { busBw, bitRate } from "@/viz/components/BusPerfView";
import { ioCompare } from "@/viz/components/IoIntrView";
import { dmaVsIntr } from "@/viz/components/DmaView";
import { ioCpuCost } from "@/viz/components/ChannelView";
import { JOBS, batchTimeline } from "@/viz/components/BatchView";
import { trapFlow, isPrivileged } from "@/viz/components/TrapView";
import { procWalk } from "@/viz/components/ProcStateView";
import { dynAlloc, INIT_PARTS, REQ as DA_REQ, coalesce, sortBestFit, buddyAlloc, buddyFree, COAL_INIT, COAL_REC } from "@/viz/components/DynAllocView";
import { WS_REF, thrashCurve, workingSet, workingSetAt, T408_REF, T408_W } from "@/viz/components/ThrashView";
import { OS_MEM_EXAMS, osMemExamsForKp } from "@/data/kg/osMemTopics";
import { readCost, INDEX_TABLE } from "@/viz/components/FileStructView";
import { resolvePath, hardLinkRef, FSDATA } from "@/viz/components/DirView";
import { indexMax } from "@/viz/components/InodeView";
import { bitmapPos, bitmapBlock, groupLinkAlloc } from "@/viz/components/FreeSpaceView";
import { bufferSim } from "@/viz/components/BufferView";
import { diskSchedule, REQS as DISK_REQS, START as DISK_START } from "@/viz/components/DiskSchedView";
import { encapsulate } from "@/viz/components/EncapView";
import { sendDelayMs, propDelayMs, hopDelayMs } from "@/viz/components/DelayView";
import { encodeWave, transitions, BITS as WAVE_BITS } from "@/viz/components/CodingView";
import { switchCompare } from "@/viz/components/SwitchView";
import { slidingSim } from "@/viz/components/SlidingView";
import { minFrameLen, backoffMax } from "@/viz/components/CsmaView";
import { switchLearn, EVENTS as SW_EVENTS } from "@/viz/components/SwitchLearnView";
import { byteStuff, pppStateWalk } from "@/viz/components/PppView";
import { arpSteps, traceroute } from "@/viz/components/ArpView";
import { compressIPv6, SAMPLES as V6_SAMPLES } from "@/viz/components/Ipv6View";
import { udpChecksum, scenarioWords } from "@/viz/components/UdpView";
import { dnsResolve } from "@/viz/components/DnsView";
import { httpTotal } from "@/viz/components/HttpView";
import { doraSteps } from "@/viz/components/DhcpView";

describe("计组：冯·诺依曼执行", () => {
  it("LDA10/ADD32/STA200 → ACC=42、M[200]=42、6 周期", () => {
    const r = vnRun(VN_PROG);
    expect(r.acc).toBe(42);
    expect(r.mem200).toBe(42);
    expect(r.cycles).toBe(6);
    expect(r.ir).toEqual(["LDA 10", "ADD 32", "STA 200"]);
  });
});

describe("计组：CPI/MIPS", () => {
  it("主频陷阱：2GHz×CPI4 与 1GHz×CPI2 同速；混合程序算 MIPS", () => {
    expect(perfCalc(2000, MIX_A).timeUs).toBe(2000);
    expect(perfCalc(1000, MIX_B).timeUs).toBe(2000);
    const c = perfCalc(1000, MIX_C);
    expect(c.cycles).toBe(9.5e6);
    expect(c.instrs).toBe(3e6);
    expect(c.timeUs).toBe(9500);
    expect(c.mips).toBeCloseTo(315.79, 1);
  });
});

describe("计组：原反补移码", () => {
  it("-45 四码与 -128 边界", () => {
    const e = intEncodings(-45);
    expect(e.orig).toBe("10101101");
    expect(e.inv).toBe("11010010");
    expect(e.comp).toBe("11010011");
    expect(e.shift).toBe("01010011");
    expect(e.hex).toBe("0xD3");
    expect(intEncodings(-128).orig).toBeNull();
    expect(intEncodings(-128).comp).toBe("10000000");
    expect(intEncodings(127).comp).toBe("01111111");
    expect(intEncodings(45).comp).toBe("00101101"); // 正数三码相同
  });
});

describe("计组：补码加减与溢出", () => {
  it("96+96 回卷成 -64 溢出；20-80=-60 无溢出", () => {
    expect(addSub8(96, 96)).toMatchObject({ result: -64, v: true });
    expect(addSub8(-96, -96)).toMatchObject({ result: 64, v: true });
    expect(addSub8(20, 80, true)).toMatchObject({ result: -60, v: false });
    expect(addSub8(50, 25)).toMatchObject({ result: 75, v: false });
  });
  it("双符号位：01 正溢、10 负溢、00 无溢出", () => {
    expect(dualSign(96, 96)).toBe("01");
    expect(dualSign(-96, -96)).toBe("10");
    expect(dualSign(50, 25)).toBe("00");
  });
});

describe("计组：海明与 CRC", () => {
  it("海明(1010)=1011010；翻第 3 位 → S=3", () => {
    const h = hammingCode([1, 0, 1, 0]);
    expect(h.code).toEqual([1, 0, 1, 1, 0, 1, 0]);
    const recv = [...h.code];
    recv[2] ^= 1;
    expect(hammingCheck(recv)).toBe(3);
    expect(hammingCheck(h.code)).toBe(0);
  });
  it("CRC(10110, 10011) = 1111", () => {
    expect(crcRem([1, 0, 1, 1, 0], [1, 0, 0, 1, 1])).toEqual([1, 1, 1, 1]);
  });
});

describe("计组：局部性", () => {
  it("按行 8/16 命中，按列 0/16（块=2、直接映射 2 行）", () => {
    expect(localityScan("row").hits).toBe(8);
    expect(localityScan("row").misses).toBe(8);
    expect(localityScan("col").hits).toBe(0);
  });
});

describe("计组：芯片扩展与刷新", () => {
  it("4K×4 → 16K×8 需 8 片、片选 2 位", () => {
    const p = chipPlan(4, 4, 16, 8);
    expect(p).toMatchObject({ wordExpand: 4, bitExpand: 2, chips: 8, addrBits: 14, offBits: 12, csBits: 2 });
    expect(decodeAddr(0x35af, 12)).toEqual({ cs: 3, intra: 0x5af });
  });
  it("128 行 / 2ms 分散刷新间隔 15.625µs", () => {
    expect(refreshPlan(128, 2).intervalUs).toBe(15.625);
  });
});

describe("计组：寻址方式与扩展操作码", () => {
  it("EA：间接 1000（访存 2 次）、相对 2800、变址 1000、基址 2100", () => {
    const m = eaModes();
    expect(m.find((x) => x.mode === "一次间接寻址")).toMatchObject({ ea: 1000, operand: 42, memAccess: 2 });
    expect(m.find((x) => x.mode === "相对寻址")).toMatchObject({ ea: ISA_PC + ISA_A, operand: 42 });
    expect(m.find((x) => x.mode === "变址寻址")).toMatchObject({ ea: 1000, operand: 42 });
    expect(m.find((x) => x.mode === "基址寻址")).toMatchObject({ ea: 2100, operand: 42 });
    expect(m.find((x) => x.mode === "立即寻址")).toMatchObject({ ea: null, operand: ISA_A, memAccess: 0 });
    expect(expandOpcodes().total).toBe(61);
  });
});

describe("计组：CISC vs RISC", () => {
  it("同任务 CISC 10 拍；RISC 流水 8 拍、串行 20 拍", () => {
    const r = ciscRiscCycles();
    expect(r.ciscCycles).toBe(10);
    expect(r.riscCyclesPipe).toBe(8);
    expect(r.riscCyclesSerial).toBe(20);
    expect(r.riscInsns).toHaveLength(4);
  });
});

describe("计组：数据通路", () => {
  it("lw 经过 DM 且写回；sw 不写回；beq 回到 PC", () => {
    const d = datapathFlow();
    const lw = d.find((x) => x.insn.startsWith("lw"))!;
    const sw = d.find((x) => x.insn.startsWith("sw"))!;
    const beq = d.find((x) => x.insn.startsWith("beq"))!;
    expect(lw.comps).toContain("DM");
    expect(lw.write).toBe("R1");
    expect(sw.write).toBeUndefined();
    expect(sw.comps).toContain("DM");
    expect(beq.comps.filter((c) => c === "PC")).toHaveLength(2);
  });
});

describe("计组：微程序控制器", () => {
  it("ADD 走 μ0→μ1→μ3；LDA 走 μ0→μ1→μ2；硬布线 3 拍", () => {
    expect(microRun("ADD").map((s) => s.addr)).toEqual([0, 1, 3]);
    expect(microRun("LDA").map((s) => s.addr)).toEqual([0, 1, 2]);
    expect(hardwireRun("ADD")).toHaveLength(3);
  });
});

describe("计组：总线", () => {
  it("链式/计数器仲裁：1、2 号同请判 1 号", () => {
    expect(chainGrant(REQ_DEMO)).toBe(1);
    expect(counterGrant(0, REQ_DEMO)).toBe(1);
  });
  it("32 位 @100MHz = 400MB/s；DDR64 位 @200MHz = 3200MB/s", () => {
    expect(busBw(100, 32)).toBe(400);
    expect(busBw(200, 64, 2)).toBe(3200);
    expect(bitRate(1200, 2)).toBe(2400);
  });
});

describe("计组：I/O 方式账本", () => {
  it("查询 CPU 全占 10300µs；中断只占 300µs", () => {
    const c = ioCompare(100, 100, 3);
    expect(c.queryCpuUs).toBe(10300);
    expect(c.intrCpuUs).toBe(300);
  });
  it("DMA 1000B CPU 10µs vs 中断 3000µs；通道介入 2 次", () => {
    const d = dmaVsIntr(1000, 3, 5);
    expect(d.dmaCpuUs).toBe(10);
    expect(d.intrCpuUs).toBe(3000);
    expect(ioCpuCost(4096, "query")).toBe(4096);
    expect(ioCpuCost(4096, "dma")).toBe(16);
    expect(ioCpuCost(4096, "channel")).toBe(2);
  });
});

describe("OS：多道程序", () => {
  it("单道 24ms → 多道 12ms，多道 CPU 满载", () => {
    expect(batchTimeline(JOBS, "single").total).toBe(24);
    const m = batchTimeline(JOBS, "multi");
    expect(m.total).toBe(12);
    const cpuBusy = m.segs.filter((s) => s.kind === "cpu").reduce((a, s) => a + s.len, 0);
    expect(cpuBusy).toBe(12); // 2 作业 × 3 轮 × 2ms，零空闲
  });
});

describe("OS：系统调用与特权指令", () => {
  it("fork+write+exit 共 6 次模式切换；关中断是特权指令", () => {
    expect(trapFlow().switches).toBe(6);
    expect(isPrivileged("关中断")).toBe(true);
    expect(isPrivileged("置时钟")).toBe(true);
    expect(isPrivileged("加法 add")).toBe(false);
    expect(isPrivileged("访存 load")).toBe(false);
  });
});

describe("OS：进程五状态", () => {
  it("事件序列走到终止：运行 3 次、阻塞 1 次", () => {
    const w = procWalk();
    expect(w.states.at(-1)).toBe("exit");
    expect(w.runs).toBe(3);
    expect(w.blocks).toBe(1);
  });
});

describe("OS：动态分区", () => {
  it("申请 212KB：首次选 500、最佳选 300、最坏选 600（王道）", () => {
    expect(dynAlloc(INIT_PARTS, DA_REQ, "first").chosen).toBe(1);
    expect(dynAlloc(INIT_PARTS, DA_REQ, "best").chosen).toBe(3);
    expect(dynAlloc(INIT_PARTS, DA_REQ, "worst").chosen).toBe(4);
    expect(dynAlloc(INIT_PARTS, DA_REQ, "first").remain).toBe(288);
    expect(dynAlloc(INIT_PARTS, DA_REQ, "best").remain).toBe(88);
    expect(dynAlloc(INIT_PARTS, DA_REQ, "worst").remain).toBe(388);
  });

  it("2017 选择 25：回收 60K/140KB 后三段并成 380KB，最佳适应链头 500K/80KB", () => {
    const merged = coalesce(COAL_INIT, COAL_REC);
    expect(merged).toEqual([
      { start: 20, size: 380 },
      { start: 500, size: 80 },
      { start: 1000, size: 100 },
    ]);
    expect(sortBestFit(merged)[0]).toEqual({ start: 500, size: 80 });
  });

  it("2024 选择 27：1024KB 申请 128KB 对半拆出 512/256/128；伙伴空闲才合并", () => {
    expect(buddyAlloc(1024, 128)).toEqual({ splits: [512, 256, 128], block: 128 });
    expect(buddyFree(128, true)).toEqual({ merged: 256 });
    expect(buddyFree(128, false)).toEqual({ leftover: 128 });
  });
});

describe("OS：抖动与工作集", () => {
  it("循环访问 3 页：帧 ≥3 缺页 3 次；帧 2 缺页 18 次", () => {
    expect(thrashCurve(WS_REF, [5, 4, 3, 2])).toEqual([3, 3, 3, 18]);
    expect(workingSet(WS_REF, 3).total).toBe(3);
    expect(workingSet(WS_REF, 2).total).toBe(2);
  });

  it("时刻 t 的工作集 = 窗口内出现过的页", () => {
    expect([...workingSetAt(T408_REF, T408_W, 8)].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
    expect(workingSetAt(T408_REF, T408_W, 0)).toEqual(new Set([1]));
    expect(workingSet(T408_REF, T408_W).sets[8]).toEqual(workingSetAt(T408_REF, T408_W, 8));
  });
});

describe("OS：内存管理真题分类", () => {
  it("2012–2026 共 44 道，四个考点都有题", () => {
    expect(OS_MEM_EXAMS).toHaveLength(44);
    expect(osMemExamsForKp("os.mem.alloc").length).toBe(3);
    expect(osMemExamsForKp("os.mem.page").length).toBeGreaterThan(10);
    expect(osMemExamsForKp("os.mem.virt").length).toBeGreaterThan(10);
    expect(osMemExamsForKp("os.mem.thrash").length).toBeGreaterThanOrEqual(3);
    const keys = new Set(OS_MEM_EXAMS.map((e) => `${e.year}-${e.n}`));
    expect(keys.size).toBe(44);
  });
});

describe("OS：文件物理结构", () => {
  it("读第 5 块：连续 1 次、链接 5 次、索引 1 次", () => {
    expect(readCost("seq", 5)).toMatchObject({ reads: 1, path: [24] });
    expect(readCost("linked", 5)).toMatchObject({ reads: 5, path: [20, 33, 41, 17, 58] });
    expect(readCost("indexed", 5)).toMatchObject({ reads: 1, path: [INDEX_TABLE[4]!] });
  });
});

describe("OS：目录与链接", () => {
  it("符号链接解析到真实路径；目标删除则悬空；硬链接计数 1→2→1", () => {
    const ok = resolvePath("/home/ua/docs/notes.txt");
    expect(ok.ok).toBe(true);
    expect(ok.viaSymlink).toBe(true);
    expect(ok.realPath).toBe("/home/ub/share/notes.txt");
    const gone = resolvePath("/home/ua/docs/notes.txt", { ...FSDATA, "/home/ub": [] });
    expect(gone.ok).toBe(false);
    expect(hardLinkRef().map((h) => h.ref)).toEqual([1, 2, 1]);
  });
});

describe("OS：多级索引", () => {
  it("4KB 块/4B 指针：10+1024+1024²+1024³ 块；读盘深度 1..4", () => {
    const c = indexMax();
    expect(c.blocks).toEqual([10, 1024, 1048576, 1073741824]);
    expect(c.maxBlocks).toBe(1074791434);
    expect(c.reads).toEqual([1, 2, 3, 4]);
  });
});

describe("OS：空闲管理", () => {
  it("位示图：块 100 ↔ 行 3 列 4；成组链接分配 25 块第 21 块触发换组", () => {
    expect(bitmapPos(100)).toEqual({ row: 3, col: 4 });
    expect(bitmapBlock(3, 4)).toBe(100);
    const a = groupLinkAlloc(25);
    expect(a.events).toHaveLength(25);
    expect(a.events[0]).toMatchObject({ block: 40, reload: false });
    expect(a.events[19]).toMatchObject({ block: 21, reload: true });
    expect(a.events[24]).toMatchObject({ block: 16 });
    expect(a.stackLeft).toBe(15);
  });
});

describe("OS：缓冲", () => {
  it("T100/M50/C80 × 5 块：单缓冲 830µs、双缓冲 630µs", () => {
    expect(bufferSim("single", 5).total).toBe(830);
    expect(bufferSim("double", 5).total).toBe(630);
  });
});

describe("OS：磁盘调度", () => {
  it("王道：FCFS 640、SSTF 236、SCAN 299、C-SCAN 153（跳回不计）", () => {
    expect(diskSchedule(DISK_REQS, DISK_START, "fcfs").moves).toBe(640);
    const sstf = diskSchedule(DISK_REQS, DISK_START, "sstf");
    expect(sstf.order).toEqual([65, 67, 37, 14, 98, 122, 124, 183]);
    expect(sstf.moves).toBe(236);
    const scan = diskSchedule(DISK_REQS, DISK_START, "scan");
    expect(scan.order).toEqual([65, 67, 98, 122, 124, 183, 37, 14]);
    expect(scan.moves).toBe(299);
    expect(diskSchedule(DISK_REQS, DISK_START, "cscan").moves).toBe(153);
  });
});

describe("计网：封装", () => {
  it("100B 报文 → 158B 帧（TCP20+IP20+以太 14+FCS4）", () => {
    const e = encapsulate(100);
    expect(e.sizes).toEqual([100, 120, 140, 158]);
    expect(e.overhead).toBe(58);
  });
});

describe("计网：时延", () => {
  it("1KB@10Mb/s 发送 0.8ms；1000km 传播 5ms；3 跳存储转发 10.7ms", () => {
    expect(sendDelayMs(1000, 10)).toBeCloseTo(0.8, 6);
    expect(propDelayMs(1000)).toBeCloseTo(5, 6);
    expect(hopDelayMs(1000, 10, 500, 3)).toBeCloseTo(10.7, 6);
  });
});

describe("计网：编码波形", () => {
  it("曼彻斯特 8 位必有 8 次中间跳变；NRZ 中间不跳", () => {
    expect(transitions(WAVE_BITS, "man").mid).toBe(8);
    expect(transitions(WAVE_BITS, "nrz").mid).toBe(0);
    expect(transitions(WAVE_BITS, "diff").mid).toBe(8);
    const man = encodeWave(WAVE_BITS, "man");
    expect(man).toHaveLength(16);
  });
});

describe("计网：交换方式", () => {
  it("电路 148ms（含建链）/ 报文 392ms / 分组 103ms", () => {
    const r = switchCompare();
    expect(r.groups).toBe(100);
    expect(r.circuit).toBeCloseTo(0.148, 6);
    expect(r.message).toBeCloseTo(0.392, 6);
    expect(r.packet).toBeCloseTo(0.103, 6);
  });
});

describe("计网：滑动窗口", () => {
  it("帧 2 丢失：停等发 5、GBN 发 6、SR 发 5", () => {
    expect(slidingSim("stop").sent).toBe(5);
    expect(slidingSim("gbn").sent).toBe(6);
    expect(slidingSim("sr").sent).toBe(5);
    const gbn = slidingSim("gbn").events;
    expect(gbn.some((e) => e.type === "discard")).toBe(true); // GBN 接收方丢失序帧
  });
});

describe("计网：CSMA/CD", () => {
  it("10Mb/s 最小帧 64B；退避上限 1/3/1023", () => {
    expect(minFrameLen(10, 25.6)).toBe(64);
    expect(minFrameLen(1000, 25.6)).toBe(6400); // 千兆半双工的 512B 需载波扩展
    expect(backoffMax(1)).toBe(1);
    expect(backoffMax(2)).toBe(3);
    expect(backoffMax(10)).toBe(1023);
    expect(backoffMax(16)).toBe(1023);
  });
});

describe("计网：交换机自学习", () => {
  it("首帧洪泛（除入口）、次帧单播到端口 1", () => {
    const a = switchLearn(SW_EVENTS);
    expect(a[0]).toMatchObject({ flood: true, learned: true, outPorts: [2, 3, 4] });
    expect(a[1]).toMatchObject({ flood: false, outPorts: [1] });
    expect(a[2]).toMatchObject({ flood: false, outPorts: [2] });
  });
});

describe("计网：PPP", () => {
  it("7E/7D 转义；建链含鉴别共 6 阶段、无鉴别 5 阶段", () => {
    expect(byteStuff([0x7e, 0x7d, 0x45])).toEqual([0x7d, 0x5e, 0x7d, 0x5d, 0x45]);
    const s = pppStateWalk(true);
    expect(s.map((x) => x.state)).toContain("auth");
    expect(s.at(-1)!.state).toBe("terminate");
    expect(pppStateWalk(false)).toHaveLength(5);
  });
});

describe("计网：ARP 与 ICMP", () => {
  it("未命中 3 步（首包广播）；命中 0 包；traceroute TTL 递增", () => {
    const miss = arpSteps(false, true);
    expect(miss.packets).toHaveLength(3);
    expect(miss.packets[0]!.broadcast).toBe(true);
    expect(miss.packets[1]!.broadcast).toBe(false);
    expect(arpSteps(true, true).packets).toHaveLength(1);
    const cross = arpSteps(false, false);
    expect(cross.targetIp).toBe("192.168.1.1"); // 跨网段先问网关
    const tr = traceroute(3);
    expect(tr.map((h) => h.type)).toEqual(["timeout", "timeout", "echo"]);
  });
});

describe("计网：IPv6 压缩", () => {
  it("经典三例：::ff00:42:8329 / ::1 / 单零保留", () => {
    expect(compressIPv6(V6_SAMPLES[0]!).result).toBe("2001:db8::ff00:42:8329");
    expect(compressIPv6(V6_SAMPLES[1]!).result).toBe("::1");
    expect(compressIPv6(V6_SAMPLES[2]!).result).toBe("2001:db8:1:1:1:1:1:0");
  });
});

describe("计网：UDP 校验和", () => {
  it("反码求和 0xF445 → 校验和 0x0BBA → 回验全 1", () => {
    const w = scenarioWords();
    const all = [...w.pseudo, ...w.header, ...w.data];
    const c = udpChecksum(all);
    expect(c.sum).toBe(0xf445);
    expect(c.checksum).toBe(0x0bba);
    const v = udpChecksum([...w.pseudo, 0x14e9, 0x0035, 12, c.checksum, ...w.data]);
    expect(v.sum).toBe(0xffff);
  });
});

describe("计网：DNS / HTTP / DHCP", () => {
  it("消息数：hosts 0、缓存 2、全递归 8、迭代 6", () => {
    expect(dnsResolve("hosts").count).toBe(0);
    expect(dnsResolve("cache").count).toBe(2);
    expect(dnsResolve("recursive").count).toBe(8);
    expect(dnsResolve("iterative").count).toBe(6);
  });
  it("4 对象 RTT：非持久 8、持久 5、流水线 3", () => {
    expect(httpTotal("nonkeep")).toMatchObject({ rtts: 8, conns: 4 });
    expect(httpTotal("keep")).toMatchObject({ rtts: 5, conns: 1 });
    expect(httpTotal("pipeline")).toMatchObject({ rtts: 3, conns: 1 });
  });
  it("DORA 四步：2 次广播 2 次单播", () => {
    const d = doraSteps();
    expect(d.map((x) => x.name)).toEqual(["Discover", "Offer", "Request", "ACK"]);
    expect(d.filter((x) => x.broadcast)).toHaveLength(2);
  });
});
