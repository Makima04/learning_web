import type { WangdaoItem } from "@/lib/kg/wangdao408";
import { MATH_CATALOG_VER } from "@/lib/kg/mathPractice";

const OPT_KEYS = ["A", "B", "C", "D"] as const;

export function WangdaoStem({ item }: { item: WangdaoItem }) {
  if (item.img) {
    const src = item.img.includes("?") ? item.img : `${item.img}?v=${MATH_CATALOG_VER}`;
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
