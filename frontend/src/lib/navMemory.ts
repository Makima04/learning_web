// 主导航「分区上次路径」：离开子页再点回该导航时，回到上次浏览处而非一级首页。

export interface NavSection {
  /** 与 NAV 项 to 对齐的主键 */
  id: string;
  /** 分区根路径（无记忆时的默认 to） */
  root: string;
  match: (pathname: string) => boolean;
}

/** 主导航分区（含其下子路由） */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "/",
    root: "/",
    match: (p) => p === "/" || p === "/study" || p === "/today",
  },
  {
    id: "/kg",
    root: "/kg",
    match: (p) => p === "/kg" || p.startsWith("/kg/"),
  },
  {
    id: "/journal",
    root: "/journal",
    match: (p) => p === "/journal" || p.startsWith("/journal/"),
  },
  {
    id: "/papers",
    root: "/papers",
    // 阅读器 + 选卷层级（注意勿吞 /papers-recite）
    match: (p) =>
      p === "/papers" ||
      p.startsWith("/papers/") ||
      p === "/reader" ||
      p.startsWith("/reader/"),
  },
  {
    id: "/papers-recite",
    root: "/papers-recite",
    match: (p) => p === "/papers-recite" || p.startsWith("/papers-recite/"),
  },
  {
    id: "/transmgr",
    root: "/transmgr",
    match: (p) => p === "/transmgr" || p.startsWith("/transmgr/"),
  },
  {
    id: "/settings",
    root: "/settings",
    match: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
];

const STORAGE_KEY = "ew.nav.memory.v1";

type MemoryMap = Record<string, string>;

function load(): MemoryMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MemoryMap;
  } catch {
    return {};
  }
}

function save(map: MemoryMap) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function sectionForPath(pathname: string): NavSection | undefined {
  // 更长/更具体的分区优先（避免 / 吃掉一切）
  const ranked = [...NAV_SECTIONS].sort(
    (a, b) => b.root.length - a.root.length || b.id.length - a.id.length
  );
  return ranked.find((s) => s.match(pathname));
}

/** 记录当前 URL 到所属分区（pathname + search） */
export function rememberNavPath(pathname: string, search = "") {
  const section = sectionForPath(pathname);
  if (!section) return;
  const full = pathname + (search || "");
  const map = load();
  if (map[section.id] === full) return;
  map[section.id] = full;
  save(map);
}

/**
 * 某导航项应跳转的地址：有合法记忆则用记忆，否则用 root。
 * @param root 导航配置的 to
 */
export function hrefForNavRoot(root: string): string {
  const section = NAV_SECTIONS.find((s) => s.id === root || s.root === root);
  if (!section) return root;
  const mem = load()[section.id];
  if (!mem) return section.root;
  const pathOnly = mem.split("?")[0] || "";
  if (!section.match(pathOnly)) return section.root;
  return mem;
}

/** 当前路径是否属于该导航分区（用于高亮，而非仅匹配 to） */
export function isNavSectionActive(root: string, pathname: string): boolean {
  const section = NAV_SECTIONS.find((s) => s.id === root || s.root === root);
  if (!section) return pathname === root;
  return section.match(pathname);
}
