import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

/** 本地打包公式与字体，不依赖 CDN；长公式的滚动限制在公式本身。 */
export function MathFormula({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => katex.renderToString(tex, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: "ignore",
  }), [tex]);
  return (
    <div
      className={cn("min-w-0 max-w-full overflow-x-auto py-1 text-sm [&_.katex-display]:my-1 [&_.katex-display>.katex]:text-left [&_.katex]:text-[1.05em]", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
