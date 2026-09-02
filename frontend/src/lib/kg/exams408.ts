// 408 历年真题：从 /cs408/*.json 懒加载（由 scripts/gen_cs408_frontend.py 生成）

export type ExamKind = "mcq" | "big";

export interface ExamKpRef {
  id: string;
  role?: "primary" | "secondary" | string;
  confidence?: number;
}

export interface ExamItem {
  n: number;
  kind: ExamKind | string;
  book: string;
  book_name?: string;
  points?: number;
  stem: string;
  options?: Record<string, string> | null;
  kps: ExamKpRef[];
  answer?: string | null;
}

export interface ExamPaper {
  year: number;
  subject: string;
  title: string;
  counts: { total: number; mcq: number; big: number };
  items: ExamItem[];
}

export interface ExamIndexPaper {
  year: number;
  file: string;
  total: number;
  mcq: number;
  big: number;
}

export interface ExamIndex {
  subject: string;
  years: number[];
  paper_count: number;
  papers: ExamIndexPaper[];
  notes?: string;
}

const indexCache: { value?: ExamIndex; promise?: Promise<ExamIndex> } = {};
const paperCache = new Map<number, ExamPaper>();
const paperPromises = new Map<number, Promise<ExamPaper>>();

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`加载失败 ${url} (${r.status})`);
  return (await r.json()) as T;
}

export function loadCs408ExamIndex(): Promise<ExamIndex> {
  if (indexCache.value) return Promise.resolve(indexCache.value);
  if (!indexCache.promise) {
    indexCache.promise = fetchJson<ExamIndex>("/cs408/index.json").then((v) => {
      indexCache.value = v;
      return v;
    });
  }
  return indexCache.promise;
}

export function loadCs408ExamPapers(years: number[]): Promise<ExamPaper[]> {
  return Promise.all(years.map((y) => loadCs408ExamPaper(y)));
}

export function loadCs408ExamPaper(year: number): Promise<ExamPaper> {
  const cached = paperCache.get(year);
  if (cached) return Promise.resolve(cached);
  let p = paperPromises.get(year);
  if (!p) {
    p = fetchJson<ExamPaper>(`/cs408/${year}.json`).then((v) => {
      paperCache.set(year, v);
      paperPromises.delete(year);
      return v;
    });
    paperPromises.set(year, p);
  }
  return p;
}

/** 稳定 itemId，用于进度标记跨设备 */
export function examItemId(year: number, n: number): string {
  return `cs408-${year}-q${n}`;
}

export function primaryKpId(item: ExamItem): string | null {
  const primary = item.kps.find((k) => k.role === "primary");
  return primary?.id ?? item.kps[0]?.id ?? null;
}

export function secondaryKpIds(item: ExamItem): string[] {
  const prim = primaryKpId(item);
  return item.kps.map((k) => k.id).filter((id) => id && id !== prim);
}
