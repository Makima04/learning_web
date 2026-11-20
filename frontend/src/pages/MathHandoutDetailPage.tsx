import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  Network,
  RotateCcw,
  Scissors,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  loadMathHandouts,
  useHandoutPriority,
  type HandoutExample,
  type MathHandout,
} from "@/lib/mathHandouts";
import { useKgProgress } from "@/stores/kgProgress";
import { useJournal } from "@/stores/journal";
import { findKp } from "@/data/kg";
import { wangdaoJournalId } from "@/lib/kg/wangdao408";
import type { MarkLevel, UserItemMark } from "@/lib/kg/types";
import "@/styles/mathHandout.css";

function isLilinExample(ex: HandoutExample): boolean {
  return ex.sourceType === "lilin880" || Boolean(ex.lilin880Id);
}

function isExamExample(ex: HandoutExample): boolean {
  return ex.sourceType === "exam" || ex.sourceType === "lilin_mock";
}

/** 同一道题若是「真题 · 880 同题」，同步写入两个 ID，确保跨模块（手稿/880/图谱/复习性价比）完全互通。 */
function syncIdsOf(ex: HandoutExample): string[] {
  const ids = [ex.id];
  if (ex.lilin880Id && ex.lilin880Id !== ex.id) ids.push(ex.lilin880Id);
  return ids;
}

interface UndoPayload {
  title: string;
  entries: {
    itemId: string;
    prevMark: UserItemMark | null;
    wasActiveInJournal: boolean;
  }[];
}

function MarkStrip({
  ex,
  currentMark,
  primaryKpId,
  secondaryKpIds,
  onRetire,
}: {
  ex: HandoutExample;
  currentMark?: MarkLevel;
  primaryKpId: string;
  secondaryKpIds: string[];
  onRetire: () => void;
}) {
  const markItem = useKgProgress((s) => s.markItem);

  const handle = (mark: Exclude<MarkLevel, "skip">) => {
    const ids = syncIdsOf(ex);
    const journal = useJournal.getState();
    for (const itemId of ids) {
      markItem({ itemId, mark, primaryKpId, secondaryKpIds });
      const existing = journal.entries.find(
        (e) => e.sourceItemId === itemId && e.status === "active"
      );
      if (mark === "fuzzy" || mark === "fail") {
        if (existing) {
          journal.reviewEntry(existing.id, mark === "fuzzy" ? "hard" : "fail");
        } else {
          journal.collectWrongItem({
            id: wangdaoJournalId(itemId),
            sourceItemId: itemId,
            kpId: primaryKpId,
            title: `${ex.title}（${ex.source}）`,
            body: ex.source,
            categoryId: "cat-math",
          });
        }
      } else if (mark === "pass" && existing) {
        journal.reviewEntry(existing.id, "pass");
      }
    }
  };

  return (
    <div className="mh-mark-group" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => handle("pass")}
        className={`mh-mark-btn${currentMark === "pass" ? " is-pass" : ""}`}
        title="标记为已掌握（同步到题目复习、复习性价比、知识图谱）"
      >
        <Check className="h-3 w-3" />会
      </button>
      <button
        type="button"
        onClick={() => handle("fuzzy")}
        className={`mh-mark-btn${currentMark === "fuzzy" ? " is-fuzzy" : ""}`}
        title="标记为模糊（加入 1/3/7/14 复习队列并同步全站）"
      >
        <HelpCircle className="h-3 w-3" />模糊
      </button>
      <button
        type="button"
        onClick={() => handle("fail")}
        className={`mh-mark-btn${currentMark === "fail" ? " is-fail" : ""}`}
        title="标记为不会（加入 1/3/7/14 复习队列并同步全站）"
      >
        <X className="h-3 w-3" />不会
      </button>
      <button
        type="button"
        onClick={onRetire}
        className="mh-mark-btn is-retire"
        title="一次性过关、不再纳入后续复习，并折叠为灰条（随时可一键移回）"
      >
        <Scissors className="h-3 w-3" />斩掉
      </button>
    </div>
  );
}

function ExampleCard({
  ex,
  isActive,
  isRetired,
  isPeeking,
  hintOpen,
  stepsOpen,
  currentMark,
  primaryKpId,
  secondaryKpIds,
  onActivate,
  onToggleHint,
  onToggleSteps,
  onRetire,
  onUnretire,
  onTogglePeek,
}: {
  ex: HandoutExample;
  isActive: boolean;
  isRetired: boolean;
  isPeeking: boolean;
  hintOpen: boolean;
  stepsOpen: boolean;
  currentMark?: MarkLevel;
  primaryKpId: string;
  secondaryKpIds: string[];
  onActivate: () => void;
  onToggleHint: () => void;
  onToggleSteps: () => void;
  onRetire: () => void;
  onUnretire: () => void;
  onTogglePeek: () => void;
}) {
  const questionRef = useRef<HTMLDivElement>(null);
  const [mcqFeedback, setMcqFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const is880 = isLilinExample(ex);

  // 已斩掉且未临时展开预览时：折叠成一行灰色紧凑条
  if (isRetired && !isPeeking) {
    return (
      <div id={ex.anchorId} className="mh-retired-row">
        <span className="mh-retired-badge">
          <Check className="h-3 w-3" />
          已斩
        </span>
        <span className="mh-retired-title">{ex.title}</span>
        <span className="mh-retired-source">{ex.source}</span>
        <div className="mh-retired-actions">
          <button
            type="button"
            className="mh-retired-btn"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePeek();
            }}
            title="临时展开查看原题（不取消已斩状态）"
          >
            <Eye className="h-3 w-3" />
            查看
          </button>
          <button
            type="button"
            className="mh-retired-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUnretire();
            }}
            title="取消已斩，恢复到正常列表并允许再次纳入复习"
          >
            <RotateCcw className="h-3 w-3" />
            移回复习
          </button>
        </div>
      </div>
    );
  }

  // 选择题点击选项即时判分（还原原手稿交互）
  const handleQuestionClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onActivate();
    if (!ex.answerLetter) return;
    const li = (e.target as HTMLElement).closest("ol.options > li");
    if (!li || !questionRef.current) return;
    const list = li.parentElement;
    if (!list) return;
    const items = Array.from(list.children);
    const idx = items.indexOf(li);
    if (idx < 0 || idx > 3) return;
    const letters = ["A", "B", "C", "D"];
    const picked = letters[idx];
    const correctIdx = letters.indexOf(ex.answerLetter);

    items.forEach((el, i) => {
      el.classList.remove("is-correct", "is-wrong");
      if (i === correctIdx) el.classList.add("is-correct");
      else if (i === idx && picked !== ex.answerLetter) el.classList.add("is-wrong");
    });

    if (picked === ex.answerLetter) {
      setMcqFeedback({ ok: true, text: `选择 ${picked}，回答正确。` });
    } else {
      setMcqFeedback({ ok: false, text: `已选 ${picked}，参考答案是 ${ex.answerLetter}。` });
    }
  };

  return (
    <article
      id={ex.anchorId}
      data-mh-example={ex.anchorId}
      className={`mh-example${isActive ? " is-active" : ""}`}
      onClick={onActivate}
    >
      {isRetired && isPeeking && (
        <div className="mh-retired-row mb-3 mt-0">
          <span className="mh-retired-badge">
            <Check className="h-3 w-3" />
            已斩（临时展开查看）
          </span>
          <div className="mh-retired-actions">
            <button
              type="button"
              className="mh-retired-btn"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePeek();
              }}
            >
              <EyeOff className="h-3 w-3" />
              重新折叠
            </button>
            <button
              type="button"
              className="mh-retired-btn"
              onClick={(e) => {
                e.stopPropagation();
                onUnretire();
              }}
            >
              <RotateCcw className="h-3 w-3" />
              移回复习
            </button>
          </div>
        </div>
      )}

      <div className="mh-ex-head">
        <h3 className="mh-ex-title">{ex.title}</h3>
      </div>

      <p className="mh-ex-source">
        <span className={`mh-src-tag ${is880 ? "is-880" : "is-exam"}`}>
          {ex.sourceType === "lilin880"
            ? "李林 880"
            : ex.sourceType === "lilin_mock"
            ? "李林预测卷 / 红笔"
            : ex.lilin880Id
            ? "真题 · 880 同题"
            : "历年真题"}
        </span>
        <span>{ex.source}</span>
        {ex.matchedMath1 && ex.year && ex.n && (
          <Link
            to={`/review-priority/exams/math1/${ex.year}/${ex.n}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 font-semibold"
          >
            真题原卷
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </p>

      {/* 题干（全 HTML + MathML 渲染） */}
      <div
        ref={questionRef}
        className={`mh-question${is880 ? " is-880" : ""}`}
        onClick={handleQuestionClick}
        dangerouslySetInnerHTML={{ __html: ex.questionHtml }}
      />
      {mcqFeedback && (
        <div className={`mh-opt-feedback ${mcqFeedback.ok ? "ok" : "err"}`}>
          {mcqFeedback.text}
        </div>
      )}

      {/* 控制条：题面线索 + 答题步骤详情（按钮 / 空格键） + 全站同步标记 + 斩掉 */}
      <div className="mh-ex-controls">
        {ex.hintHtml && (
          <button
            type="button"
            className="mh-btn mh-btn-subtle"
            aria-pressed={hintOpen}
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
              onToggleHint();
            }}
          >
            <Lightbulb className="h-3.5 w-3.5" />
            {hintOpen ? "收起线索" : "看第一步线索"}
          </button>
        )}

        {ex.stepsHtml && (
          <button
            type="button"
            className="mh-btn"
            aria-pressed={stepsOpen}
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
              onToggleSteps();
            }}
          >
            {stepsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {stepsOpen ? "收起答题步骤" : "显示答题步骤"}
            <kbd className="mh-kbd">Space</kbd>
          </button>
        )}

        <span className="mh-spacer" />

        <MarkStrip
          ex={ex}
          currentMark={currentMark}
          primaryKpId={primaryKpId}
          secondaryKpIds={secondaryKpIds}
          onRetire={onRetire}
        />
      </div>

      {/* 题面线索和第一步 */}
      {ex.hintHtml && hintOpen && (
        <div className="mh-solution" dangerouslySetInnerHTML={{ __html: ex.hintHtml }} />
      )}

      {/* 具体答题步骤细节（推导与结论 / 举一反三） */}
      {ex.stepsHtml && stepsOpen && (
        <div className="mh-solution" dangerouslySetInnerHTML={{ __html: ex.stepsHtml }} />
      )}
    </article>
  );
}

export function MathHandoutDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [handout, setHandout] = useState<MathHandout | null>(null);
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useHandoutPriority();

  // 默认收起具体答题步骤，方便按空格或按钮按需展开
  const [globalStepsOpen, setGlobalStepsOpen] = useState(false);
  const [stepsOverride, setStepsOverride] = useState<Record<string, boolean>>({});
  const [hintOpenMap, setHintOpenMap] = useState<Record<string, boolean>>({});
  const [peekRetiredMap, setPeekRetiredMap] = useState<Record<string, boolean>>({});
  const [hideRetired, setHideRetired] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoPayload | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const states = useKgProgress((s) => s.states);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const retireItem = useKgProgress((s) => s.retireItem);
  const unretireItem = useKgProgress((s) => s.unretireItem);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadMathHandouts()
      .then((hs) => {
        if (!alive) return;
        setHandout(hs.find((x) => x.slug === slug) ?? null);
        setStepsOverride({});
        setHintOpenMap({});
        setPeekRetiredMap({});
        setActiveAnchorId(null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const markRecordMap = useMemo(() => {
    const m = new Map<string, UserItemMark>();
    for (const it of itemMarks) m.set(it.itemId, it);
    return m;
  }, [itemMarks]);

  const getExampleMark = useCallback(
    (ex: HandoutExample): MarkLevel | undefined => {
      return (
        markRecordMap.get(ex.id)?.mark ??
        (ex.lilin880Id ? markRecordMap.get(ex.lilin880Id)?.mark : undefined)
      );
    },
    [markRecordMap]
  );

  const isExampleRetired = useCallback(
    (ex: HandoutExample): boolean => {
      return Boolean(
        markRecordMap.get(ex.id)?.retired ||
          (ex.lilin880Id && markRecordMap.get(ex.lilin880Id)?.retired)
      );
    },
    [markRecordMap]
  );

  const handleRetireExample = useCallback(
    (ex: HandoutExample) => {
      if (!handout) return;
      const ids = syncIdsOf(ex);
      const journal = useJournal.getState();
      const entries = ids.map((itemId) => ({
        itemId,
        prevMark: markRecordMap.get(itemId) ?? null,
        wasActiveInJournal: journal.entries.some(
          (e) => e.sourceItemId === itemId && e.status === "active"
        ),
      }));

      for (const itemId of ids) {
        retireItem({
          itemId,
          primaryKpId: handout.primaryKpId,
          secondaryKpIds: handout.secondaryKpIds,
        });
      }
      setPeekRetiredMap((prev) => {
        if (!prev[ex.anchorId]) return prev;
        const next = { ...prev };
        delete next[ex.anchorId];
        return next;
      });

      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
      setUndoToast({ title: ex.title, entries });
      undoTimerRef.current = window.setTimeout(() => {
        setUndoToast(null);
        undoTimerRef.current = null;
      }, 5500);
    },
    [handout, markRecordMap, retireItem]
  );

  const handleUnretireExample = useCallback(
    (ex: HandoutExample) => {
      for (const itemId of syncIdsOf(ex)) {
        unretireItem(itemId);
      }
      setPeekRetiredMap((prev) => {
        if (!prev[ex.anchorId]) return prev;
        const next = { ...prev };
        delete next[ex.anchorId];
        return next;
      });
    },
    [unretireItem]
  );

  const handleUndoRetire = useCallback(() => {
    if (!undoToast) return;
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const journal = useJournal.getState();
    for (const item of undoToast.entries) {
      unretireItem(item.itemId, item.prevMark);
      if (item.wasActiveInJournal) {
        const entry = journal.entries.find((e) => e.sourceItemId === item.itemId);
        if (entry && entry.status !== "active") {
          journal.setEntryReviewStatus(entry.id, "active");
        }
      }
    }
    setUndoToast(null);
  }, [undoToast, unretireItem]);

  const isStepsOpen = useCallback(
    (anchorId: string) => stepsOverride[anchorId] ?? globalStepsOpen,
    [stepsOverride, globalStepsOpen]
  );

  const toggleStepsFor = useCallback(
    (anchorId: string) => {
      setStepsOverride((prev) => {
        const cur = prev[anchorId] ?? globalStepsOpen;
        return { ...prev, [anchorId]: !cur };
      });
    },
    [globalStepsOpen]
  );

  const toggleAllSteps = useCallback(() => {
    setGlobalStepsOpen((prev) => {
      const next = !prev;
      setStepsOverride({});
      return next;
    });
  }, []);

  // 全局空格快捷键（Space）：切换当前聚焦题目的「具体答题步骤细节」显示/关闭
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      const container = readerRef.current;
      if (!container) return;

      // 优先操作当前激活且可见的题目；否则自动定位视口上中部最近的可见题目
      let chosenId: string | null = null;
      if (activeAnchorId) {
        const activeEl = container.querySelector<HTMLElement>(
          `[data-mh-example="${CSS.escape(activeAnchorId)}"]`
        );
        if (activeEl && activeEl.offsetParent !== null) {
          chosenId = activeAnchorId;
        }
      }

      if (!chosenId) {
        const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-mh-example]")).filter(
          (el) => el.offsetParent !== null
        );
        if (cards.length === 0) return;
        const anchorY = window.innerHeight * 0.28;
        let bestDist = Infinity;
        for (const el of cards) {
          const rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          const dist = Math.abs(rect.top - anchorY);
          if (dist < bestDist) {
            bestDist = dist;
            chosenId = el.dataset.mhExample ?? null;
          }
        }
        if (!chosenId) chosenId = cards[0].dataset.mhExample ?? null;
      }

      if (!chosenId) return;
      e.preventDefault();
      setActiveAnchorId(chosenId);
      toggleStepsFor(chosenId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAnchorId, toggleStepsFor]);

  // 拦截讲义内部的 #anchor 跳转：自动展开目标所在的 <details> 分组并平滑滚动
  const handleReaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const rawHash = a.getAttribute("href");
    if (!rawHash || rawHash === "#") return;
    const targetId = decodeURIComponent(rawHash.slice(1));
    const el = document.getElementById(targetId);
    if (!el) return;
    e.preventDefault();

    // 展开所有祖先 <details>
    let cur: HTMLElement | null = el;
    while (cur) {
      if (cur.tagName === "DETAILS") {
        (cur as HTMLDetailsElement).open = true;
      }
      cur = cur.parentElement;
    }
    if (el.dataset.mhExample) {
      setActiveAnchorId(el.dataset.mhExample);
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  if (loading) {
    return (
      <div className="mh-reader flex items-center justify-center py-20 text-sm text-[var(--mh-muted)]">
        正在加载手稿内容…
      </div>
    );
  }

  if (!handout) {
    return (
      <div className="mh-reader mx-auto max-w-3xl space-y-4 px-6 py-12">
        <p>未找到该份数学手稿。</p>
        <Link to="/math-handouts" className="mh-btn">
          ← 返回数学手稿目录
        </Link>
      </div>
    );
  }

  const kpInfo = findKp(handout.primaryKpId);
  const kpState = states[handout.primaryKpId];
  const confidence = Math.round((kpState?.confidence ?? 0) * 100);

  const allExamples = handout.groups.flatMap((g) => g.examples);
  const passedCount = allExamples.filter((e) => getExampleMark(e) === "pass").length;
  const retiredCount = allExamples.filter((e) => isExampleRetired(e)).length;
  const progressPct = allExamples.length > 0 ? Math.round((passedCount / allExamples.length) * 100) : 0;
  const hasAny880 = handout.stats.lilin880 > 0;

  return (
    <div ref={readerRef} className="mh-reader" onClick={handleReaderClick}>
      <div className="mh-layout">
        {/* 左侧悬浮讲义目录与控制面板（还原手稿 Web 左侧栏） */}
        <aside className="mh-toc">
          <p className="mh-toc-title">{handout.title}</p>
          <nav className="mh-toc-list" aria-label="讲义目录">
            {handout.verdictHtml && <a href="#verdict">{handout.verdictHeading}</a>}
            {handout.methods.length > 0 && <a href="#topic-index">{handout.topicHeading}</a>}
            {handout.workedHtml && <a href="#worked-examples">{handout.workedHeading || "例题串讲"}</a>}
            <a href="#practice">{handout.practiceHeading}</a>
          </nav>

          <div className="mh-toc-group">
            <div className="mh-toc-label">例题讲解优先源</div>
            <div className="mh-seg">
              <button
                type="button"
                className={priority === "exam" ? "is-active" : ""}
                onClick={() => setPriority("exam")}
              >
                真题优先
              </button>
              <button
                type="button"
                className={priority === "lilin880" ? "is-active-880" : ""}
                onClick={() => setPriority("lilin880")}
              >
                880 优先
              </button>
            </div>
          </div>

          <div className="mh-toc-group space-y-2">
            <div className="mh-toc-label">答题步骤与已斩题</div>
            <button
              type="button"
              className="mh-btn w-full justify-center"
              aria-pressed={globalStepsOpen}
              onClick={toggleAllSteps}
            >
              {globalStepsOpen ? "全部收起步骤" : "全部展开步骤"}
            </button>
            {retiredCount > 0 && (
              <button
                type="button"
                className="mh-btn mh-btn-subtle w-full justify-center"
                aria-pressed={hideRetired}
                onClick={() => setHideRetired((v) => !v)}
              >
                {hideRetired ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {hideRetired ? `显示已斩灰条 (${retiredCount})` : `隐藏已斩灰条 (${retiredCount})`}
              </button>
            )}
            <p className="m-0 text-[12px] leading-snug text-[var(--mh-muted)]">
              点选题目后按 <kbd className="mh-kbd">Space</kbd> 显隐答题步骤；点「斩掉」折叠成灰条并移出复习。
            </p>
          </div>

          <div className="mh-toc-group">
            <div className="mh-toc-label">
              本讲进度（{passedCount} / {allExamples.length} 已会
              {retiredCount > 0 ? ` · ${retiredCount} 已斩` : ""}）
            </div>
            <div className="mh-prog-bar">
              <div className="mh-prog-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
              <Link to={`/kg/math/kp/${handout.primaryKpId}`} className="inline-flex items-center gap-1">
                <Network className="h-3.5 w-3.5" />
                图谱：{kpInfo?.kp.name ?? handout.primaryKpId}（{confidence}%）
              </Link>
              <Link to={`/review-priority/knowledge/${handout.primaryKpId}`} className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                查看复习性价比排序
              </Link>
            </div>
          </div>
        </aside>

        {/* 右侧讲义正文区 */}
        <main className="mh-main">
          <header>
            <p className="mh-back">
              <Link to="/math-handouts">← 全部数学手稿</Link>
            </p>
            <p className="mh-chapter">{handout.chapterPath}</p>
            <h1>{handout.title}</h1>

            <div className="mh-sync-strip">
              <span className="mh-sync-pill is-ok">
                <Sparkles className="h-3.5 w-3.5" />
                图谱掌握度 {confidence}%
              </span>
              <Link to={`/kg/math/kp/${handout.primaryKpId}`} className="mh-sync-pill">
                <Network className="h-3.5 w-3.5" />
                {kpInfo?.kp.name ?? handout.primaryKpId}
              </Link>
              <Link to={`/review-priority/knowledge/${handout.primaryKpId}`} className="mh-sync-pill">
                <Target className="h-3.5 w-3.5" />
                复习性价比同步
              </Link>
              <span className="text-[var(--mh-muted)]">
                真题 {handout.stats.exam} 题 · 李林 880 精讲 {handout.stats.lilin880} 题
                {retiredCount > 0 ? ` · 已斩 ${retiredCount} 题` : ""}
              </span>
            </div>

            {/* 窄屏顶部控制条 */}
            <div className="mh-mobile-bar">
              <div className="mh-seg">
                <button
                  type="button"
                  className={priority === "exam" ? "is-active" : ""}
                  onClick={() => setPriority("exam")}
                >
                  真题优先
                </button>
                <button
                  type="button"
                  className={priority === "lilin880" ? "is-active-880" : ""}
                  onClick={() => setPriority("lilin880")}
                >
                  880 优先
                </button>
              </div>
              <button
                type="button"
                className="mh-btn"
                aria-pressed={globalStepsOpen}
                onClick={toggleAllSteps}
              >
                {globalStepsOpen ? "收起全部步骤" : "展开全部步骤"}
                <kbd className="mh-kbd">Space</kbd>
              </button>
              {retiredCount > 0 && (
                <button
                  type="button"
                  className="mh-btn mh-btn-subtle"
                  aria-pressed={hideRetired}
                  onClick={() => setHideRetired((v) => !v)}
                >
                  {hideRetired ? `显示已斩 (${retiredCount})` : `隐藏已斩 (${retiredCount})`}
                </button>
              )}
            </div>
          </header>

          {/* 1. 怎么判 */}
          {handout.verdictHtml && (
            <section>
              <h2 id="verdict" className="mh-topic">
                {handout.verdictHeading}
              </h2>
              <div dangerouslySetInnerHTML={{ __html: handout.verdictHtml }} />
            </section>
          )}

          {/* 2. 看式子找第一步 */}
          {handout.methods.length > 0 && (
            <section>
              <h2 id="topic-index" className="mh-topic">
                {handout.topicHeading}
              </h2>
              {handout.topicIntroHtml && (
                <div dangerouslySetInnerHTML={{ __html: handout.topicIntroHtml }} />
              )}
              <div className="mh-methods">
                {handout.methods.map((m, idx) => (
                  <div key={m.id} id={m.id} className="mh-method-card">
                    <div className="mh-method-head">
                      <span className="mh-method-num">{idx + 1}</span>
                      <span dangerouslySetInnerHTML={{ __html: m.titleHtml }} />
                    </div>
                    {m.descHtml && (
                      <div
                        className="mh-method-desc"
                        dangerouslySetInnerHTML={{ __html: m.descHtml }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. 例题串讲 */}
          {handout.workedHtml && (
            <section className="mh-worked">
              <h2 id="worked-examples" className="mh-topic">
                {handout.workedHeading || "例题串讲"}
              </h2>
              <div dangerouslySetInnerHTML={{ __html: handout.workedHtml }} />
            </section>
          )}

          {/* 4. 按方法练习（按「真题优先 / 李林 880 优先」切换主次例题，全 HTML 渲染） */}
          <section>
            <h2 id="practice" className="mh-topic">
              {handout.practiceHeading}
              <span className="ml-auto text-xs font-semibold text-[var(--mh-muted)]">
                当前：{priority === "lilin880" ? "李林 880 优先" : "真题优先"} · 按{" "}
                <kbd className="mh-kbd">Space</kbd> 显隐答题步骤
              </span>
            </h2>

            {handout.practiceIntroHtml && (
              <div dangerouslySetInnerHTML={{ __html: handout.practiceIntroHtml }} />
            )}

            {priority === "lilin880" && !hasAny880 && (
              <div className="note">
                <strong>提示：</strong>本讲的李林 880 HTML 精讲题尚未补齐（不以扫描图凑数），当前先展示本讲历年真题与方法讲解；「连续性与间断点」已完成 20 道李林 880 全 HTML 精讲作为样板。
              </div>
            )}

            {handout.groups.map((g, gIdx) => {
              const examList = g.examples.filter(isExamExample);
              const lilinList = g.examples.filter(isLilinExample);

              let primaryList: HandoutExample[];
              let secondaryList: HandoutExample[];
              let secondaryLabel: string;

              if (priority === "lilin880" && hasAny880) {
                primaryList = lilinList;
                secondaryList = examList.filter((e) => !isLilinExample(e));
                secondaryLabel = `展开本组历年真题对照（${secondaryList.length} 题）`;
              } else {
                primaryList = examList;
                secondaryList = lilinList.filter((e) => !isExamExample(e));
                secondaryLabel = `展开本组李林 880 精讲（${secondaryList.length} 题）`;
              }

              const visiblePrimary = hideRetired
                ? primaryList.filter((e) => !isExampleRetired(e))
                : primaryList;
              const visibleSecondary = hideRetired
                ? secondaryList.filter((e) => !isExampleRetired(e))
                : secondaryList;

              const passedInGroup = g.examples.filter((e) => getExampleMark(e) === "pass").length;
              const retiredInGroup = g.examples.filter((e) => isExampleRetired(e)).length;

              return (
                <details
                  key={g.id}
                  id={g.id}
                  open={gIdx === 0 || (priority === "lilin880" && primaryList.length > 0)}
                  className="mh-group"
                >
                  <summary>
                    <span>{g.title}</span>
                    <span className="mh-group-meta">
                      <span className="mh-group-count">
                        {priority === "lilin880" && hasAny880
                          ? `880 ${primaryList.length} 题`
                          : `真题 ${primaryList.length} 题`}
                      </span>
                      <span>
                        已会 {passedInGroup}/{g.examples.length}
                        {retiredInGroup > 0 ? ` · 已斩 ${retiredInGroup}` : ""}
                      </span>
                    </span>
                  </summary>

                  <div className="mh-group-body">
                    {visiblePrimary.length === 0 ? (
                      <p className="py-2 text-sm text-[var(--mh-muted)]">
                        {primaryList.length > 0 && hideRetired
                          ? "本组主源例题已全部斩掉并隐藏，可在左侧重新显示已斩灰条。"
                          : "本方法分组下暂无对应主源例题，可展开下方对照题练习。"}
                      </p>
                    ) : (
                      visiblePrimary.map((ex) => (
                        <ExampleCard
                          key={ex.anchorId}
                          ex={ex}
                          isActive={activeAnchorId === ex.anchorId}
                          isRetired={isExampleRetired(ex)}
                          isPeeking={Boolean(peekRetiredMap[ex.anchorId])}
                          hintOpen={Boolean(hintOpenMap[ex.anchorId])}
                          stepsOpen={isStepsOpen(ex.anchorId)}
                          currentMark={getExampleMark(ex)}
                          primaryKpId={handout.primaryKpId}
                          secondaryKpIds={handout.secondaryKpIds}
                          onActivate={() => setActiveAnchorId(ex.anchorId)}
                          onToggleHint={() =>
                            setHintOpenMap((m) => ({ ...m, [ex.anchorId]: !m[ex.anchorId] }))
                          }
                          onToggleSteps={() => toggleStepsFor(ex.anchorId)}
                          onRetire={() => handleRetireExample(ex)}
                          onUnretire={() => handleUnretireExample(ex)}
                          onTogglePeek={() =>
                            setPeekRetiredMap((m) => ({ ...m, [ex.anchorId]: !m[ex.anchorId] }))
                          }
                        />
                      ))
                    )}

                    {visibleSecondary.length > 0 && (
                      <details className="mh-secondary-fold">
                        <summary>{secondaryLabel}</summary>
                        <div>
                          {visibleSecondary.map((ex) => (
                            <ExampleCard
                              key={ex.anchorId}
                              ex={ex}
                              isActive={activeAnchorId === ex.anchorId}
                              isRetired={isExampleRetired(ex)}
                              isPeeking={Boolean(peekRetiredMap[ex.anchorId])}
                              hintOpen={Boolean(hintOpenMap[ex.anchorId])}
                              stepsOpen={isStepsOpen(ex.anchorId)}
                              currentMark={getExampleMark(ex)}
                              primaryKpId={handout.primaryKpId}
                              secondaryKpIds={handout.secondaryKpIds}
                              onActivate={() => setActiveAnchorId(ex.anchorId)}
                              onToggleHint={() =>
                                setHintOpenMap((m) => ({ ...m, [ex.anchorId]: !m[ex.anchorId] }))
                              }
                              onToggleSteps={() => toggleStepsFor(ex.anchorId)}
                              onRetire={() => handleRetireExample(ex)}
                              onUnretire={() => handleUnretireExample(ex)}
                              onTogglePeek={() =>
                                setPeekRetiredMap((m) => ({ ...m, [ex.anchorId]: !m[ex.anchorId] }))
                              }
                            />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        </main>
      </div>

      {/* 斩题 5 秒即时撤销提示条 */}
      {undoToast && (
        <div className="mh-undo-toast" role="status" aria-live="polite">
          <span>
            已斩掉「{undoToast.title}」，不再纳入后续复习
          </span>
          <button type="button" onClick={handleUndoRetire}>
            撤销
          </button>
        </div>
      )}
    </div>
  );
}
