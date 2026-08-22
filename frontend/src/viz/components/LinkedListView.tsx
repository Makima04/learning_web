// 图解 · 单链表/双链表/循环链表：指针操作是链表题的核心，逐步演示插入与删除时指针怎么变
import { useMemo } from "react";
import { C, StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";

interface Node2 {
  id: string;
  label: string;
  x: number;
  y: number;
  state: "normal" | "active" | "new" | "dead" | "warn" | "done";
}
interface Arrow {
  from: string;
  to: string;
  kind: "solid" | "ghost" | "new" | "fade";
}
interface Ptr {
  label: string;
  target: string;
  color: string;
}
interface Frame extends VizFrame {
  nodes: Node2[];
  arrows: Arrow[];
  ptrs: Ptr[];
}

const W = 76;
const H = 34;
const Y = 96;

function n(id: string, x: number, state: Node2["state"] = "normal", y = Y): Node2 {
  return { id, label: id, x, y, state };
}
function solid(from: string, to: string): Arrow {
  return { from, to, kind: "solid" };
}

const NODES = ["a", "b", "c", "d"];
const baseX = (id: string) => 56 + NODES.indexOf(id) * 118;

/** 手工编排帧：帧数少，直接写数据最直观 */
function buildFrames(): Frame[] {
  const f = (
    desc: string,
    phase: string,
    nodes: Node2[],
    arrows: Arrow[],
    ptrs: Ptr[]
  ): Frame => ({ desc, phase, nodes, arrows, ptrs });

  return [
    f(
      "单链表 a→b→c→d，head 指向首元结点。下面先演示「在 b 之后插入 x」，再演示「删除 x」。",
      "初始",
      NODES.map((id) => n(id, baseX(id))),
      NODES.slice(0, 3).map((id) => solid(id, NODES[NODES.indexOf(id) + 1])),
      [{ label: "head", target: "a", color: C.done }]
    ),
    f(
      "插入 x：先用指针 p 定位到目标位置的前驱结点 b。",
      "插入",
      NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
      NODES.slice(0, 3).map((id) => solid(id, NODES[NODES.indexOf(id) + 1])),
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
      ]
    ),
    f(
      "malloc 新结点 x（虚线框），此时它还没接入链表。",
      "插入",
      [...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")), n("x", 233, "new", 28)],
      NODES.slice(0, 3).map((id) => solid(id, NODES[NODES.indexOf(id) + 1])),
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
      ]
    ),
    f(
      "第 ① 步：x->next = p->next。让 x 先接上 b 的后继 c（虚线）。注意这一步必须在改 p 之前做。",
      "插入",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
        n("x", 233, "new", 28),
      ],
      [
        ...NODES.slice(0, 3).map((id) => solid(id, NODES[NODES.indexOf(id) + 1])),
        { from: "x", to: "c", kind: "ghost" },
      ],
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
      ]
    ),
    f(
      "第 ② 步：p->next = x。b 的指针改指 x（红色新箭头），原来 b→c 的箭头作废（淡出）。若先做这步，c 及其后继就找不回来了——这是链表题最常见的丢链错误。",
      "插入",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
        n("x", 233, "new", 28),
      ],
      [
        solid("a", "b"),
        { from: "b", to: "x", kind: "new" },
        { from: "x", to: "c", kind: "ghost" },
        solid("c", "d"),
        { from: "b", to: "c", kind: "fade" },
      ],
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
      ]
    ),
    f(
      "插入完成：a→b→x→c→d。整个过程只改了两根指针，时间花在定位前驱 p 上（单链表插入要 O(n) 找位置，改指针本身 O(1)）。",
      "插入完成",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "done" : "normal")),
        n("x", 233, "done", 28),
      ],
      [
        solid("a", "b"),
        { from: "b", to: "x", kind: "solid" },
        { from: "x", to: "c", kind: "solid" },
        solid("c", "d"),
      ],
      [{ label: "head", target: "a", color: C.done }]
    ),
    f(
      "删除 x：同样先让 p 定位到前驱 b。",
      "删除",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
        n("x", 233, "normal", 28),
      ],
      [
        solid("a", "b"),
        { from: "b", to: "x", kind: "solid" },
        { from: "x", to: "c", kind: "solid" },
        solid("c", "d"),
      ],
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
      ]
    ),
    f(
      "用 q 记下待删结点 x（否则改完指针就找不到它，无法 free）。",
      "删除",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
        n("x", 233, "warn", 28),
      ],
      [
        solid("a", "b"),
        { from: "b", to: "x", kind: "solid" },
        { from: "x", to: "c", kind: "solid" },
        solid("c", "d"),
      ],
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
        { label: "q", target: "x", color: C.warn },
      ]
    ),
    f(
      "跨过 x：p->next = q->next，即让 b 直接指向 c（新箭头），b→x 作废。",
      "删除",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "active" : "normal")),
        n("x", 233, "warn", 28),
      ],
      [
        solid("a", "b"),
        { from: "b", to: "c", kind: "new" },
        { from: "x", to: "c", kind: "fade" },
        solid("c", "d"),
        { from: "b", to: "x", kind: "fade" },
      ],
      [
        { label: "head", target: "a", color: C.done },
        { label: "p", target: "b", color: C.active },
        { label: "q", target: "x", color: C.warn },
      ]
    ),
    f(
      "free(q) 释放 x，删除完成：a→b→c→d。考试里若用「前驱」表述，想想双链表怎么删——找前驱不用回头走，O(1) 即可定位。",
      "删除完成",
      [
        ...NODES.map((id) => n(id, baseX(id), id === "b" ? "done" : "normal")),
        n("x", 233, "dead", 28),
      ],
      [
        solid("a", "b"),
        solid("b", "c"),
        solid("c", "d"),
      ],
      [{ label: "head", target: "a", color: C.done }]
    ),
  ];
}

const ARROW_STYLE: Record<Arrow["kind"], { color: string; dash?: string; opacity: number; width: number }> = {
  solid: { color: C.line, opacity: 1, width: 1.6 },
  ghost: { color: C.line, dash: "5 4", opacity: 0.9, width: 1.6 },
  new: { color: C.bad, opacity: 1, width: 2.2 },
  fade: { color: C.line, dash: "3 5", opacity: 0.35, width: 1.2 },
};

const FILL: Record<Node2["state"], string> = {
  normal: C.node,
  active: C.active,
  new: "#eff6ff",
  warn: C.warn,
  dead: "#cbd5e1",
  done: C.done,
};
const TEXT: Record<Node2["state"], string> = {
  normal: C.nodeText,
  active: C.activeText,
  new: "#1d4ed8",
  warn: C.warnText,
  dead: "#94a3b8",
  done: C.doneText,
};

export function LinkedListView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      <svg viewBox="0 0 560 218" className="w-full">
        <defs>
          <marker id="ll-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill={C.line} />
          </marker>
          <marker id="ll-arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill={C.bad} />
          </marker>
        </defs>
        {fr.arrows.map((a, i) => {
          const from = fr.nodes.find((x) => x.id === a.from)!;
          const to = fr.nodes.find((x) => x.id === a.to)!;
          if (!from || !to) return null;
          const st = ARROW_STYLE[a.kind];
          // 同排：右缘→左缘；向上（指向新结点 x）：上缘→右缘；向下（x 接回主链）：右缘→左缘
          const sameRow = from.y === to.y;
          const goingUp = to.y < from.y;
          const sx = sameRow ? from.x + W / 2 + 4 : goingUp ? from.x : from.x + W / 2;
          const sy = sameRow ? from.y : goingUp ? from.y - H / 2 - 2 : from.y;
          const x2 = goingUp ? to.x + W / 2 + 8 : to.x - W / 2 - 8;
          const y2 = sameRow ? from.y : to.y;
          const mid = (sx + x2) / 2;
          const d = sameRow
            ? `M${sx},${sy} L${x2},${y2}`
            : `M${sx},${sy} C${mid},${sy} ${mid},${y2} ${x2},${y2}`;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={st.color}
              strokeWidth={st.width}
              strokeDasharray={st.dash}
              opacity={st.opacity}
              markerEnd={a.kind === "new" ? "url(#ll-arrow-red)" : "url(#ll-arrow)"}
            />
          );
        })}
        {fr.nodes.map((nd) => {
          const dead = nd.state === "dead";
          return (
            <g key={nd.id} opacity={dead ? 0.45 : 1}>
              <rect
                x={nd.x - W / 2}
                y={nd.y - H / 2}
                width={W}
                height={H}
                rx={8}
                fill={FILL[nd.state]}
                stroke={nd.state === "new" ? "#3b82f6" : "#94a3b8"}
                strokeWidth={nd.state === "new" ? 1.5 : 1}
                strokeDasharray={nd.state === "new" ? "5 3" : undefined}
              />
              <text
                x={nd.x}
                y={nd.y + 5}
                textAnchor="middle"
                fontSize={15}
                fontWeight={600}
                fill={TEXT[nd.state]}
              >
                {nd.label}
              </text>
            </g>
          );
        })}
        {fr.ptrs.map((pt, i) => {
          const t = fr.nodes.find((x) => x.id === pt.target)!;
          const px = t.x;
          const py = t.y + H / 2 + 14 + i * 34;
          return (
            <g key={pt.label}>
              <path
                d={`M${px},${py} L${px},${t.y + H / 2 + 6}`}
                stroke={pt.color}
                strokeWidth={1.6}
                fill="none"
              />
              <path d={`M${px - 4},${py - 6} L${px + 4},${py - 6} L${px},${py} z`} fill={pt.color} />
              <text x={px + 6} y={py + 4} fontSize={12} fill={pt.color} fontWeight={600}>
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
