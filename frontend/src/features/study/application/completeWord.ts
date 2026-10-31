import { completeStudy } from "../domain/completion";
import { dayKey } from "@/lib/day";
import type { Card } from "@/lib/srs";
import { enqueueStudyCompletion } from "@/lib/syncQueue";
import { cardToDto, useCards } from "@/stores/cards";
import { useMeta } from "@/stores/meta";
import { useSettings } from "@/stores/settings";
import { useTodayLog } from "@/stores/todayLog";

/** 页面只调用过关命令；调度、本地投影与服务端事务由这里协调。 */
export function completeWord(idx: number, previous: Card, firstPass: boolean): Card {
  const now = Date.now();
  // 长会话期间可能已拉到更新卡片，不能拿队列中的旧快照覆盖它。
  const latest = useCards.getState().get(idx) ?? previous;
  const { card, eventType } = completeStudy(latest, firstPass, useSettings.getState().srsMaxIvl, now);
  const operationId = globalThis.crypto?.randomUUID?.()
    ?? `study-${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
  enqueueStudyCompletion({
    operation_id: operationId, word_idx: idx, card: cardToDto(card),
    event_type: eventType, day_key: dayKey(now), client_at: now,
  });
  useCards.getState().save(idx, card, { skipMirror: true });
  useTodayLog.getState().record(idx, eventType, { skipMirror: true, at: now });
  useMeta.getState().bump(eventType === "new" ? "newToday" : "reviewToday", 1, { skipMirror: true });
  useMeta.getState().bump("doneToday", 1, { skipMirror: true });
  return card;
}
