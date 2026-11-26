import { Link } from "react-router-dom";
import { Check, Eye, EyeOff, Target } from "lucide-react";
import type { HandoutExample, HandoutGroup, HandoutPriority } from "@/lib/mathHandouts";
import type { MarkLevel } from "@/lib/kg/types";

interface HandoutSidebarProps {
  directoryHref: string;
  title: string;
  primaryKpId: string;
  kpName: string;
  confidence: number;
  passedCount: number;
  totalCount: number;
  dueTotalCount: number;
  retiredCount: number;
  activeGroups: HandoutGroup[];
  currentGroupId: string | null;
  priority: HandoutPriority;
  globalStepsOpen: boolean;
  hideRetired: boolean;
  getExampleMark: (ex: HandoutExample) => MarkLevel | undefined;
  isExampleDue: (ex: HandoutExample) => boolean;
  onSwitchGroup: (groupId: string) => void;
  onPriorityChange: (next: HandoutPriority) => void;
  onToggleAllSteps: () => void;
  onToggleHideRetired: () => void;
}

export function HandoutSidebar({
  directoryHref,
  title,
  primaryKpId,
  kpName,
  confidence,
  passedCount,
  totalCount,
  dueTotalCount,
  retiredCount,
  activeGroups,
  currentGroupId,
  priority,
  globalStepsOpen,
  hideRetired,
  getExampleMark,
  isExampleDue,
  onSwitchGroup,
  onPriorityChange,
  onToggleAllSteps,
  onToggleHideRetired,
}: HandoutSidebarProps) {
  return (
    <aside className="mh-toc">
      <Link to={directoryHref} className="mh-toc-back">
        ← 返回手稿目录
      </Link>
      <p className="mh-toc-title">{title}</p>
      <p className="mh-toc-meta">
        掌握 {confidence}% · 已会 {passedCount}/{totalCount}
        {dueTotalCount > 0 ? ` · 待复习 ${dueTotalCount}` : ""}
        {retiredCount > 0 ? ` · 斩 ${retiredCount}` : ""}
      </p>

      <div className="mh-toc-label">判别场景</div>
      <nav className="mh-scene-nav" aria-label="判别场景导航">
        {activeGroups.map((g, idx) => {
          const gPassed = g.examples.filter((e) => getExampleMark(e) === "pass").length;
          const gDue = g.examples.filter((e) => isExampleDue(e)).length;
          const gTotal = g.examples.length;
          const gDone = gTotal > 0 && gPassed === gTotal;
          const shortLabel = g.guide?.shortTitle || g.title;
          const isCurrent = currentGroupId === g.id;
          const sectionLabel = g.guide?.section?.trim() || "";
          const prevSection = idx > 0 ? activeGroups[idx - 1].guide?.section?.trim() || "" : "";
          const showSection = Boolean(sectionLabel && sectionLabel !== prevSection);
          return (
            <div key={g.id}>
              {showSection && (
                <div className={`mh-scene-section${idx === 0 ? " is-first" : ""}`}>
                  {sectionLabel}
                </div>
              )}
              <button
                type="button"
                className={`mh-scene-item${isCurrent ? " is-active" : ""}`}
                onClick={() => onSwitchGroup(g.id)}
              >
                <span>{shortLabel}</span>
                <span className="inline-flex items-center gap-1.5">
                  {gDue > 0 && <span className="mh-scene-due-badge">待复习 {gDue}</span>}
                  <span className={`mh-scene-prog${gDone ? " is-done" : ""}`}>
                    {gDone ? <Check className="h-3.5 w-3.5" /> : `${gPassed}/${gTotal}`}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mh-toc-group">
        <div className="mh-seg">
          <button
            type="button"
            className={priority === "exam" ? "is-active" : ""}
            onClick={() => onPriorityChange("exam")}
          >
            真题优先
          </button>
          <button
            type="button"
            className={priority === "lilin880" ? "is-active-880" : ""}
            onClick={() => onPriorityChange("lilin880")}
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
          onClick={onToggleAllSteps}
        >
          {globalStepsOpen ? "全部收起步骤" : "全部展开步骤"}
          <kbd className="mh-kbd">Space</kbd>
        </button>
        {retiredCount > 0 && (
          <button
            type="button"
            className="mh-btn mh-btn-subtle w-full justify-center"
            aria-pressed={hideRetired}
            onClick={onToggleHideRetired}
          >
            {hideRetired ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hideRetired ? `显示已斩 (${retiredCount})` : `隐藏已斩 (${retiredCount})`}
          </button>
        )}
      </div>

      <div className="mh-toc-group mh-toc-links">
        <Link to={`/review-priority/knowledge/${primaryKpId}`}>
          <Target className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">复习性价比 · {kpName}</span>
        </Link>
      </div>
    </aside>
  );
}
