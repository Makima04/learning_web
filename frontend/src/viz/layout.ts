// 通用二叉树布局：x 取中序序号、y 取深度——树形变化（旋转/分裂）时每帧重算，不用手工摆坐标
export interface LayNode {
  l: unknown;
  r: unknown;
}

/** 返回结点 → [x, y] 的映射（inorderIdx*xGap + x0, depth*yGap + y0） */
export function layoutBinary<T extends LayNode>(
  root: T | null,
  opts: { xGap?: number; yGap?: number; x0?: number; y0?: number } = {}
): Map<T, [number, number]> {
  const { xGap = 46, yGap = 56, x0 = 26, y0 = 30 } = opts;
  const pos = new Map<T, [number, number]>();
  let idx = 0;
  const walk = (n: T | null, depth: number) => {
    if (!n) return;
    walk(n.l as T | null, depth + 1);
    pos.set(n, [x0 + idx * xGap, y0 + depth * yGap]);
    idx++;
    walk(n.r as T | null, depth + 1);
  };
  walk(root, 0);
  return pos;
}

/** SVG viewBox 尺寸：宽 = 结点数*xGap + x0*2，高 = (最大深度+1)*yGap + y0*2 */
export function layoutSize<T extends LayNode>(
  root: T | null,
  pos: Map<T, [number, number]>,
  opts: { xGap?: number; yGap?: number; x0?: number; y0?: number } = {}
): { w: number; h: number } {
  const { xGap = 46, yGap = 56, x0 = 26, y0 = 30 } = opts;
  let maxD = 0;
  let count = 0;
  const walk = (n: T | null, depth: number) => {
    if (!n) return;
    maxD = Math.max(maxD, depth);
    count++;
    walk(n.l as T | null, depth + 1);
    walk(n.r as T | null, depth + 1);
  };
  walk(root, 0);
  return { w: count * xGap + x0 * 2, h: (maxD + 1) * yGap + y0 * 2 };
}
