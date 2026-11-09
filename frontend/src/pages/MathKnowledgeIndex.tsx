import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { CS408_BOOKS } from "@/data/kg/cs408";
import { MATH_BOOKS } from "@/data/kg/math";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { knowledgeReviewPath } from "@/lib/kg/paths";
import { CS408_QUESTION_CASES, CS408_QUESTION_GAPS } from "@/lib/kg/cs408QuestionReview";

export function MathKnowledgeIndex() {
  const [params] = useSearchParams();
  const [bookId, setBookId] = useState("all");
  const [query, setQuery] = useState("");
  const subject = params.get("subject") === "cs408" ? "cs408" : "math";
  const subjectBooks = subject === "math" ? MATH_BOOKS : CS408_BOOKS;
  const selectedBook = subjectBooks.some(book => book.id === bookId) ? bookId : "all";
  const needle = query.trim().toLowerCase();
  const count = subjectBooks.flatMap((book) => book.modules.flatMap((module) => module.kps)).length;
  const books = subjectBooks.filter((book) => selectedBook === "all" || book.id === selectedBook).map((book) => ({
    ...book, modules: book.modules.map((module) => ({
      ...module, kps: module.kps.filter((kp) => `${kp.name} ${module.name} ${book.name}`.toLowerCase().includes(needle)),
    })).filter((module) => module.kps.length > 0),
  })).filter((book) => book.modules.length > 0);
  return <div className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
    <header>
      <Link to={`/review-priority?subject=${subject}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" />返回复习性价比</Link>
      <h1 className="mt-4 text-2xl font-extrabold">{subject === "math" ? "数学" : "408"}知识复习</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{subject === "cs408"
        ? `${count} 个考点 · ${Object.keys(CS408_QUESTION_CASES).length} 个结合真题或王道逐题讲解 · ${Object.keys(CS408_QUESTION_GAPS).length} 个待补原题。`
        : `${count} 个考点 · 教材体系 · 概念公式、过程推演与易错检查。`}</p>
    </header>
    <div role="group" aria-label="选择学科" className="flex gap-2">{(["math", "cs408"] as const).map(value => <Button key={value} asChild size="sm" variant={subject === value ? "default" : "outline"}><Link onClick={() => { setBookId("all"); setQuery(""); }} to={`?${new URLSearchParams({ subject: value, kind: value === "cs408" && params.get("kind") === "fill" ? "big" : params.get("kind") ?? "big", order: params.get("order") ?? "personal" })}`}>{value === "math" ? "数学" : "408"}</Link></Button>)}</div>
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div role="group" aria-label="按分科筛选" className="flex flex-wrap gap-2">
        {[{ id: "all", name: "全部", count }, ...subjectBooks.map((book) => ({ id: book.id, name: book.name, count: book.modules.flatMap((module) => module.kps).length }))].map((book) =>
          <Button key={book.id} size="sm" variant={selectedBook === book.id ? "default" : "outline"} aria-pressed={selectedBook === book.id} onClick={() => setBookId(book.id)}>{book.name} {book.count}</Button>)}
      </div>
      <label className="flex items-center gap-2"><Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">搜索考点</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={subject === "math" ? "搜索曲线积分、特征值、条件概率" : "搜索 KMP、Cache、信号量、TCP"} /></label>
    </div>
    {books.length === 0 && <p role="status" className="text-sm text-muted-foreground">未找到匹配考点，试试章节名称或更短的关键词。</p>}
    {books.map((book) => <section key={book.id} aria-labelledby={`knowledge-${book.id}`} className="space-y-4">
      <h2 id={`knowledge-${book.id}`} className="text-lg font-extrabold">{book.name}</h2>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {book.modules.map((module) => <section key={module.id} className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold">{module.name}</h3>
          <ul className="mt-3 divide-y divide-border/60">{module.kps.map((kp) => <li key={kp.id}>
            <Link to={knowledgeReviewPath(kp.id, params.toString())} className="flex items-center gap-2 py-3 text-sm leading-6 text-primary hover:underline"><span className="min-w-0 flex-1">{kp.name}{subject === "cs408" && <span className="block text-[11px] leading-5 text-muted-foreground">{CS408_QUESTION_CASES[kp.id]?.label ?? "基础讲解 · 原题待补"}</span>}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></Link>
          </li>)}</ul>
        </section>)}
      </div>
    </section>)}
  </div>;
}
