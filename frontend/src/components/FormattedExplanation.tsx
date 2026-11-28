import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

/**
 * 将纯文本解析中的常见数学表达式（分数、科学计数法、次方、显式 $...$）
 * 转换为 KaTeX 行内渲染，同时避开协议名（CSMA/CD、TCP/IP、I/O）与单位（Mb/s、m/μs）；
 * 自动识别 C/C++/伪代码块并以等宽代码块独立展示，避免代码被公式规则误改。
 */

const SKIP_SLASH_PAIRS = new Set([
  "0/1",
  "1/0",
  "CSMA/CD",
  "CSMA/CA",
  "TCP/IP",
  "I/O",
  "B/S",
  "C/S",
  "P/V",
  "R/W",
  "A/D",
  "D/A",
  "RTS/CTS",
  "PAP/CHAP",
  "8B/10B",
  "4B/5B",
  "SONET/SDH",
  "IP/MAC",
  "MAC/IP",
  "LAN/WAN",
  "RAM/ROM",
  "CPU/GPU",
  "SRAM/DRAM",
  "RISC/CISC",
]);

const UNIT_NUM_RE = /^(?:\d+(?:\.\d+)?)?(?:k|K|M|G|T)?(?:b|B|bit|bits|Byte|Bytes|m|km|cm|mm|Hz|kHz|MHz|GHz)$/i;
const UNIT_DEN_RE = /^(?:s|ms|μs|us|ns|min|h|Hz)$/i;

// 单个数学原子：括弧表达式、科学计数法(2×10^8)、带次方(10^8 / 2^(n-1))、带下标变量(T_t / L_min)、数字或单字母变量(d, v, τ, n, R)
const SCI = String.raw`\d+(?:\.\d+)?\s*[×*]\s*\d+\^(?:\([^()]+\)|[+-]?\d+)`;
const POW = String.raw`(?:[A-Za-z0-9]+|\([^()]+\))\^(?:\([^()]+\)|[+-]?[A-Za-z0-9]+)`;
const PAREN = String.raw`\([^()]{1,40}\)`;
const SUBVAR = String.raw`[A-Za-z]_[A-Za-z0-9]+`;
const NUM = String.raw`\d+(?:\.\d+)?`;
const SINGLE_VAR = String.raw`(?:[a-zA-Z]|τ|λ|μ|ρ|η|π)`;

const ATOM = `(?:${SCI}|${POW}|${PAREN}|${SUBVAR}|${NUM}|${SINGLE_VAR})`;

// 分数：分子 / 分母（前后不能紧贴 / 或字母数字，避免截断多斜杠列表如 1/3/7/14 或词内）
const FRAC_RE = new RegExp(
  `(?<![A-Za-z0-9_/])(${ATOM})\\s*/\\s*(${ATOM})(?![A-Za-z0-9_/])`,
  "g"
);

// 独立次方：如 10^8、2^(n-1)、10^-6、2^k
const STANDALONE_POW_RE = new RegExp(
  `(?<![A-Za-z0-9_])(${POW})(?![A-Za-z0-9_])`,
  "g"
);

function toTexAtom(raw: string): string {
  let s = raw.trim();
  // 去掉仅包裹整项的外层圆括号，分数横线本身已起分组作用
  if (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let wrapsAll = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) {
        wrapsAll = false;
        break;
      }
    }
    if (wrapsAll) s = s.slice(1, -1).trim();
  }
  return toTexInner(s);
}

function toTexInner(raw: string): string {
  return raw
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/≤/g, " \\le ")
    .replace(/≥/g, " \\ge ")
    .replace(/≠/g, " \\ne ")
    .replace(/≈/g, " \\approx ")
    .replace(/τ/g, "\\tau ")
    .replace(/μ/g, "\\mu ")
    .replace(/λ/g, "\\lambda ")
    .replace(/ρ/g, "\\rho ")
    .replace(/η/g, "\\eta ")
    .replace(/π/g, "\\pi ")
    // x^(a-b) -> x^{a-b}
    .replace(/\^\(([^()]+)\)/g, "^{$1}")
    // x^-6 or x^10 -> x^{-6} / x^{10}
    .replace(/\^([+-]?[A-Za-z0-9]+)/g, "^{$1}")
    // L_min -> L_{\text{min}}, T_t -> T_{t}
    .replace(/([A-Za-z])_([A-Za-z]{2,})/g, "$1_{\\text{$2}}")
    .replace(/([A-Za-z])_([A-Za-z0-9])/g, "$1_{$2}")
    // 中文字符包裹 \text{} 避免 KaTeX 告警
    .replace(/([\u4e00-\u9fff]+)/g, "\\text{$1}");
}

function isValidMathFraction(num: string, den: string): boolean {
  const pair = `${num}/${den}`;
  if (SKIP_SLASH_PAIRS.has(pair.toUpperCase())) return false;
  if (UNIT_NUM_RE.test(num) && UNIT_DEN_RE.test(den)) return false;
  // 括号内若含中文且无任何运算符/数字/希腊字母，多为文字并列如 (发送/接收)，跳过
  if (/[\u4e00-\u9fff]/.test(num) && !/[+\-×*=0-9^]/.test(num)) return false;
  if (/[\u4e00-\u9fff]/.test(den) && !/[+\-×*=0-9^]/.test(den)) return false;
  // 排除纯大小写字母双字母对如 A/B、I/O、P/V（但保留经典物理公式如 d/v、L/R、d/c）
  if (/^[A-Z]$/.test(num) && /^[A-Z]$/.test(den)) {
    const allowedUpper = new Set(["L/R", "L/C", "W/R", "S/N", "C/B", "B/W", "T/R"]);
    if (!allowedUpper.has(pair)) return false;
  }
  return true;
}

type Segment = { type: "text"; value: string } | { type: "math"; tex: string; display?: boolean };

export function parseExplanationSegments(text: string): Segment[] {
  // 1) 先切分显式 $$...$$ 与 $...$
  const explicitParts: Segment[] = [];
  const explicitRe = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = explicitRe.exec(text)) !== null) {
    if (m.index > last) explicitParts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] != null) explicitParts.push({ type: "math", tex: m[1].trim(), display: true });
    else if (m[2] != null) explicitParts.push({ type: "math", tex: m[2].trim(), display: false });
    last = explicitRe.lastIndex;
  }
  if (last < text.length) explicitParts.push({ type: "text", value: text.slice(last) });

  // 2) 对纯文本段自动升级分数与次方
  const out: Segment[] = [];
  for (const part of explicitParts) {
    if (part.type === "math") {
      out.push(part);
      continue;
    }
    const raw = part.value;
    // 先找所有合法分数，再在剩余文本里找独立次方
    const fracMatches: Array<{ start: number; end: number; tex: string }> = [];
    FRAC_RE.lastIndex = 0;
    let fm: RegExpExecArray | null;
    while ((fm = FRAC_RE.exec(raw)) !== null) {
      const num = fm[1].trim();
      const den = fm[2].trim();
      if (!isValidMathFraction(num, den)) continue;
      fracMatches.push({
        start: fm.index,
        end: fm.index + fm[0].length,
        tex: `\\dfrac{${toTexAtom(num)}}{${toTexAtom(den)}}`,
      });
    }

    const pushPlainWithPowers = (chunk: string) => {
      if (!chunk) return;
      STANDALONE_POW_RE.lastIndex = 0;
      let pos = 0;
      let pm: RegExpExecArray | null;
      while ((pm = STANDALONE_POW_RE.exec(chunk)) !== null) {
        if (pm.index > pos) out.push({ type: "text", value: chunk.slice(pos, pm.index) });
        out.push({ type: "math", tex: toTexInner(pm[1]), display: false });
        pos = pm.index + pm[0].length;
      }
      if (pos < chunk.length) out.push({ type: "text", value: chunk.slice(pos) });
    };

    let cursor = 0;
    for (const fmItem of fracMatches) {
      if (fmItem.start < cursor) continue;
      if (fmItem.start > cursor) pushPlainWithPowers(raw.slice(cursor, fmItem.start));
      out.push({ type: "math", tex: fmItem.tex, display: false });
      cursor = fmItem.end;
    }
    if (cursor < raw.length) pushPlainWithPowers(raw.slice(cursor));
  }
  return out;
}

export type ExplanationBlock =
  | { kind: "prose"; text: string }
  | { kind: "code"; code: string };

const CODE_START_RE =
  /^\s*(?:#include\b|typedef\b|struct\b|enum\b|const\s+\w+|(?:static\s+)?(?:int|void|bool|char|float|double|unsigned|long|short|ElemType|Status|LNode|LinkList|BiTree|BiTNode|MGraph|ALGraph|SqList|SqBiTree|NODE|semaphore)\s+\*?\w+\s*[(=;[]|(?:int|void|bool|char)\s+\w+\s*\()/;
const CODE_LINE_RE =
  /^\s*(?:[{}()[\]]|\/\/|\/\*|\*\/|for\s*\(|while\s*\(|if\s*\(|else\b|return\b|break;|continue;|switch\s*\(|case\s+|default:|do\s*\{|P\s*\(|V\s*\(|wait\s*\(|signal\s*\(|printf\s*\(|scanf\s*\(|free\s*\(|malloc\s*\(|swap\s*\(|[A-Za-z_]\w*(?:\[[^\]]*\]|->\w+|\.\w+)*\s*(?:[+\-*/]?=|\+\+|--)\s*|[A-Za-z_]\w*\s*\([^)]*\)\s*;)/;
const PROSE_HEADER_RE = /^\s*(?:[（(]\s*\d+\s*[）)]|第[一二三四五六七八九十]+步|时间复杂度|空间复杂度|复杂度分析|算法思想|基本设计思想|【)/;

function isLikelyCodeLine(line: string, inCode: boolean): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (PROSE_HEADER_RE.test(trimmed)) return false;
  if (CODE_START_RE.test(trimmed)) return true;
  if (!inCode) return false;
  if (/^\s{2,}/.test(line)) return true;
  if (CODE_LINE_RE.test(trimmed)) return true;
  if (/[;{}]$/.test(trimmed)) return true;
  return false;
}

export function splitExplanationBlocks(text: string): ExplanationBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ExplanationBlock[] = [];
  let proseBuf: string[] = [];
  let codeBuf: string[] = [];
  let inFence = false;
  let inCode = false;

  const flushProse = () => {
    const joined = proseBuf.join("\n").trim();
    if (joined) blocks.push({ kind: "prose", text: joined });
    proseBuf = [];
  };
  const flushCode = () => {
    while (codeBuf.length && !codeBuf[0].trim()) codeBuf.shift();
    while (codeBuf.length && !codeBuf[codeBuf.length - 1].trim()) codeBuf.pop();
    if (codeBuf.length) blocks.push({ kind: "code", code: codeBuf.join("\n") });
    codeBuf = [];
    inCode = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      if (inFence) {
        inFence = false;
        flushCode();
      } else {
        if (inCode) flushCode();
        flushProse();
        inFence = true;
      }
      continue;
    }

    if (inFence) {
      codeBuf.push(line);
      continue;
    }

    if (!inCode) {
      if (isLikelyCodeLine(line, false)) {
        flushProse();
        inCode = true;
        codeBuf.push(line);
      } else {
        proseBuf.push(line);
      }
    } else {
      if (!trimmed) {
        let nextIdx = i + 1;
        while (nextIdx < lines.length && !lines[nextIdx].trim()) nextIdx++;
        if (nextIdx < lines.length && isLikelyCodeLine(lines[nextIdx], true)) {
          codeBuf.push("");
        } else {
          flushCode();
        }
      } else if (isLikelyCodeLine(line, true)) {
        codeBuf.push(line);
      } else {
        flushCode();
        proseBuf.push(line);
      }
    }
  }

  if (inFence || inCode) flushCode();
  flushProse();
  return blocks;
}

function ProseParagraph({ text }: { text: string }) {
  const rendered = useMemo(() => {
    return parseExplanationSegments(text).map((seg, idx) => {
      if (seg.type === "text") return { key: idx, text: seg.value };
      const html = katex.renderToString(seg.tex, {
        displayMode: Boolean(seg.display),
        throwOnError: false,
        trust: false,
        strict: "ignore",
      });
      return { key: idx, html, display: Boolean(seg.display) };
    });
  }, [text]);

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7 [&_.katex]:text-[1.02em]">
      {rendered.map((node) =>
        "html" in node ? (
          node.display ? (
            <div key={node.key} className="my-1.5 overflow-x-auto" dangerouslySetInnerHTML={{ __html: node.html! }} />
          ) : (
            <span
              key={node.key}
              className="mx-[0.06em] inline-block align-middle"
              dangerouslySetInnerHTML={{ __html: node.html! }}
            />
          )
        ) : (
          <span key={node.key}>{node.text}</span>
        )
      )}
    </div>
  );
}

export function FormattedExplanation({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => splitExplanationBlocks(text), [text]);
  return (
    <div className={cn("space-y-2.5", className)}>
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-lg border border-border/70 bg-muted/60 px-3.5 py-2.5 font-mono text-[13px] leading-6 text-foreground"
          >
            <code>{block.code}</code>
          </pre>
        ) : (
          <ProseParagraph key={index} text={block.text} />
        )
      )}
    </div>
  );
}
