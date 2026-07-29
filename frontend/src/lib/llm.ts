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

export async function translate(text: string): Promise<string> {
  text = String(text ?? "").trim();
  if (!text) return "";
  // 单词语等非例句：不请求后端
  if (text.length < 12 && !/\s/.test(text)) {
    throw new Error("仅支持例句翻译");
  }
  const cached = useTrans.getState().getTrans(text);
  if (cached !== undefined) return cached;
  try {
    const r = await api.translateByText(text);
    if (r && r.status === "ok" && r.zh) {
      useTrans.getState().setTrans(text, r.zh);
      return r.zh;
    }
    if (r && r.status === "unconfigured") {
      throw new Error("未配置 LLM(服务端)");
    }
    throw new Error((r && r.zh) || "翻译失败");
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      throw new Error("请登录后翻译新例句（已缓存译文仍可匿名读取）");
    }
    throw e;
  }
}
