import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Scissors,
  X,
} from "lucide-react";
import type { HandoutExample } from "@/lib/mathHandouts";
import { useKgProgress } from "@/stores/kgProgress";
import { useJournal } from "@/stores/journal";
import { wangdaoJournalId } from "@/lib/kg/wangdao408";
import type { MarkLevel, UserItemMark } from "@/lib/kg/types";
import { dayKey } from "@/lib/day";

export function isLilinExample(ex: HandoutExample): boolean {
  return ex.sourceType === "lilin880" || Boolean(ex.lilin880Id);
}

export function isExamExample(ex: HandoutExample): boolean {
  return ex.sourceType === "exam" || ex.sourceType === "lilin_mock";
}

/** 同一道题若是「真题 · 880 同题」，同步写入两个 ID，确保跨模块（手稿/880/图谱/复习性价比）完全互通。 */
export function syncIdsOf(ex: HandoutExample): string[] {
  const ids = [ex.id];
  if (ex.lilin880Id && ex.lilin880Id !== ex.id) ids.push(ex.lilin880Id);
  return ids;
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

export function markHandoutExample(
  ex: HandoutExample,
  mark: Exclude<MarkLevel, "skip">,
  primaryKpId: string,
  secondaryKpIds: string[]
) {
  const markItem = useKgProgress.getState().markItem;
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
}

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
  const handle = (mark: Exclude<MarkLevel, "skip">) => {
    markHandoutExample(ex, mark, primaryKpId, secondaryKpIds);
    onMarked();
  };

  return (
    <div className="mh-mark-group" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => handle("pass")}
        className={`mh-mark-btn${currentMark === "pass" ? " is-pass" : ""}`}
        title="标记为已掌握（全站进度同步，快捷键 1）"
      >
        <Check className="h-3 w-3" />会<kbd className="mh-kbd mh-kbd-pc">1</kbd>
      </button>
      <button
        type="button"
        onClick={() => handle("fuzzy")}
        className={`mh-mark-btn${currentMark === "fuzzy" ? " is-fuzzy" : ""}`}
        title="标记为模糊（加入 1/3/7/14 复习队列并同步全站，快捷键 2）"
      >
        <HelpCircle className="h-3 w-3" />模糊<kbd className="mh-kbd mh-kbd-pc">2</kbd>
      </button>
      <button
        type="button"
        onClick={() => handle("fail")}
        className={`mh-mark-btn${currentMark === "fail" ? " is-fail" : ""}`}
        title="标记为不会（加入 1/3/7/14 复习队列并同步全站，快捷键 3）"
      >
        <X className="h-3 w-3" />不会<kbd className="mh-kbd mh-kbd-pc">3</kbd>
      </button>
      <button
        type="button"
        onClick={onRetire}
        className="mh-mark-btn is-retire"
        title="一次性过关、不再纳入后续复习（随时可一键移回，快捷键 4）"
      >
        <Scissors className="h-3 w-3" />斩掉<kbd className="mh-kbd mh-kbd-pc">4</kbd>
      </button>
    </div>
  );
}

export function ExampleCard({
  ex,
  isActive,
  isFeatured,
  isDue = false,
  reviewedToday = false,
  isRetired,
  isForcedOpen,
  singleMode = false,
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
  isDue?: boolean;
  reviewedToday?: boolean;
  isRetired: boolean;
  /** 会话级手动展开（已斩临时查看 / 今日已练手动展开共用） */
  isForcedOpen: boolean;
  /** 单题切题模式下不折叠成单行条，且去掉多余外框与左高亮条 */
  singleMode?: boolean;
  /** 非空表示「今日已练」（会/模糊/不会），列表模式下当天默认折叠，下次复习日自动展开 */
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

  if (!singleMode && isRetired && !isForcedOpen) {
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

  if (!singleMode && doneMark && !isForcedOpen) {
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
      className={`mh-example${singleMode ? " is-single" : isActive ? " is-active" : ""}`}
      onClick={onActivate}
    >
      {isRetired && (singleMode || isForcedOpen) && (
        <div className="mh-retired-row mb-3 mt-0">
          <span className="mh-retired-badge">
            <Check className="h-3 w-3" />
            {singleMode ? "已斩" : "已斩（临时展开查看）"}
          </span>
          <div className="mh-retired-actions">
            {!singleMode && (
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
            )}
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

      {doneMark && !isRetired && !singleMode && isForcedOpen && (
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
        {isDue && <span className="mh-src-tag is-due">待复习</span>}
        {!isDue && reviewedToday && <span className="mh-src-tag is-reviewed-today">今日已复盘</span>}
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
