import { describe, expect, it } from "vitest";
import { dayKeyStartMs } from "@/lib/day";
import { buildTechniquePlan, nextPracticeMark } from "./techniqueTraining";
import { buildMath1Topics } from "./math1Analysis";
import type { UserItemMark } from "./types";
import type { WangdaoItem } from "./wangdao408";

const start = dayKeyStartMs("2026-11-08") + 60_000;
const topic = { ...buildMath1Topics({}).find((t) => t.kpId === "calc.m.ext")!, facets: ["a", "b"] };
const question = (id: string, facets: string[], extra: Partial<WangdaoItem> = {}): WangdaoItem => ({
  id, source: "lilin880", book: "calc", kind: "big", section: "5", qno: 1,
  kp_ids: [topic.kpId], facets, part: "base", ...extra,
});
const a = question("a", ["a", "b"], { primaryFacet: "a" });
const a2 = question("a2", ["a"], { source: "zhangyu1000", part: "hard" });
const b = question("b", ["b"]);
const b2 = question("b2", ["b"], { source: "zhangyu1000", part: "hard" });
const pool = [a, a2, b, b2];
const pass = (id: string, ts = start) => nextPracticeMark(undefined, id, "pass", ts);
const plan = (marks: UserItemMark[] = [], now = start, qs = pool, waiting = new Set<string>()) =>
  buildTechniquePlan(topic, qs, marks, new Set(), waiting, now);

describe("按技巧覆盖与补充训练", () => {
  it("每个技巧选两题，优先主考题并搭配不同来源/层级，综合题跨技巧去重", () => {
    const p = plan();
    expect(p.groups.map((g) => g.recommendations.length)).toEqual([2, 2]);
    expect(p.groups[0].recommendations.map((r) => r.item.id)).toEqual(["a", "a2"]);
    const shared = plan([], start, [a, a2, b]);
    expect(shared.recommendations.filter((r) => r.item.id === "a")).toHaveLength(1);
    expect(shared.recommendations.find((r) => r.item.id === "a")!.techniqueIds).toEqual(["a", "b"]);
  });

  it("一题重复做不算两题；只有辅助技巧的通过证据也不能完成", () => {
    const repeated = nextPracticeMark(pass("a"), "a", "pass", start + 1000);
    expect(plan([repeated]).preliminary).toBe(0);
    const onlySecondary = [question("s1", ["a", "b"]), question("s2", ["a", "b"])];
    const p = plan([pass("s1"), pass("s2")], start, onlySecondary);
    expect(p.groups.find((g) => g.id === "b")!.shortage).toBe(true);
    expect(p.groups.find((g) => g.id === "b")!.status).not.toBe("preliminary");
    // 不能把一个综合题的首标签擅自当成主技巧。
    expect(p.groups.find((g) => g.id === "a")!.shortage).toBe(true);
  });

  it("两题都会先停练；北京时间三天后复测，同一天重复点会不算稳定掌握", () => {
    const marks = pool.map((q) => pass(q.id));
    expect(plan(marks).preliminary).toBe(2);
    expect(plan(marks).recommendations).toEqual([]);
    const repeat = nextPracticeMark(marks[0], "a", "pass", start + 3600_000);
    expect(plan([repeat, ...marks.slice(1)]).stable).toBe(0);
    const due = dayKeyStartMs("2026-11-11");
    expect(plan(marks, due - 1).recommendations).toEqual([]);
    expect(plan(marks, due).groups.every((g) => g.status === "due")).toBe(true);
    const verified = nextPracticeMark(marks[0], "a", "pass", due);
    const p = plan([verified, ...marks.slice(1)], due);
    expect(p.groups.find((g) => g.id === "a")!.status).toBe("stable");
    expect(p.groups.find((g) => g.id === "b")!.status).toBe("due");
  });

  it("薄弱技巧优先补新题，不挤进未到期的原错题；无关技巧不受影响", () => {
    const extra = [question("a3", ["a"]), question("a4", ["a"])];
    const weak = nextPracticeMark(undefined, "a2", "fuzzy", start + 1);
    const p = plan([weak, pass("b"), pass("b2")], start + 2, [...pool, ...extra], new Set(["a2"]));
    expect(p.groups.find((g) => g.id === "a")!.status).toBe("weak");
    expect(p.groups.find((g) => g.id === "b")!.status).toBe("preliminary");
    expect(p.recommendations).toHaveLength(2);
    expect(p.recommendations.every((r) => r.reason === "supplement" && r.item.id !== "a2")).toBe(true);
  });

  it("复测不会后重新补练，旧通过不充数；改会一题仍需另一道新证据", () => {
    const due = dayKeyStartMs("2026-11-11");
    const weak = nextPracticeMark(pass("a2"), "a2", "fail", due);
    const repaired = nextPracticeMark(weak, "a2", "pass", due + 1);
    const p = plan([pass("a"), repaired], due + 2);
    expect(p.groups.find((g) => g.id === "a")!.status).toBe("weak");
    expect(p.groups.find((g) => g.id === "a")!.passed).toBe(1);
    const after = nextPracticeMark(pass("a"), "a", "pass", due + 3);
    // 原题在薄弱事件后的重新作答也能重新提供证据。
    expect(plan([after, repaired], due + 4).groups.find((g) => g.id === "a")!.status).toBe("preliminary");
    const secondDue = dayKeyStartMs("2026-11-14");
    const checked = nextPracticeMark(after, "a", "pass", secondDue);
    expect(plan([checked, repaired], secondDue).groups.find((g) => g.id === "a")!.status).toBe("stable");
  });

  it("缺题和无标签题不虚报完成，也不跨科目/考点/题型凑数", () => {
    const qs = [a, question("no-tag", []), question("other-kind", ["a"], { kind: "mcq" }),
      question("other-topic", ["a"], { kp_ids: ["calc.limit.fn"] }),
      question("other-source", ["a"], { source: "wangdao" })];
    const p = plan([pass("a"), pass("no-tag")], start, qs);
    expect(p.untaggedCount).toBe(1);
    expect(p.groups.every((g) => g.shortage)).toBe(true);
    expect(p.preliminary).toBe(0);
    expect(p.recommendations.every((r) => r.item.id === "a")).toBe(true);
  });

  it("综合题的辅助技巧不会扩成当前考点的必练量", () => {
    const mixed = question("mixed", ["a", "unconfirmed"]);
    const secondary = question("secondary", ["unrelated"], { kp_ids: ["calc.limit.fn", topic.kpId] });
    expect(plan([], start, [...pool, mixed, secondary]).groups.map((g) => g.id)).toEqual(["a", "b"]);
    const explicit = question("explicit", ["extra", "a"], { primaryFacet: "extra" });
    expect(plan([], start, [...pool, explicit]).groups.map((g) => g.id)).toEqual(["a", "b", "extra"]);
  });

  it("旧版通过记录仍可计入；跳过不抹掉已有判断与复测证据", () => {
    const legacy: UserItemMark = { itemId: "a", mark: "pass", ts: start };
    expect(nextPracticeMark(legacy, "a", "skip", start + 1)).toEqual(legacy);
    const repeat = nextPracticeMark(legacy, "a", "pass", start + 2);
    expect(repeat.passStartedAt).toBe(start);
    expect(plan([legacy, pass("a2")]).groups[0].status).toBe("preliminary");
  });
});
