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
    for (const k of Object.keys(obj)) {
      const card = obj[k];
      out[parseInt(k, 10)] = {
        ...card,
        learned: card.learned ?? card.state === "review",
      };
    }
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

function toDto(card: Card): api.CardDTO {
  return {
    learned: !!card.learned,
    state: card.state,
    due: card.due,
    ivl: card.ivl,
    ease: card.ease,
    reps: card.reps,
    lapses: card.lapses,
    quiz: card.quiz ?? 0,
    updated_at: card.updatedAt ?? 0,
  };
}

function fromDto(card: api.CardDTO): Card {
  return {
    learned: !!card.learned,
    state: (card.state || "new") as Card["state"],
    due: card.due ?? 0,
    ivl: card.ivl ?? 0,
    ease: card.ease ?? 2.5,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    quiz: card.quiz ?? 0,
    updatedAt: card.updated_at ?? 0,
  };
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
    const saved: Card = {
      ...card,
      updatedAt: card.updatedAt && card.updatedAt > 0 ? card.updatedAt : Date.now(),
    };
    const all = { ...get().cards, [idx]: saved };
    set({ cards: all });
    saveAll(all);
    // 登录后后台镜像写，不 await，失败静默（镜像 putCard）
    if (api.isLoggedIn()) {
      void api
        .putCard(idx, toDto(saved))
        .catch((e: any) => console.warn("mirror putCard failed:", e?.message));
    }
  },
  replaceAll: (cards) => {
    const normalized = Object.fromEntries(
      Object.entries(cards).map(([idx, card]) => [
        +idx,
        {
          ...card,
          learned: card.learned ?? card.state === "review",
          updatedAt: card.updatedAt ?? 0,
        },
      ])
    ) as Record<number, Card>;
    set({ cards: normalized });
    saveAll(normalized);
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
    for (const k of remoteKeys) remoteNum[+k] = fromDto(remoteCards[k]);

    if (remoteKeys.length === 0 && Object.keys(localCards).length > 0) {
      // 首登：服务端空，推本地上去
      try {
        await api.bulkCards(
          Object.fromEntries(
            Object.entries(localCards).map(([idx, card]) => [idx, toDto(card)])
          )
        );
      } catch (e: any) {
        console.warn("bulkCards push failed:", e?.message);
      }
    } else if (remoteKeys.length > 0) {
      const merged = { ...localCards };
      const localNewer: Record<string, api.CardDTO> = {};
      for (const [idx, localCard] of Object.entries(localCards)) {
        if (!remoteCards[idx]) localNewer[idx] = toDto(localCard);
      }
      for (const [idx, remoteCard] of Object.entries(remoteNum)) {
        const localCard = localCards[+idx];
        if ((localCard?.updatedAt ?? 0) > (remoteCard.updatedAt ?? 0)) {
          localNewer[idx] = toDto(localCard);
        } else {
          merged[+idx] = remoteCard;
        }
      }
      set({ cards: merged });
      saveAll(merged);
      if (Object.keys(localNewer).length > 0) {
        try {
          await api.bulkCards(localNewer);
        } catch (e: any) {
          console.warn("bulkCards merge failed:", e?.message);
        }
      }
    }
    return { cards: Object.keys(get().cards).length };
  },
}));
