import { Link } from "react-router-dom";
import {
  osMemExamLookup,
  osMemExamKey,
  osMemGroupForTopic,
  osMemSetPath,
  osMemTopic,
  type OsMemTopicId,
} from "@/data/kg/osMemTopics";
import { cn } from "@/lib/utils";

export function OsMemTags({
  year,
  n,
  showMinor = true,
  compact = false,
  link = true,
}: {
  year: number;
  n: number;
  /** 点开题目后才出小类；列表收起时可 false */
  showMinor?: boolean;
  compact?: boolean;
  link?: boolean;
}) {
  const ref = osMemExamLookup(year, n);
  if (!ref) return null;
  const topic = osMemTopic(ref.topic);
  const group = osMemGroupForTopic(ref.topic);
  if (!topic || !group) return null;
  const cls = compact ? "rounded px-1.5 py-0.5 text-[10px]" : "rounded-md px-2 py-0.5 text-[11px]";
  const major = (
    <span className={cn(cls, "bg-sky-500/15 text-sky-800 dark:text-sky-200")}>{group.name}</span>
  );
  const minor = showMinor ? (
    <span className={cn(cls, "bg-violet-500/15 text-violet-800 dark:text-violet-200")}>{topic.name}</span>
  ) : null;
  if (!link) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {major}
        {minor}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Link
        to={osMemSetPath({ group: group.id, q: osMemExamKey(year, n) })}
        className={cn(cls, "bg-sky-500/15 text-sky-800 hover:underline dark:text-sky-200")}
      >
        {group.name}
      </Link>
      {showMinor && (
        <Link
          to={osMemSetPath({ group: group.id, topic: topic.id as OsMemTopicId, q: osMemExamKey(year, n) })}
          className={cn(cls, "bg-violet-500/15 text-violet-800 hover:underline dark:text-violet-200")}
        >
          {topic.name}
        </Link>
      )}
    </span>
  );
}
