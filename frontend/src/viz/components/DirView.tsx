// 图解 · 目录与文件共享：树形目录的路径解析（绝对/相对、符号链接展开）+ 硬链接引用计数。
// resolvePath 与 hardLinkRef 现算；「删原文件后硬链接仍可读、符号链接悬空」由模拟验证。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

/** 迷你文件系统：目录路径 → 条目列表。约定：`xx/` 子目录；`xx@路径` 符号链接；`xx@inodeN` 硬链接 */
export const FSDATA: Record<string, string[]> = {
  "/": ["etc/", "home/", "var/"],
  "/etc": ["passwd@inode1"],
  "/home": ["ua/", "ub/"],
  "/home/ua": ["report.doc@inode5", "docs@/home/ub/share", "sys.hard@inode9"],
  "/home/ub": ["share/"],
  "/home/ub/share": ["notes.txt@inode7"],
  "/var": ["log/"],
  "/var/log": ["syslog@inode9"],
};

export interface ResolveResult {
  ok: boolean;
  realPath: string | null; // 最终真实路径
  viaSymlink: boolean;
  steps: string[]; // 解析轨迹
}

/** 解析绝对路径：逐段下钻，遇符号链接（@路径）替换重解；目标不存在 → 悬空 */
export function resolvePath(path: string, fs: Record<string, string[]> = FSDATA): ResolveResult {
  const steps: string[] = [];
  let segs = path.split("/").filter(Boolean);
  let viaSymlink = false;
  let cur = "";
  for (let guard = 0; guard < 10 && segs.length > 0; guard++) {
    const seg = segs[0]!;
    const dir = cur === "" ? "/" : cur;
    const entries = fs[dir] ?? [];
    const hit = entries.find((e) => e.split("@")[0] === seg || e === seg + "/");
    if (hit == null) {
      steps.push(`${dir} 下没有 ${seg} → 解析失败`);
      return { ok: false, realPath: null, viaSymlink, steps };
    }
    if (hit.endsWith("/")) {
      cur = (cur === "" ? "" : cur) + "/" + seg;
      steps.push(`${seg} 是目录 → 进入 ${cur === "" ? "/" : cur}`);
      segs = segs.slice(1);
      continue;
    }
    const [name, target] = hit.split("@");
    void name;
    if (target != null && target.startsWith("inode")) {
      steps.push(`${seg} = 文件（${target}）→ ${segs.length === 1 ? "找到" : "但还有下段路径，文件不是目录，失败"}`);
      if (segs.length === 1) {
        return { ok: true, realPath: dir + "/" + seg, viaSymlink, steps };
      }
      return { ok: false, realPath: null, viaSymlink, steps };
    }
    // 符号链接：把链接目标接到剩余路径前
    viaSymlink = true;
    steps.push(`${seg} 是符号链接 → 跳转到 ${target}`);
    const rest = segs.slice(1).join("/");
    path = rest ? `${target}/${rest}` : target!;
    segs = path.split("/").filter(Boolean);
    cur = "";
  }
  return { ok: segs.length === 0, realPath: cur || null, viaSymlink, steps };
}

/** inode9（/var/log/syslog）的硬链接引用计数演变：初始 1 → ln 到 ua → unlink 原路径 */
export function hardLinkRef(): { label: string; ref: number; alive: boolean; note: string }[] {
  return [
    { label: "初始", ref: 1, alive: true, note: "只有 /var/log/syslog 指向 inode9" },
    { label: "ln /var/log/syslog /home/ua/sys.hard", ref: 2, alive: true, note: "目录里新增一条 (文件名→inode9)，引用计数 +1。硬链接 = 同一 inode 多个名字" },
    { label: "unlink /var/log/syslog", ref: 1, alive: true, note: "计数 −1 但未到 0 → 文件实体不删，sys.hard 仍可读。计数到 0 才真正释放" },
  ];
}

/** 符号链接场景：删除被链接的目录 → 悬空 */
export const SYMLINK_CASES: { path: string; removed: boolean; expectOk: boolean }[] = [
  { path: "/home/ua/docs/notes.txt", removed: false, expectOk: true },
  { path: "/home/ua/docs/notes.txt", removed: true, expectOk: false },
];

interface Frame extends VizFrame {
  show: "tree" | "resolve" | "resolveGone" | "hard" | "summary";
}

function buildFrames(): Frame[] {
  const ok = resolvePath("/home/ua/docs/notes.txt");
  return [
    {
      show: "tree",
      phase: "树形目录",
      desc: "目录 = 「文件名 → inode/FCB」的索引表，组织成树。绝对路径从 / 走；相对路径从当前目录（每个进程有 cwd）走，解析时拼起来。目录里特殊两项：`.`（自身）、`..`（父目录）实现回溯。本例树：/etc、/home/{ua,ub}、/var/log；ua 下有符号链接 docs → /home/ub/share，硬链接 sys.hard 与 /var/log/syslog 同指 inode9。",
    },
    {
      show: "resolve",
      phase: "路径解析",
      desc: `解析 /home/ua/docs/notes.txt：${ok.steps.join("；")}。符号链接对用户透明——路径里看不出它是链接；解析时把它替换为目标路径继续走。注意循环符号链接要让解析失败（本实现限深 10 层）。`,
    },
    {
      show: "resolveGone",
      phase: "链接悬空",
      desc: "符号链接只是「存了一个路径名」。若管理员把 /home/ub/share 移走/删除，再走 /home/ua/docs/notes.txt → 解析到目标目录不存在，失败（悬空链接 dangling）。硬链接没有这个问题——它直接指 inode，不依赖别的路径名。",
    },
    {
      show: "hard",
      phase: "硬链接计数",
      desc: "看 inode9 的引用计数演变：1 → 2 → 1，文件始终存活。删除文件 = 删一条目录项并计数减一，减到 0 才释放数据块。硬链接限制：不能跨文件系统（inode 号只在本文件系统内唯一）、多数系统不允许给目录建硬链接（防环）。符号链接可以跨文件系统、可以指目录，代价是「目标没了就悬空」+ 多一次解析开销。",
    },
    {
      show: "summary",
      phase: "小结",
      desc: "考点：① 绝对/相对路径解析逐步写出经过的目录；② 硬链接 vs 符号链接（inode/路径名、计数、跨盘、悬空）；③ 目录实现：线性表/哈希表（查找效率）；④ 删除文件的语义（unlink 只减计数）。",
    },
  ];
}

export function DirView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];
  const ok = resolvePath("/home/ua/docs/notes.txt");
  const resolveGone = resolvePath("/home/ua/docs/notes.txt", { ...FSDATA, "/home/ub": [] });

  return (
    <div className="space-y-4">
      {fr.show === "tree" && (
        <div className="rounded-xl border p-3 font-mono text-xs leading-6">
          <div>/</div>
          <div>├── etc/</div>
          <div>├── var/log/syslog <span className="text-emerald-600">(inode9)</span></div>
          <div>└── home/</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;├── ua/</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp; ├── report.doc <span className="text-emerald-600">(inode5)</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp; ├── docs → /home/ub/share <span className="text-sky-600">(符号链接)</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp; └── sys.hard <span className="text-amber-600">(inode9 硬链接)</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;└── ub/share/notes.txt <span className="text-emerald-600">(inode7)</span></div>
        </div>
      )}
      {(fr.show === "resolve" || fr.show === "resolveGone") && (
        <div className="space-y-1.5">
          <p className="font-mono text-xs">解析 /home/ua/docs/notes.txt {fr.show === "resolveGone" ? "（假设 /home/ub/share 已被删除）" : ""}</p>
          {(fr.show === "resolve" ? ok : resolveGone).steps.map((s, i) => (
            <div key={i} className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">{s}</div>
          ))}
          <div className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", (fr.show === "resolve" ? ok : resolveGone).ok ? "bg-emerald-600 text-white" : "bg-rose-500 text-white")}>
            {(fr.show === "resolve" ? ok : resolveGone).ok ? `解析成功：${ok.realPath}` : "解析失败：悬空符号链接"}
          </div>
        </div>
      )}
      {fr.show === "hard" && (
        <div className="space-y-1.5">
          {hardLinkRef().map((h, i) => (
            <div key={h.label} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-xs", i === 2 && "ring-2 ring-amber-400")}>
              <span className="w-56 shrink-0 font-mono">{h.label}</span>
              <span className="rounded bg-muted px-2 py-0.5 font-mono font-bold">引用计数 {h.ref}</span>
              <span className={h.alive ? "text-emerald-600" : "text-rose-500"}>{h.alive ? "文件存活 ✓" : "已删除"}</span>
            </div>
          ))}
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
