import { Link } from "react-router-dom";
import { examClassOf, examKey, examSetPath } from "@/data/kg/examTaxonomy";
import { cn } from "@/lib/utils";

export function ExamTags({
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
  const cls = examClassOf(year, n);
  if (!cls) return null;
  const pill = compact ? "rounded px-1.5 py-0.5 text-[10px]" : "rounded-md px-2 py-0.5 text-[11px]";
  const majorCls = cn(pill, "bg-sky-500/15 text-sky-800 dark:text-sky-200");
  const minorCls = cn(pill, "bg-violet-500/15 text-violet-800 dark:text-violet-200");
  const q = examKey(year, n);
  if (!link) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={majorCls}>{cls.group.name}</span>
        {showMinor ? <span className={minorCls}>{cls.topic.name}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Link to={examSetPath({ group: cls.group.id, q })} className={cn(majorCls, "hover:underline")}>
        {cls.group.name}
      </Link>
      {showMinor && (
        <Link
          to={examSetPath({ group: cls.group.id, topic: cls.topic.id, q })}
          className={cn(minorCls, "hover:underline")}
        >
          {cls.topic.name}
        </Link>
      )}
    </span>
  );
}
