// 408 历年真题：从 /cs408/*.json 懒加载（由 scripts/gen_cs408_frontend.py 生成）

export type ExamKind = "mcq" | "big";

export interface ExamKpRef {
  id: string;
  role?: "primary" | "secondary" | string;
  confidence?: number;
}

export interface ExamAnswerMeta {
  method?: string;
  quality?: string;
  note?: string | null;
  /** 源答案页只有答案键、无逐题解析时，提供原页扫描图供校对 */
  page_images?: string[];
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
  explanation?: string | null;
  answer_meta?: ExamAnswerMeta | null;
}

/** 每套卷的版本与数据质量（由 gen_cs408_frontend.py 写入，勿手改） */
export interface ExamPaperMeta {
  edition: "recall" | "compilation" | "rebuild" | string;
  edition_label: string;
  quality: "ok" | "needs_review" | string;
  confidence: "high" | "medium" | "low" | string;
  annotation: "llm" | "rules" | string;
  excluded_from_stats: boolean;
  source_url?: string | null;
  source_note?: string | null;
  warning?: string;
  verification?: {
    source_url?: string;
    checked_at?: string;
    status?: string;
    answer_key_match?: string;
    official_pdf?: boolean;
    scope?: string;
    residual_risk?: string;
    promote_when?: string;
  } | null;
  answer_keys: number;
  explanations: number;
  page_images: number;
}

export interface ExamPaper {
  year: number;
  subject: string;
  title: string;
  counts: { total: number; mcq: number; big: number };
  meta?: ExamPaperMeta;
  items: ExamItem[];
}

export interface ExamIndexPaper extends Partial<ExamPaperMeta> {
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
  /** 与 scripts/gen_cs408_frontend.py 的 DATA_VER 保持一致 */
  data_ver?: string;
  notes?: string;
}

const indexCache: { value?: ExamIndex; promise?: Promise<ExamIndex> } = {};
const paperCache = new Map<number, ExamPaper>();
const paperPromises = new Map<number, Promise<ExamPaper>>();

// 题库结构或内容变更后需同步 gen_cs408_frontend.py 的 DATA_VER，
// 查询串用于绕过浏览器对 /cs408/*.json 的旧缓存。
export const CS408_DATA_VER = "20261106b";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(`${url}?v=${CS408_DATA_VER}`);
  if (!r.ok) throw new Error(`加载失败 ${url} (${r.status})`);
  return (await r.json()) as T;
}

export function loadCs408ExamIndex(): Promise<ExamIndex> {
  if (indexCache.value) return Promise.resolve(indexCache.value);
  if (!indexCache.promise) {
    indexCache.promise = fetchJson<ExamIndex>("/cs408/index.json")
      .then((v) => {
        indexCache.value = v;
        return v;
      })
      // 失败不能把 rejected promise 留在缓存里，否则「重试」永远拿到同一次失败
      .catch((e: unknown) => {
        indexCache.promise = undefined;
        throw e;
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
    p = fetchJson<ExamPaper>(`/cs408/${year}.json`)
      .then((v) => {
        paperCache.set(year, v);
        paperPromises.delete(year);
        return v;
      })
      // 同上：失败后清掉 in-flight 记录，重试才会真正重新发请求
      .catch((e: unknown) => {
        paperPromises.delete(year);
        throw e;
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
