import { Link, useParams } from "react-router-dom";
import { MathExplanationPanel } from "./MathExplanationPanel";

export function MathExplanationPage() {
  const { itemId = "" } = useParams();
  return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-20 md:p-6">
    <header className="space-y-3"><Link to="/review-priority?subject=math" className="text-xs text-muted-foreground hover:underline">← 返回数学复习性价比</Link><h1 className="text-2xl font-extrabold">逐题解析</h1><p className="text-sm text-muted-foreground">先看突破点，再按步骤展开推导和计算。</p></header>
    <MathExplanationPanel key={itemId} itemId={itemId} standalone />
  </div>;
}
