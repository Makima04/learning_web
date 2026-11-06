// llm helper —— 例句翻译：本地 trans 缓存 → 服务端共用 translations 表。
// 仅例句（足够长、像句子）会触发 LLM；已译永不重翻。
// 服务端：缓存可读；未命中缓存需登录才调 LLM。
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useTrans } from "@/stores/trans";

export function isConfigured(): boolean {
  // 后端语义：key 收归服务端；未配置时返 status='unconfigured'。
  return true;
}

/**
 * 上游中转网关偶尔丢掉 system 提示词，模型会把原句当成「用户贴了段引文」，
 * 返回英文分析/反问。这类内容一旦进 localStorage 或 translations 表就再也不会重翻，
 * 所以读缓存、写缓存、接收响应三处都要挡住。
 */
export function isChineseTranslation(zh: string): boolean {
  const s = (zh || "").trim();
  if (!s) return false;
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  return han >= 2 && han * 10 >= Array.from(s).length;
}

export async function translate(text: string): Promise<string> {
  text = String(text ?? "").trim();
  if (!text) return "";
  // 单词语等非例句：不请求后端
  if (text.length < 12 && !/\s/.test(text)) {
    throw new Error("仅支持例句翻译");
  }
  const cached = useTrans.getState().getTrans(text);
  if (cached !== undefined && isChineseTranslation(cached)) return cached;
  try {
    const r = await api.translateByText(text);
    if (r && r.status === "ok" && isChineseTranslation(r.zh || "")) {
      useTrans.getState().setTrans(text, r.zh);
      return r.zh;
    }
    if (r && r.status === "unconfigured") {
      throw new Error("未配置 LLM(服务端)");
    }
    if (r && r.status === "ok") {
      throw new Error("译文内容异常（返回的不是中文），请稍后重试");
    }
    throw new Error((r && r.zh) || "翻译失败");
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      throw new Error("请登录后翻译新例句（已缓存译文仍可匿名读取）");
    }
    throw e;
  }
}
