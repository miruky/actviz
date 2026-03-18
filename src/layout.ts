import { findCycle } from './graph';
import type { WorkflowModel } from './types';

// 左から右へ流れるレイヤードDAGレイアウト。
// レイヤー = needs を辿った最長距離。同一レイヤー内は前段の重心順に並べ、
// 交差をほどほどに減らす(完全な交差最小化はNP困難なので狙わない)。

export const NODE_W = 192;
export const NODE_H = 56;
export const GAP_X = 72;
export const GAP_Y = 24;
export const PADDING = 24;

export interface PlacedJob {
  id: string;
  layer: number;
  x: number;
  y: number;
}

export interface WorkflowLayout {
  placed: Map<string, PlacedJob>;
  width: number;
  height: number;
}

export function layoutWorkflow(wf: WorkflowModel): WorkflowLayout {
  const ids = new Set(wf.jobs.map((j) => j.id));
  const cyclic = findCycle(wf) !== null;

  // レイヤー割り当て。循環時は宣言順に1列ずつ置いて少なくとも全体を見せる
  const layerOf = new Map<string, number>();
  if (cyclic) {
    wf.jobs.forEach((job, i) => layerOf.set(job.id, i));
  } else {
    const depth = (id: string, seen: Set<string>): number => {
      if (layerOf.has(id)) return layerOf.get(id)!;
      seen.add(id);
      const deps = wf.jobs.find((j) => j.id === id)?.needs.filter((d) => ids.has(d)) ?? [];
      const value =
        deps.length === 0
          ? 0
          : Math.max(...deps.map((d) => (seen.has(d) ? 0 : depth(d, seen)))) + 1;
      layerOf.set(id, value);
      return value;
    };
    for (const job of wf.jobs) depth(job.id, new Set());
  }

  // レイヤーごとの整列: 宣言順を初期値に、前段の重心でソート(安定)
  const layers: string[][] = [];
  for (const job of wf.jobs) {
    const layer = layerOf.get(job.id)!;
    (layers[layer] ??= []).push(job.id);
  }
  const slotOf = new Map<string, number>();
  layers.forEach((layer, index) => {
    if (index > 0) {
      const barycenter = (id: string): number => {
        const deps = wf.jobs
          .find((j) => j.id === id)!
          .needs.filter((d) => slotOf.has(d) && layerOf.get(d) === index - 1);
        if (deps.length === 0) return Number.POSITIVE_INFINITY; // 前段に依存しない節は末尾へ
        return deps.reduce((sum, d) => sum + slotOf.get(d)!, 0) / deps.length;
      };
      layer.sort((a, b) => barycenter(a) - barycenter(b));
    }
    layer.forEach((id, slot) => slotOf.set(id, slot));
  });

  const tallest = Math.max(...layers.map((layer) => layer.length));
  const height = PADDING * 2 + tallest * NODE_H + (tallest - 1) * GAP_Y;
  const placed = new Map<string, PlacedJob>();
  layers.forEach((layer, index) => {
    const blockHeight = layer.length * NODE_H + (layer.length - 1) * GAP_Y;
    const top = PADDING + (height - PADDING * 2 - blockHeight) / 2;
    layer.forEach((id, slot) => {
      placed.set(id, {
        id,
        layer: index,
        x: PADDING + index * (NODE_W + GAP_X),
        y: top + slot * (NODE_H + GAP_Y),
      });
    });
  });

  return {
    placed,
    width: PADDING * 2 + layers.length * NODE_W + (layers.length - 1) * GAP_X,
    height,
  };
}
