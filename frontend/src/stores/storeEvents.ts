// 轻量强类型 Store 事件总线：单向解耦 journal ↔ kgProgress，彻底消除双向循环依赖。
// 本模块严禁 import 任何 Zustand store。
import type { MarkLevel } from "@/lib/kg/types";

export interface StoreEventMap {
  "journal:reviewed": {
    kpId: string;
    mark: MarkLevel;
    dueMs?: number;
    ivl?: number;
  };
  "kg:kpCovered": {
    kpId: string;
    title: string;
    body: string;
    categoryId: string;
  };
  "kg:kpUncovered": {
    kpId: string;
  };
  "kg:wrongUncollected": {
    sourceItemId: string;
  };
}

type EventKey = keyof StoreEventMap;
type Listener<K extends EventKey> = (payload: StoreEventMap[K]) => void;

const listeners = new Map<EventKey, Set<Listener<EventKey>>>();

export function onStoreEvent<K extends EventKey>(
  event: K,
  listener: Listener<K>
): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const fn = listener as Listener<EventKey>;
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

export function emitStoreEvent<K extends EventKey>(
  event: K,
  payload: StoreEventMap[K]
): void {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  for (const fn of [...set]) {
    fn(payload);
  }
}
