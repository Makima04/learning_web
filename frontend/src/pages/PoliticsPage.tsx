import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  Check,
  CircleAlert,
  ListChecks,
  PenLine,
  ScrollText,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ASK_VERBS, BAD_VS_GOOD, METHOD_STEPS, SUBJECT_TIPS } from "@/lib/politics/method";
import { POLITICS_QUESTIONS, POLITICS_YEARS, questionById } from "@/lib/politics/questions";
import { scoreChecked, scorePart } from "@/lib/politics/score";
import {
  SUBJECT_LABEL,
  type PoliticsQuestion,
  type PoliticsSubject,
  type QuestionPart,
} from "@/lib/politics/types";
import { useAuth } from "@/stores/auth";
import { usePolitics } from "@/stores/politics";
import { cn } from "@/lib/utils";

const SUBJECTS: PoliticsSubject[] = ["marx", "xi", "history", "moral", "world"];
const TABS = ["practice", "method", "log"] as const;
type Tab = (typeof TABS)[number];

function normalizeTab(raw: string | undefined): Tab {
  if (raw === "method" || raw === "log") return raw;
  return "practice";
}

const TEXTAREA_CLS =
  "flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function PoliticsPage() {
  const { tab: tabParam, qid } = useParams<{ tab?: string; qid?: string }>();
  const navigate = useNavigate();
  const loggedIn = useAuth((s) => s.loggedIn);
  const load = usePolitics((s) => s.load);
  const syncFromServer = usePolitics((s) => s.syncFromServer);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loggedIn) void syncFromServer();
  }, [loggedIn, syncFromServer]);

  if (qid) {
    const q = questionById(qid);
    if (!q) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8">
          <p className="text-sm text-destructive">没有这道题</p>
          <Button variant="outline" onClick={() => navigate("/politics")}>
            返回题库
          </Button>
        </div>
      );
    }
    return <PracticeView question={q} onBack={() => navigate("/politics")} />;
  }

  const tab = normalizeTab(tabParam);
  const setTab = (next: string) => {
    const t = normalizeTab(next);
    navigate(t === "practice" ? "/politics" : `/politics/${t}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">考研政治</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          主观题工坊 · 按点给分训练
          {loggedIn ? " · 已登录，练习记录同步到账号" : " · 未登录仅保存在本机，登录后写入服务端"}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="practice" className="gap-1.5">
            <PenLine className="h-3.5 w-3.5" />
            练题
          </TabsTrigger>
          <TabsTrigger value="method" className="gap-1.5">
            <Target className="h-3.5 w-3.5" />
            答法
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            记录
          </TabsTrigger>
        </TabsList>
        <TabsContent value="practice" className="mt-4">
          <QuestionList />
        </TabsContent>
        <TabsContent value="method" className="mt-4">
          <MethodPanel />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <LogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuestionList() {
  const [year, setYear] = useState<number | "all">("all");
  const [subject, setSubject] = useState<PoliticsSubject | "all">("all");
  const attempts = usePolitics((s) => s.attempts);
  const lastQuestionId = usePolitics((s) => s.lastQuestionId);

  const lastScore = useMemo(() => {
    const m = new Map<string, { score: number; maxScore: number }>();
    for (const a of attempts) {
      if (!m.has(a.questionId)) m.set(a.questionId, { score: a.score, maxScore: a.maxScore });
    }
    return m;
  }, [attempts]);

  const list = useMemo(() => {
    return POLITICS_QUESTIONS.filter((q) => {
      if (year !== "all" && q.year !== year) return false;
      if (subject !== "all" && q.subject !== subject) return false;
      return true;
    });
  }, [year, subject]);

  const practiced = lastScore.size;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            近三年真题分析题 15 道。先写，再对照踩分点，缺的点补进下一次。已练 {practiced}/15。
          </p>
          {lastQuestionId && (
            <Button asChild size="sm">
              <Link to={`/politics/q/${lastQuestionId}`}>继续上次</Link>
            </Button>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Chip active={year === "all"} onClick={() => setYear("all")}>
              全部年份
            </Chip>
            {POLITICS_YEARS.map((y) => (
              <Chip key={y} active={year === y} onClick={() => setYear(y)}>
                {y}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={subject === "all"} onClick={() => setSubject("all")}>
              全部科目
            </Chip>
            {SUBJECTS.map((s) => (
              <Chip key={s} active={subject === s} onClick={() => setSubject(s)}>
                {SUBJECT_LABEL[s]}
              </Chip>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {list.map((q) => {
          const rec = lastScore.get(q.id);
          return (
            <Link
              key={q.id}
              to={`/politics/q/${q.id}`}
              className="block rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  {q.year} · {q.no} {SUBJECT_LABEL[q.subject]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rec ? `上次 ${rec.score}/${rec.maxScore}` : "未练"}
                </span>
              </div>
              <p className="mt-1 text-sm">{q.title}</p>
            </Link>
          );
        })}
        {list.length === 0 && <p className="text-sm text-muted-foreground">当前筛选下无题目。</p>}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

function PracticeView({ question, onBack }: { question: PoliticsQuestion; onBack: () => void }) {
  const draft = usePolitics((s) => s.drafts[question.id]);
  const saveDraft = usePolitics((s) => s.saveDraft);
  const submitQuestion = usePolitics((s) => s.submitQuestion);
  const lastAttempt = usePolitics((s) => s.attempts.find((a) => a.questionId === question.id));

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of question.parts) init[p.id] = draft?.answers[p.id] ?? "";
    return init;
  });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const d = usePolitics.getState().drafts[question.id];
    const init: Record<string, string> = {};
    for (const p of question.parts) init[p.id] = d?.answers[p.id] ?? "";
    setAnswers(init);
    setRevealed({});
    setChecked({});
    setSavedMsg("");
  }, [question.id, question.parts]);

  const setPart = (partId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [partId]: text }));
    saveDraft(question.id, partId, text);
  };

  const reveal = (part: QuestionPart) => {
    const auto = scorePart(answers[part.id] || "", part);
    setChecked((prev) => ({ ...prev, [part.id]: auto.hitIds }));
    setRevealed((prev) => ({ ...prev, [part.id]: true }));
  };

  const togglePoint = (part: QuestionPart, id: string) => {
    setChecked((prev) => {
      const cur = new Set(prev[part.id] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, [part.id]: [...cur] };
    });
  };

  const fillSkeleton = (part: QuestionPart) => {
    if ((answers[part.id] || "").trim()) return;
    setPart(part.id, part.skeleton);
  };

  const onSubmit = () => {
    const attempt = submitQuestion(question.id, answers, checked);
    if (!attempt) return;
    setSavedMsg(`已记下 ${attempt.score}/${attempt.maxScore} 分。缺的点看下方红字，下次补上。`);
    for (const p of question.parts) {
      if (!revealed[p.id]) reveal(p);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
      <div>
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onBack}>
          ← 题库
        </button>
        <h1 className="mt-1 text-xl font-semibold">
          {question.year} 年第 {question.no} 题 · {SUBJECT_LABEL[question.subject]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{question.title}</p>
        {lastAttempt && (
          <p className="mt-1 text-xs text-muted-foreground">
            上次自测 {lastAttempt.score}/{lastAttempt.maxScore}
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">材料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          {question.materials.map((m) => (
            <div key={m.label}>
              {question.materials.length > 1 && (
                <p className="mb-1 text-xs font-medium text-muted-foreground">{m.label}</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-7">{m.text}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            答题时摘 1–2 个材料原词，不要整段抄。材料已按训练需要压缩。
          </p>
        </CardContent>
      </Card>

      {question.parts.map((p, idx) => {
        const auto = scorePart(answers[p.id] || "", p);
        const shown = revealed[p.id];
        const picked = checked[p.id] ?? auto.hitIds;
        const liveScore = scoreChecked(picked, p.scorePoints);
        return (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                （{idx + 1}）{p.prompt}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{p.points} 分</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={answers[p.id] || ""}
                onChange={(e) => setPart(p.id, e.target.value)}
                placeholder="先写原理，再挂钩材料，最后回扣设问。"
                className={TEXTAREA_CLS}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!!(answers[p.id] || "").trim()}
                  onClick={() => fillSkeleton(p)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  套用骨架
                </Button>
                <Button type="button" size="sm" onClick={() => reveal(p)}>
                  对照踩分
                </Button>
              </div>
              {shown && (
                <div className="space-y-3 rounded-md border border-dashed p-3">
                  {auto.missingMaterial && (
                    <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      没摘到材料关键词，这一问最多只能拿到原理分。把「{p.materialHints[0]}」写进分析里。
                    </p>
                  )}
                  <p className="text-sm">
                    当前 {liveScore}/{auto.maxScore} 分
                    {auto.hitIds.length > 0 ? ` · 自动命中 ${auto.hitIds.length} 点` : " · 尚未命中关键词"}
                  </p>
                  <ul className="space-y-2">
                    {p.scorePoints.map((sp) => {
                      const on = picked.includes(sp.id);
                      const autoOn = auto.hitIds.includes(sp.id);
                      return (
                        <li key={sp.id}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={on}
                              onChange={() => togglePoint(p, sp.id)}
                            />
                            <span>
                              <span className={on ? "text-foreground" : "text-muted-foreground"}>
                                {sp.text}
                              </span>
                              <span className="ml-1 text-xs text-muted-foreground">
                                {sp.score} 分
                                {autoOn ? " · 已写出" : " · 未写出"}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">参考答案</p>
                    <p className="mt-1 text-sm leading-7">{p.model}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSubmit}>
          <Check className="h-4 w-4" />
          记下这次练习
        </Button>
        {savedMsg && <p className="text-sm text-muted-foreground">{savedMsg}</p>}
      </div>
    </div>
  );
}

function MethodPanel() {
  const [subject, setSubject] = useState<PoliticsSubject>("marx");
  const tip = SUBJECT_TIPS[subject];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">四步写法</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {METHOD_STEPS.map((s, i) => (
            <div key={s.title} className="rounded-lg border p-3">
              <p className="text-sm font-medium">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">设问动词</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {ASK_VERBS.map((v) => (
            <p key={v.verb} className="text-sm leading-6">
              <span className="font-medium">{v.verb}</span>
              <span className="text-muted-foreground"> — {v.do}</span>
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" />
            五科帽子句
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {SUBJECTS.map((s) => (
              <Chip key={s} active={subject === s} onClick={() => setSubject(s)}>
                {SUBJECT_LABEL[s]}
              </Chip>
            ))}
          </div>
          <p className="text-sm font-medium">{tip.title}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
            {tip.hat.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="rounded-md bg-muted/60 p-3 text-sm leading-7">{tip.skeleton}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">同一问：低分 vs 高分</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4 text-sm leading-7">
          <p className="text-muted-foreground">{BAD_VS_GOOD.prompt}</p>
          <div>
            <p className="font-medium text-rose-700 dark:text-rose-300">低分</p>
            <p className="mt-1">{BAD_VS_GOOD.bad}</p>
            <p className="mt-1 text-xs text-muted-foreground">{BAD_VS_GOOD.badWhy}</p>
          </div>
          <div>
            <p className="font-medium text-emerald-700 dark:text-emerald-300">高分</p>
            <p className="mt-1">{BAD_VS_GOOD.good}</p>
            <p className="mt-1 text-xs text-muted-foreground">{BAD_VS_GOOD.goodWhy}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogPanel() {
  const attempts = usePolitics((s) => s.attempts);
  const clearAll = usePolitics((s) => s.clearAll);

  if (attempts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ScrollText className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">还没有练习记录</p>
          <p className="text-sm text-muted-foreground">在「练题」里写完对照踩分，点记下这次练习</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {attempts.map((a) => {
        const q = questionById(a.questionId);
        return (
          <Link
            key={a.id}
            to={`/politics/q/${a.questionId}`}
            className="block rounded-xl border bg-card p-4 transition hover:border-primary/40"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {q ? `${q.year} · ${q.no} ${SUBJECT_LABEL[q.subject]}` : a.questionId}
              </span>
              <span className="text-sm tnum">
                {a.score}/{a.maxScore}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {q?.title} · {new Date(a.at).toLocaleString("zh-CN")}
            </p>
          </Link>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (window.confirm("清空本机及账号中的政治练习记录？")) clearAll();
        }}
      >
        清空记录
      </Button>
    </div>
  );
}
