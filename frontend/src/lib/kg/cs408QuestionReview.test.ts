import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import payload from "@/data/kg/cs408QuestionLessons.json";
import { CS408_QUESTION_CASES, CS408_QUESTION_GAPS } from "./cs408QuestionReview";
import { resolveReviewLesson } from "./knowledgeReview";

const root = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const wangdao = JSON.parse(read("frontend/public/cs408/wangdao2027.json"));

describe("408 结合原题的知识讲解", () => {
  it("92 个考点均有真实教案或明确来源缺口，默认正文不再只是自编例题加链接", () => {
    expect(Object.keys(CS408_KNOWLEDGE_REVIEWS)).toHaveLength(92);
    expect(Object.keys(CS408_QUESTION_CASES)).toHaveLength(91);
    expect(Object.keys(CS408_QUESTION_GAPS)).toEqual(["co.io.channel"]);
    for (const template of Object.values(CS408_KNOWLEDGE_REVIEWS)) {
      const { lesson } = resolveReviewLesson(template, null, null);
      if (template.sourceGap) {
        expect(lesson.sourceQuestion).toBeUndefined();
        expect(template.sourceGap).toContain("存储器的多通道带宽题不属于 I/O 通道题");
        continue;
      }
      expect(lesson.sourceQuestion?.questionId).toBe(CS408_QUESTION_CASES[template.kpId].questionId);
      expect(lesson.steps).toHaveLength(3);
      expect(lesson.showWorkingByDefault).toBe(true);
      expect(lesson.references[0].questionId).toBe(lesson.sourceQuestion?.questionId);
      expect(lesson.techniques[0].content).toEqual([{ type: "text", text: CS408_QUESTION_CASES[template.kpId].transfer }]);
      expect(resolveReviewLesson(template, "method", null).lesson.label).toContain("自编");
    }
  });

  it("每份讲解均能回到真实题库，同一题的题干、选项和答案键可核对", () => {
    for (const [kp, c] of Object.entries(CS408_QUESTION_CASES)) {
      const match = /^cs408-(\d{4})-q(\d+)$/.exec(c.questionId);
      const original = match
        ? JSON.parse(read(`frontend/public/cs408/${match[1]}.json`)).items.find((q: { n: number }) => q.n === Number(match[2]))
        : wangdao.find((q: { id: string }) => q.id === c.questionId);
      expect(original, c.questionId).toBeTruthy();
      expect(original.book).toBe(kp.split(".")[0]);
      expect(original.kind).toBe(c.kind);
      if (!c.excerpt) expect(c.stem).toBe(original.stem);
      else expect(c.stem.length).toBeGreaterThan(20);
      if (original.answer && /^[A-D]+$/.test(original.answer)) expect(c.answer).toBe(original.answer);
      expect(Object.keys(c.options)).toEqual(Object.keys(original.options ?? {}));
      for (const [key, value] of Object.entries(c.options)) expect(original.options[key]).toContain(value);
      const lesson = resolveReviewLesson(CS408_KNOWLEDGE_REVIEWS[kp], null, null).lesson;
      const check = lesson.selfCheck;
      expect(check.options[check.correctIndex]).toBeTruthy();
      expect(new Set(check.options).size).toBe(check.options.length);
      if (c.source === "wangdao") {
        expect(c.label).toContain(`第 ${original.section.split(".")[0]} 章`);
        expect(c.label).toContain(`第 ${original.section} 节`);
        expect(c.label).toContain(`第 ${original.qno} 题`);
      }
    }
  });

  it("题库来源快照发生变化时提醒重建，生成不依赖本地未入库的 PDF 中间文件", () => {
    for (const [path, sha] of Object.entries(payload.sources)) {
      expect(path.startsWith("frontend/public/cs408/")).toBe(true);
      expect(createHash("sha256").update(read(path)).digest("hex"), path).toBe(sha);
    }
  });

  it("正文包含原题数据的推演与代码，并纠正源 OCR 解析中的计算错误", () => {
    const allText = (kp: string) => CS408_QUESTION_CASES[kp].steps.join("\n");
    expect(allText("ds.tree.huffman")).toContain("90/36=2.5");
    expect(allText("co.mem.sram-dram")).toContain("30000000H～3FFFFFFFH");
    expect(allText("cn.net.ipv6")).toContain("2^96");
    expect(allText("cn.net.ipv6")).not.toContain("2^64");
    expect(allText("cn.dll.framing")).toContain("2^(3−1)=4");
    expect(allText("cn.intro.perf")).toContain("800 个分组");
    expect(CS408_QUESTION_CASES["ds.algo.dp"].code).toContain("void calMulMax");
    expect(CS408_QUESTION_CASES["ds.graph.store"].code).toContain("int printVertices");
    expect(CS408_QUESTION_CASES["os.proc.classic"].code).toContain("P(emptyB)");
    expect(allText("ds.search.hash")).toContain("1.8");
  });
});
