import { describe, expect, it } from "vitest";
import type { JournalEntry } from "@/lib/journal";
import type { UserItemMark } from "@/lib/kg/types";
import {
  countKpDrill,
  journalCopyForWangdao,
  learnQueue,
  reviewQueue,
  type WangdaoItem,
} from "./wangdao408";

function item(partial: Partial<WangdaoItem> & Pick<WangdaoItem, "id">): WangdaoItem {
  return {
    book: "ds",
    kind: "mcq",
    section: "2.2",
    qno: 1,
    stem: "stem",
    kp_ids: ["ds.linear.seq"],
    ...partial,
  };
}

function entry(sourceItemId: string, extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: `je-wd-${sourceItemId}`,
    categoryId: "cat-408",
    title: sourceItemId,
    body: "",
    kind: "mistake",
    createdOn: "2026-08-30",
    nextReviewOn: "2026-08-31",
    step: 1,
    status: "active",
    lapses: 0,
    updatedAt: 1,
    kpId: "ds.linear.seq",
    fromKg: true,
    sourceItemId,
    ...extra,
  };
}

const items = [
  item({ id: "a", qno: 1 }),
  item({ id: "b", qno: 2 }),
  item({ id: "c", qno: 3 }),
  item({ id: "d", qno: 4, kp_ids: ["ds.linear.linked"] }),
];

describe("countKpDrill", () => {
  it("unmarked = 新学, due wrong = 复习, future wrong = 间隔中", () => {
    const marks: UserItemMark[] = [{ itemId: "b", mark: "pass", ts: 1 }];
    const entries = [
      entry("c", { nextReviewOn: "2026-08-31" }),
      entry("x-waiting", { nextReviewOn: "2026-09-03", sourceItemId: "a" }),
    ];
    const counts = countKpDrill(items, "ds.linear.seq", marks, entries, "2026-08-31");
    expect(counts).toEqual({ total: 3, learn: 0, review: 1, waiting: 1 });
  });

  it("unmarked question is 新学", () => {
    const marks: UserItemMark[] = [{ itemId: "b", mark: "pass", ts: 1 }];
    const entries = [entry("c", { nextReviewOn: "2026-08-31" })];
    const counts = countKpDrill(items, "ds.linear.seq", marks, entries, "2026-08-31");
    expect(counts.learn).toBe(1);
    expect(counts.review).toBe(1);
    expect(counts.waiting).toBe(0);
    expect(learnQueue(items, "ds.linear.seq", marks, entries).map((q) => q.id)).toEqual(["a"]);
    expect(reviewQueue(items, "ds.linear.seq", entries, "2026-08-31").map((q) => q.id)).toEqual([
      "c",
    ]);
  });

  it("treats retired la.eq.gauss journal rows as 解的结构", () => {
    const qs: WangdaoItem[] = [
      item({ id: "eq-1", kp_ids: ["la.eq.structure"] }),
    ];
    const entries = [
      entry("eq-1", { kpId: "la.eq.gauss", nextReviewOn: "2026-08-31" }),
    ];
    expect(countKpDrill(qs, "la.eq.structure", [], entries, "2026-08-31").review).toBe(1);
    expect(reviewQueue(qs, "la.eq.structure", entries, "2026-08-31").map((q) => q.id)).toEqual([
      "eq-1",
    ]);
  });
});

describe("journalCopyForWangdao", () => {
  it("includes options in journal body", () => {
    const copy = journalCopyForWangdao(
      item({
        id: "ds-mcq-8.2-1",
        section: "8.2",
        qno: 1,
        stem: "对5个不同的数据元素进行直接插入排序，最多需要进行的比较次数是（），注意，哨兵的比较不计入次数。",
        options: { A: "8", B: "10", C: "15", D: "25" },
        kp_ids: ["ds.sort.insert"],
      })
    );
    expect(copy?.body).toContain("A. 8");
    expect(copy?.body).toContain("D. 25");
    expect(copy?.title).toContain("哨兵的比较不计入次数");
  });

  it("math with img uses short title, not OCR stem", () => {
    const copy = journalCopyForWangdao(
      item({
        id: "ll-base-1-mcq-1",
        source: "lilin880",
        section: "1",
        qno: 1,
        stem: "函数f x = xsinx ecosx",
        img: "/math/img/ll/ll-base-1-mcq-1.jpg",
        kp_ids: ["calc.limit.fn"],
      })
    );
    expect(copy?.title).toBe("李林880 §1 #1");
    expect(copy?.title).not.toContain("xsinx");
    expect(copy?.body).not.toContain("xsinx");
  });
});
