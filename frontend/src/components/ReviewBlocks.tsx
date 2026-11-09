import { MathFormula } from "@/components/MathFormula";
import type { ReviewBlock } from "@/lib/kg/knowledgeReview";

export function ReviewBlocks({ blocks }: { blocks: ReviewBlock[] }) {
  return (
    <div className="min-w-0 space-y-2 text-sm leading-7">
      {blocks.map((block, index) => {
        if (block.type === "math") return <MathFormula key={index} tex={block.tex} />;
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
