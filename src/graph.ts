import type { WorkflowModel } from './types';

// needs から張られる依存グラフに対する問い合わせ。
// レイアウトと描画から独立させ、単体でテストできるようにしている。

export interface NeedsIssue {
  jobId: string;
  message: string;
}

/** 存在しないジョブへの needs 参照を列挙する */
export function findNeedsIssues(wf: WorkflowModel): NeedsIssue[] {
  const ids = new Set(wf.jobs.map((j) => j.id));
  const issues: NeedsIssue[] = [];
  for (const job of wf.jobs) {
    for (const dep of job.needs) {
      if (!ids.has(dep)) {
        issues.push({ jobId: job.id, message: `needs の参照先 ${dep} が存在しない` });
      }
    }
  }
  return issues;
}

/** 依存の循環を探す。見つかればそのパス(先頭と末尾が同じジョブ)を返す */
export function findCycle(wf: WorkflowModel): string[] | null {
  const adjacency = new Map(wf.jobs.map((j) => [j.id, j.needs]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') {
      return [...stack.slice(stack.indexOf(id)), id];
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of adjacency.get(id) ?? []) {
      if (!adjacency.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const job of wf.jobs) {
    const found = visit(job.id);
    if (found) return found;
  }
  return null;
}

/** ジョブの祖先(直接・間接に依存している側、needs を辿った先)を返す */
export function ancestorsOf(wf: WorkflowModel, jobId: string): Set<string> {
  const byId = new Map(wf.jobs.map((j) => [j.id, j]));
  const result = new Set<string>();
  const queue = [...(byId.get(jobId)?.needs ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id) || !byId.has(id)) continue;
    result.add(id);
    queue.push(...byId.get(id)!.needs);
  }
  return result;
}

/** ジョブの子孫(このジョブの完了を待つ側)を返す */
export function descendantsOf(wf: WorkflowModel, jobId: string): Set<string> {
  const result = new Set<string>();
  let frontier = new Set([jobId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const job of wf.jobs) {
      if (result.has(job.id) || job.id === jobId) continue;
      if (job.needs.some((dep) => frontier.has(dep))) {
        result.add(job.id);
        next.add(job.id);
      }
    }
    frontier = next;
  }
  return result;
}

/** 直列にしか進めない最長のジョブ列(クリティカルパス)を返す。循環があれば空 */
export function criticalPath(wf: WorkflowModel): string[] {
  if (findCycle(wf)) return [];
  const byId = new Map(wf.jobs.map((j) => [j.id, j]));
  const memo = new Map<string, string[]>();

  const longestTo = (id: string): string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    const deps = (byId.get(id)?.needs ?? []).filter((dep) => byId.has(dep));
    let best: string[] = [];
    for (const dep of deps) {
      const path = longestTo(dep);
      if (path.length > best.length) best = path;
    }
    const result = [...best, id];
    memo.set(id, result);
    return result;
  };

  let best: string[] = [];
  for (const job of wf.jobs) {
    const path = longestTo(job.id);
    if (path.length > best.length) best = path;
  }
  return best.length > 1 ? best : [];
}

export interface WorkflowStats {
  /** ジョブ数 */
  jobCount: number;
  /** 直列段数(needsの最長鎖の長さ)。同じ段に並ぶジョブはまとめて1段 */
  stageCount: number;
  /** 同じ段に並ぶ最大ジョブ数(並列度の上限) */
  maxParallel: number;
}

/**
 * ジョブ依存から規模の指標を出す。各ジョブの段(needs方向の最長距離)を求め、
 * 段数と段ごとの幅から直列の深さと並列度を読む。循環があっても止まらない。
 */
export function workflowStats(wf: WorkflowModel): WorkflowStats {
  const byId = new Map(wf.jobs.map((job) => [job.id, job]));
  const depthCache = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    const deps = (byId.get(id)?.needs ?? []).filter((dep) => byId.has(dep));
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => depthOf(dep, stack)));
    stack.delete(id);
    depthCache.set(id, depth);
    return depth;
  };
  const widthByStage = new Map<number, number>();
  let maxDepth = 0;
  for (const job of wf.jobs) {
    const depth = depthOf(job.id, new Set());
    maxDepth = Math.max(maxDepth, depth);
    widthByStage.set(depth, (widthByStage.get(depth) ?? 0) + 1);
  }
  return {
    jobCount: wf.jobs.length,
    stageCount: wf.jobs.length === 0 ? 0 : maxDepth + 1,
    maxParallel: widthByStage.size === 0 ? 0 : Math.max(...widthByStage.values()),
  };
}

/**
 * workflow_run による連鎖。戻り値は [先行ワークフローの添字, 後続の添字]。
 * 先行はワークフロー名(name)で照合される。
 */
export function workflowRunEdges(workflows: WorkflowModel[]): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  workflows.forEach((wf, to) => {
    for (const upstream of wf.workflowRunOf) {
      const from = workflows.findIndex((w) => w.label === upstream);
      if (from >= 0 && from !== to) edges.push([from, to]);
    }
  });
  return edges;
}
