import { describe, expect, it } from "vitest";
import { CS408_BOOKS } from "@/data/kg/cs408";
import { FILE_KNOWLEDGE_NODES, FILE_KNOWLEDGE_SECTIONS, sectionNodeIds } from "@/data/kg/cs408FileKnowledge";

describe("408 文件管理知识点", () => {
  it("为文件管理每个小节提供入口和对应的知识树", () => {
    const chapter = CS408_BOOKS.find(book => book.id === "os")?.modules.find(module => module.id === "os-file");
    expect(FILE_KNOWLEDGE_SECTIONS.map(section => [section.id, section.title]))
      .toEqual(chapter?.kps.map(kp => [kp.id, kp.name]));

    const allChecklistNodes = new Set(FILE_KNOWLEDGE_SECTIONS.flatMap(section => sectionNodeIds(section)));
    expect([...allChecklistNodes].sort()).toEqual(Object.keys(FILE_KNOWLEDGE_NODES).sort());
  });

  it("图上的节点在本节知识树有说明，连线的两端有相邻节点", () => {
    for (const section of FILE_KNOWLEDGE_SECTIONS) {
      const positions = new Map(section.graph.map(([id, row, column]) => [id, { row, column }]));
      const checklist = new Set(sectionNodeIds(section));
      expect(new Set(section.graph.map(([, row, column]) => `${row},${column}`)).size).toBe(section.graph.length);
      for (const [id] of section.graph) expect(checklist.has(id), section.id).toBe(true);
      for (const [source, target] of section.edges) {
        const a = positions.get(source);
        const b = positions.get(target);
        expect(a && b && Math.abs(a.row - b.row) + Math.abs(a.column - b.column), `${section.id} ${source} → ${target}`).toBe(1);
      }
    }
  });
});
