import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ReviewBlocks } from "@/components/ReviewBlocks";
import {
  FILE_KNOWLEDGE_NODES,
  FILE_KNOWLEDGE_SECTIONS,
  flattenTreeIds,
  sectionNodeIds,
  type FileKnowledgeId,
  type FileKnowledgeNode,
  type FileKnowledgeSection,
  type FileKnowledgeTreeItem,
} from "@/data/kg/cs408FileKnowledge";
import { cn } from "@/lib/utils";
import "@/styles/cs408FileKnowledge.css";

type SectionHref = (section: string, node?: FileKnowledgeId) => string;

interface NodeBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: number;
  y: number;
}

interface PositionedEdge {
  from: FileKnowledgeId;
  to: FileKnowledgeId;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
}

function positionEdge(
  [from, to, label]: FileKnowledgeSection["edges"][number],
  source: NodeBox,
  target: NodeBox,
  width: number,
): PositionedEdge {
  const gap = 7;
  if (Math.abs(target.x - source.x) > Math.abs(target.y - source.y)) {
    const rightward = target.x > source.x;
    const x1 = rightward ? source.right + gap : source.left - gap;
    const x2 = rightward ? target.left - gap : target.right + gap;
    return {
      from, to, label, x1, x2, y1: source.y, y2: target.y,
      labelX: (x1 + x2) / 2, labelY: Math.min(source.top, target.top) - 5, anchor: "middle",
    };
  }

  const downward = target.y > source.y;
  const y1 = downward ? source.bottom + gap : source.top - gap;
  const y2 = downward ? target.top - gap : target.bottom + gap;
  const labelOnLeft = source.x > width * 0.67;
  return {
    from, to, label, x1: source.x, x2: target.x, y1, y2,
    labelX: source.x + (labelOnLeft ? -11 : 11), labelY: (y1 + y2) / 2 - 6,
    anchor: labelOnLeft ? "end" : "start",
  };
}

function KnowledgeGraph({ section, selected, onSelect }: {
  section: FileKnowledgeSection;
  selected: FileKnowledgeId | null;
  onSelect: (node: FileKnowledgeId | null) => void;
}) {
  const graph = useRef<HTMLDivElement>(null);
  const markerId = `knowledge-arrow-${useId().replace(/:/g, "")}`;
  const [edges, setEdges] = useState<PositionedEdge[]>([]);
  const hasGraphSelection = section.graph.some(([node]) => node === selected);

  useLayoutEffect(() => {
    const element = graph.current;
    if (!element) return;
    const nodes = Array.from(element.querySelectorAll<HTMLButtonElement>("[data-file-node]"));

    function draw() {
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const boxes = new Map(nodes.map(node => {
        const rect = node.getBoundingClientRect();
        const left = rect.left - bounds.left;
        const top = rect.top - bounds.top;
        return [node.dataset.fileNode, {
          left, top, right: left + rect.width, bottom: top + rect.height,
          x: left + rect.width / 2, y: top + rect.height / 2,
        }] as const;
      }));
      setEdges(section.edges.flatMap(edge => {
        const source = boxes.get(edge[0]);
        const target = boxes.get(edge[1]);
        return source && target ? [positionEdge(edge, source, target, bounds.width)] : [];
      }));
    }

    const observer = new ResizeObserver(draw);
    observer.observe(element);
    for (const node of nodes) observer.observe(node);
    draw();
    return () => observer.disconnect();
  }, [section]);

  return (
    <div className="cfk-graph-shell">
      <div className="cfk-graph" ref={graph} role="group" aria-label="知识关系图">
        <svg className="cfk-lines" aria-hidden="true">
          <defs>
            {(["normal", "active", "muted"] as const).map(mode => (
              <marker key={mode} id={`${markerId}-${mode}`} orient="auto" markerUnits="userSpaceOnUse"
                refX="8" refY="5" markerWidth="10" markerHeight="10">
                <path d="M1 1L8 5 1 9" fill="none" strokeLinecap="round" strokeLinejoin="round"
                  className={`cfk-edge-${mode}`} />
              </marker>
            ))}
          </defs>
          {edges.map(edge => {
            const related = selected === edge.from || selected === edge.to;
            const mode = related ? "active" : hasGraphSelection ? "muted" : "normal";
            return (
              <g key={`${edge.from}-${edge.to}`} className={`cfk-edge-${mode}`}>
                <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} markerEnd={`url(#${markerId}-${mode})`} />
                <text x={edge.labelX} y={edge.labelY} textAnchor={edge.anchor}>{edge.label}</text>
              </g>
            );
          })}
        </svg>
        {section.graph.map(([id, row, column]) => (
          <button key={id} type="button" className="cfk-node" data-file-node={id} aria-pressed={selected === id}
            style={{ "--node-row": row, "--node-column": column } as CSSProperties}
            onClick={() => onSelect(selected === id ? null : id)}>
            {FILE_KNOWLEDGE_NODES[id].title}
          </button>
        ))}
        <ul className="sr-only">
          {section.edges.map(([from, to, label]) => (
            <li key={`${from}-${to}`}>{FILE_KNOWLEDGE_NODES[from].title} · {label} · {FILE_KNOWLEDGE_NODES[to].title}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KnowledgeTreeList({ items, depth = 0, selected, onSelect, hrefFor, navState }: {
  items: readonly FileKnowledgeTreeItem[];
  depth?: number;
  selected: FileKnowledgeId | null;
  onSelect: (node: FileKnowledgeId) => void;
  hrefFor: SectionHref;
  navState: unknown;
}) {
  return (
    <ul className={cn("cfk-tree", depth > 0 && "cfk-tree-nested")}>
      {items.map(item => {
        const node: FileKnowledgeNode = FILE_KNOWLEDGE_NODES[item.id];
        const targetSection = item.detailSection
          ? FILE_KNOWLEDGE_SECTIONS.find(sec => sec.id === item.detailSection)
          : undefined;
        return (
          <li key={`${depth}-${item.id}`} className={cn("cfk-tree-item", selected === item.id && "is-selected")}>
            <div className="cfk-tree-head">
              <button type="button" className="cfk-tree-title" onClick={() => onSelect(item.id)}>
                {node.title}
              </button>
              {item.tag && <span className="cfk-tree-tag">{item.tag}</span>}
              {targetSection && (
                <Link to={hrefFor(targetSection.id, item.id)} replace state={navState} className="cfk-tree-jump">
                  详看「{targetSection.title}」→
                </Link>
              )}
            </div>
            <div className="cfk-tree-body">
              <ReviewBlocks blocks={node.content} />
              {node.examTip && (
                <p className="cfk-exam-tip"><span>常考/易错</span>{node.examTip}</p>
              )}
            </div>
            {item.children && item.children.length > 0 && (
              <KnowledgeTreeList
                items={item.children}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
                hrefFor={hrefFor}
                navState={navState}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Cs408FileKnowledge({ section, initialNode, backHref, hrefFor }: {
  section: FileKnowledgeSection;
  initialNode: string | null;
  backHref: string;
  hrefFor: SectionHref;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<FileKnowledgeId | null>(() =>
    sectionNodeIds(section).find(id => id === initialNode) ?? null
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(section.groups.map(group => [group.title, true]))
  );

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  function returnToPractice(event: MouseEvent<HTMLAnchorElement>) {
    if (location.state?.openedFileKnowledge && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      navigate(-1);
    }
  }

  const currentNode: FileKnowledgeNode | null = selected ? FILE_KNOWLEDGE_NODES[selected] : null;
  const relatedSections = selected ? FILE_KNOWLEDGE_SECTIONS.filter(other =>
    other.id !== section.id && sectionNodeIds(other).includes(selected)
  ) : [];
  const allGroupsOpen = section.groups.every(group => Boolean(openGroups[group.title]));

  function toggleAllGroups() {
    const next = !allGroupsOpen;
    setOpenGroups(Object.fromEntries(section.groups.map(group => [group.title, next])));
  }

  return (
    <div className="mh-layout">
      <aside className="mh-toc">
        <Link to={backHref} replace onClick={returnToPractice} className="mh-toc-back">← 返回练题</Link>
        <p className="mh-toc-title">文件管理</p>
        <div className="mh-toc-label">小节知识点</div>
        <nav className="mh-scene-nav" aria-label="文件管理知识点导航">
          {FILE_KNOWLEDGE_SECTIONS.map(item => (
            <Link key={item.id} to={hrefFor(item.id)} replace state={location.state} aria-current={item.id === section.id ? "page" : undefined}
              className={cn("mh-scene-item", item.id === section.id && "is-active")}>
              {item.title}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="mh-main cfk-content">
        <div className="mh-mobile-bar cfk-mobile">
          <Link to={backHref} replace onClick={returnToPractice} className="mh-toc-back">← 返回练题</Link>
          <details>
            <summary>切换小节</summary>
            <nav aria-label="文件管理知识点导航">
              {FILE_KNOWLEDGE_SECTIONS.map(item => (
                <Link key={item.id} to={hrefFor(item.id)} replace state={location.state} aria-current={item.id === section.id ? "page" : undefined}>
                  {item.title}
                </Link>
              ))}
            </nav>
          </details>
        </div>
        <section aria-labelledby="file-knowledge-title">
          <h2 id="file-knowledge-title" ref={heading} tabIndex={-1} className="mh-stage-title outline-none">{section.title}</h2>
          <p className="cfk-opening">{section.opening}</p>
          <KnowledgeGraph section={section} selected={selected} onSelect={setSelected} />
          <div className="cfk-node-detail" role="status" aria-label="知识节点说明">
            {currentNode && selected ? (
              <>
                <h3>{currentNode.title}</h3>
                <ReviewBlocks blocks={currentNode.content} />
                {currentNode.examTip && (
                  <p className="cfk-exam-tip"><span>常考/易错</span>{currentNode.examTip}</p>
                )}
                {relatedSections.length > 0 && (
                  <div className="cfk-related">
                    <span>也可在这些小节查看</span>
                    {relatedSections.map(other => (
                      <Link key={other.id} to={hrefFor(other.id, selected)} replace state={location.state}>{other.title}</Link>
                    ))}
                  </div>
                )}
              </>
            ) : <p>点上图或下方知识树中的节点，查看定义、高频公式和相邻关系。</p>}
          </div>
        </section>

        <section className="cfk-checklist" aria-labelledby="file-knowledge-checklist">
          <div className="cfk-checklist-head">
            <h3 id="file-knowledge-checklist">分类与知识树</h3>
            <button type="button" className="cfk-toggle-all" onClick={toggleAllGroups}>
              {allGroupsOpen ? "全部收起" : "全部展开"}
            </button>
          </div>
          {section.groups.map(group => {
            const count = flattenTreeIds(group.items).length;
            return (
              <details key={group.title} open={Boolean(openGroups[group.title])}
                onToggle={event => {
                  const isOpen = event.currentTarget.open;
                  setOpenGroups(current => current[group.title] === isOpen ? current : { ...current, [group.title]: isOpen });
                }}>
                <summary>
                  {group.title}
                  {group.subtitle && <em className="cfk-group-sub">{group.subtitle}</em>}
                  <span>{count} 项</span>
                </summary>
                <KnowledgeTreeList
                  items={group.items}
                  selected={selected}
                  onSelect={id => setSelected(id)}
                  hrefFor={hrefFor}
                  navState={location.state}
                />
              </details>
            );
          })}
        </section>

        {section.comparison && (
          <section className="cfk-compare" aria-labelledby="file-knowledge-compare">
            <h3 id="file-knowledge-compare">{section.comparison.title}</h3>
            <div className="cfk-compare-wrap">
              <table>
                <thead>
                  <tr>
                    {section.comparison.headers.map(header => <th key={header} scope="col">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {section.comparison.rows.map((row, idx) => (
                    <tr key={idx}>
                      {row.map((cell, col) => <td key={col}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
