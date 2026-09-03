// 李林 880 + 张宇 1000：index 计数，章节分片按需加载（与王道同一套 PracticeItem）。
import { useEffect, useState } from "react";
import {
  loadCatalogIndex,
  loadCatalogShard,
  PRACTICE_CATALOG_VER,
  type CatalogWhich,
} from "@/lib/kg/catalogLoad";
import { useWangdao408, type WangdaoItem } from "@/lib/kg/wangdao408";
import type { BookDrillSpec } from "@/lib/kg/mathBookToc";

export const MATH_CATALOG_VER = PRACTICE_CATALOG_VER;

const cache: {
  ver?: string;
  value?: WangdaoItem[];
  promise?: Promise<WangdaoItem[]>;
} = {};

export function loadMathPractice(): Promise<WangdaoItem[]> {
  if (cache.ver === MATH_CATALOG_VER && cache.value) return Promise.resolve(cache.value);
  if (cache.ver === MATH_CATALOG_VER && cache.promise) return cache.promise;
  cache.ver = MATH_CATALOG_VER;
  cache.value = undefined;
  cache.promise = Promise.all([
    loadCatalogIndex("lilin880"),
    loadCatalogIndex("zhangyu1000"),
  ])
    .then(([a, b]) => {
      cache.value = [...a, ...b];
      return cache.value;
    })
    .catch((err) => {
      cache.ver = undefined;
      cache.promise = undefined;
      throw err;
    });
  return cache.promise;
}

export async function loadMathChapter(spec: {
  source: MathBookSource;
  part: string;
  section: string;
}): Promise<WangdaoItem[]> {
  const key = `${spec.part}-${spec.section}`;
  const shard = await loadCatalogShard(spec.source, key);
  if (shard.length) return shard;
  const all = await loadCatalogIndex(spec.source);
  return all.filter((q) => q.part === spec.part && String(q.section) === String(spec.section));
}

/** 按学科拉目录，避免刷数学还等王道整包。 */
export function useDrillCatalog(which: CatalogWhich = "all"): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const wd = useWangdao408({ enabled: which === "wangdao" || which === "all" });
  const math = useMathPractice({ enabled: which === "math" || which === "all" });
  if (which === "none") return { items: [], error: "" };
  if (which === "wangdao") return wd;
  if (which === "math") return math;
  const ready = wd.items !== null && math.items !== null;
  return {
    items: ready ? [...(wd.items ?? []), ...(math.items ?? [])] : null,
    error: wd.error || math.error,
  };
}

export function useMathPractice(opts?: { enabled?: boolean }): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const enabled = opts?.enabled !== false;
  const [items, setItems] = useState<WangdaoItem[] | null>(
    enabled ? (cache.value ?? null) : []
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setError("");
      return;
    }
    let cancelled = false;
    loadMathPractice()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载数学题目录失败");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { items, error };
}

export function useMathChapter(spec: BookDrillSpec | undefined): {
  items: WangdaoItem[] | null;
  error: string;
} {
  const [items, setItems] = useState<WangdaoItem[] | null>(spec ? null : []);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!spec) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setItems(null);
    loadMathChapter(spec)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载章节题目失败");
      });
    return () => {
      cancelled = true;
    };
  }, [spec?.source, spec?.part, spec?.section]);
  return { items, error };
}

export type MathBookSource = "lilin880" | "zhangyu1000";

export const MATH_BOOK_SOURCES: {
  id: MathBookSource;
  label: string;
}[] = [
  { id: "lilin880", label: "李林880" },
  { id: "zhangyu1000", label: "张宇1000" },
];

export function itemsForSource(
  items: WangdaoItem[],
  source: string | null | undefined
): WangdaoItem[] {
  if (!source) return items;
  return items.filter((q) => q.source === source);
}

export function mathBookLabel(source: string | null | undefined): string {
  if (source === "lilin880") return "李林880";
  if (source === "zhangyu1000") return "张宇1000";
  return "题目";
}

export function practiceSourceLabel(item: WangdaoItem): string {
  const part = item.part === "hard" ? "强化" : item.part === "base" ? "基础" : "";
  if (item.source === "lilin880") return part ? `李林880·${part}` : "李林880";
  if (item.source === "zhangyu1000") return part ? `张宇1000·${part}` : "张宇1000";
  return "王道";
}

export function practiceKindLabel(kind: string | undefined): string {
  if (kind === "fill") return "填空";
  if (kind === "big") return "大题";
  return "选择";
}

/** 题型细类：解析分类，不进图谱。 */
export const MATH_FACETS: { id: string; name: string }[] = [
  { id: "compute_gauss", name: "消元计算" },
  { id: "solvability", name: "有解判别" },
  { id: "nullspace", name: "齐次基础解系" },
  { id: "structure", name: "解的结构" },
  { id: "common_same", name: "公共解/同解" },
  { id: "matrix_eq", name: "矩阵方程" },
  { id: "geometry", name: "平面几何" },
  { id: "rank_adjoint", name: "伴随与秩" },
  { id: "vector_link", name: "向量组" },
  { id: "least_squares", name: "法方程" },
  { id: "proof", name: "证明" },
  { id: "rank_product", name: "乘积秩" },
  { id: "det_def", name: "行列式定义" },
  { id: "det_prop", name: "行列式性质" },
  { id: "det_compute", name: "行列式计算" },
  { id: "cramer", name: "克拉默法则" },
  { id: "cofactor", name: "余子式/展开" },
  { id: "adjoint_det", name: "伴随与行列式" },
  { id: "vandermonde", name: "范德蒙德" },
  { id: "block_det", name: "分块行列式" },
  { id: "rec_expand", name: "递推展开" },
  { id: "poly_coeff", name: "展开式系数" },
  { id: "eig_det", name: "用特征值求行列式" },
  { id: "calc_mixed", name: "夹微积分" },
  { id: "mat_ops", name: "矩阵运算" },
  { id: "elem_trans", name: "初等变换" },
  { id: "inverse", name: "求逆" },
  { id: "adjoint", name: "伴随矩阵" },
  { id: "block", name: "分块" },
  { id: "rank", name: "求秩" },
  { id: "rank_ineq", name: "秩等式/不等式" },
  { id: "poly_mat", name: "矩阵多项式" },
  { id: "mat_eq", name: "矩阵方程" },
  { id: "dep", name: "线性相关/无关" },
  { id: "max_ind", name: "极大无关组" },
  { id: "vector_rank", name: "向量组的秩" },
  { id: "equiv", name: "向量组等价" },
  { id: "represent", name: "线性表出" },
  { id: "basis", name: "基/维数/坐标" },
  { id: "transition", name: "过渡矩阵" },
  { id: "schmidt", name: "施密特正交化" },
  { id: "ortho_mat", name: "正交矩阵" },
  { id: "inner", name: "内积" },
  { id: "eigen_compute", name: "求特征值/向量" },
  { id: "eigen_prop", name: "特征值性质" },
  { id: "similar", name: "相似判定" },
  { id: "diagonalize", name: "可对角化" },
  { id: "real_sym", name: "实对称对角化" },
  { id: "cayley", name: "矩阵多项式/CH" },
  { id: "jordan", name: "若尔当/不能对角化" },
  { id: "recurrence", name: "递推与矩阵幂" },
  { id: "quad_matrix", name: "二次型矩阵" },
  { id: "complete_square", name: "配方法" },
  { id: "ortho_trans", name: "正交变换化标准形" },
  { id: "congruent", name: "合同" },
  { id: "inertia", name: "惯性定理/规范形" },
  { id: "pd", name: "正定判定" },
  { id: "pd_complete", name: "合同于单位阵" },
  { id: "quad_rank", name: "二次型的秩" },
  { id: "quadric", name: "二次曲面" },
  { id: "rayleigh", name: "瑞利商" },
  { id: "simultaneous", name: "同时标准化" },
  { id: "quad_eq", name: "二次型方程" },
  // 高数
  { id: "parity", name: "奇偶性" },
  { id: "period", name: "周期性" },
  { id: "bound", name: "有界性" },
  { id: "mono_fn", name: "函数单调" },
  { id: "suff_nec", name: "充要条件" },
  { id: "piecewise", name: "分段函数" },
  { id: "squeeze", name: "夹逼" },
  { id: "equiv_inf", name: "等价无穷小" },
  { id: "two_imp", name: "两个重要极限" },
  { id: "rationalize", name: "有理化" },
  { id: "seq_rec", name: "递推数列" },
  { id: "seq_mono", name: "单调有界数列" },
  { id: "stolz", name: "Stolz" },
  { id: "inf_order", name: "无穷小阶" },
  { id: "disc", name: "间断点" },
  { id: "cont_on", name: "区间连续" },
  { id: "zero_thm", name: "零点定理" },
  { id: "asymp_h", name: "水平渐近线" },
  { id: "asymp_v", name: "铅直渐近线" },
  { id: "asymp_ob", name: "斜渐近线" },
  { id: "eps_delta", name: "ε-δ 定义" },
  { id: "eps_n", name: "ε-N 定义" },
  { id: "der_def", name: "定义求导" },
  { id: "tangent", name: "切线法线" },
  { id: "one_sided", name: "单侧导数" },
  { id: "higher", name: "高阶导" },
  { id: "chain", name: "复合求导" },
  { id: "implicit_d", name: "隐函数求导" },
  { id: "param_d", name: "参数方程求导" },
  { id: "inverse_d", name: "反函数求导" },
  { id: "log_d", name: "对数求导" },
  { id: "leibniz", name: "莱布尼茨" },
  { id: "rolle", name: "罗尔定理" },
  { id: "lagrange", name: "拉格朗日中值" },
  { id: "cauchy", name: "柯西中值" },
  { id: "taylor_thm", name: "泰勒定理" },
  { id: "taylor_exp", name: "泰勒展开" },
  { id: "lhopital", name: "洛必达" },
  { id: "mono", name: "单调性" },
  { id: "extremum", name: "极值最值" },
  { id: "inflection", name: "拐点" },
  { id: "convex", name: "凹凸性" },
  { id: "sketch", name: "作图" },
  { id: "ineq_proof", name: "不等式证明" },
  { id: "eq_proof", name: "等式证明" },
  { id: "related_rate", name: "相关变化率" },
  { id: "riemann", name: "黎曼和" },
  { id: "var_limit", name: "变限积分" },
  { id: "fund_thm", name: "微积分基本定理" },
  { id: "indef", name: "不定积分" },
  { id: "subst", name: "换元" },
  { id: "parts", name: "分部积分" },
  { id: "rational", name: "有理函数积分" },
  { id: "trig_sub", name: "三角换元" },
  { id: "improper_inf", name: "无穷限反常" },
  { id: "improper_sing", name: "瑕积分" },
  { id: "area", name: "面积" },
  { id: "volume", name: "体积" },
  { id: "arc", name: "弧长" },
  { id: "surf_rev", name: "旋转侧面积" },
  { id: "centroid", name: "形心" },
  { id: "int_eq", name: "积分等式" },
  { id: "int_ineq", name: "积分不等式" },
  { id: "int_mvt", name: "积分中值" },
  { id: "phys_work", name: "功与压力" },
  { id: "dot", name: "数量积" },
  { id: "cross", name: "向量积" },
  { id: "mixed", name: "混合积" },
  { id: "plane_eq", name: "平面方程" },
  { id: "line_eq", name: "直线方程" },
  { id: "angle_dist", name: "夹角距离" },
  { id: "proj", name: "投影" },
  { id: "param_curve", name: "空间曲线" },
  { id: "partial", name: "偏导数" },
  { id: "total_diff", name: "全微分" },
  { id: "chain_m", name: "多元复合" },
  { id: "higher_m", name: "高阶偏导" },
  { id: "dir_grad", name: "方向导数梯度" },
  { id: "implicit_m", name: "隐函数定理" },
  { id: "tangent_pl", name: "切平面法线" },
  { id: "ext_free", name: "无条件极值" },
  { id: "lagrange_m", name: "条件极值" },
  { id: "dbl_rect", name: "直角坐标二重" },
  { id: "dbl_polar", name: "极坐标二重" },
  { id: "order", name: "换序" },
  { id: "jacobi", name: "雅可比换元" },
  { id: "tpl_cyl", name: "柱坐标三重" },
  { id: "tpl_sph", name: "球坐标三重" },
  { id: "mass", name: "质量" },
  { id: "centroid_m", name: "重积分形心" },
  { id: "inertia_m", name: "转动惯量" },
  { id: "sep", name: "可分离变量" },
  { id: "homog_ode", name: "齐次方程" },
  { id: "lin1", name: "一阶线性" },
  { id: "bernoulli", name: "伯努利方程" },
  { id: "const_coeff", name: "常系数线性" },
  { id: "undetermined", name: "待定特解" },
  { id: "reduce_order", name: "可降阶" },
  { id: "euler_ode", name: "欧拉方程" },
  { id: "ode_mix", name: "混合溶液" },
  { id: "ode_phys", name: "ODE 物理" },
  { id: "p_series", name: "p 级数" },
  { id: "ratio_root", name: "比值根值" },
  { id: "integral_test", name: "积分判别" },
  { id: "alt", name: "交错级数" },
  { id: "abs_cond", name: "绝对/条件收敛" },
  { id: "radius", name: "收敛半径" },
  { id: "expand", name: "幂级数展开" },
  { id: "termwise", name: "逐项微积" },
  { id: "sum_fn", name: "和函数" },
  { id: "fourier_cos", name: "余弦级数" },
  { id: "fourier_sin", name: "正弦级数" },
  { id: "line_ds", name: "对弧长" },
  { id: "line_coord", name: "对坐标" },
  { id: "green", name: "格林公式" },
  { id: "surf_dS", name: "对面积" },
  { id: "flux", name: "通量" },
  { id: "gauss", name: "高斯公式" },
  { id: "stokes", name: "斯托克斯" },
  { id: "conservative", name: "保守场" },
  { id: "curvature", name: "曲率" },
  { id: "comparison", name: "比较判别" },
  { id: "series_prop", name: "级数性质" },
  { id: "avg", name: "平均值" },
  { id: "telescoping", name: "裂项" },
  { id: "singularity", name: "奇点" },
  { id: "phys_pressure", name: "液体压力" },
  { id: "exact_ode", name: "恰当方程" },
  { id: "ode_geom", name: "ODE 几何" },
  { id: "shift", name: "平移" },
  { id: "symmetry", name: "对称性" },
  { id: "poly", name: "多项式" },
  { id: "multi_lim", name: "二元极限" },
  { id: "geom", name: "几何意义" },
  { id: "dbl_cmp", name: "二重估计" },
  { id: "abs_split", name: "绝对收敛拆分" },
  { id: "fourier_sum", name: "傅里叶求和" },
  { id: "close_path", name: "闭曲线" },
  { id: "dirichlet", name: "狄利克雷" },
  { id: "curl", name: "旋度" },
  // 概率
  { id: "classical", name: "古典概型" },
  { id: "geometric", name: "几何概型" },
  { id: "add_formula", name: "加法公式" },
  { id: "cond", name: "条件概率" },
  { id: "total", name: "全概率" },
  { id: "bayes", name: "贝叶斯" },
  { id: "indep_evt", name: "事件独立" },
  { id: "bern_trial", name: "独立重复试验" },
  { id: "cdf", name: "分布函数" },
  { id: "pmf", name: "分布律" },
  { id: "pdf", name: "密度" },
  { id: "binomial", name: "二项分布" },
  { id: "poisson", name: "泊松分布" },
  { id: "geo", name: "几何分布" },
  { id: "uniform", name: "均匀分布" },
  { id: "exp", name: "指数分布" },
  { id: "normal", name: "正态分布" },
  { id: "func_1d", name: "一维函数分布" },
  { id: "joint", name: "联合分布" },
  { id: "marginal", name: "边缘分布" },
  { id: "cond_dist", name: "条件分布" },
  { id: "indep_rv", name: "变量独立" },
  { id: "sum_conv", name: "和的分布" },
  { id: "maxmin", name: "最大最小" },
  { id: "jacobi_rv", name: "雅可比变换" },
  { id: "expect", name: "期望" },
  { id: "var", name: "方差" },
  { id: "cov", name: "协方差" },
  { id: "corr", name: "相关系数" },
  { id: "moment", name: "矩" },
  { id: "chebyshev", name: "切比雪夫" },
  { id: "lln", name: "大数定律" },
  { id: "clt", name: "中心极限" },
  { id: "de_moivre", name: "德莫佛-拉普拉斯" },
  { id: "sample", name: "样本统计量" },
  { id: "chi2", name: "χ² 分布" },
  { id: "t_dist", name: "t 分布" },
  { id: "f_dist", name: "F 分布" },
  { id: "moment_est", name: "矩估计" },
  { id: "mle", name: "极大似然" },
  { id: "unbiased", name: "无偏性" },
  { id: "interval", name: "区间估计" },
  { id: "hyp_test", name: "假设检验" },
];

const FACET_NAME = new Map(MATH_FACETS.map((f) => [f.id, f.name]));

export function mathFacetName(id: string): string {
  return FACET_NAME.get(id) ?? id;
}

export function mathFacetLabels(ids: string[] | undefined): { id: string; name: string }[] {
  return (ids || []).map((id) => ({ id, name: mathFacetName(id) }));
}
