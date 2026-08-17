// cards store —— localStorage 优先 + 登录后批量镜像 /api/cards（syncQueue）。
import { create } from "zustand";
import * as api from "@/lib/api";
import { dayKey } from "@/lib/day";
import type { Card } from "@/lib/srs";
import { scopedKey } from "@/lib/storageScope";
import { clearPendingCards, enqueueCard } from "@/lib/syncQueue";

const KEY_BASE = "ew.cards.v1";

function storageKey() {
  return scopedKey(KEY_BASE);
}

function loadAll(): Record<number, Card> {
  try {
    const raw = localStorage.getItem(storageKey());
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
    localStorage.setItem(storageKey(), JSON.stringify(obj));
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

/** 服务端 progress_reset.reset_at → 毫秒；无则 0 */
function parseResetAt(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw) {
    const n = Date.parse(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
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
  /** 清空本地；登录时走服务端权威清空（失败抛错，不假装成功） */
  clearAll: () => Promise<void>;
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
    enqueueCard(idx, toDto(saved));
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
    // 导入后若已登录，整包入队
    if (api.isLoggedIn()) {
      for (const [idx, card] of Object.entries(normalized)) {
        enqueueCard(+idx, toDto(card));
      }
    }
  },
  clearAll: async () => {
    // 登录：先等服务端权威清空成功，再清本地，避免失败却提示成功
    if (api.isLoggedIn()) {
      await api.deleteAllCards(dayKey());
    }
    set({ cards: {} });
    try {
      localStorage.removeItem(storageKey());
    } catch {
      /* ignore */
    }
    clearPendingCards();
  },
  rehydrate: () => set({ cards: loadAll() }),
  sync: async () => {
    const remote = await api.getCards();
    const remoteCards = (remote && remote.cards) || {};
    const localCards = get().cards;
    const remoteKeys = Object.keys(remoteCards);
    const resetAt = parseResetAt(remote.reset_at);
    const remoteNum: Record<number, Card> = {};
    for (const k of remoteKeys) remoteNum[+k] = fromDto(remoteCards[k]);

    const newerThanReset = (card: Card) => (card.updatedAt ?? 0) > resetAt;

    if (remoteKeys.length === 0) {
      // 远端空 + 从未权威清空：首次登录 / 访客迁移，整包上传
      // 远端空 + 刚重置：丢掉 reset 之前的本地卡，两边都空则 no-op（不救活）
      let toPush = localCards;
      if (resetAt > 0) {
        const kept: Record<number, Card> = {};
        for (const [idx, card] of Object.entries(localCards)) {
          if (newerThanReset(card)) kept[+idx] = card;
        }
        if (Object.keys(kept).length !== Object.keys(localCards).length) {
          set({ cards: kept });
          saveAll(kept);
        }
        toPush = kept;
      }
      if (Object.keys(toPush).length > 0) {
        try {
          await api.bulkCards(
            Object.fromEntries(
              Object.entries(toPush).map(([idx, card]) => [idx, toDto(card)])
            )
          );
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("bulkCards push failed:", message);
          for (const [idx, card] of Object.entries(toPush)) {
            enqueueCard(+idx, toDto(card));
          }
        }
      }
    } else if (remoteKeys.length > 0) {
      const merged = { ...localCards };
      const localNewer: Record<string, api.CardDTO> = {};
      for (const [idx, localCard] of Object.entries(localCards)) {
        if (remoteCards[idx]) continue;
        // 重置后远端没有的旧卡：丢掉，不要当「本地权威」推回
        if (resetAt > 0 && !newerThanReset(localCard)) {
          delete merged[+idx];
          continue;
        }
        localNewer[idx] = toDto(localCard);
      }
      for (const [idx, remoteCard] of Object.entries(remoteNum)) {
        const localCard = localCards[+idx];
        if ((localCard?.updatedAt ?? 0) > (remoteCard.updatedAt ?? 0)) {
          localNewer[idx] = toDto(localCard!);
        } else {
          merged[+idx] = remoteCard;
        }
      }
      set({ cards: merged });
      saveAll(merged);
      if (Object.keys(localNewer).length > 0) {
        try {
          await api.bulkCards(localNewer);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("bulkCards merge failed:", message);
          for (const [idx, card] of Object.entries(localNewer)) {
            enqueueCard(+idx, card);
          }
        }
      }
    }
    return { cards: Object.keys(get().cards).length };
  },
}));
