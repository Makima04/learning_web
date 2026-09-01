// 图谱模块 → 李林880 / 张宇1000 原书章节。按书刷走这一层，不按考点过滤。
import type { WangdaoItem } from "@/lib/kg/wangdao408";

export type BookDrillSpec = {
  source: "lilin880" | "zhangyu1000";
  part: "base" | "hard";
  section: string;
  bookLabel: string;
  chapterLabel: string;
};

const LILIN_CH: Record<string, { ch: number; name: string }> = {
  "calc-limit": { ch: 1, name: "函数、极限、连续" },
  "calc-diff1": { ch: 2, name: "一元函数微分学及其应用" },
  "calc-int1": { ch: 3, name: "一元函数积分学及其应用" },
  "calc-geom": { ch: 4, name: "空间解析几何" },
  "calc-multi": { ch: 5, name: "多元函数微分学及其应用" },
  "calc-multi-int": { ch: 6, name: "重积分及其应用" },
  "calc-ode": { ch: 7, name: "微分方程及其应用" },
  "calc-series": { ch: 8, name: "无穷级数" },
  "calc-line-surf": { ch: 9, name: "曲线积分与曲面积分" },
  "la-det": { ch: 10, name: "行列式" },
  "la-matrix": { ch: 11, name: "矩阵" },
  "la-vec": { ch: 12, name: "向量" },
  "la-eq": { ch: 13, name: "线性方程组" },
  "la-eigen": { ch: 14, name: "相似矩阵" },
  "la-quad": { ch: 15, name: "二次型" },
  "prob-base": { ch: 16, name: "随机事件及其概率" },
  "prob-rv": { ch: 17, name: "随机变量及其分布" },
  "prob-multi": { ch: 18, name: "多维随机变量及其分布" },
  "prob-num": { ch: 19, name: "随机变量的数字特征" },
  "prob-limit": { ch: 20, name: "大数定律与中心极限定理" },
  "prob-stat": { ch: 21, name: "数理统计的基本概念" },
  "prob-est": { ch: 22, name: "参数估计" },
  "prob-hyp": { ch: 23, name: "假设检验" },
};

const ZHANGYU_SECTIONS: Record<string, { part: "base" | "hard"; section: string; name: string }[]> = {
  "calc-limit": [
    { part: "base", section: "hs-0", name: "零基础" },
    { part: "base", section: "hs-1", name: "函数极限与连续" },
    { part: "base", section: "hs-2", name: "数列极限" },
    { part: "hard", section: "hs-1", name: "函数极限与连续" },
    { part: "hard", section: "hs-2", name: "数列极限" },
  ],
  "calc-diff1": [
    { part: "base", section: "hs-3", name: "微分学的概念" },
    { part: "base", section: "hs-4", name: "微分学的计算" },
    { part: "base", section: "hs-5", name: "几何应用" },
    { part: "base", section: "hs-6", name: "中值定理与不等式" },
    { part: "base", section: "hs-7", name: "物理应用" },
    { part: "hard", section: "hs-3", name: "微分学的概念" },
    { part: "hard", section: "hs-4", name: "微分学的计算" },
    { part: "hard", section: "hs-5", name: "几何应用" },
    { part: "hard", section: "hs-6", name: "中值定理与不等式" },
    { part: "hard", section: "hs-7", name: "物理应用" },
  ],
  "calc-int1": [
    { part: "base", section: "hs-8", name: "积分学概念与性质" },
    { part: "base", section: "hs-9", name: "积分学的计算" },
    { part: "base", section: "hs-10", name: "几何应用" },
    { part: "base", section: "hs-11", name: "积分等式与不等式" },
    { part: "base", section: "hs-12", name: "物理应用" },
    { part: "hard", section: "hs-8", name: "积分学概念与性质" },
    { part: "hard", section: "hs-9", name: "积分学的计算" },
    { part: "hard", section: "hs-10", name: "几何应用" },
    { part: "hard", section: "hs-11", name: "积分等式与不等式" },
    { part: "hard", section: "hs-12", name: "物理应用" },
  ],
  "calc-multi": [
    { part: "base", section: "hs-13", name: "多元函数微分学" },
    { part: "hard", section: "hs-13", name: "多元函数微分学" },
  ],
  "calc-multi-int": [
    { part: "base", section: "hs-14", name: "二重积分" },
    { part: "hard", section: "hs-14", name: "二重积分" },
  ],
  "calc-ode": [
    { part: "base", section: "hs-15", name: "微分方程" },
    { part: "hard", section: "hs-15", name: "微分方程" },
  ],
  "calc-series": [
    { part: "base", section: "hs-16", name: "无穷级数" },
    { part: "hard", section: "hs-16", name: "无穷级数" },
  ],
  "calc-line-surf": [
    { part: "base", section: "hs-17", name: "多元积分预备" },
    { part: "base", section: "hs-18", name: "多元函数积分学" },
    { part: "hard", section: "hs-17", name: "多元积分预备" },
    { part: "hard", section: "hs-18", name: "多元函数积分学" },
  ],
  "la-det": [
    { part: "base", section: "la-1", name: "行列式" },
    { part: "hard", section: "la-1", name: "行列式" },
    { part: "hard", section: "la-2", name: "余子式和代数余子式" },
  ],
  "la-matrix": [
    { part: "base", section: "la-2", name: "矩阵" },
    { part: "hard", section: "la-3", name: "矩阵运算" },
    { part: "hard", section: "la-4", name: "矩阵的秩" },
  ],
  "la-vec": [
    { part: "base", section: "la-3", name: "向量组" },
    { part: "hard", section: "la-6", name: "向量组" },
  ],
  "la-eq": [
    { part: "base", section: "la-4", name: "线性方程组" },
    { part: "hard", section: "la-5", name: "线性方程组" },
  ],
  "la-eigen": [
    { part: "base", section: "la-5", name: "特征值与特征向量" },
    { part: "hard", section: "la-7", name: "特征值与特征向量" },
    { part: "hard", section: "la-8", name: "相似理论" },
  ],
  "la-quad": [
    { part: "base", section: "la-6", name: "二次型" },
    { part: "hard", section: "la-9", name: "二次型" },
  ],
  "prob-base": [
    { part: "base", section: "prob-1", name: "随机事件与概率" },
    { part: "hard", section: "prob-1", name: "随机事件和概率" },
  ],
  "prob-rv": [
    { part: "base", section: "prob-2", name: "一维随机变量及其分布" },
    { part: "hard", section: "prob-2", name: "一维随机变量及其分布" },
    { part: "hard", section: "prob-3", name: "一维随机变量函数的分布" },
  ],
  "prob-multi": [
    { part: "base", section: "prob-3", name: "多维随机变量及其分布" },
    { part: "hard", section: "prob-4", name: "多维随机变量及其分布" },
    { part: "hard", section: "prob-5", name: "多维随机变量函数的分布" },
  ],
  "prob-num": [
    { part: "base", section: "prob-4", name: "随机变量的数字特征" },
    { part: "hard", section: "prob-6", name: "数字特征" },
  ],
  "prob-limit": [
    { part: "base", section: "prob-5", name: "大数定律与中心极限定理" },
    { part: "hard", section: "prob-7", name: "大数定律与中心极限定理" },
  ],
  "prob-stat": [
    { part: "base", section: "prob-6", name: "数理统计" },
    { part: "hard", section: "prob-8", name: "统计量及其分布" },
  ],
  "prob-est": [
    { part: "hard", section: "prob-9", name: "参数估计与假设检验" },
  ],
};

function lilinGroups(moduleId: string): BookDrillSpec[] {
  const meta = LILIN_CH[moduleId];
  if (!meta) return [];
  const ch = String(meta.ch);
  return (["base", "hard"] as const).map((part) => ({
    source: "lilin880" as const,
    part,
    section: ch,
    bookLabel: part === "base" ? "李林880 · 基础" : "李林880 · 强化",
    chapterLabel: `第${meta.ch}章 ${meta.name}`,
  }));
}

function zhangyuGroups(moduleId: string): BookDrillSpec[] {
  return (ZHANGYU_SECTIONS[moduleId] ?? []).map((s) => ({
    source: "zhangyu1000" as const,
    part: s.part,
    section: s.section,
    bookLabel: s.part === "base" ? "张宇1000 · 基础" : "张宇1000 · 强化",
    chapterLabel: s.name,
  }));
}

export function bookDrillGroups(moduleId: string): BookDrillSpec[] {
  return [...lilinGroups(moduleId), ...zhangyuGroups(moduleId)];
}

export function matchBookDrill(
  groups: BookDrillSpec[],
  src: string | null,
  part: string | null,
  section: string | null
): BookDrillSpec | undefined {
  return groups.find(
    (g) =>
      g.source === src &&
      g.part === part &&
      (section ? g.section === section : true)
  );
}

export function sortBookItems(items: WangdaoItem[]): WangdaoItem[] {
  const kindRank = (k?: string) => (k === "mcq" ? 0 : k === "fill" ? 1 : 2);
  return [...items].sort((a, b) => {
    const p = (a.pdf_page ?? 10_000) - (b.pdf_page ?? 10_000);
    if (p !== 0) return p;
    if (a.qno !== b.qno) return a.qno - b.qno;
    const kd = kindRank(a.kind) - kindRank(b.kind);
    if (kd !== 0) return kd;
    return a.id.localeCompare(b.id);
  });
}

export function itemsForBookDrill(items: WangdaoItem[], spec: BookDrillSpec): WangdaoItem[] {
  return sortBookItems(
    items.filter(
      (q) => q.source === spec.source && q.part === spec.part && q.section === spec.section
    )
  );
}

export function itemsWithFacet(items: WangdaoItem[], facet: string | null | undefined): WangdaoItem[] {
  if (!facet) return items;
  return items.filter((q) => (q.facets || []).includes(facet));
}

export function facetsInItems(items: WangdaoItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of items) {
    for (const f of q.facets || []) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}
