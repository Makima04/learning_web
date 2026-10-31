import type { StudySnapshotDTO } from "@/lib/api";
import { scopedKey } from "@/lib/storageScope";

export type ImportData = Pick<StudySnapshotDTO,"cards"|"events"|"meta">;
type Receipt = { data: string; snapshot: StudySnapshotDTO };
type Reply = { ok: boolean; duplicate?: boolean };

/** 旧队列仍保留原始内容；迁移凭据先持久化，网络失败重试复用同一操作 ID。 */
export async function submitImport(data: ImportData, transport: (snapshot:StudySnapshotDTO) => Promise<Reply>): Promise<Reply> {
  const kind = data.cards ? "cards" : data.events ? "events" : "meta";
  const key = scopedKey(`ew.sync.importReceipt.${kind}.v2`);
  const serialized = JSON.stringify(data);
  let previous: Receipt | null = null;
  const raw = localStorage.getItem(key);
  if (raw) {
    try { previous = JSON.parse(raw) as Receipt; }
    catch { throw new Error("进度迁移凭据损坏，请保留浏览器数据并联系管理员"); }
  }
  const receipt: Receipt = previous?.data === serialized ? previous : {
    data: serialized,
    snapshot: {
      ...data,
      operation_id: globalThis.crypto?.randomUUID?.() ?? `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      client_at: Date.now(),
    },
  };
  const saved = JSON.stringify(receipt);
  localStorage.setItem(key,saved);
  const reply = await transport(receipt.snapshot);
  if (reply?.ok !== true) throw new Error("服务端尚未确认进度迁移，请稍后重试");
  // 只有原始队列完成 ACK 清理后才能安全删凭据；这里保留最近一次收据，避免确认期间崩溃重放。
  return reply;
}
