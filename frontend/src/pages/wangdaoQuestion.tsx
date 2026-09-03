import { useState } from "react";
import { findKp } from "@/data/kg";
import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { mediaUrl } from "@/lib/kg/catalogLoad";
import { mathFacetLabels } from "@/lib/kg/mathPractice";

const OPT_KEYS = ["A", "B", "C", "D"] as const;

export function WangdaoStem({ item }: { item: WangdaoItem }) {
  if (item.img) {
    const src = mediaUrl(item.img)!;
    return (
      <div className="-mx-1 overflow-hidden rounded-md bg-white sm:mx-0">
        <img
          src={src}
          alt={item.stem ? item.stem.slice(0, 80) : `第${item.qno}题`}
          className="h-auto w-full bg-white"
        />
      </div>
    );
  }
  const opts = item.options;
  const keys = OPT_KEYS.filter((k) => opts?.[k]);
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-base leading-relaxed">{item.stem}</p>
      {keys.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {keys.map((k) => (
            <li key={k} className="flex gap-2">
              <span className="w-5 shrink-0 font-medium text-muted-foreground">{k}.</span>
              <span className="min-w-0 whitespace-pre-wrap">{opts![k]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuestionKpLine({ item }: { item: WangdaoItem }) {
  const names = (item.kp_ids || [])
    .map((id) => findKp(id)?.kp.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  return <p className="text-xs text-muted-foreground">考点：{names.join(" · ")}</p>;
}

export function QuestionFacetChips({ item }: { item: WangdaoItem }) {
  const labels = mathFacetLabels(item.facets);
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((f) => (
        <span
          key={f.id}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {f.name}
        </span>
      ))}
    </div>
  );
}

export function WangdaoAnalysis({ item }: { item: WangdaoItem }) {
  const [open, setOpen] = useState(false);
  const labels = mathFacetLabels(item.facets);
  if (!item.ans_img && !item.answer && labels.length === 0) return null;
  const src = mediaUrl(item.ans_img);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-xs text-muted-foreground hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起解析" : item.ans_img || item.answer ? "看解析" : "看题型分类"}
      </button>
      {open && (
        <div className="space-y-2 overflow-hidden rounded-md border border-dashed bg-white p-3 dark:bg-background">
          {labels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">解析分类</p>
              <QuestionFacetChips item={item} />
            </div>
          )}
          {item.answer && (
            <p className="text-sm">
              <span className="font-medium">答案：</span>
              {item.answer}
            </p>
          )}
          {src && (
            <img
              src={src}
              alt={`第${item.qno}题解析`}
              className="h-auto w-full bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}
