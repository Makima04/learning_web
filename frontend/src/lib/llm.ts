// llm helper —— 翻译客户端，走后端 /api/translate（by text，无需 token）。
// 镜像 web/llm.js。译文缓存走 trans store。
import * as api from "@/lib/api";
import { useTrans } from "@/stores/trans";

export function isConfigured(): boolean {
  // 后端语义：key 收归服务端，on-card 翻译总会响应；未配置时返 status='unconfigured'。
  return true;
}

export async function translate(text: string): Promise<string> {
  text = String(text ?? "").trim();
  if (!text) return "";
  const cached = useTrans.getState().getTrans(text);
  if (cached !== undefined) return cached;
  const r = await api.translateByText(text);
  if (r && r.status === "ok" && r.zh) {
    useTrans.getState().setTrans(text, r.zh);
    return r.zh;
  }
  if (r && r.status === "unconfigured") {
    throw new Error("未配置 LLM(服务端)");
  }
  // status === 'error' 或其它：zh 存错误文本，抛错让 UI 显示重试
  throw new Error((r && r.zh) || "翻译失败");
}
