import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WordListToggle } from "@/components/WordListToggle";
import { getPhonetic, getWordMap } from "@/lib/words";
import { cn } from "@/lib/utils";
import { speakEnglish } from "@/lib/tts";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { useWordLists } from "@/stores/wordLists";
import type { WordEntry } from "@/types/words";

type TabKey = "new" | "known";

function cnOf(entry: WordEntry): string {
  return (entry[2] || []).map((s) => s[1]).join("；");
}

export function WordListsPage() {
  const navigate = useNavigate();
  const loggedIn = useAuth((s) => s.loggedIn);
  const rate = useSettings((s) => s.rate);
  const entries = useWordLists((s) => s.entries);
  const idxsOf = useWordLists((s) => s.idxsOf);
  const syncFromServer = useWordLists((s) => s.syncFromServer);
  const startNewListReview = useStudy((s) => s.startNewListReview);
  const [tab, setTab] = useState<TabKey>("new");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loggedIn) return;
    void syncFromServer();
  }, [loggedIn, syncFromServer]);

  const newIdxs = useMemo(() => idxsOf("new"), [idxsOf, entries]);
  const knownIdxs = useMemo(() => idxsOf("known"), [idxsOf, entries]);
  const idxs = tab === "new" ? newIdxs : knownIdxs;

  const rows = useMemo(() => {
    const map = getWordMap();
    const needle = q.trim().toLowerCase();
    const out: { idx: number; entry: WordEntry }[] = [];
    for (const idx of idxs) {
      const entry = map.get(idx);
      if (!entry) continue;
      if (needle) {
        const en = entry[1].toLowerCase();
        const cn = cnOf(entry);
        if (!en.includes(needle) && !cn.includes(needle)) continue;
      }
      out.push({ idx, entry });
    }
    return out;
  }, [idxs, q]);

  function beginNewReview() {
    if (!startNewListReview()) return;
    navigate("/study");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-5 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => navigate("/")}
          aria-label="返回首页"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bookmark className="h-5 w-5 text-primary" />
            生词 / 熟词
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            生词会一直出现在复习里；熟词不再进入学习和复习。
          </p>
        </div>
      </div>

      <Card className="border-border/90 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="new">生词 {newIdxs.length}</TabsTrigger>
                <TabsTrigger value="known">熟词 {knownIdxs.length}</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "new" && (
              <Button size="sm" disabled={newIdxs.length === 0} onClick={beginNewReview}>
                复习生词
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索英文或释义"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {q.trim()
                ? "没有匹配的词"
                : tab === "new"
                  ? "还没有生词。学习或阅读时点「生词」即可收藏。"
                  : "还没有熟词。点「熟词」后，该词不再出现在学习和复习中。"}
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map(({ idx, entry }) => {
                const phonetic = getPhonetic(entry);
                const cn = cnOf(entry);
                return (
                  <li key={idx} className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => speakEnglish(entry[1], rate)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tracking-wide">{entry[1]}</span>
                        {phonetic ? (
                          <span className="text-xs text-muted-foreground">{phonetic}</span>
                        ) : null}
                      </div>
                      {cn ? (
                        <div className="mt-0.5 text-sm leading-snug text-muted-foreground">{cn}</div>
                      ) : null}
                    </button>
                    <WordListToggle idx={idx} compact />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className={cn("mt-3 text-xs text-muted-foreground")}>
        {loggedIn ? "已登录：词表会同步到其他设备。" : "未登录仅保存在本机，登录后可跨设备同步。"}
      </p>
    </div>
  );
}
