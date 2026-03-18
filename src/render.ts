import { GAP_X, NODE_H, NODE_W, layoutWorkflow } from './layout';
import type { JobModel, WorkflowModel } from './types';

// ワークフロー1つぶんのグラフをSVG文字列として組み立てる。
// <style> を内蔵させているのは、書き出したSVGが単体ファイルとしても
// ライト・ダーク両テーマで成立するようにするため。

export interface RenderOptions {
  /** クリティカルパスとして強調するジョブID列(criticalPath の戻り値) */
  critical?: string[];
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** matrix の全軸の組み合わせ数 */
export function matrixSize(job: JobModel): number {
  if (!job.matrix) return 0;
  return Object.values(job.matrix).reduce((acc, n) => acc * n, 1);
}

const STYLE = `
.actviz-graph { --panel:#ffffff; --ink:#2c2b28; --muted:#6e6b63; --line:#b5b0a6;
  --accent:#3c6394; --accent-soft:#e4ebf4; font-family:system-ui,sans-serif; }
@media (prefers-color-scheme: dark) {
  .actviz-graph { --panel:#22252c; --ink:#d6d8de; --muted:#8b8f99; --line:#4a4f5a;
    --accent:#93b5e4; --accent-soft:#2b3547; }
}
.actviz-graph .node rect.body { fill:var(--panel); stroke:var(--line); stroke-width:1.2; }
.actviz-graph .node text.title { fill:var(--ink); font-size:13px; font-weight:600; }
.actviz-graph .node text.caption { fill:var(--muted); font-size:11px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.actviz-graph .edge { fill:none; stroke:var(--line); stroke-width:1.4; }
.actviz-graph .node.crit rect.body { stroke:var(--accent); stroke-width:1.8; fill:var(--accent-soft); }
.actviz-graph .edge.crit { stroke:var(--accent); stroke-width:2; }
.actviz-graph .badge rect { fill:var(--accent-soft); stroke:var(--accent); stroke-width:1; }
.actviz-graph .badge text { fill:var(--accent); font-size:10px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.actviz-graph .node { cursor:pointer; }
.actviz-graph .node.dim, .actviz-graph .edge.dim { opacity:0.25; }
.actviz-graph .node, .actviz-graph .edge { transition:opacity 160ms ease; }
@media (prefers-reduced-motion: reduce) {
  .actviz-graph .node, .actviz-graph .edge { transition:none; }
}
`;

export function renderWorkflowSvg(
  wf: WorkflowModel,
  index: number,
  options: RenderOptions = {},
): string {
  const layout = layoutWorkflow(wf);
  const byId = new Map(wf.jobs.map((j) => [j.id, j]));
  const critical = options.critical ?? [];
  const criticalSet = new Set(critical);
  const criticalEdges = new Set(critical.slice(1).map((id, i) => `${critical[i]}->${id}`));

  const edges: string[] = [];
  for (const job of wf.jobs) {
    const to = layout.placed.get(job.id);
    if (!to) continue;
    for (const dep of job.needs) {
      const from = layout.placed.get(dep);
      if (!from) continue;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const bend = Math.min(GAP_X * 0.55, (x2 - x1) / 2);
      const isCrit = criticalEdges.has(`${dep}->${job.id}`);
      edges.push(
        `<path class="edge${isCrit ? ' crit' : ''}" data-from="${escapeXml(dep)}" ` +
          `data-to="${escapeXml(job.id)}" marker-end="url(#arr-${index}${isCrit ? 'c' : ''})" ` +
          `d="M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 7} ${y2}"/>`,
      );
    }
  }

  const nodes: string[] = [];
  let order = 0;
  for (const place of layout.placed.values()) {
    const job = byId.get(place.id)!;
    const size = matrixSize(job);
    const caption = job.uses ? `uses: ${job.uses.split('@')[0]}` : job.runsOn || '(runs-on 未指定)';
    const badge =
      size > 1
        ? `<g class="badge" aria-hidden="true">` +
          `<rect x="${NODE_W - 58}" y="-9" width="52" height="18" rx="9"/>` +
          `<text x="${NODE_W - 32}" y="4" text-anchor="middle">matrix ${size}</text></g>`
        : '';
    nodes.push(
      `<g class="node${criticalSet.has(job.id) ? ' crit' : ''}" data-job="${escapeXml(job.id)}" ` +
        `transform="translate(${place.x} ${place.y})" style="--i:${order}" tabindex="0" ` +
        `role="button" aria-label="${escapeXml(`ジョブ ${job.label} の詳細`)}">` +
        `<rect class="body" width="${NODE_W}" height="${NODE_H}" rx="10"/>` +
        `<text class="title" x="14" y="24">${escapeXml(truncate(job.label, 22))}</text>` +
        `<text class="caption" x="14" y="42">${escapeXml(truncate(caption, 26))}</text>` +
        `${badge}</g>`,
    );
    order += 1;
  }

  return (
    `<svg class="actviz-graph" viewBox="0 0 ${layout.width} ${layout.height}" ` +
    `width="${layout.width}" role="img" aria-label="${escapeXml(`${wf.label} のジョブ依存グラフ`)}" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(`${wf.label} のジョブ依存グラフ`)}</title>` +
    `<style>${STYLE}</style>` +
    `<defs>` +
    `<marker id="arr-${index}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--line)"/></marker>` +
    `<marker id="arr-${index}c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker>` +
    `</defs>` +
    `${edges.join('')}${nodes.join('')}</svg>`
  );
}
