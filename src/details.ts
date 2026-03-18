import { escapeXml, matrixSize } from './render';
import type { JobModel, WorkflowModel } from './types';

// 選択したジョブの詳細パネル。HTML文字列を返し、呼び出し側がはめ込む。

export function renderDetails(wf: WorkflowModel, job: JobModel): string {
  const rows: string[] = [];
  const row = (term: string, value: string, mono = false) => {
    rows.push(
      `<div class="detail-row"><dt>${escapeXml(term)}</dt>` +
        `<dd${mono ? ' class="mono"' : ''}>${escapeXml(value)}</dd></div>`,
    );
  };

  row('ジョブID', job.id, true);
  if (job.uses) {
    row('再利用ワークフロー', job.uses, true);
  } else {
    row('runs-on', job.runsOn || '(未指定)', true);
  }
  row('needs', job.needs.length > 0 ? job.needs.join(', ') : 'なし(起点ジョブ)', true);
  if (job.condition) row('if', job.condition, true);
  if (job.environment) row('environment', job.environment, true);
  if (job.timeoutMinutes !== undefined) row('timeout-minutes', String(job.timeoutMinutes), true);
  if (job.matrix) {
    const axes = Object.entries(job.matrix)
      .map(([axis, n]) => `${axis} (${n}通り)`)
      .join(' / ');
    row('matrix', `${axes} = 計${matrixSize(job)}並列`, false);
  }

  const steps =
    job.steps.length > 0
      ? `<ol class="step-list">${job.steps
          .map((s) => `<li class="${s.uses ? 'uses' : 'run'}">${escapeXml(s.label)}</li>`)
          .join('')}</ol>`
      : '<p class="empty">ステップなし</p>';

  return (
    `<header class="details-head">` +
    `<p class="context">${escapeXml(wf.label)}</p>` +
    `<h2>${escapeXml(job.label)}</h2>` +
    `<button class="close" id="details-close" aria-label="詳細を閉じる">` +
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">` +
    `<path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
    `</svg></button></header>` +
    `<dl class="detail-grid">${rows.join('')}</dl>` +
    `<h3>ステップ(${job.steps.length})</h3>${steps}`
  );
}
