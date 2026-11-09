import { readFileSync } from "node:fs";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { CS408_BOOKS } from "@/data/kg/cs408";
import { MATH_BOOKS } from "@/data/kg/math";
import { CS408_TEXTBOOK_REVIEWS, CS408_KNOWLEDGE_REVIEWS } from "@/data/kg/cs408TextbookReview";
import { MATH_KNOWLEDGE_REVIEWS } from "@/data/kg/mathKnowledgeReviews";
import { MATH_TEXTBOOK_KNOWLEDGE } from "@/data/kg/mathTextbookKnowledge";
import { KNOWLEDGE_REVIEW_TOPICS, resolveReviewLesson, type ReviewBlock } from "./knowledgeReview";
import { cs408KnowledgeReferences } from "./cs408KnowledgeReferences";
import { REVIEW_DATASETS, reviewQuestionHref } from "./reviewPriority";
import type { WangdaoItem } from "./wangdao408";
const mathPoints=MATH_BOOKS.flatMap(b=>b.modules.flatMap(g=>g.kps));
const csPoints=CS408_BOOKS.flatMap(b=>b.modules.flatMap(g=>g.kps));
const catalog=JSON.parse(readFileSync(new URL("../../../public/cs408/wangdao2027/index.json",import.meta.url),"utf8")).items as WangdaoItem[];
function verify(blocks:ReviewBlock[]) {
 expect(blocks.length).toBeGreaterThan(0);
 for(const b of blocks) {
  if(b.type==="math") expect(()=>katex.renderToString(b.tex,{throwOnError:true,strict:"error",trust:false})).not.toThrow();
  if(b.type==="code") expect(b.code.trim().length).toBeGreaterThan(0);
  if(b.type==="table") { expect(b.rows.length).toBeGreaterThan(0); b.rows.forEach(r=>expect(r.length).toBe(b.headers.length)); }
 }
}
describe("教材体系知识复习覆盖与排版",()=>{
 it("覆盖75个数学和92个408考点，正文无重复或悬空入口",()=>{
  expect(mathPoints).toHaveLength(75); expect(csPoints).toHaveLength(92);
  expect(CS408_TEXTBOOK_REVIEWS).toHaveLength(92);
  expect(Object.keys(CS408_KNOWLEDGE_REVIEWS).sort()).toEqual(csPoints.map(k=>k.id).sort());
  expect(Object.keys(MATH_TEXTBOOK_KNOWLEDGE).sort()).toEqual(mathPoints.map(k=>k.id).filter(id=>id!=="calc.m.surf2").sort());
  expect(Object.keys(KNOWLEDGE_REVIEW_TOPICS).sort()).toEqual([...mathPoints,...csPoints].map(k=>k.id).sort());
 });
 it.each(Object.entries({...MATH_KNOWLEDGE_REVIEWS,...CS408_KNOWLEDGE_REVIEWS}))("%s 的公式／表格／推演均可展示",(id,review)=>{
  expect(review.kpId).toBe(id);
  expect(review.textbook?.title).toBeTruthy();
  expect(new URL(review.textbook!.url).protocol).toBe("https:");
  verify(review.knowledge!);
  for(const route of review.routes) for(const lesson of route.lessons) {
   expect(lesson.showWorkingByDefault).toBe(true); verify(lesson.prompt);
   expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
   lesson.steps.forEach(step=>verify(step.working)); lesson.techniques.forEach(tech=>verify(tech.content));
   expect(new Set(lesson.selfCheck.options).size).toBe(lesson.selfCheck.options.length);
   expect(lesson.selfCheck.options[lesson.selfCheck.correctIndex]).toBeTruthy();
  }
  expect(resolveReviewLesson(review,"invalid","invalid").lesson).toBeTruthy();
 });
 it.each(["big","mcq"] as const)("408 %s 练习严格匹配考点、题型，真题导航保持408",kind=>{
  for(const kp of csPoints) for(const ref of cs408KnowledgeReferences(kp.id,kind,catalog)) {
   if(ref.source==="exam") {
    const q=REVIEW_DATASETS.cs408.items.find(q=>q.id===ref.questionId);
    expect(q?.kpId).toBe(kp.id);expect(q?.kind).toBe(kind);
    expect(reviewQuestionHref("cs408",q!)).toMatch(/^\/kg\/exams\/practice\//);
   } else {
    expect(ref.source).toBe("wangdao");
    const q=catalog.find(q=>q.id===ref.questionId);expect(q?.kp_ids).toContain(kp.id);expect(q?.kind).toBe(kind);
   }
  }
  expect(cs408KnowledgeReferences("missing",kind,catalog)).toEqual([]);
 });
});
