// 卡片答案面：词根词缀拆分 + 同义 / 反义 / 形近 / 同族词。各分区受设置开关控制。
import { useWordInfo } from "@/lib/wordInfo";
import { useSettings } from "@/stores/settings";
import type { RelatedWord } from "@/types/words";
import { cn } from "@/lib/utils";

export function WordInfoBlock({
  english,
  className,
  section = "all",
}: {
  english: string;
  className?: string;
  /** all=整块（默认）；parts=只出词根词缀；lists=只出同/反/形近/同族。
   *  大屏卡片把两部分分放到左右两栏，避免左栏留白、右栏过长。 */
  section?: "all" | "parts" | "lists";
}) {
  const showParts = useSettings((s) => s.showWordParts);
  const showSyn = useSettings((s) => s.showSynonyms);
  const showAnt = useSettings((s) => s.showAntonyms);
  const showSim = useSettings((s) => s.showSimilar);
  const showRel = useSettings((s) => s.showRelated);
  const wantParts = section !== "lists" && showParts;
  const wantLists =
    section !== "parts" && (showSyn || showAnt || showSim || showRel);
  const anyOn = wantParts || wantLists;
  const info = useWordInfo(english, anyOn);
  if (!info) return null;

  const hasParts = wantParts && (info.parts.length > 0 || !!info.note);
  const lists: [string, RelatedWord[]][] = [];
  if (wantLists && showSyn) lists.push(["同义", info.syn]);
  if (wantLists && showAnt) lists.push(["反义", info.ant]);
  if (wantLists && showSim) lists.push(["形近", info.sim]);
  if (wantLists && showRel) lists.push(["同族", info.rel]);
  const shownLists = lists.filter(([, words]) => words.length > 0);
  if (!hasParts && shownLists.length === 0) return null;

  return (
    <div
      className={cn(
        "w-full space-y-2 text-left text-sm md:text-[15px]",
        // lists 单独成块时（跟随在词根后面）不再画顶部分隔线，免得手机上出现两条横线
        section === "lists"
          ? "mt-2"
          : "mt-4 border-t border-border/60 pt-3",
        className
      )}
    >
      {hasParts ? (
        <div>
          {info.parts.length > 0 ? (
            <div className="flex flex-wrap items-start gap-x-1 gap-y-1.5">
              {info.parts.map(([seg, meaning], i) => (
                <span key={i} className="flex items-start gap-1">
                  {i > 0 ? <span className="pt-0.5 text-muted-foreground">+</span> : null}
                  <span className="flex flex-col items-center rounded-md bg-muted/60 px-1.5 py-0.5">
                    <span className="font-semibold tracking-wide">{seg}</span>
                    {meaning ? <span className="text-xs text-muted-foreground">{meaning}</span> : null}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          {info.note ? <div className="mt-1.5 text-muted-foreground">{info.note}</div> : null}
        </div>
      ) : null}
      {shownLists.map(([label, words]) => (
        <div key={label} className="flex gap-2">
          <span className="shrink-0 text-xs leading-5 text-muted-foreground">{label}</span>
          <span className="leading-5">
            {words.map(([en, cn], i) => (
              <span key={en}>
                {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
                <span className="font-medium">{en}</span>
                {cn ? <span className="text-muted-foreground"> {cn}</span> : null}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
