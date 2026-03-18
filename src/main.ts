import './style.css';
import { renderDetails } from './details';
import {
  ancestorsOf,
  criticalPath,
  descendantsOf,
  findCycle,
  findNeedsIssues,
  workflowRunEdges,
} from './graph';
import { WorkflowParseError, parseWorkflow } from './parse';
import { escapeXml, renderWorkflowSvg } from './render';
import { SAMPLE_FILES } from './samples';
import { loadFiles, saveFiles } from './store';
import type { WorkflowFile, WorkflowModel } from './types';

interface AppState {
  files: WorkflowFile[];
  active: number;
  showCritical: boolean;
}

// localStorageが使えない環境(プライベートブラウジング等)ではメモリ保持に切り替える
function appStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    const probe = '__actviz_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    };
  }
}

const storage = appStorage();

const state: AppState = {
  files: loadFiles(storage) ?? structuredClone(SAMPLE_FILES),
  active: 0,
  showCritical: false,
};

const el = {
  tabs: document.getElementById('file-tabs')!,
  source: document.getElementById('source') as HTMLTextAreaElement,
  graphPane: document.getElementById('graph-pane')!,
  details: document.getElementById('details')!,
  fileInput: document.getElementById('file-input') as HTMLInputElement,
};

let parsed: Array<WorkflowModel | WorkflowParseError> = [];
let renderTimer: ReturnType<typeof setTimeout> | undefined;

function parseAll(): void {
  parsed = state.files.map((file) => {
    try {
      return parseWorkflow(file.source, file.name);
    } catch (error) {
      if (error instanceof WorkflowParseError) return error;
      throw error;
    }
  });
}

function parsedWorkflows(): Array<WorkflowModel | undefined> {
  return parsed.map((p) => (p instanceof WorkflowParseError ? undefined : p));
}

function renderTabs(): void {
  el.tabs.innerHTML = state.files
    .map((file, i) => {
      const active = i === state.active;
      return (
        `<button role="tab" aria-selected="${active}" data-tab="${i}" ` +
        `class="tab${active ? ' active' : ''}">${escapeXml(file.name)}</button>`
      );
    })
    .join('');
  el.source.value = state.files[state.active]?.source ?? '';
}

function workflowCard(wf: WorkflowModel, index: number): string {
  const issues = findNeedsIssues(wf).map((issue) => `ジョブ ${issue.jobId}: ${issue.message}`);
  const cycle = findCycle(wf);
  if (cycle) issues.push(`依存が循環している: ${cycle.join(' -> ')}`);

  const chips = wf.triggers.map((t) => `<span class="chip">${escapeXml(t)}</span>`).join('');
  const workflows = parsedWorkflows();
  const upstream = workflowRunEdges(workflows.filter((w): w is WorkflowModel => Boolean(w)))
    .filter(([, to]) => workflows.filter(Boolean)[to] === wf)
    .map(([from]) => workflows.filter(Boolean)[from]?.label)
    .filter((v): v is string => Boolean(v));
  const chain =
    upstream.length > 0
      ? `<span class="chip chain">workflow_run: ${escapeXml(upstream.join(', '))} の完了後</span>`
      : '';

  const critical = state.showCritical ? criticalPath(wf) : [];
  const issueList =
    issues.length > 0
      ? `<ul class="issues">${issues.map((m) => `<li>${escapeXml(m)}</li>`).join('')}</ul>`
      : '';

  return (
    `<article class="wf-card" data-wf="${index}" style="--d:${index}">` +
    `<header class="wf-head">` +
    `<div class="wf-title"><h2>${escapeXml(wf.label)}</h2>` +
    `<span class="file mono">${escapeXml(wf.fileName)}</span></div>` +
    `<div class="wf-meta">${chips}${chain}` +
    `<button class="ghost export" data-export="${index}">SVGを書き出す</button></div>` +
    `</header>${issueList}` +
    `<div class="svg-wrap">${renderWorkflowSvg(wf, index, { critical })}</div>` +
    `</article>`
  );
}

function errorCard(file: WorkflowFile, error: WorkflowParseError, index: number): string {
  return (
    `<article class="wf-card broken" data-wf="${index}" style="--d:${index}">` +
    `<header class="wf-head"><div class="wf-title">` +
    `<h2>${escapeXml(file.name)}</h2></div></header>` +
    `<p class="parse-error">${escapeXml(error.message)}</p></article>`
  );
}

function renderGraphs(): void {
  parseAll();
  el.graphPane.innerHTML = parsed
    .map((result, i) =>
      result instanceof WorkflowParseError
        ? errorCard(state.files[i]!, result, i)
        : workflowCard(result, i),
    )
    .join('');
}

function scheduleRender(): void {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderGraphs();
    saveFiles(storage, state.files);
  }, 250);
}

function showDetails(wfIndex: number, jobId: string): void {
  const wf = parsedWorkflows()[wfIndex];
  const job = wf?.jobs.find((j) => j.id === jobId);
  if (!wf || !job) return;
  el.details.innerHTML = renderDetails(wf, job);
  el.details.hidden = false;
}

function closeDetails(): void {
  el.details.hidden = true;
}

function highlight(svg: SVGElement, wfIndex: number, jobId: string | null): void {
  const wf = parsedWorkflows()[wfIndex];
  if (!wf) return;
  const nodes = svg.querySelectorAll<SVGGElement>('g.node');
  const edges = svg.querySelectorAll<SVGPathElement>('path.edge');
  if (!jobId) {
    nodes.forEach((n) => n.classList.remove('dim'));
    edges.forEach((e) => e.classList.remove('dim'));
    return;
  }
  const related = new Set([jobId, ...ancestorsOf(wf, jobId), ...descendantsOf(wf, jobId)]);
  nodes.forEach((n) => n.classList.toggle('dim', !related.has(n.dataset.job ?? '')));
  edges.forEach((e) => {
    const onPath = related.has(e.dataset.from ?? '') && related.has(e.dataset.to ?? '');
    e.classList.toggle('dim', !onPath);
  });
}

function exportSvg(wfIndex: number): void {
  const svg = el.graphPane.querySelector(`article[data-wf="${wfIndex}"] svg`);
  const wf = parsedWorkflows()[wfIndex];
  if (!svg || !wf) return;
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`], {
    type: 'image/svg+xml',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = wf.fileName.replace(/\.ya?ml$/, '') + '.svg';
  link.click();
  URL.revokeObjectURL(url);
}

function uniqueName(base: string): string {
  const names = new Set(state.files.map((f) => f.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = base.replace(/(\.ya?ml)$/, `-${i}$1`);
    if (!names.has(candidate)) return candidate;
  }
}

const NEW_FILE_TEMPLATE = `name: New Workflow
on: [push]

jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

function refresh(): void {
  renderTabs();
  renderGraphs();
  saveFiles(storage, state.files);
}

function bindEvents(): void {
  el.tabs.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    state.active = Number(tab.dataset.tab);
    renderTabs();
  });

  el.source.addEventListener('input', () => {
    const file = state.files[state.active];
    if (!file) return;
    file.source = el.source.value;
    scheduleRender();
  });

  document.getElementById('add-file')!.addEventListener('click', () => {
    state.files.push({ name: uniqueName('workflow.yml'), source: NEW_FILE_TEMPLATE });
    state.active = state.files.length - 1;
    refresh();
  });

  document.getElementById('remove-file')!.addEventListener('click', () => {
    if (state.files.length <= 1) return;
    state.files.splice(state.active, 1);
    state.active = Math.min(state.active, state.files.length - 1);
    refresh();
    closeDetails();
  });

  document.getElementById('open-files')!.addEventListener('click', () => el.fileInput.click());

  el.fileInput.addEventListener('change', async () => {
    const picked = [...(el.fileInput.files ?? [])];
    for (const file of picked) {
      state.files.push({ name: uniqueName(file.name), source: await file.text() });
    }
    if (picked.length > 0) {
      state.active = state.files.length - 1;
      refresh();
    }
    el.fileInput.value = '';
  });

  document.getElementById('load-sample')!.addEventListener('click', () => {
    state.files = structuredClone(SAMPLE_FILES);
    state.active = 0;
    refresh();
    closeDetails();
  });

  const criticalToggle = document.getElementById('critical-toggle') as HTMLInputElement;
  criticalToggle.addEventListener('change', () => {
    state.showCritical = criticalToggle.checked;
    renderGraphs();
  });

  el.graphPane.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const exportButton = target.closest<HTMLElement>('[data-export]');
    if (exportButton) {
      exportSvg(Number(exportButton.dataset.export));
      return;
    }
    const node = target.closest<SVGGElement>('g.node');
    const card = target.closest<HTMLElement>('article[data-wf]');
    if (node && card) showDetails(Number(card.dataset.wf), node.dataset.job ?? '');
  });

  el.graphPane.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = (event.target as HTMLElement).closest<SVGGElement>('g.node');
    const card = (event.target as HTMLElement).closest<HTMLElement>('article[data-wf]');
    if (node && card) {
      event.preventDefault();
      showDetails(Number(card.dataset.wf), node.dataset.job ?? '');
    }
  });

  el.graphPane.addEventListener('mouseover', (event) => {
    const node = (event.target as HTMLElement).closest<SVGGElement>('g.node');
    if (!node) return;
    const card = node.closest<HTMLElement>('article[data-wf]');
    const svg = node.closest<SVGElement>('svg');
    if (card && svg) highlight(svg, Number(card.dataset.wf), node.dataset.job ?? null);
  });

  el.graphPane.addEventListener('mouseout', (event) => {
    const node = (event.target as HTMLElement).closest<SVGGElement>('g.node');
    if (!node) return;
    const card = node.closest<HTMLElement>('article[data-wf]');
    const svg = node.closest<SVGElement>('svg');
    if (card && svg) highlight(svg, Number(card.dataset.wf), null);
  });

  el.details.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('#details-close')) closeDetails();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetails();
  });
}

renderTabs();
renderGraphs();
bindEvents();
