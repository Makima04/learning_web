import { MathFormula } from "@/components/MathFormula";
import type { ReviewBlock } from "@/lib/kg/knowledgeReview";

export function ReviewBlocks({ blocks }: { blocks: ReviewBlock[] }) {
  return (
    <div className="min-w-0 space-y-2 text-sm leading-7">
      {blocks.map((block, index) => {
        if (block.type === "math") return <MathFormula key={index} tex={block.tex} />;
        if (block.type === "flow") return (
          <div key={index} className="space-y-1.5 rounded-lg border border-border/60 bg-secondary/25 p-2.5">
            {block.title && <div className="text-xs font-bold text-primary">{block.title}</div>}
            <div className="space-y-1">
              {block.items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs leading-5">
                  <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-foreground ring-1 ring-border/70">{it.from}</span>
                  <span className={`font-bold ${it.arrow === "↛" ? "text-destructive" : "text-primary"}`}>{it.arrow ?? "⇒"}</span>
                  {Array.isArray(it.to) ? (
                    <ul className="border-l-2 border-primary/40 pl-2 space-y-0.5 text-foreground">
                      {it.to.map((line, j) => <li key={j}>{line}</li>)}
                    </ul>
                  ) : (
                    <span className="text-foreground">{it.to}</span>
                  )}
                  {it.note && <span className="text-muted-foreground">（{it.note}）</span>}
                </div>
              ))}
            </div>
          </div>
        );
        if (block.type === "code") return <pre key={index} className="max-w-full overflow-x-auto rounded-lg bg-secondary/50 p-3 text-xs leading-6"><code>{block.code}</code></pre>;
        if (block.type === "table") return (
          <div key={index} className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-xs leading-6">
              <thead><tr>{block.headers.map((header, at) => <th key={at} scope="col" className="border-b border-border px-2 py-2 font-semibold text-muted-foreground">{header}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, at) => <tr key={at}>{row.map((cell, col) => <td key={col} className="border-b border-border/50 px-2 py-2 last:tabular-nums">{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <p key={index} className="whitespace-pre-wrap">{block.text}</p>;
      })}
    </div>
  );
}
