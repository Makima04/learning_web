// cards store —— localStorage 优先 + 登录后 fire-and-forget 镜像 /api/cards。
// 镜像 web/store.js saveCard / getAllCards / clearAll / sync 语义。
import { create } from "zustand";
import * as api from "@/lib/api";
import type { Card } from "@/lib/srs";

const KEY = "ew.cards.v1";

function loadAll(): Record<number, Card> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, Card>;
    const out: Record<number, Card> = {};
    for (const k of Object.keys(obj)) out[parseInt(k, 10)] = obj[k];
    return out;
  } catch {
    return {};
  }
}
function saveAll(cards: Record<number, Card>) {
  try {
    const obj: Record<string, Card> = {};
    for (const k of Object.keys(cards)) obj[k] = cards[+k];
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

interface CardsStore {
  cards: Record<number, Card>;
  get: (idx: number) => Card | null;
  save: (idx: number, card: Card) => void;
  replaceAll: (cards: Record<number, Card>) => void;
  clearAll: () => void;
  rehydrate: () => void;
  sync: () => Promise<{ cards: number }>;
}

export const useCards = create<CardsStore>((set, get) => ({
  cards: loadAll(),
  get: (idx) => get().cards[idx] || null,
  save: (idx, card) => {
    const all = { ...get().cards, [idx]: card };
    set({ cards: all });
    saveAll(all);
    // 登录后后台镜像写，不 await，失败静默（镜像 putCard）
    if (api.isLoggedIn()) {
      void api
        .putCard(idx, card)
        .catch((e: any) => console.warn("mirror putCard failed:", e?.message));
    }
  },
  replaceAll: (cards) => {
    set({ cards });
    saveAll(cards);
  },
  clearAll: () => {
    set({ cards: {} });
    localStorage.removeItem(KEY);
  },
  rehydrate: () => set({ cards: loadAll() }),
  sync: async () => {
    const remote = await api.getCards();
    const remoteCards = (remote && remote.cards) || {};
    const localCards = get().cards;
    const remoteKeys = Object.keys(remoteCards);
    const remoteNum: Record<number, Card> = {};
    for (const k of remoteKeys) remoteNum[+k] = remoteCards[k] as unknown as Card;

    if (remoteKeys.length === 0 && Object.keys(localCards).length > 0) {
      // 首登：服务端空，推本地上去
      try {
        await api.bulkCards(localCards as unknown as Record<string, api.CardDTO>);
      } catch (e: any) {
        console.warn("bulkCards push failed:", e?.message);
      }
    } else if (remoteKeys.length > 0) {
      // 合并：remote 覆盖本地，本地独有保留
      const merged = { ...localCards, ...remoteNum };
      set({ cards: merged });
      saveAll(merged);
    }
    return { cards: Object.keys(get().cards).length };
  },
}));
