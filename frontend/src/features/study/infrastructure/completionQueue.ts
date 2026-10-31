// 每条学习命令单独持久化，避免多个标签页读改写同一个队列对象时互相覆盖。
// 并发重复上传由服务端 operation_id 去重；确认后才删除对应原始内容。
import * as api from "@/lib/api";
import type { StudyCompletionDTO } from "@/lib/api";
import { scopedKey, stillInScope } from "@/lib/storageScope";

function keys(): string[] {
  if (typeof localStorage === "undefined") return [];
  const prefix = `${scopedKey("ew.sync.pending.completions.v1")}:`;
  const found: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) found.push(key);
  }
  return found;
}

export function hasPendingCompletions(): boolean { return keys().length > 0; }

export function clearPendingCompletions() {
  for (const key of keys()) localStorage.removeItem(key);
}

export function saveCompletion(command: StudyCompletionDTO) {
  const key = `${scopedKey("ew.sync.pending.completions.v1")}:${command.operation_id}`;
  const serialized = JSON.stringify(command);
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing !== serialized) throw new Error("operation_id conflict");
    localStorage.setItem(key, serialized);
  } catch {
    throw new Error("学习记录保存失败，请释放浏览器存储空间后重试");
  }
}

export function pendingCompletionWordIds(): Set<number> {
  return new Set(keys().flatMap((key) => {
    const serialized = localStorage.getItem(key);
    return serialized ? [(JSON.parse(serialized) as StudyCompletionDTO).word_idx] : [];
  }));
}

export async function flushCompletions(epoch: number): Promise<string | null> {
  try {
    const entries = keys().map((key) => {
      const serialized = localStorage.getItem(key);
      return serialized ? { key, serialized, command: JSON.parse(serialized) as StudyCompletionDTO } : null;
    }).filter((entry) => entry !== null).sort((a,b) => a.command.client_at - b.command.client_at);
    for (let i = 0; i < entries.length; i += 200) {
      if (!stillInScope(epoch) || !api.isLoggedIn()) return null;
      const chunk = entries.slice(i, i + 200);
      const response = await api.postStudyCompletions(chunk.map((entry) => entry.command));
      if (!stillInScope(epoch) || !api.isLoggedIn()) return null;
      if (response?.ok !== true) throw new Error("服务端未确认学习记录，请稍后重试");
      for (const entry of chunk) {
        if (localStorage.getItem(entry.key) === entry.serialized) localStorage.removeItem(entry.key);
      }
    }
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
