import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { dayKey } from "@/lib/day";
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
  anchorId: string;
  /** 斩掉前是否处于手动展开状态，撤销时原样恢复 */
  wasForcedOpen: boolean;
  entries: {
    itemId: string;
    prevMark: UserItemMark | null;
    wasActiveInJournal: boolean;
  }[];
}

/**
 * 「今日已练」判定：今天（北京时间）标过会/模糊/不会且未斩掉 → 当天折叠，
 * 跨天（下次复习）自动展开。ts 随 /api/kg 同步，多端一致。
 */
export function doneMarkForToday(
  rec: UserItemMark | undefined,
  todayKey: string
): Exclude<MarkLevel, "skip"> | undefined {
  if (!rec || rec.retired || rec.mark === "skip") return undefined;
  return dayKey(rec.ts) === todayKey ? rec.mark : undefined;
}

/** 「今日已练」折叠条的展示元信息：与会/模糊/不会标记按钮同色，区别于已斩灰条 */
const DONE_MARK_META: Record<Exclude<MarkLevel, "skip">, { label: string; icon: ReactNode }> = {
  pass: { label: "已会", icon: <Check className="h-3 w-3" /> },
  fuzzy: { label: "模糊", icon: <HelpCircle className="h-3 w-3" /> },
  fail: { label: "不会", icon: <X className="h-3 w-3" /> },
};

function MarkStrip({
  ex,
  currentMark,
  primaryKpId,
  secondaryKpIds,
  onRetire,
  onMarked,
}: {
  ex: HandoutExample;
  currentMark?: MarkLevel;
  primaryKpId: string;
  secondaryKpIds: string[];
  onRetire: () => void;
  onMarked: () => void;
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
    // 标记后当天收起本题（清掉手动展开状态，下次复习日自动恢复展开）
    onMarked();
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

export function ExampleCard({
  ex,
  isActive,
  isFeatured,
  isRetired,
  isForcedOpen,
  doneMark,
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
  onToggleForceOpen,
  onMarked,
}: {
  ex: HandoutExample;
  isActive: boolean;
  isFeatured?: boolean;
  isRetired: boolean;
  /** 会话级手动展开（已斩临时查看 / 今日已练手动展开共用） */
  isForcedOpen: boolean;
  /** 非空表示「今日已练」（会/模糊/不会），当天默认折叠，下次复习日自动展开 */
  doneMark?: Exclude<MarkLevel, "skip">;
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
  onToggleForceOpen: () => void;
  onMarked: () => void;
}) {
  const questionRef = useRef<HTMLDivElement>(null);
  const [mcqFeedback, setMcqFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const is880 = isLilinExample(ex);

  // 已斩掉且未临时展开预览时：折叠成一行灰色紧凑条
  if (isRetired && !isForcedOpen) {
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
              onToggleForceOpen();
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

  // 今日已练（会/模糊/不会）且未手动展开：折叠成一行彩色紧凑条（区别于已斩灰条），
  // 下次复习日（北京时间跨天）自动恢复展开；ts 随 /api/kg 同步，多端一致。
  if (doneMark && !isForcedOpen) {
    const meta = DONE_MARK_META[doneMark];
    return (
      <div id={ex.anchorId} className={`mh-done-row is-${doneMark}`}>
        <span className={`mh-done-badge is-${doneMark}`}>
          {meta.icon}
          {meta.label}
        </span>
        <span className="mh-done-title">{ex.title}</span>
        <span className="mh-retired-source">{ex.source}</span>
        <span className="mh-done-note">今日已练 · 下次复习自动展开</span>
        <div className="mh-retired-actions">
          <button
            type="button"
            className="mh-retired-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleForceOpen();
            }}
            title="手动展开本题（不改变标记与复习队列）"
          >
            <ChevronDown className="h-3 w-3" />
            展开
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
      {isRetired && isForcedOpen && (
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
                onToggleForceOpen();
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

      {/* 今日已练但手动展开：顶部彩条提示，可重新折叠；重新标记会再次收起 */}
      {doneMark && !isRetired && isForcedOpen && (
        <div className={`mh-done-row is-${doneMark} mb-3 mt-0`}>
          <span className={`mh-done-badge is-${doneMark}`}>
            {DONE_MARK_META[doneMark].icon}
            {DONE_MARK_META[doneMark].label}（今日已练 · 手动展开）
          </span>
          <div className="mh-retired-actions">
            <button
              type="button"
              className="mh-retired-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleForceOpen();
              }}
            >
              <ChevronUp className="h-3 w-3" />
              重新折叠
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
        {isFeatured && <span className="mh-src-tag is-featured">示范母题</span>}
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
          onMarked={onMarked}
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
  const [forceExpandMap, setForceExpandMap] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
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
        const found = hs.find((x) => x.slug === slug) ?? null;
        setHandout(found);
        setStepsOverride({});
        setHintOpenMap({});
        setForceExpandMap({});
        setActiveAnchorId(null);
        if (found && found.groups.length > 0) {
          setOpenGroups({ [found.groups[0].id]: true });
          setActiveGroupId(found.groups[0].id);
        } else {
          setOpenGroups({});
          setActiveGroupId(null);
        }
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

  // 滚动联动左侧判别场景高亮（ScrollSpy）
  useEffect(() => {
    if (!handout || handout.groups.length === 0) return;
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const container = readerRef.current;
        if (!container) return;
        const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-mh-group]"));
        if (sections.length === 0) return;
        const threshold = 130;
        let current = sections[0].dataset.mhGroup ?? null;
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top <= threshold) {
            current = sec.dataset.mhGroup ?? current;
          } else {
            break;
          }
        }
        if (current) setActiveGroupId(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [handout]);

  const jumpToScenario = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setOpenGroups((prev) => (prev[groupId] ? prev : { ...prev, [groupId]: true }));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(groupId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
    setActiveGroupId(groupId);
  }, []);

  const markRecordMap = useMemo(() => {
    const m = new Map<string, UserItemMark>();
    for (const it of itemMarks) m.set(it.itemId, it);
    return m;
  }, [itemMarks]);

  const getExampleMarkRecord = useCallback(
    (ex: HandoutExample): UserItemMark | undefined => {
      return (
        markRecordMap.get(ex.id) ??
        (ex.lilin880Id ? markRecordMap.get(ex.lilin880Id) : undefined)
      );
    },
    [markRecordMap]
  );

  const getExampleMark = useCallback(
    (ex: HandoutExample): MarkLevel | undefined => getExampleMarkRecord(ex)?.mark,
    [getExampleMarkRecord]
  );

  const todayKey = dayKey();
  const getExampleDoneMark = useCallback(
    (ex: HandoutExample): Exclude<MarkLevel, "skip"> | undefined =>
      doneMarkForToday(getExampleMarkRecord(ex), todayKey),
    [getExampleMarkRecord, todayKey]
  );

  /** 手动展开/收起某题（会话级视图状态；标记本身随 /api/kg 同步） */
  const setForceOpen = useCallback((anchorId: string, open: boolean) => {
    setForceExpandMap((prev) => {
      if (Boolean(prev[anchorId]) === open) return prev;
      const next = { ...prev };
      if (open) next[anchorId] = true;
      else delete next[anchorId];
      return next;
    });
  }, []);

  const toggleForceOpen = useCallback((anchorId: string) => {
    setForceExpandMap((prev) => ({ ...prev, [anchorId]: !prev[anchorId] }));
  }, []);

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

      const wasForcedOpen = Boolean(forceExpandMap[ex.anchorId]);
      for (const itemId of ids) {
        retireItem({
          itemId,
          primaryKpId: handout.primaryKpId,
          secondaryKpIds: handout.secondaryKpIds,
        });
      }
      setForceOpen(ex.anchorId, false);

      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
      setUndoToast({ title: ex.title, anchorId: ex.anchorId, wasForcedOpen, entries });
      undoTimerRef.current = window.setTimeout(() => {
        setUndoToast(null);
        undoTimerRef.current = null;
      }, 5500);
    },
    [handout, markRecordMap, retireItem, forceExpandMap, setForceOpen]
  );

  const handleUnretireExample = useCallback(
    (ex: HandoutExample) => {
      for (const itemId of syncIdsOf(ex)) {
        unretireItem(itemId);
      }
      // 移回复习要立即看到完整题面（恢复的 pass 记录 ts 为今天，否则会被「今日已练」折叠）
      setForceOpen(ex.anchorId, true);
    },
    [unretireItem, setForceOpen]
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
    setForceOpen(undoToast.anchorId, undoToast.wasForcedOpen);
    setUndoToast(null);
  }, [undoToast, unretireItem, setForceOpen]);

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

  // 拦截讲义内部的 #anchor 跳转：自动展开目标所在场景组、次要对照折叠区，再平滑滚动
  const handleReaderClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const rawHash = a.getAttribute("href");
      if (!rawHash || rawHash === "#") return;
      const targetId = decodeURIComponent(rawHash.slice(1));
      e.preventDefault();

      if (handout) {
        const ownerGroup = handout.groups.find(
          (g) => g.id === targetId || g.examples.some((ex) => ex.anchorId === targetId)
        );
        if (ownerGroup) {
          setActiveGroupId(ownerGroup.id);
          setOpenGroups((prev) => (prev[ownerGroup.id] ? prev : { ...prev, [ownerGroup.id]: true }));
        }
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const el = document.getElementById(targetId);
          if (!el) return;
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
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    },
    [handout]
  );

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
  const hasAny880 = handout.stats.lilin880 > 0;
  const leadHtml = handout.verdictLeadHtml ?? handout.verdictHtml;
  const showLegacyBottomRef =
    !handout.hasStructuredScenarios && Boolean(handout.verdictTableHtml || handout.workedHtml);

  return (
    <div ref={readerRef} className="mh-reader" onClick={handleReaderClick}>
      <div className="mh-layout">
        {/* 左侧极简控制面板：判别场景导航 + 真题/880 切换 + 答题步骤展开 */}
        <aside className="mh-toc">
          <p className="mh-toc-title">{handout.title}</p>

          <div className="mh-toc-label">判别场景</div>
          <nav className="mh-scene-nav" aria-label="判别场景导航">
            {handout.groups.map((g) => {
              const gPassed = g.examples.filter((e) => getExampleMark(e) === "pass").length;
              const gTotal = g.examples.length;
              const gDone = gTotal > 0 && gPassed === gTotal;
              const shortLabel = g.guide?.shortTitle || g.title;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`mh-scene-item${activeGroupId === g.id ? " is-active" : ""}`}
                  onClick={() => jumpToScenario(g.id)}
                >
                  <span>{shortLabel}</span>
                  <span className={`mh-scene-prog${gDone ? " is-done" : ""}`}>
                    {gDone ? <Check className="h-3.5 w-3.5" /> : `${gPassed}/${gTotal}`}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mh-toc-group">
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
            <button
              type="button"
              className="mh-btn w-full justify-center"
              aria-pressed={globalStepsOpen}
              onClick={toggleAllSteps}
            >
              {globalStepsOpen ? "全部收起步骤" : "全部展开步骤"}
              <kbd className="mh-kbd">Space</kbd>
            </button>
            {retiredCount > 0 && (
              <button
                type="button"
                className="mh-btn mh-btn-subtle w-full justify-center"
                aria-pressed={hideRetired}
                onClick={() => setHideRetired((v) => !v)}
              >
                {hideRetired ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {hideRetired ? `显示已斩 (${retiredCount})` : `隐藏已斩 (${retiredCount})`}
              </button>
            )}
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
                真题 {handout.stats.exam} 题 · 李林 880 精讲 {handout.stats.lilin880} 题 · 已会{" "}
                {passedCount}/{allExamples.length}
                {retiredCount > 0 ? ` · 已斩 ${retiredCount}` : ""}
              </span>
            </div>

            {/* 窄屏顶部控制条 + 场景快捷跳转 */}
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
              <div className="mh-mobile-scenes w-full">
                {handout.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={activeGroupId === g.id ? "is-active" : ""}
                    onClick={() => jumpToScenario(g.id)}
                  >
                    {g.guide?.shortTitle || g.title}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* 全局一句话起手（精简导览，不再堆大表格） */}
          {leadHtml && (
            <section id="verdict" dangerouslySetInnerHTML={{ __html: leadHtml }} />
          )}

          {priority === "lilin880" && !hasAny880 && (
            <div className="note">
              <strong>提示：</strong>本讲的李林 880 HTML 精讲题尚未补齐（不以扫描图凑数），当前先展示本讲历年真题与方法讲解。
            </div>
          )}

          {/* 按判别场景闭环：每个场景顶部展开核心关键与刷题路线图，紧接对应例题 */}
          <div className="mt-4">
            {handout.groups.map((g) => {
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
              const isOpen = Boolean(openGroups[g.id]);
              const featuredSet = new Set(g.guide?.featuredAnchorIds ?? []);
              const guide = g.guide;
              const hasGuideBody = Boolean(
                guide && (guide.clueHtml || guide.coreHtml || guide.pitfallHtml || guide.roadmapHtml)
              );

              return (
                <section
                  key={g.id}
                  id={g.id}
                  data-mh-group={g.id}
                  className={`mh-group${isOpen ? " is-open" : ""}`}
                >
                  <button
                    type="button"
                    className="mh-group-head"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(g.id)}
                  >
                    <span className="mh-group-head-left">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronUp className="h-4 w-4 shrink-0 rotate-90" />
                      )}
                      <span>{g.title}</span>
                    </span>
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
                  </button>

                  {isOpen && (
                    <div className="mh-group-body">
                      {/* 场景内展开的「核心关键」与示范母题路线图 */}
                      {hasGuideBody && guide && (
                        <div className="mh-scene-guide">
                          <div className="mh-sg-grid">
                            {guide.clueHtml && (
                              <div className="mh-sg-row">
                                <span className="mh-sg-badge is-clue">看式子认题眼</span>
                                <span dangerouslySetInnerHTML={{ __html: guide.clueHtml }} />
                              </div>
                            )}
                            {guide.coreHtml && (
                              <div className="mh-sg-row">
                                <span className="mh-sg-badge">核心关键与起手</span>
                                <span dangerouslySetInnerHTML={{ __html: guide.coreHtml }} />
                              </div>
                            )}
                            {guide.pitfallHtml && (
                              <div className="mh-sg-row is-pitfall">
                                <span className="mh-sg-badge is-pitfall">高频坑点</span>
                                <span dangerouslySetInnerHTML={{ __html: guide.pitfallHtml }} />
                              </div>
                            )}
                            {guide.roadmapHtml && (
                              <div className="mh-sg-row is-roadmap">
                                <span className="mh-sg-badge is-roadmap">本组刷题路线</span>
                                <span dangerouslySetInnerHTML={{ __html: guide.roadmapHtml }} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {visiblePrimary.length === 0 ? (
                        <p className="py-2 text-sm text-[var(--mh-muted)]">
                          {primaryList.length > 0 && hideRetired
                            ? "本组主源例题已全部斩掉并隐藏，可在左侧重新显示已斩灰条。"
                            : "本场景下暂无对应主源例题，可展开下方对照题练习。"}
                        </p>
                      ) : (
                        visiblePrimary.map((ex) => (
                          <ExampleCard
                            key={ex.anchorId}
                            ex={ex}
                            isActive={activeAnchorId === ex.anchorId}
                            isFeatured={featuredSet.has(ex.anchorId)}
                            isRetired={isExampleRetired(ex)}
                            isForcedOpen={Boolean(forceExpandMap[ex.anchorId])}
                            doneMark={getExampleDoneMark(ex)}
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
                            onToggleForceOpen={() => toggleForceOpen(ex.anchorId)}
                            onMarked={() => setForceOpen(ex.anchorId, false)}
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
                                isFeatured={featuredSet.has(ex.anchorId)}
                                isRetired={isExampleRetired(ex)}
                                isForcedOpen={Boolean(forceExpandMap[ex.anchorId])}
                                doneMark={getExampleDoneMark(ex)}
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
                                onToggleForceOpen={() => toggleForceOpen(ex.anchorId)}
                                onMarked={() => setForceOpen(ex.anchorId, false)}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* 尚未升级结构化场景指南的旧手稿：在底部折叠保留速查表与综合串讲，确保信息零丢失 */}
          {showLegacyBottomRef && (
            <details className="mh-group mt-6">
              <summary>
                <span>本讲速查表与综合串讲（点击展开复盘）</span>
              </summary>
              <div className="mh-group-body">
                {handout.verdictTableHtml && (
                  <div dangerouslySetInnerHTML={{ __html: handout.verdictTableHtml }} />
                )}
                {handout.workedHtml && (
                  <div className="mh-worked" dangerouslySetInnerHTML={{ __html: handout.workedHtml }} />
                )}
              </div>
            </details>
          )}
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
