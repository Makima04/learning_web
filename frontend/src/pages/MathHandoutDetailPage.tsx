import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  buildJournalEntryMap,
  getExampleReviewState,
  loadMathHandoutDetail,
  useHandoutPriority,
  type HandoutExample,
  type HandoutGroupGuide,
  type MathHandout,
} from "@/lib/mathHandouts";
import { useKgProgress } from "@/stores/kgProgress";
import { useJournal } from "@/stores/journal";
import { findKp } from "@/data/kg";
import { MATH_TEXTBOOK_KNOWLEDGE } from "@/data/kg/mathTextbookKnowledge";
import { MathFormula } from "@/components/MathFormula";
import type { MarkLevel, UserItemMark } from "@/lib/kg/types";
import { dayKey } from "@/lib/day";
import {
  ExampleCard,
  doneMarkForToday,
  isExamExample,
  isLilinExample,
  markHandoutExample,
  syncIdsOf,
} from "@/pages/mathHandout/ExampleCard";
import { HandoutSidebar } from "@/pages/mathHandout/HandoutSidebar";
import "@/styles/mathHandout.css";

export { ExampleCard, doneMarkForToday };

function hasGuideContent(g?: HandoutGroupGuide): boolean {
  return Boolean(
    g && (g.clueHtml || g.coreHtml || g.principleHtml || g.pitfallHtml || g.roadmapHtml)
  );
}

interface UndoPayload {
  title: string;
  anchorId: string;
  wasForcedOpen: boolean;
  entries: {
    itemId: string;
    prevMark: UserItemMark | null;
    wasActiveInJournal: boolean;
  }[];
}

export function MathHandoutDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [handout, setHandout] = useState<MathHandout | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingUrlNavRef = useRef<{ group: string | null; q: string | null } | null>(null);
  const [priority, setPriority] = useHandoutPriority();

  const [globalStepsOpen, setGlobalStepsOpen] = useState(false);
  const [stepsOverride, setStepsOverride] = useState<Record<string, boolean>>({});
  const [hintOpenMap, setHintOpenMap] = useState<Record<string, boolean>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  /** 每个判别场景各自记忆当前页码：有核心讲解时 0=核心讲解、1..N=第1..N题；无讲解时 0..N-1=第1..N题 */
  const [groupStepMap, setGroupStepMap] = useState<Record<string, number>>({});
  const [hideRetired, setHideRetired] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoPayload | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const stageTopRef = useRef<HTMLDivElement>(null);

  const states = useKgProgress((s) => s.states);
  const itemMarks = useKgProgress((s) => s.itemMarks);
  const retireItem = useKgProgress((s) => s.retireItem);
  const unretireItem = useKgProgress((s) => s.unretireItem);
  const journalEntries = useJournal((s) => s.entries);

  const todayKey = dayKey();
  const markRecordMap = useMemo(() => {
    const m = new Map<string, UserItemMark>();
    for (const it of itemMarks) m.set(it.itemId, it);
    return m;
  }, [itemMarks]);

  const journalByItemId = useMemo(
    () => buildJournalEntryMap(journalEntries, todayKey),
    [journalEntries, todayKey]
  );

  const getExampleReview = useCallback(
    (ex: HandoutExample) => getExampleReviewState(ex, journalByItemId, markRecordMap, todayKey),
    [journalByItemId, markRecordMap, todayKey]
  );

  const isExampleDue = useCallback(
    (ex: HandoutExample): boolean => getExampleReview(ex).isDue,
    [getExampleReview]
  );

  const isExampleReviewedToday = useCallback(
    (ex: HandoutExample): boolean => getExampleReview(ex).reviewedToday,
    [getExampleReview]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const initialReviewDue = searchParams.get("review") === "due";
    const urlGroup = searchParams.get("group");
    const urlQ = searchParams.get("q");
    pendingUrlNavRef.current = urlGroup || urlQ ? { group: urlGroup, q: urlQ } : null;
    (slug ? loadMathHandoutDetail(slug) : Promise.resolve(null))
      .then((found) => {
        if (!alive) return;
        setHandout(found);
        setStepsOverride({});
        setHintOpenMap({});
        setGroupStepMap({});

        if (found && found.groups.length > 0) {
          const hashId = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
          const hashGroup = hashId
            ? found.groups.find(
                (g) => g.id === hashId || g.examples.some((ex) => ex.anchorId === hashId)
              )
            : undefined;

          if (hashGroup) {
            setActiveGroupId(hashGroup.id);
            const gHasGuide = hasGuideContent(hashGroup.guide);
            if (hashGroup.id !== hashId) {
              const has880 = found.stats.lilin880 > 0;
              const examList = hashGroup.examples.filter(isExamExample);
              const lilinList = hashGroup.examples.filter(isLilinExample);
              const qList =
                priority === "lilin880" && has880
                  ? [...lilinList, ...examList.filter((e) => !isLilinExample(e))]
                  : [...examList, ...lilinList.filter((e) => !isExamExample(e))];
              const idx = qList.findIndex((ex) => ex.anchorId === hashId);
              if (idx >= 0) {
                setGroupStepMap({ [hashGroup.id]: idx + (gHasGuide ? 1 : 0) });
              }
            }
          } else if (initialReviewDue) {
            const latestJournal = buildJournalEntryMap(useJournal.getState().entries, dayKey());
            const latestMarks = new Map<string, UserItemMark>();
            for (const it of useKgProgress.getState().itemMarks) latestMarks.set(it.itemId, it);
            const todayStr = dayKey();
            const firstDueGroup = found.groups.find((g) =>
              g.examples.some(
                (ex) => getExampleReviewState(ex, latestJournal, latestMarks, todayStr).isDue
              )
            );
            if (firstDueGroup) {
              setActiveGroupId(firstDueGroup.id);
              const gHasGuide = hasGuideContent(firstDueGroup.guide);
              const has880 = found.stats.lilin880 > 0;
              const examList = firstDueGroup.examples.filter(isExamExample);
              const lilinList = firstDueGroup.examples.filter(isLilinExample);
              const qList =
                priority === "lilin880" && has880
                  ? [...lilinList, ...examList.filter((e) => !isLilinExample(e))]
                  : [...examList, ...lilinList.filter((e) => !isExamExample(e))];
              const dueIdx = qList.findIndex(
                (ex) => getExampleReviewState(ex, latestJournal, latestMarks, todayStr).isDue
              );
              setGroupStepMap({
                [firstDueGroup.id]: (dueIdx >= 0 ? dueIdx : 0) + (gHasGuide ? 1 : 0),
              });
            } else {
              setActiveGroupId(found.groups[0].id);
            }
          } else {
            setActiveGroupId(found.groups[0].id);
          }
        } else {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

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

  const getExampleDoneMark = useCallback(
    (ex: HandoutExample): Exclude<MarkLevel, "skip"> | undefined =>
      doneMarkForToday(getExampleMarkRecord(ex), todayKey),
    [getExampleMarkRecord, todayKey]
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

  const orderedExamplesOf = useCallback(
    (examples: HandoutExample[], hasAny880: boolean): HandoutExample[] => {
      const examList = examples.filter(isExamExample);
      const lilinList = examples.filter(isLilinExample);
      const combined =
        priority === "lilin880" && hasAny880
          ? [...lilinList, ...examList.filter((e) => !isLilinExample(e))]
          : [...examList, ...lilinList.filter((e) => !isExamExample(e))];
      return hideRetired ? combined.filter((e) => !isExampleRetired(e)) : combined;
    },
    [priority, hideRetired, isExampleRetired]
  );

  const hasAny880 = Boolean(handout && handout.stats.lilin880 > 0);
  const activeGroups = useMemo(() => handout?.groups ?? [], [handout]);

  const currentGroupIndex = useMemo(() => {
    if (activeGroups.length === 0) return -1;
    const idx = activeGroups.findIndex((g) => g.id === activeGroupId);
    if (idx >= 0) return idx;
    const firstNonEmpty = activeGroups.findIndex((g) => g.examples.length > 0);
    return firstNonEmpty >= 0 ? firstNonEmpty : 0;
  }, [activeGroups, activeGroupId]);

  const currentGroup =
    currentGroupIndex >= 0 ? activeGroups[currentGroupIndex] ?? null : null;

  const guide = currentGroup?.guide;
  const hasGuidePage = hasGuideContent(guide);

  const currentQueue = useMemo(() => {
    if (!currentGroup) return [];
    return orderedExamplesOf(currentGroup.examples, hasAny880);
  }, [currentGroup, orderedExamplesOf, hasAny880]);

  const totalSteps = (hasGuidePage ? 1 : 0) + currentQueue.length;
  const defaultStep = hasGuidePage && currentQueue.length > 0 ? 1 : 0;
  const rawStep = currentGroup ? groupStepMap[currentGroup.id] ?? defaultStep : 0;
  const currentStep = totalSteps === 0 ? 0 : Math.min(Math.max(rawStep, 0), totalSteps - 1);
  const isOnGuidePage = hasGuidePage && currentStep === 0;
  const currentExIndex = isOnGuidePage ? -1 : hasGuidePage ? currentStep - 1 : currentStep;
  const currentEx = currentExIndex >= 0 ? currentQueue[currentExIndex] ?? null : null;

  // 刷新或直链进入时，按 URL 参数（group / q）恢复精确的场景与具体题目
  useEffect(() => {
    const pending = pendingUrlNavRef.current;
    if (!pending || !handout || activeGroups.length === 0) return;

    pendingUrlNavRef.current = null;
    const matchedGroup = pending.group
      ? activeGroups.find((g) => g.id === pending.group)
      : activeGroups[0];
    if (!matchedGroup) return;

    setActiveGroupId(matchedGroup.id);
    const gHasGuide = hasGuideContent(matchedGroup.guide);

    if (!pending.q) return;
    if (pending.q === "guide") {
      setGroupStepMap((prev) => ({ ...prev, [matchedGroup.id]: 0 }));
      return;
    }
    const qList = orderedExamplesOf(matchedGroup.examples, hasAny880);
    let idx = qList.findIndex((ex) => ex.anchorId === pending.q || ex.id === pending.q);
    if (idx < 0 && /^\d+$/.test(pending.q)) {
      const n = Number(pending.q) - 1;
      if (n >= 0 && n < qList.length) idx = n;
    }
    if (idx >= 0) {
      setGroupStepMap((prev) => ({ ...prev, [matchedGroup.id]: idx + (gHasGuide ? 1 : 0) }));
    }
  }, [handout, activeGroups, orderedExamplesOf, hasAny880]);

  // 将当前所处的判别场景与具体题目同步回 URL，刷新不丢失位置
  useEffect(() => {
    if (!handout || !currentGroup) return;
    if (pendingUrlNavRef.current !== null) return;

    const nextGroup = currentGroup.id;
    const nextQ = isOnGuidePage ? "guide" : currentEx ? currentEx.anchorId : "guide";

    if (
      !searchParams.has("mode") &&
      searchParams.get("group") === nextGroup &&
      searchParams.get("q") === nextQ
    ) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("mode");
    next.set("group", nextGroup);
    next.set("q", nextQ);
    setSearchParams(next, { replace: true });
  }, [
    handout,
    currentGroup,
    isOnGuidePage,
    currentEx,
    searchParams,
    setSearchParams,
  ]);

  const scrollToStageTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = stageTopRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < 72 || rect.top > window.innerHeight * 0.55) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  const switchGroup = useCallback((groupId: string, resetStep = false) => {
    setActiveGroupId(groupId);
    if (resetStep) {
      setGroupStepMap((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goToStep = useCallback(
    (nextStep: number) => {
      if (!currentGroup || totalSteps === 0) return;
      const clamped = Math.min(Math.max(nextStep, 0), totalSteps - 1);
      setGroupStepMap((prev) => ({ ...prev, [currentGroup.id]: clamped }));
      scrollToStageTop();
    },
    [currentGroup, totalSteps, scrollToStageTop]
  );

  const handlePriorityChange = useCallback(
    (nextPriority: "exam" | "lilin880") => {
      setPriority(nextPriority);
      if (currentGroup && !isOnGuidePage) {
        setGroupStepMap((prev) => ({ ...prev, [currentGroup.id]: hasGuidePage ? 1 : 0 }));
      }
    },
    [setPriority, currentGroup, isOnGuidePage, hasGuidePage]
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

      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
      setUndoToast({ title: ex.title, anchorId: ex.anchorId, wasForcedOpen: false, entries });
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

  // 键盘快捷键：Space 显隐当前题步骤，← / → 在当前小类内翻页（含讲解页），1-4 标记会/模糊/不会/斩掉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }

      if ((e.code === "Space" || e.key === " ") && currentEx) {
        e.preventDefault();
        toggleStepsFor(currentEx.anchorId);
      } else if (e.key === "ArrowLeft" && currentStep > 0) {
        e.preventDefault();
        goToStep(currentStep - 1);
      } else if (e.key === "ArrowRight" && currentStep < totalSteps - 1) {
        e.preventDefault();
        goToStep(currentStep + 1);
      } else if (currentEx && handout && !e.repeat) {
        if (e.key === "1") {
          e.preventDefault();
          markHandoutExample(currentEx, "pass", handout.primaryKpId, handout.secondaryKpIds);
        } else if (e.key === "2") {
          e.preventDefault();
          markHandoutExample(currentEx, "fuzzy", handout.primaryKpId, handout.secondaryKpIds);
        } else if (e.key === "3") {
          e.preventDefault();
          markHandoutExample(currentEx, "fail", handout.primaryKpId, handout.secondaryKpIds);
        } else if (e.key === "4") {
          e.preventDefault();
          if (isExampleRetired(currentEx)) handleUnretireExample(currentEx);
          else handleRetireExample(currentEx);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentEx, currentStep, totalSteps, handout, toggleStepsFor, goToStep, isExampleRetired, handleRetireExample, handleUnretireExample]);

  // 拦截「本组刷题路线」或正文中 #anchor 链接：自动切到目标小类并直接翻到对应题页
  const handleReaderClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || !handout) return;
      const rawHash = a.getAttribute("href");
      if (!rawHash || rawHash === "#") return;
      const targetId = decodeURIComponent(rawHash.slice(1));
      e.preventDefault();

      const ownerGroup = handout.groups.find(
        (g) => g.id === targetId || g.examples.some((ex) => ex.anchorId === targetId)
      );
      if (!ownerGroup) return;

      const ownerHasGuide = hasGuideContent(ownerGroup.guide);
      setActiveGroupId(ownerGroup.id);

      if (ownerGroup.id === targetId) {
        setGroupStepMap((prev) => ({ ...prev, [ownerGroup.id]: 0 }));
        scrollToStageTop();
        return;
      }

      const queue = orderedExamplesOf(ownerGroup.examples, hasAny880);
      const foundIdx = queue.findIndex((ex) => ex.anchorId === targetId);
      if (foundIdx >= 0) {
        setGroupStepMap((prev) => ({
          ...prev,
          [ownerGroup.id]: foundIdx + (ownerHasGuide ? 1 : 0),
        }));
        scrollToStageTop();
      } else if (hideRetired) {
        setHideRetired(false);
        const fullExam = ownerGroup.examples.filter(isExamExample);
        const fullLilin = ownerGroup.examples.filter(isLilinExample);
        const fullQueue =
          priority === "lilin880" && hasAny880
            ? [...fullLilin, ...fullExam.filter((ex) => !isLilinExample(ex))]
            : [...fullExam, ...fullLilin.filter((ex) => !isExamExample(ex))];
        const fullIdx = fullQueue.findIndex((ex) => ex.anchorId === targetId);
        if (fullIdx >= 0) {
          setGroupStepMap((prev) => ({
            ...prev,
            [ownerGroup.id]: fullIdx + (ownerHasGuide ? 1 : 0),
          }));
          scrollToStageTop();
        }
      }
    },
    [handout, orderedExamplesOf, hasAny880, hideRetired, priority, scrollToStageTop]
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
  const directoryHref = kpInfo ? `/math-handouts?book=${kpInfo.book.id}` : "/math-handouts";
  const kpState = states[handout.primaryKpId];
  const confidence = Math.round((kpState?.confidence ?? 0) * 100);

  const allExamples = handout.groups.flatMap((g) => g.examples);
  const passedCount = allExamples.filter((e) => getExampleMark(e) === "pass").length;
  const retiredCount = allExamples.filter((e) => isExampleRetired(e)).length;
  const dueTotalCount = allExamples.filter((e) => isExampleDue(e)).length;
  const nextGroup =
    currentGroupIndex >= 0 && currentGroupIndex < activeGroups.length - 1
      ? activeGroups[currentGroupIndex + 1]
      : null;

  const featuredSet = new Set(currentGroup?.guide?.featuredAnchorIds ?? []);
  const passedInCurrentGroup = currentGroup
    ? currentGroup.examples.filter((e) => getExampleMark(e) === "pass").length
    : 0;
  const retiredInCurrentGroup = currentGroup
    ? currentGroup.examples.filter((e) => isExampleRetired(e)).length
    : 0;

  const knowledgeSections = Array.from(
    new Set([handout.primaryKpId, ...handout.secondaryKpIds])
  )
    .map((kpId) => ({
      kpId,
      name: findKp(kpId)?.kp.name ?? kpId,
      blocks: MATH_TEXTBOOK_KNOWLEDGE[kpId] ?? [],
    }))
    .filter((sec) => sec.blocks.length > 0);

  return (
    <div ref={readerRef} className="mh-reader" onClick={handleReaderClick}>
      <div className="mh-layout">
        <HandoutSidebar
          directoryHref={directoryHref}
          title={handout.title}
          primaryKpId={handout.primaryKpId}
          kpName={kpInfo?.kp.name ?? handout.primaryKpId}
          confidence={confidence}
          passedCount={passedCount}
          totalCount={allExamples.length}
          dueTotalCount={dueTotalCount}
          retiredCount={retiredCount}
          activeGroups={activeGroups}
          currentGroupId={currentGroup?.id ?? null}
          priority={priority}
          globalStepsOpen={globalStepsOpen}
          hideRetired={hideRetired}
          getExampleMark={getExampleMark}
          isExampleDue={isExampleDue}
          onSwitchGroup={switchGroup}
          onPriorityChange={handlePriorityChange}
          onToggleAllSteps={toggleAllSteps}
          onToggleHideRetired={() => setHideRetired((v) => !v)}
        />

        {/* 右侧极简翻页舞台：桌面端直接从场景与题号开始，首屏零冗余占高 */}
        <main className="mh-main">
          {/* 窄屏/移动端专用紧凑顶栏（桌面端隐藏） */}
          <div className="mh-mobile-bar">
            <div className="mh-mobile-head">
              <Link to={directoryHref} className="mh-toc-back">
                ← 返回手稿目录
              </Link>
              <span className="mh-mobile-title">{handout.title}</span>
            </div>
            <div className="mh-seg">
              <button
                type="button"
                className={priority === "exam" ? "is-active" : ""}
                onClick={() => handlePriorityChange("exam")}
              >
                真题优先
              </button>
              <button
                type="button"
                className={priority === "lilin880" ? "is-active-880" : ""}
                onClick={() => handlePriorityChange("lilin880")}
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
              {activeGroups.map((g) => {
                const gDue = g.examples.filter((e) => isExampleDue(e)).length;
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={currentGroup?.id === g.id ? "is-active" : ""}
                    onClick={() => switchGroup(g.id)}
                  >
                    {g.guide?.shortTitle || g.title}
                    {gDue > 0 ? ` · 待复习 ${gDue}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 当前激活小类的单页舞台 */}
          {currentGroup && (
            <section ref={stageTopRef} id={currentGroup.id} className="mh-stage">
              {/* 顶部位置导航 + 标题与页码胶囊（讲解页 + 1..N 题平级切换） */}
              <div className="mh-stage-header">
                <nav className="mh-breadcrumb" aria-label="当前位置导航">
                  <span className="mh-crumb-mode is-static">判别场景</span>
                  <ChevronRight className="mh-crumb-sep h-3.5 w-3.5" />
                  <button
                    type="button"
                    className={`mh-crumb-btn${isOnGuidePage ? " is-current" : ""}`}
                    onClick={() => hasGuidePage && goToStep(0)}
                    disabled={!hasGuidePage || isOnGuidePage}
                    title={hasGuidePage ? "回到本组核心讲解" : undefined}
                  >
                    {currentGroup.guide?.shortTitle || currentGroup.title}
                  </button>
                  <ChevronRight className="mh-crumb-sep h-3.5 w-3.5" />
                  <span className="mh-crumb-cur">
                    {isOnGuidePage
                      ? "核心讲解"
                      : currentEx
                      ? `第 ${currentExIndex + 1} 题 · ${currentEx.source}`
                      : "暂无题目"}
                  </span>
                </nav>

                <div className="mh-stage-title-row">
                  <h2 className="mh-stage-title">{currentGroup.title}</h2>
                  <span className="mh-stage-status">
                    {isOnGuidePage
                      ? "核心讲解"
                      : currentQueue.length > 0
                      ? `第 ${currentExIndex + 1} / ${currentQueue.length} 题`
                      : "0 题"}
                    {" · "}已会 {passedInCurrentGroup}/{currentGroup.examples.length}
                    {retiredInCurrentGroup > 0 ? ` · 已斩 ${retiredInCurrentGroup}` : ""}
                  </span>
                </div>

                <div className="mh-q-dots" role="navigation" aria-label="本组讲解与题号切换">
                  {hasGuidePage && (
                    <button
                      type="button"
                      className={`mh-q-dot is-guide-dot${isOnGuidePage ? " is-current" : ""}`}
                      onClick={() => goToStep(0)}
                      title="本场景核心讲解与刷题路线"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      讲解
                    </button>
                  )}
                  {currentQueue.map((item, idx) => {
                    const stepIdx = idx + (hasGuidePage ? 1 : 0);
                    const mk = getExampleMark(item);
                    const retired = isExampleRetired(item);
                    const due = isExampleDue(item);
                    const isCur = stepIdx === currentStep;
                    const cls = [
                      "mh-q-dot",
                      isCur ? "is-current" : "",
                      due ? "is-due" : "",
                      !isCur && !due && retired ? "is-retired" : "",
                      !isCur && !due && !retired && mk === "pass" ? "is-pass" : "",
                      !isCur && !due && !retired && mk === "fuzzy" ? "is-fuzzy" : "",
                      !isCur && !due && !retired && mk === "fail" ? "is-fail" : "",
                      isExamExample(item) ? "is-exam-badge" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={item.anchorId}
                        type="button"
                        className={cls}
                        onClick={() => goToStep(stepIdx)}
                        title={`第 ${idx + 1} 题 · ${item.source}${due ? " · 今日待复习" : ""}`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 舞台主体：要么是「核心讲解页」，要么是「单道题页」，绝不同屏拥挤 */}
              <div className="mh-stage-body">
                {isOnGuidePage && guide ? (
                  <div className="space-y-4">
                    <div className="mh-scene-guide mt-0">
                      <div className="mh-sg-grid">
                        {guide.clueHtml && (
                          <div className="mh-sg-row">
                            <span className="mh-sg-badge is-clue">看式子认题眼</span>
                            <span dangerouslySetInnerHTML={{ __html: guide.clueHtml }} />
                          </div>
                        )}
                        {guide.coreHtml && (
                          <div
                            className={`mh-sg-row${guide.coreHtml.includes("mh-sg-cases") ? " is-structured" : ""}`}
                          >
                            <span className="mh-sg-badge">核心关键与起手</span>
                            <div
                              className="mh-sg-body"
                              dangerouslySetInnerHTML={{ __html: guide.coreHtml }}
                            />
                          </div>
                        )}
                        {guide.principleHtml && (
                          <div className="mh-sg-row is-principle">
                            <details className="mh-sg-principle">
                              <summary className="mh-sg-principle-sum">
                                <span className="mh-sg-badge is-principle">原理与推导依据</span>
                                <span className="mh-sg-principle-hint">默认收起 · 点击展开原理</span>
                                <ChevronDown className="mh-sg-principle-chevron h-4 w-4" />
                              </summary>
                              <div
                                className="mh-sg-principle-body"
                                dangerouslySetInnerHTML={{ __html: guide.principleHtml }}
                              />
                            </details>
                          </div>
                        )}
                        {guide.pitfallHtml && (
                          <div className="mh-sg-row is-pitfall">
                            <span className="mh-sg-badge is-pitfall">高频坑点</span>
                            <span dangerouslySetInnerHTML={{ __html: guide.pitfallHtml }} />
                          </div>
                        )}
                        {guide.roadmapHtml && (() => {
                          const links = Array.from(
                            guide.roadmapHtml.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
                          );
                          return (
                            <div className="mh-sg-row is-roadmap">
                              <span className="mh-sg-badge is-roadmap">本组核心思路</span>
                              {links.length > 0 ? (
                                <span className="mh-rm-list">
                                  {links.map((m, idx) => (
                                    <span key={`${m[1]}-${idx}`} className="mh-rm-item">
                                      {idx > 0 && (
                                        <span className="mh-rm-sep" aria-hidden="true">
                                          →
                                        </span>
                                      )}
                                      <a
                                        href={m[1]}
                                        dangerouslySetInnerHTML={{ __html: m[2] }}
                                      />
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span dangerouslySetInnerHTML={{ __html: guide.roadmapHtml }} />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {knowledgeSections.length > 0 && (
                      <details className="mh-kp-drawer">
                        <summary className="mh-kp-drawer-sum">
                          <span className="mh-kp-drawer-left">
                            <ChevronDown className="mh-kp-chevron h-4 w-4" />
                            <span className="mh-kp-drawer-title">本讲通用知识点与公式速查</span>
                            <span className="mh-kp-drawer-tags">
                              {knowledgeSections.map((s) => s.name).join(" · ")}
                            </span>
                          </span>
                          <Link
                            to={`/review-priority/knowledge/${handout.primaryKpId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mh-kp-drawer-link"
                          >
                            知识复习
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </summary>
                        <div
                          className={`mh-kp-drawer-body${knowledgeSections.length > 1 ? " is-multi" : ""}`}
                        >
                          {knowledgeSections.map((sec) => (
                            <div key={sec.kpId} className="mh-kp-col">
                              <Link to={`/review-priority/knowledge/${sec.kpId}`} className="mh-kp-col-title">
                                {sec.name}
                              </Link>
                              <div className="mh-kp-col-blocks">
                                {sec.blocks.map((block, idx) =>
                                  block.type === "text" ? (() => {
                                    const lm = block.text.match(/^【([^】]+)】\s*([\s\S]*)$/);
                                    return (
                                      <p key={idx} className={`mh-kp-text${lm ? " is-labeled" : ""}`}>
                                        {lm ? (
                                          <>
                                            <strong className="mh-kp-label">{lm[1]}</strong>
                                            <span>{lm[2]}</span>
                                          </>
                                        ) : (
                                          block.text
                                        )}
                                      </p>
                                    );
                                  })() : block.type === "math" ? (
                                    <MathFormula
                                      key={idx}
                                      tex={block.tex}
                                      className="py-0.5 text-[13px] [&_.katex-display]:my-0.5"
                                    />
                                  ) : block.type === "flow" ? (
                                    <div key={idx} className="mh-kp-flow">
                                      {block.title && (
                                        <div className="mh-kp-flow-title">
                                          <strong className="mh-kp-label">{block.title}</strong>
                                        </div>
                                      )}
                                      <ul className="mh-kp-flow-list">
                                        {block.items.map((it, i) => (
                                          <li key={i} className="mh-kp-flow-row">
                                            <span className="mh-kp-flow-from">{it.from}</span>
                                            <span
                                              className={`mh-kp-flow-arrow${
                                                it.arrow === "↛"
                                                  ? " is-neg"
                                                  : it.arrow === "⇔"
                                                  ? " is-iff"
                                                  : it.arrow === "⟸"
                                                  ? " is-suff"
                                                  : ""
                                              }`}
                                              aria-hidden="true"
                                            >
                                              {it.arrow ?? "⇒"}
                                            </span>
                                            {Array.isArray(it.to) ? (
                                              <ul className="mh-kp-branch">
                                                {it.to.map((line, j) => (
                                                  <li key={j}>{line}</li>
                                                ))}
                                              </ul>
                                            ) : (
                                              <span className="mh-kp-flow-to">
                                                {it.to}
                                                {it.note && (
                                                  <span className="mh-kp-flow-note">（{it.note}）</span>
                                                )}
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : block.type === "table" ? (
                                    <div key={idx} className="mh-kp-table-wrap">
                                      <table className="mh-kp-table">
                                        <thead>
                                          <tr>
                                            {block.headers.map((h, hi) => (
                                              <th key={hi}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {block.rows.map((row, ri) => (
                                            <tr key={ri}>
                                              {row.map((cell, ci) => (
                                                <td key={ci}>{cell}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : null
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ) : !currentEx ? (
                  <p className="py-10 text-center text-sm text-[var(--mh-muted)]">
                    {currentGroup.examples.length > 0 && hideRetired
                      ? "本场景题目已全部斩掉并隐藏，可在左侧点击「显示已斩」查看。"
                      : "本场景暂无题目。"}
                  </p>
                ) : (
                  <ExampleCard
                    key={currentEx.anchorId}
                    ex={currentEx}
                    isActive
                    singleMode
                    isFeatured={featuredSet.has(currentEx.anchorId)}
                    isDue={isExampleDue(currentEx)}
                    reviewedToday={isExampleReviewedToday(currentEx)}
                    isRetired={isExampleRetired(currentEx)}
                    isForcedOpen={true}
                    doneMark={getExampleDoneMark(currentEx)}
                    hintOpen={Boolean(hintOpenMap[currentEx.anchorId])}
                    stepsOpen={isStepsOpen(currentEx.anchorId)}
                    currentMark={getExampleMark(currentEx)}
                    primaryKpId={handout.primaryKpId}
                    secondaryKpIds={handout.secondaryKpIds}
                    onActivate={() => {}}
                    onToggleHint={() =>
                      setHintOpenMap((m) => ({
                        ...m,
                        [currentEx.anchorId]: !m[currentEx.anchorId],
                      }))
                    }
                    onToggleSteps={() => toggleStepsFor(currentEx.anchorId)}
                    onRetire={() => handleRetireExample(currentEx)}
                    onUnretire={() => handleUnretireExample(currentEx)}
                    onToggleForceOpen={() => {}}
                    onMarked={() => {}}
                  />
                )}
              </div>

              {/* 唯一底部翻页栏（去重、清爽、无边框套娃） */}
              {totalSteps > 0 && (
                <div className="mh-stage-footer">
                  <button
                    type="button"
                    className="mh-step-nav-btn"
                    disabled={currentStep <= 0}
                    onClick={() => goToStep(currentStep - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {hasGuidePage && currentStep === 1 ? "核心讲解" : "上一题"}
                  </button>

                  <span className="mh-stage-kbd-hint">
                    <kbd className="mh-kbd">←</kbd> <kbd className="mh-kbd">→</kbd> 切页
                    {!isOnGuidePage && (
                      <>
                        {" · "}
                        <kbd className="mh-kbd">Space</kbd> 显隐步骤
                        {" · "}
                        <kbd className="mh-kbd">1</kbd>-<kbd className="mh-kbd">4</kbd> 会/模糊/不会/斩掉
                      </>
                    )}
                  </span>

                  {currentStep < totalSteps - 1 ? (
                    <button
                      type="button"
                      className="mh-step-nav-btn is-primary"
                      onClick={() => goToStep(currentStep + 1)}
                    >
                      {isOnGuidePage ? "开始刷题（第 1 题）" : "下一题"}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : nextGroup ? (
                    <button
                      type="button"
                      className="mh-step-nav-btn is-primary"
                      onClick={() => switchGroup(nextGroup.id, true)}
                    >
                      下一场景：{nextGroup.guide?.shortTitle || nextGroup.title}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" className="mh-step-nav-btn" disabled>
                      本讲已刷完
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* 斩题 5 秒即时撤销提示条 */}
      {undoToast && (
        <div className="mh-undo-toast" role="status" aria-live="polite">
          <span>已斩掉「{undoToast.title}」，不再纳入后续复习</span>
          <button type="button" onClick={handleUndoRetire}>
            撤销
          </button>
        </div>
      )}
    </div>
  );
}
