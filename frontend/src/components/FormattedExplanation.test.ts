import { describe, expect, it } from "vitest";
import { parseExplanationSegments } from "@/components/FormattedExplanation";

describe("FormattedExplanation 公式解析", () => {
  it("将常见分数与科学计数法次方转为 KaTeX 片段", () => {
    const segs = parseExplanationSegments("2×(d/2×10^8 + 1.51μs) ≤ 5.12μs，解得d/10^8 ≤ 1.05μs，发送时间=512/10^8=5.12μs。");
    const maths = segs.filter((s) => s.type === "math").map((s) => s.tex);
    expect(maths).toContain("\\dfrac{d}{2 \\times 10^{8}}");
    expect(maths).toContain("\\dfrac{d}{10^{8}}");
    expect(maths).toContain("\\dfrac{512}{10^{8}}");
  });

  it("转换独立次方表达式", () => {
    const segs = parseExplanationSegments("最大退避窗口为 2^(n-1) 或 2^10 - 1，时间 10^-6 s。");
    const maths = segs.filter((s) => s.type === "math").map((s) => s.tex);
    expect(maths).toEqual(["2^{n-1}", "2^{10}", "10^{-6}"]);
  });

  it("不误伤协议名、单位和选项列表", () => {
    const sample = "CSMA/CD 和 CSMA/CA、TCP/IP、I/O 设备、速率 100Mb/s、传播速率 200m/μs、选项 A/B/C/D、0/1 编号。";
    const segs = parseExplanationSegments(sample);
    expect(segs.filter((s) => s.type === "math")).toHaveLength(0);
  });
});
