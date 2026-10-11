import { useCallback, useEffect, useState } from "react";

const DISTANCE = 24;
const TOP_ZONE = 24;

/**
 * 页面或任意内部滚动容器往下滚一段距离 → hidden=true；往上滚一段或回到顶部 → false。
 * 用捕获阶段监听 document，内层 overflow 容器的滚动也能感知。resetKey 变化（如换路由）时复位。
 * media 给定时只在匹配该媒体查询时响应（如只管手机宽度）。
 */
export function useHideOnScrollDown(resetKey?: unknown, media?: string) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
  }, [resetKey]);

  useEffect(() => {
    // 每个滚动容器各记一份：上次位置 + 本次滚动方向的起点
    const track = new WeakMap<Element, { y: number; anchor: number }>();
    const mq = media ? window.matchMedia(media) : null;
    const onScroll = (e: Event) => {
      if (mq && !mq.matches) return;
      const el =
        e.target === document ? document.scrollingElement : e.target instanceof Element ? e.target : null;
      if (!el) return;
      const y = el.scrollTop;
      const s = track.get(el) ?? { y, anchor: y };
      if ((y - s.y) * (s.y - s.anchor) < 0) s.anchor = s.y;
      s.y = y;
      track.set(el, s);
      const moved = y - s.anchor;
      if (y < TOP_ZONE) setHidden(false);
      else if (moved > DISTANCE) setHidden(true);
      else if (moved < -DISTANCE) setHidden(false);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [media]);

  const show = useCallback(() => setHidden(false), []);
  return { hidden, show };
}
