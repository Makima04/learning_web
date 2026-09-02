import { Link } from "react-router-dom";
import { wdClassOf, wdKindLabel, wdSetPath } from "@/data/kg/wdTaxonomy";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { cn } from "@/lib/utils";

export function WdTags({
  item,
  showMinor = true,
  compact = false,
  link = true,
}: {
  item: WangdaoItem;
  showMinor?: boolean;
  compact?: boolean;
  link?: boolean;
}) {
  const cls = wdClassOf(item);
  const pill = compact ? "rounded px-1.5 py-0.5 text-[10px]" : "rounded-md px-2 py-0.5 text-[11px]";
  const kindCls = cn(
    pill,
    cls.kind === "big"
      ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
      : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
  );
  const majorCls = cn(pill, "bg-sky-500/15 text-sky-800 dark:text-sky-200");
  const minorCls = cn(pill, "bg-violet-500/15 text-violet-800 dark:text-violet-200");
  const examCls = cn(pill, "bg-rose-500/15 text-rose-800 dark:text-rose-200");
  const inner = (
    <>
      <span className={kindCls}>{wdKindLabel(cls.kind)}</span>
      <span className={majorCls}>{cls.group.name}</span>
      {showMinor ? <span className={minorCls}>{cls.topic.name}</span> : null}
      {cls.isExam ? <span className={examCls}>{item.year} 真题</span> : null}
    </>
  );
  if (!link) {
    return <span className="inline-flex flex-wrap items-center gap-1">{inner}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Link
        to={wdSetPath({ group: cls.group.id, kind: cls.kind })}
        className={cn(kindCls, "hover:underline")}
      >
        {wdKindLabel(cls.kind)}
      </Link>
      <Link
        to={wdSetPath({ group: cls.group.id, kind: cls.kind, q: item.id })}
        className={cn(majorCls, "hover:underline")}
      >
        {cls.group.name}
      </Link>
      {showMinor && (
        <Link
          to={wdSetPath({
            group: cls.group.id,
            kind: cls.kind,
            topic: cls.topic.id,
            q: item.id,
          })}
          className={cn(minorCls, "hover:underline")}
        >
          {cls.topic.name}
        </Link>
      )}
      {cls.isExam && <span className={examCls}>{item.year} 真题</span>}
    </span>
  );
}
